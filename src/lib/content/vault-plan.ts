/**
 * Vault export planning (docs/design/vault-mirror.md #V3, #V12).
 *
 * Pure: given the notes of a workspace and the workspace's folder labels, it
 * returns the files to write and the attachment blobs to copy. The store owns
 * the actual writes; this module only decides what they should be, which keeps
 * file-name collisions and path building unit-testable.
 *
 * A second note with the same title lands in the same folder with a numeric
 * suffix (`Note-2.md`), matching the existing folder export so the two cannot
 * disagree.
 */

import type { Note } from '$lib/content/content';
import { extractReferences } from '$lib/content/attachment-manager';
import { parseAttachmentReference } from '$lib/content/attachments';
import { vaultFolderSegment, vaultRelPath, renderVaultNote } from '$lib/content/vault-format';

/** One rendered file ready to be written into the vault. */
export type VaultExportFile = {
	noteId: string;
	relPath: string;
	content: string;
};

export type VaultExportPlan = {
	files: VaultExportFile[];
	/** Store references (`stylenotes-attachment://…`) the exported notes use. */
	references: string[];
};

/** Deduplicates a case-insensitive key across the whole vault, not per folder. */
function uniqueRelPath(relPath: string, used: Set<string>): string {
	if (!used.has(relPath.toLowerCase())) {
		used.add(relPath.toLowerCase());
		return relPath;
	}
	const dir = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/') + 1) : '';
	const file = relPath.slice(dir.length).replace(/\.md$/i, '');
	for (let n = 2; ; n += 1) {
		const candidate = `${dir}${file}-${n}.md`;
		if (!used.has(candidate.toLowerCase())) {
			used.add(candidate.toLowerCase());
			return candidate;
		}
	}
}

/**
 * Builds the export plan for a set of notes.
 *
 * Only notes of the given workspace are expected; the caller filters first. The
 * returned order is deterministic (folder, then title) so an export produces the
 * same bytes every run, which keeps a re-export a no-op (#V7).
 */
export function planExport(
	notes: Note[],
	options: { writeId?: boolean } = {}
): VaultExportPlan {
	const used = new Set<string>();
	const references = new Set<string>();
	const files: VaultExportFile[] = [];

	for (const note of notes) {
		const relPath = uniqueRelPath(vaultRelPath(note.folder, note.title), used);
		files.push({
			noteId: note.id,
			relPath,
			content: renderVaultNote(note, options)
		});
		for (const reference of extractReferences(note.body)) {
			if (parseAttachmentReference(reference)) references.add(reference);
		}
	}

	files.sort((a, b) => a.relPath.localeCompare(b.relPath));
	return { files, references: [...references] };
}

/** The relative vault path an attachment blob is copied to, from its reference. */
export function attachmentRelPath(reference: string): string | null {
	const parsed = parseAttachmentReference(reference);
	if (!parsed) return null;
	const ext = parsed.ext ? `.${parsed.ext}` : '';
	return `attachments/${parsed.id.slice(0, 2)}/${parsed.id}${ext}`;
}

/** The folder segment used for a workspace folder label. */
export function folderSegmentFor(folder: string): string {
	return vaultFolderSegment(folder);
}
