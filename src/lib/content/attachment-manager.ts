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

/** A catalog row enriched for the manager: display label, reference, and kind. */
export type AttachmentCatalogRow = CatalogRow & {
	label: string;
	reference: string;
	kind: AttachmentKind;
};

/** Trashed blob as the manager lists it (mirrors `TrashedAttachment`). */
export type TrashRow = {
	id: string;
	ext: string;
	deletedAt: number;
	size: number;
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
export function catalogRows(records: AttachmentRecord[]): AttachmentCatalogRow[] {
	return [...records].sort((a, b) => b.createdAt - a.createdAt).map(catalogRow);
}

/** The catalog's label, reference and kind for one id, without re-sorting. */
export function catalogRow(record: AttachmentRecord): AttachmentCatalogRow {
	return {
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
	};
}

/** What the manager's file list can be filtered by. */
export type AttachmentKindFilter = AttachmentKind | 'all' | 'orphan';

/** Case-insensitive match over a row's name and id (the visible label). */
export function matchesAttachmentQuery(row: { label: string; id: string }, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (!needle) return true;
	return row.label.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle);
}

/**
 * Rows passing a kind filter and a search query, in catalog order. `orphan`
 * keeps rows no note references; the other kinds match the file type, so the
 * manager can answer "show me only the images" without a second scan.
 */
export function filterCatalogRows(
	rows: AttachmentCatalogRow[],
	options: { kind?: AttachmentKindFilter; query?: string; orphans?: ReadonlySet<string> } = {}
): AttachmentCatalogRow[] {
	const { kind = 'all', query = '', orphans } = options;
	return rows.filter((row) => {
		if (kind === 'orphan' && !orphans?.has(row.id)) return false;
		if (kind !== 'all' && kind !== 'orphan' && row.kind !== kind) return false;
		return matchesAttachmentQuery(row, query);
	});
}

/** Trash rows passing a kind filter and search query, in the order given. */
export function filterTrashRows<T extends { id: string; ext: string }>(
	rows: T[],
	options: { kind?: AttachmentKindFilter; query?: string } = {}
): T[] {
	const { kind = 'all', query = '' } = options;
	const needle = query.trim().toLowerCase();
	return rows.filter((row) => {
		if (kind !== 'all' && kind !== 'orphan' && attachmentKind(row.ext) !== kind) return false;
		if (!needle) return true;
		const name = `${row.id}${row.ext ? `.${row.ext}` : ''}`.toLowerCase();
		return name.includes(needle);
	});
}

/** Kind choices offered by the manager's filter bar, in display order. */
export const ATTACHMENT_KIND_FILTERS: AttachmentKindFilter[] = [
	'all',
	'image',
	'video',
	'audio',
	'pdf',
	'file',
	'orphan'
];

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
