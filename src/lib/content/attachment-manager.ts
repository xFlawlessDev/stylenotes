/**
 * Pure logic for the attachment manager: catalog health and size formatting.
 *
 * Kept out of the Svelte component so it is unit-testable — the store decides
 * what to do with a failing entry, the component only renders it.
 */

import {
	attachmentKind,
	fileNameFromPath,
	isAttachmentReference,
	parseAttachmentReference,
	targetExtension,
	type AttachmentKind
} from '$lib/content/attachments';
import type { AttachmentRecord } from '$lib/db';

export type CatalogRow = {
	id: string;
	ext: string;
	name: string;
	size: number;
	relPath: string;
	createdAt: number;
	lastSeenAt: number;
};

function displayName(record: AttachmentRecord): string {
	const name = record.name?.trim();
	if (name) return fileNameFromPath(name);
	const ext = record.ext ? `.${record.ext}` : '';
	return `${record.id.slice(0, 12)}${ext}`;
}

/**
 * Rows for the manager: newest first, each with a display name and size, plus a
 * stable reference the user can drop back into a note.
 */
export function catalogRows(records: AttachmentRecord[]): Array<CatalogRow & { label: string; reference: string; kind: AttachmentKind }> {
	return [...records]
		.sort((a, b) => b.createdAt - a.createdAt)
		.map((record) => ({
			id: record.id,
			ext: record.ext,
			name: record.name,
			size: record.size,
			relPath: record.relPath,
			createdAt: record.createdAt,
			lastSeenAt: record.lastSeenAt,
			label: displayName(record),
			reference: `stylenotes-attachment://${record.id}${record.ext ? `.${record.ext}` : ''}`,
			kind: attachmentKind(record.ext)
		}));
}

/**
 * Catalog ids that no note body references — safe to move to Trash. A record
 * whose blob is still referenced elsewhere is never orphaned.
 */
export function orphanIds(
	records: AttachmentRecord[],
	referencedIds: ReadonlySet<string>
): string[] {
	return records.filter((record) => !referencedIds.has(record.id)).map((record) => record.id);
}

/** Human-readable byte size. Binary units, one decimal past KB. */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** exponent;
	const digits = exponent === 0 ? 0 : value < 10 ? 1 : 0;
	return `${value.toFixed(digits)} ${units[exponent]}`;
}

/** Total stored bytes across catalog rows. */
export function totalBytes(records: AttachmentRecord[]): number {
	return records.reduce((sum, record) => sum + (Number(record.size) || 0), 0);
}

/** The id behind a store reference, or null when it is not one. */
export function referenceId(reference: string): string | null {
	if (!isAttachmentReference(reference)) return null;
	return parseAttachmentReference(reference)?.id ?? null;
}

/** The extension a reference or bare extension resolves to, for kind checks. */
export function kindForTarget(target: string): AttachmentKind {
	return attachmentKind(targetExtension(target));
}

/** Matches one store reference token; the token charset mirrors the Rust scan. */
const REFERENCE_PATTERN = /stylenotes-attachment:\/\/[0-9a-zA-Z.-]*/g;

/**
 * Every store reference in body text, deduplicated, in first-seen order. Mirrors
 * `extract_references` in `src-tauri/src/attachments/mod.rs`; both are pinned by
 * tests so a reference found in one is found in the other.
 */
export function extractReferences(text: string): string[] {
	const out: string[] = [];
	for (const match of text.matchAll(REFERENCE_PATTERN)) {
		const reference = match[0];
		if (parseAttachmentReference(reference) && !out.includes(reference)) out.push(reference);
	}
	return out;
}

/** The set of blob ids referenced across many note bodies. */
export function referencedIds(bodies: Iterable<string>): Set<string> {
	const ids = new Set<string>();
	for (const body of bodies) {
		for (const reference of extractReferences(body)) {
			const id = parseAttachmentReference(reference)?.id;
			if (id) ids.add(id);
		}
	}
	return ids;
}

/**
 * Whether an edit changes which attachments a note references — added, removed,
 * or swapped. Such an edit always earns a version, so a reference deleted from
 * the body can be recovered even if the regular time-gap rule would skip it.
 */
export function attachmentReferencesChanged(prev: string, next: string): boolean {
	const before = extractReferences(prev);
	const after = extractReferences(next);
	if (before.length !== after.length) return true;
	const beforeSet = new Set(before);
	return after.some((reference) => !beforeSet.has(reference));
}

/**
 * References in `text` whose blob is not in `existing` — a note that still
 * points at an attachment the store no longer has (deleted, purged, or not yet
 * synced). Ordered and deduplicated.
 */
export function missingReferences(text: string, existing: ReadonlySet<string>): string[] {
	return extractReferences(text).filter((reference) => {
		const id = parseAttachmentReference(reference)?.id;
		return id ? !existing.has(id) : true;
	});
}
