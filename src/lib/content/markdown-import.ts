/**
 * Markdown import (docs/design/constella-features.md #D14).
 *
 * Turns a vault or folder of `.md` files into StyleNotes note drafts. Pure: it
 * takes `{ path, content }` pairs and returns a plan; the dialog owns the file
 * I/O and the store owns the writes, which go only through `notesRepo.upsert`.
 *
 * Obsidian wikilinks (`[[..]]`) are kept verbatim in the body — the app's own
 * parser already understands them, so an imported vault's links resolve the
 * moment the notes exist. Nothing here rewrites links or deletes anything.
 */

/** One source file, already read from disk by the caller. */
export type MarkdownFile = {
	/** Path relative to the import root, e.g. `Ideas/Graph RAG.md`. */
	path: string;
	content: string;
};

/** A note the importer would create, before it touches the database. */
export type ImportNote = {
	/** Source path, kept so the preview can name a conflict precisely. */
	sourcePath: string;
	title: string;
	/** StyleNotes folder derived from the source directory, or `inbox`. */
	folder: string;
	tags: string[];
	body: string;
};

/** What the import would do, and everything that needs a decision. */
export type ImportPlan = {
	notes: ImportNote[];
	/** Source paths whose title already exists, so the user picks a policy. */
	conflicts: { sourcePath: string; title: string }[];
	/** Source paths skipped because they are not usable notes. */
	skipped: { sourcePath: string; reason: string }[];
	/** Counts for the preview line. */
	stats: { files: number; wikilinks: number; tags: number; folders: string[] };
};

/** How a title conflict is resolved, chosen in the dialog. */
export type ConflictPolicy = 'skip' | 'duplicate';

/** The folder a file with no source directory is filed under. */
export const IMPORT_DEFAULT_FOLDER = 'inbox';

/**
 * Parses simple YAML frontmatter from the top of a file.
 *
 * Supports exactly what a vault uses for this purpose: `key: value` pairs and
 * inline lists (`tags: [a, b]`). Anything more elaborate is left in the body
 * rather than guessed at.
 */
export function parseFrontmatter(raw: string): { data: Record<string, string | string[]>; body: string } {
	const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
	if (!match) return { data: {}, body: raw };
	const data: Record<string, string | string[]> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const separator = line.indexOf(':');
		if (separator < 0) continue;
		const key = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();
		if (!key) continue;
		if (value.startsWith('[') && value.endsWith(']')) {
			data[key] = value
				.slice(1, -1)
				.split(',')
				.map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
				.filter(Boolean);
		} else {
			data[key] = value.replace(/^['"]|['"]$/g, '');
		}
	}
	return { data, body: raw.slice(match[0].length) };
}

/** Frontmatter tags, whether written as an inline list or a single value. */
function tagsFromFrontmatter(data: Record<string, string | string[]>): string[] {
	const raw = data.tags ?? data.tag;
	if (!raw) return [];
	const list = Array.isArray(raw) ? raw : [raw];
	return [...new Set(list.flatMap((value) => value.split(/[,\s]+/)).map((tag) => normalizeTag(tag)).filter(Boolean))];
}

/** Tags are stored without a leading `#`, lowercased, and space-free. */
export function normalizeTag(tag: string): string {
	return tag.trim().replace(/^#/, '').replace(/\s+/g, '-').toLowerCase();
}

/** The title of a file: its frontmatter title, else its basename without `.md`. */
export function titleForFile(file: MarkdownFile, data: Record<string, string | string[]>): string {
	const fromFrontmatter = typeof data.title === 'string' ? data.title.trim() : '';
	if (fromFrontmatter) return fromFrontmatter;
	const base = file.path.split('/').pop() ?? file.path;
	return base.replace(/\.md$/i, '').trim() || 'Untitled note';
}

/**
 * The StyleNotes folder for a file, from its directory path.
 *
 * The first directory segment becomes the folder, slugged. A file at the root
 * of the import goes to `inbox` (#D14), so a flat folder is not all dumped into
 * an arbitrary folder.
 */
export function folderForPath(path: string): string {
	const parts = path.split('/').filter(Boolean);
	if (parts.length < 2) return IMPORT_DEFAULT_FOLDER;
	const directory = parts[0].trim().toLowerCase();
	return directory ? directory.replace(/\s+/g, '-') : IMPORT_DEFAULT_FOLDER;
}

/** Counts `[[wikilinks]]` in a body, without expanding or rewriting them. */
export function countWikilinks(body: string): number {
	return (body.match(/\[\[[^\]]+\]\]/g) ?? []).length;
}

/**
 * Builds the import plan from a set of files.
 *
 * `existingTitles` are the titles already in the target workspace: a file whose
 * title is among them is reported as a conflict, not silently merged. Titles
 * are compared case-insensitively and trimmed, matching how wiki links resolve.
 */
export function planImport(files: MarkdownFile[], existingTitles: Set<string> = new Set()): ImportPlan {
	const notes: ImportNote[] = [];
	const conflicts: { sourcePath: string; title: string }[] = [];
	const skipped: { sourcePath: string; reason: string }[] = [];
	const folders = new Set<string>();
	let wikilinks = 0;
	const tagSet = new Set<string>();

	for (const file of files) {
		const { data, body } = parseFrontmatter(file.content);
		const title = titleForFile(file, data);
		if (!title || title === 'Untitled note' && body.trim().length === 0) {
			// An empty file with no usable name would create a note nobody can
			// recognise; skip it and say why.
			skipped.push({ sourcePath: file.path, reason: 'empty' });
			continue;
		}
		const folder = folderForPath(file.path);
		const tags = tagsFromFrontmatter(data);
		folders.add(folder);
		wikilinks += countWikilinks(body);
		for (const tag of tags) tagSet.add(tag);

		if (existingTitles.has(title.toLowerCase())) {
			conflicts.push({ sourcePath: file.path, title });
		}
		notes.push({ sourcePath: file.path, title, folder, tags, body });
	}

	return {
		notes,
		conflicts,
		skipped,
		stats: { files: notes.length, wikilinks, tags: tagSet.size, folders: [...folders].sort() }
	};
}

/**
 * Applies the chosen conflict policy, returning the notes to actually create.
 *
 * `skip` leaves an existing title alone; `duplicate` keeps both by suffixing the
 * incoming title. Neither ever deletes or overwrites an existing note (#D14).
 */
export function resolveConflicts(
	plan: ImportPlan,
	policy: ConflictPolicy
): ImportNote[] {
	const conflicted = new Set(plan.conflicts.map((conflict) => conflict.sourcePath));
	const used = new Set<string>();
	return plan.notes
		.filter((note) => policy === 'duplicate' || !conflicted.has(note.sourcePath))
		.map((note) => {
			let title = note.title;
			if (policy === 'duplicate' && conflicted.has(note.sourcePath)) {
				title = uniqueTitle(`${note.title} (imported)`, used);
			}
			used.add(title.toLowerCase());
			return { ...note, title };
		});
}

function uniqueTitle(base: string, used: Set<string>): string {
	let candidate = base;
	let counter = 2;
	while (used.has(candidate.toLowerCase())) {
		candidate = `${base} ${counter}`;
		counter += 1;
	}
	return candidate;
}
