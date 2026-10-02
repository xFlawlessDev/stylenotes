/**
 * Vault file format (docs/design/vault-mirror.md #V3, #V4, #V12, #V22).
 *
 * Turns a note into the markdown a vault folder holds, and back. Everything
 * here is pure so the format is unit-testable without a filesystem.
 *
 * The format is deliberately conservative: a stable frontmatter block on top,
 * the note body untouched below. `id` is written so a rename is an update, not a
 * new note (#V4); `updated_at` is written so two sides can be compared without
 * guessing (#V8). File names are made safe for Windows, macOS, and Linux alike
 * — reserved device names, trailing dots/spaces, and Unicode NFC (#V22).
 */

import type { Note } from '$lib/content/content';
import { parseFrontmatter } from '$lib/content/markdown-import';

/** Frontmatter fields the app owns. Unknown fields are left in the file. */
export type VaultMeta = {
	id?: string;
	title?: string;
	folder?: string;
	tags: string[];
	pinned?: boolean;
	updatedAt?: number;
	journalDay?: string;
};

export type ParsedVaultNote = VaultMeta & {
	/** Body with the frontmatter stripped. */
	body: string;
	/** Title resolved from frontmatter, then the first `# heading`, then the file name. */
	title: string;
	/** Folder resolved from frontmatter, then the first directory segment, then `inbox`. */
	folder: string;
};

/** Windows-reserved device names. A file called `con.md` is still reserved. */
const RESERVED_NAMES = new Set([
	'con',
	'prn',
	'aux',
	'nul',
	...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
	...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

/** Longest file/folder segment we emit, leaving room for the `.md` suffix. */
const MAX_SEGMENT_LENGTH = 120;

/** The folder a vault file with no directory is filed under. */
export const VAULT_DEFAULT_FOLDER = 'inbox';

/** The folder name reserved for the attachment store. */
export const VAULT_ATTACHMENTS_DIR = 'attachments';

/**
 * Makes one path segment safe to write on every supported platform.
 *
 * Order matters: normalise Unicode first (so a macOS NFD name and a Windows NFC
 * name hash the same), then strip characters no filesystem accepts, then trim,
 * then defend against the two Windows traps — reserved device names and a
 * trailing dot or space, which Windows silently drops.
 */
export function vaultSegment(raw: string): string {
	const normalized = (raw || '').normalize('NFC');
	let segment = normalized
		// Control characters and the characters Windows forbids in a name.
		.replace(/[\u0000-\u001f\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		// Windows strips a trailing dot or space, so a name that ends in one
		// would be written under a different name than we recorded.
		.replace(/[. ]+$/g, '')
		.replace(/^\.+/, '')
		.trim();
	if (segment.length > MAX_SEGMENT_LENGTH) segment = segment.slice(0, MAX_SEGMENT_LENGTH).trim();
	if (!segment) return 'note';
	if (RESERVED_NAMES.has(segment.toLowerCase())) return `${segment}-note`;
	return segment;
}

/** A folder segment from a StyleNotes folder id or label. */
export function vaultFolderSegment(folder: string): string {
	const normalized = (folder || '')
		.normalize('NFC')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (!normalized) return 'folder';
	// The attachment store owns this name; a note folder must not shadow it.
	if (normalized === VAULT_ATTACHMENTS_DIR) return `${VAULT_ATTACHMENTS_DIR}-notes`;
	return vaultSegment(normalized).toLowerCase();
}

/** The vault-relative path a note is written to, e.g. `ideas/Graph RAG.md`. */
export function vaultRelPath(folder: string, title: string): string {
	return `${vaultFolderSegment(folder)}/${vaultSegment(title)}.md`;
}

/** Quotes a YAML scalar when it would otherwise be ambiguous. */
function yamlScalar(value: string): string {
	if (value === '') return '""';
	const plain = /^[A-Za-z0-9][A-Za-z0-9 _.,'()-]*$/.test(value) && !value.endsWith(' ');
	if (plain) return value;
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Renders a note as vault markdown.
 *
 * `writeId` is false for a `type = 'folder'` workspace (#V21), where the app
 * reads the folder as-is and must not stamp metadata the user did not ask for.
 */
export function renderVaultNote(note: Note, options: { writeId?: boolean } = {}): string {
	const writeId = options.writeId ?? true;
	const lines: string[] = ['---'];
	if (writeId) lines.push(`id: ${yamlScalar(note.id)}`);
	lines.push(`title: ${yamlScalar(note.title || 'Untitled note')}`);
	lines.push(`folder: ${yamlScalar(note.folder || 'personal')}`);
	lines.push(`tags: [${note.tags.map((tag) => yamlScalar(tag)).join(', ')}]`);
	if (note.pinned) lines.push('pinned: true');
	if (note.updatedAt != null) lines.push(`updated_at: ${note.updatedAt}`);
	if (note.journalDay) lines.push(`journal_day: ${note.journalDay}`);
	lines.push('---', '');
	const body = note.body ?? '';
	return `${lines.join('\n')}${body}`;
}

/** The first level-1 heading, used as a fallback title for a foreign file. */
function firstHeading(body: string): string {
	const match = /^#\s+(.+)$/m.exec(body);
	return match ? match[1].trim() : '';
}

/** The base file name without `.md`, used as the last-resort title. */
function baseName(relPath: string): string {
	const file = relPath.split('/').pop() ?? relPath;
	return file.replace(/\.md$/i, '').trim() || 'Untitled note';
}

/**
 * Parses a vault file back into note fields.
 *
 * The body is never rewritten: this only reads the frontmatter the app writes
 * and any other editor understands (#V3). A file with no frontmatter is still a
 * valid note — its title comes from the heading or the file name.
 */
export function parseVaultNote(relPath: string, content: string): ParsedVaultNote {
	const { data, body } = parseFrontmatter(content);
	const asString = (key: string): string => {
		const value = data[key];
		if (Array.isArray(value)) return value[0] ?? '';
		return typeof value === 'string' ? value : '';
	};
	const tagsRaw = data.tags ?? data.tag;
	const tags = tagsRaw
		? (Array.isArray(tagsRaw) ? tagsRaw : [tagsRaw])
				.flatMap((value) => value.split(/[,\s]+/))
				.map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
				.filter(Boolean)
		: [];

	const segments = relPath.split('/').filter(Boolean);
	const fileFolder = segments.length > 1 ? segments[0] : '';
	const title = asString('title') || firstHeading(body) || baseName(relPath);
	const folder = asString('folder') || fileFolder || VAULT_DEFAULT_FOLDER;

	const updatedRaw = asString('updated_at');
	const updatedAt = updatedRaw && Number.isFinite(Number(updatedRaw)) ? Number(updatedRaw) : undefined;
	const journalDay = asString('journal_day') || undefined;
	const id = asString('id') || undefined;
	const pinned = asString('pinned').toLowerCase() === 'true';

	return { id, title, folder, tags, pinned, updatedAt, journalDay, body };
}
