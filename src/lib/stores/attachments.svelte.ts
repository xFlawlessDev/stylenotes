/**
 * Attachment manager state (docs/design/artifacts.md).
 *
 * Owns the catalog view, the Trash, and the orphan scan. The store decides what
 * to do with a failing entry (surface it, keep the blob); the component only
 * renders. Every mutating call re-reads the store so the list cannot drift from
 * disk.
 *
 * Orphans are computed by diffing the catalog against the references found in
 * every note body — the same `extractReferences` the Rust side mirrors. A blob
 * that no note points at is offered for cleanup, never removed automatically.
 */

import { browser } from '$app/environment';
import { isTauri } from '$lib/windows';
import { attachmentsRepo, notesRepo, type AttachmentRecord } from '$lib/db';
import { attachmentReference } from '$lib/content/attachments';
import {
	deleteAttachment,
	listTrashedAttachments,
	purgeAttachment,
	purgeExpiredTrash,
	resolveAttachments,
	restoreAttachment,
	type TrashedAttachment
} from '$lib/content/attachment-actions';
import { orphanIds, referencedIds, referenceId } from '$lib/content/attachment-manager';

/** Trashed blobs older than this are purged on first load of the manager. */
export const TRASH_RETENTION_DAYS = 30;

let catalog = $state<AttachmentRecord[]>([]);
let trash = $state<TrashedAttachment[]>([]);
let referenced = $state<Set<string>>(new Set());
let loading = $state(false);
let busy = $state<string | null>(null);
let error = $state<string | null>(null);
let primed = false;

export const attachmentStore = {
	get catalog(): AttachmentRecord[] {
		return catalog;
	},
	get trash(): TrashedAttachment[] {
		return trash;
	},
	get loading(): boolean {
		return loading;
	},
	/** The id currently being changed, so its row can disable itself. */
	get busy(): string | null {
		return busy;
	},
	get error(): string | null {
		return error;
	},
	get orphans(): string[] {
		return orphanIds(catalog, referenced);
	}
};

/** Reads the catalog, the Trash, and every note's references in one pass. */
export async function refreshAttachments(): Promise<void> {
	if (!browser || !isTauri) return;
	loading = true;
	error = null;
	try {
		const [records, trashed, notes] = await Promise.all([
			attachmentsRepo.list(),
			listTrashedAttachments(),
			notesRepo.list().catch(() => [])
		]);
		// The catalog is an index, not the truth (docs/design/artifacts.md #A6): a
		// blob moved to Trash (or deleted on another device) still has its row, so
		// showing it would resurrect a file the user just removed. Keep only blobs
		// that are actually on disk. When the store cannot be reached we keep every
		// row rather than hiding the whole catalog on a transient failure.
		const resolved = await resolveAttachments(
			records.map((record) => attachmentReference(record.id, record.ext))
		);
		if (resolved) {
			const present = new Set(
				resolved
					.filter((item) => item.exists)
					.map((item) => referenceId(item.reference))
					.filter((id): id is string => Boolean(id))
			);
			catalog = records.filter((record) => present.has(record.id));
		} else {
			catalog = records;
		}
		trash = trashed;
		referenced = referencedIds(notes.map((note) => note.body));
	} catch {
		error = 'load';
	} finally {
		loading = false;
	}
}

/** Loads once per session and applies the trash retention window. */
export async function primeAttachments(): Promise<void> {
	if (primed || !browser || !isTauri) return;
	primed = true;
	await purgeExpiredTrash(TRASH_RETENTION_DAYS).catch(() => 0);
	await refreshAttachments();
}

/** Moves a blob to Trash, then refreshes. Returns false on failure. */
export async function removeAttachment(id: string, reference: string): Promise<boolean> {
	if (busy) return false;
	busy = id;
	try {
		const moved = await deleteAttachment(reference);
		if (!moved) return false;
		await refreshAttachments();
		return true;
	} finally {
		busy = null;
	}
}

/** Restores a trashed blob. */
export async function restoreTrashed(id: string): Promise<boolean> {
	if (busy) return false;
	busy = id;
	try {
		const hash = await restoreAttachment(id);
		if (!hash) return false;
		await refreshAttachments();
		return true;
	} finally {
		busy = null;
	}
}

/** Permanently removes one trashed blob. */
export async function purgeTrashed(id: string): Promise<boolean> {
	if (busy) return false;
	busy = id;
	try {
		const ok = await purgeAttachment(id);
		if (!ok) return false;
		await refreshAttachments();
		return true;
	} finally {
		busy = null;
	}
}

/**
 * Moves every orphaned blob to Trash in one go. A blob whose row fails to move
 * stops the batch and is reported; the ones already moved stay moved (Trash is
 * recoverable, so a partial run is safe).
 */
export async function trashOrphans(referencesById: Map<string, string>): Promise<number> {
	if (busy) return 0;
	const ids = attachmentStore.orphans;
	let moved = 0;
	for (const id of ids) {
		const reference = referencesById.get(id);
		if (!reference) continue;
		busy = id;
		if (await deleteAttachment(reference)) moved += 1;
	}
	busy = null;
	await refreshAttachments();
	return moved;
}

/** Permanently removes every trashed blob. */
export async function emptyTrash(): Promise<number> {
	if (busy) return 0;
	busy = '*';
	try {
		const removed = await purgeExpiredTrash(0);
		// The catalog is a derived index; `refreshAttachments` filters it against
		// disk, so a row for a purged blob simply stops showing instead of being
		// deleted here (a purge of a stale trash copy must never drop a live blob's
		// row — the same content can exist in both places).
		await refreshAttachments();
		return removed;
	} finally {
		busy = null;
	}
}
