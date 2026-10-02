/**
 * Vault reconciliation (docs/design/vault-mirror.md #V18).
 *
 * Pure comparison of the folder, the app's notes, and `vault_links` into a list
 * of actions. The store executes them through the one write door; nothing here
 * touches a database or a filesystem.
 *
 * Two rules keep this safe:
 *
 * 1. **Reads are additive.** A file that exists in the folder and is new becomes
 *    a note; a file whose note is gone does **not** delete the note here — the
 *    caller decides (F1 keeps it, a later phase offers recover-or-remove).
 * 2. **Conflicts are detected, never resolved.** A file with git conflict
 *    markers, or one that two sides changed, is reported, not merged (#V8/#V9).
 */

import type { Note } from '$lib/content/content';
import { parseVaultNote } from '$lib/content/vault-format';
import { extractReferences } from '$lib/content/attachment-manager';
import { parseAttachmentReference } from '$lib/content/attachments';
import type { VaultFile, VaultLink } from '$lib/db/vault';

/** A note the folder wants created or updated. */
export type VaultImport = {
	kind: 'create' | 'update';
	relPath: string;
	/** The existing note id for `update`; absent for `create`. */
	noteId?: string;
	title: string;
	folder: string;
	body: string;
	tags: string[];
	/** The file's hash, recorded so the next sweep sees it as already known. */
	contentHash: string;
};

/** An `attachments/` blob a note references that the store does not have yet. */
export type VaultAttachmentImport = {
	kind: 'attachment';
	relPath: string;
	reference: string;
	contentHash: string;
};

/** A file that was skipped, with a stable reason code (never translated here). */
export type VaultSkip = {
	kind: 'skip';
	relPath: string;
	reason: 'conflict' | 'conflictedCopy' | 'empty';
};

/**
 * Both sides changed since the last sync.
 *
 * Detected by comparing the note's `updatedAt` against the link's `syncedAt`
 * (a local edit after we last wrote) **and** the file's hash against the link's
 * `contentHash` (an outside edit). `updated_at` alone is never used as the test:
 * two devices' clocks can differ, so only "after the last shared sync" counts.
 */
export type VaultConflict = {
	kind: 'conflict';
	relPath: string;
	noteId: string;
	/** The app's current note. */
	localTitle: string;
	localFolder: string;
	localBody: string;
	localTags: string[];
	/** The folder file's version of the same note. */
	fileTitle: string;
	fileFolder: string;
	fileBody: string;
	fileTags: string[];
	/** The file's hash, recorded once the conflict is resolved. */
	contentHash: string;
};

/** A link whose note no longer exists in this workspace. */
export type VaultOrphanLink = {
	kind: 'orphanLink';
	relPath: string;
	noteId: string | null;
};

export type VaultSyncAction =
	| VaultImport
	| VaultAttachmentImport
	| VaultSkip
	| VaultOrphanLink
	| VaultConflict;

export type VaultSyncPlan = {
	actions: VaultSyncAction[];
	stats: { create: number; update: number; attachments: number; skipped: number; orphans: number; conflicts: number };
};

/** Git/merge markers that must never be swallowed into a note body (#V9). */
export function hasConflictMarkers(content: string): boolean {
	return /^<{7}/m.test(content) && /^>{7}/m.test(content);
}

/** A Dropbox-style "conflicted copy" name, which is not a note (#V9). */
export function isConflictedCopy(relPath: string): boolean {
	const name = relPath.split('/').pop() ?? relPath;
	return /\(.*conflicted copy.*\)\.md$/i.test(name);
}

/** Files under the attachment store are never treated as notes. */
export function isAttachmentPath(relPath: string): boolean {
	return relPath === 'attachments' || relPath.startsWith('attachments/');
}

/**
 * Compares the folder against the app and returns what to do.
 *
 * `orphanTolerant` is true for a `type = 'folder'` workspace (#V21): the same
 * physical folder can be opened by more than one workspace, so a link whose note
 * is missing from *this* workspace is left alone instead of being called an
 * orphan.
 */
export function planSync(
	files: VaultFile[],
	notes: Note[],
	links: Map<string, VaultLink>,
	options: { orphanTolerant?: boolean } = {}
): VaultSyncPlan {
	const byId = new Map(notes.map((note) => [note.id, note]));
	const actions: VaultSyncAction[] = [];

	for (const file of files) {
		if (isAttachmentPath(file.relPath)) continue;

		if (isConflictedCopy(file.relPath)) {
			actions.push({ kind: 'skip', relPath: file.relPath, reason: 'conflictedCopy' });
			continue;
		}

		const link = links.get(file.relPath);

		// Our own write coming back: identical bytes, nothing to do (#V7).
		if (link && link.contentHash === file.contentHash) continue;

		// A file we wrote before but that is now empty is a truncated or emptied
		// file, not an instruction to blank the note. Never let it erase data.
		if (link && file.content.trim().length === 0) {
			actions.push({ kind: 'skip', relPath: file.relPath, reason: 'empty' });
			continue;
		}

		if (hasConflictMarkers(file.content)) {
			actions.push({ kind: 'skip', relPath: file.relPath, reason: 'conflict' });
			continue;
		}

		const parsed = parseVaultNote(file.relPath, file.content);

		const existing = parsed.id ? byId.get(parsed.id) : undefined;
		if (existing) {
			// Both sides changed since the last shared sync: the note was edited
			// in the app after we last wrote the file, and the file's bytes differ
			// from what we wrote. `updated_at` alone is never the test — only
			// "after the last sync" (#V8).
			if (link && existing.updatedAt != null && existing.updatedAt > link.syncedAt) {
				actions.push({
					kind: 'conflict',
					relPath: file.relPath,
					noteId: existing.id,
					localTitle: existing.title,
					localFolder: existing.folder,
					localBody: existing.body,
					localTags: [...existing.tags],
					fileTitle: parsed.title,
					fileFolder: parsed.folder,
					fileBody: parsed.body,
					fileTags: parsed.tags,
					contentHash: file.contentHash
				});
				continue;
			}
			// An edit made outside the app, with no local change: a plain update.
			actions.push({
				kind: 'update',
				relPath: file.relPath,
				noteId: existing.id,
				title: parsed.title,
				folder: parsed.folder,
				body: parsed.body,
				tags: parsed.tags,
				contentHash: file.contentHash
			});
		} else {
			// A file the app has never seen, or one whose `id` is unknown to this
			// workspace: it becomes a note, and the app stamps an `id` (#V4).
			actions.push({
				kind: 'create',
				relPath: file.relPath,
				title: parsed.title,
				folder: parsed.folder,
				body: parsed.body,
				tags: parsed.tags,
				contentHash: file.contentHash
			});
		}
	}

	// Blobs the folder's `.md` files point at, for the ones not yet in the store.
	const references = new Set<string>();
	for (const file of files) {
		if (isAttachmentPath(file.relPath)) continue;
		for (const reference of extractReferences(file.content)) {
			if (parseAttachmentReference(reference)) references.add(reference);
		}
	}
	for (const reference of references) {
		const parsed = parseAttachmentReference(reference);
		if (!parsed) continue;
		const ext = parsed.ext ? `.${parsed.ext}` : '';
		actions.push({
			kind: 'attachment',
			relPath: `attachments/${parsed.id.slice(0, 2)}/${parsed.id}${ext}`,
			reference,
			contentHash: ''
		});
	}

	// Links whose note is gone. F1 does not delete notes; it only reports (or,
	// for a strict workspace, drops the stale index row).
	if (!options.orphanTolerant) {
		for (const link of links.values()) {
			if (link.entityKind === 'note' && link.entityId && !byId.has(link.entityId)) {
				actions.push({ kind: 'orphanLink', relPath: link.relPath, noteId: link.entityId });
			}
		}
	}

	return {
		actions,
		stats: {
			create: actions.filter((action) => action.kind === 'create').length,
			update: actions.filter((action) => action.kind === 'update').length,
			attachments: actions.filter((action) => action.kind === 'attachment').length,
			skipped: actions.filter((action) => action.kind === 'skip').length,
			orphans: actions.filter((action) => action.kind === 'orphanLink').length,
			conflicts: actions.filter((action) => action.kind === 'conflict').length
		}
	};
}
