/**
 * The one text-ranking contract for the search tools.
 *
 * `search_notes`, `search_tasks` and `search_all` all order their hits with the
 * weights below. The Rust shim mirrors them in `src-tauri/src/mcp/rank.rs`, and
 * `mcp-search-parity.test.ts` parses that file so the two can never drift.
 *
 * Occurrence counts are **non-overlapping**, matching Rust's `str::matches`:
 * the scan jumps past each hit instead of recomputing from the next byte.
 */

export const NOTE_TITLE_WEIGHT = 10;
export const NOTE_TAGS_WEIGHT = 5;
export const NOTE_EXCERPT_WEIGHT = 3;
export const NOTE_BODY_WEIGHT = 1;

export const TASK_TITLE_WEIGHT = 10;
/** A task's own `notes` field (a description), distinct from linked notes. */
export const TASK_NOTES_WEIGHT = 3;

/** The fields a note is ranked over. */
export type RankableNote = {
	title: string;
	tags: string[];
	excerpt: string;
	/** Absent when the snapshot withheld the body; contributes nothing. */
	body?: string;
};

/** The fields a task is ranked over. */
export type RankableTask = {
	title: string;
	notes: string;
};

/**
 * Non-overlapping occurrences of `needle` in `haystack`.
 *
 * Both sides are expected already lower-cased. An empty needle counts zero so a
 * blank query cannot score every field.
 */
export function countOccurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let from = 0;
	for (;;) {
		const at = haystack.indexOf(needle, from);
		if (at === -1) break;
		count += 1;
		from = at + needle.length;
	}
	return count;
}

/** Weighted score of a note against a lowercased needle. */
export function scoreNote(note: RankableNote, needle: string): number {
	const title = countOccurrences(note.title.toLowerCase(), needle);
	const tags = note.tags.reduce(
		(sum, tag) => sum + countOccurrences(tag.toLowerCase(), needle),
		0
	);
	const excerpt = countOccurrences(note.excerpt.toLowerCase(), needle);
	const body = note.body === undefined ? 0 : countOccurrences(note.body.toLowerCase(), needle);
	return (
		title * NOTE_TITLE_WEIGHT +
		tags * NOTE_TAGS_WEIGHT +
		excerpt * NOTE_EXCERPT_WEIGHT +
		body * NOTE_BODY_WEIGHT
	);
}

/** Weighted score of a task against a lowercased needle. */
export function scoreTask(task: RankableTask, needle: string): number {
	const title = countOccurrences(task.title.toLowerCase(), needle);
	const notes = countOccurrences(task.notes.toLowerCase(), needle);
	return title * TASK_TITLE_WEIGHT + notes * TASK_NOTES_WEIGHT;
}

/** One ranked hit: the entity plus its score. */
export type Ranked<T> = { item: T; score: number };

/**
 * Notes that match `needle`, highest score first. Ties keep their input order
 * (the scan is stable), so two equally-weighted notes do not jump around
 * between calls.
 */
export function rankNotes<T extends RankableNote>(notes: T[], needle: string): Ranked<T>[] {
	return notes
		.map((item) => ({ item, score: scoreNote(item, needle) }))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score);
}

/** Tasks that match `needle`, highest score first. */
export function rankTasks<T extends RankableTask>(tasks: T[], needle: string): Ranked<T>[] {
	return tasks
		.map((item) => ({ item, score: scoreTask(item, needle) }))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score);
}
