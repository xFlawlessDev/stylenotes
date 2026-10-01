/**
 * Frontend actions over the local artifact store: import, open, pick, and the
 * markdown that references a blob.
 *
 * The store is content-addressed: importing a file returns its SHA-256 id, and
 * the note holds a portable `stylenotes-attachment://<id>.<ext>` reference. URL
 * resolution for rendering lives in `attachment-url.ts`; this module owns the
 * commands and the catalog writes, so the render path never imports SQLite.
 *
 * Everything here is guarded by `isTauri`; outside the desktop runtime the store
 * is unavailable and callers simply get nothing back.
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { isTauri } from '$lib/windows';
import { attachmentMarkdown, attachmentReference } from '$lib/content/attachments';
import { attachmentStoreRoot, onAttachmentStoreReady } from '$lib/content/attachment-url';
import { attachmentsRepo } from '$lib/db';

export { attachmentStoreRoot, onAttachmentStoreReady };

/** One stored blob, as returned by `attachment_import`. */
export type StoredAttachment = {
	id: string;
	ext: string;
	name: string;
	path: string;
	originPath: string;
	size: number;
};

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'];

/** Copies files into the store and records them in `attachments`. */
export async function importAttachments(paths: string[]): Promise<StoredAttachment[]> {
	if (!isTauri || !paths.length) return [];
	await attachmentStoreRoot().catch(() => undefined);
	const stored = await invoke<StoredAttachment[]>('attachment_import', { paths });
	await recordCatalog(stored);
	return stored;
}

/** Stores raw bytes (a pasted clipboard image) and records the blob. */
export async function importAttachmentBytes(
	bytes: Uint8Array,
	name = 'pasted-image.png'
): Promise<StoredAttachment | null> {
	if (!isTauri || !bytes.length) return null;
	await attachmentStoreRoot().catch(() => undefined);
	const stored = await invoke<StoredAttachment>('attachment_import_bytes', {
		name,
		bytes: Array.from(bytes)
	});
	await recordCatalog([stored]);
	return stored;
}

/**
 * Persists catalog rows for imported blobs. The on-disk blob is the truth, so a
 * failed row must not fail the import the user just did — report and move on.
 */
async function recordCatalog(stored: StoredAttachment[]): Promise<void> {
	const failures = await attachmentsRepo.record(stored);
	if (failures > 0) console.warn(`attachment catalog: ${failures} record(s) not saved`);
}

/** Opens a stored blob or legacy absolute path with the OS default app. */
export async function openAttachment(target: string): Promise<boolean> {
	if (!isTauri) return false;
	try {
		await invoke('attachment_open', { target });
		return true;
	} catch {
		return false;
	}
}

/**
 * Native file picker that imports the chosen files and returns their markdown.
 * `kind: 'image'` narrows the filter to image types; `'file'` allows anything.
 * Empty string when the user cancels or nothing could be imported.
 */
export async function pickAttachments(kind: 'image' | 'file'): Promise<string> {
	if (!isTauri) return '';
	const { open } = await import('@tauri-apps/plugin-dialog');
	const selected = await open({
		multiple: true,
		directory: false,
		filters: kind === 'image' ? [{ name: 'Images', extensions: IMAGE_EXTENSIONS }] : undefined
	});
	const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
	if (!paths.length) return '';
	const stored = await importAttachments(paths);
	return storedAttachmentsMarkdown(stored);
}

/** Markdown for one stored blob, with its original name as the label. */
export function storedAttachmentMarkdown(record: StoredAttachment): string {
	return attachmentMarkdown(attachmentReference(record.id, record.ext), record.name);
}

/** Markdown for a batch, one per line, in the order they were imported. */
export function storedAttachmentsMarkdown(records: StoredAttachment[]): string {
	return records.map(storedAttachmentMarkdown).join('\n');
}

/** A webview-loadable URL for a stored blob path, for previews outside markdown. */
export function attachmentPathUrl(path: string): string | null {
	if (!isTauri) return null;
	try {
		return convertFileSrc(path);
	} catch {
		return null;
	}
}
