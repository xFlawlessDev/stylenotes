/**
 * `@` mention parsing for the AI chat composer.
 *
 * The user types `@` to pull a note or task into the message as context. This
 * module owns the query parsing, ranking and the id round-trip, so the popover
 * and the composer never reimplement it. Kept pure and unit-tested.
 */

import type { WikiEntity, WikiSource } from '$lib/content/wiki-links';

/** What the user typed after an opening `@`, up to the caret. */
export type MentionQuery = {
	/** Index of the `@`. */
	start: number;
	/** Caret the query was read at; the selection is replaced up to here. */
	end: number;
	/** Text typed after `@`, without the marker. */
	text: string;
};

export type MentionSuggestion = {
	entity: WikiEntity;
	/** Title split around the matched run, for highlighting. */
	highlight: [string, string, string];
};

export type MentionContext = {
	notes: WikiSource[];
	tasks?: WikiSource[];
	limit?: number;
};

const DEFAULT_LIMIT = 8;
const EXACT = 0;
const PREFIX = 1;
const SUBSTRING = 2;
const MISS = 3;
/** `@` only starts a mention at a word boundary with a non-space after it. */
const BOUNDARY = /[\s([{]/;

function normalize(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * Reads the `@` mention containing `caret`, or null when the caret is not in
 * one. A newline or an `@` that is not at a word boundary cancels it.
 */
export function mentionQueryAt(value: string, caret: number): MentionQuery | null {
	let start = -1;
	for (let i = caret - 1; i >= 0; i -= 1) {
		const char = value[i];
		if (char === '\n' || char === '\r') return null;
		if (char !== '@') continue;
		// `foo@bar` is an email, not a mention; `(@x` and ` @x` are mentions.
		const before = value[i - 1];
		if (before && !BOUNDARY.test(before)) return null;
		start = i;
		break;
	}
	if (start < 0) return null;

	const raw = value.slice(start + 1, caret);
	// A space ends the mention query: once the user types past the title, stop.
	if (/\s/.test(raw)) return null;
	return { start, end: caret, text: raw };
}

function highlight(title: string, term: string): [string, string, string] {
	const at = term ? normalize(title).indexOf(term) : -1;
	if (at < 0) return ['', title, ''];
	return [title.slice(0, at), title.slice(at, at + term.length), title.slice(at + term.length)];
}

function sortRank(entity: WikiEntity, wanted: string): number {
	if (!wanted) return EXACT;
	const title = normalize(entity.title);
	if (title === wanted) return EXACT;
	if (title.startsWith(wanted)) return PREFIX;
	if (title.includes(wanted)) return SUBSTRING;
	return MISS;
}

/** Notes then tasks, scoped to a workspace when the caller supplies one. */
export function mentionPool(context: MentionContext, workspaceId?: string): WikiEntity[] {
	const shares = (item: WikiSource) =>
		workspaceId === undefined || (item.workspaceId ?? 'workspace-default') === workspaceId;
	return [
		...context.notes.filter(shares).map((note) => ({ ...note, kind: 'note' as const })),
		...(context.tasks ?? []).filter(shares).map((task) => ({ ...task, kind: 'task' as const }))
	];
}

/** Ranks the pool for a query; an empty query lists the pool. */
export function rankMentions(
	entities: WikiEntity[],
	query: MentionQuery,
	limit = DEFAULT_LIMIT
): MentionSuggestion[] {
	const wanted = normalize(query.text);
	return entities
		.map((entity) => ({
			entity,
			highlight: highlight(entity.title, wanted),
			score: sortRank(entity, wanted)
		}))
		.filter((item) => item.score !== MISS)
		.sort((a, b) => a.score - b.score || a.entity.title.localeCompare(b.entity.title))
		.slice(0, limit)
		.map(({ entity, highlight: parts }) => ({ entity, highlight: parts }));
}

/** Builds the suggestion list for the caret, or null when no `@` is open. */
export function mentionSuggestionsFor(
	value: string,
	caret: number,
	context: MentionContext,
	workspaceId?: string
): { query: MentionQuery; items: MentionSuggestion[] } | null {
	const query = mentionQueryAt(value, caret);
	if (!query) return null;
	return { query, items: rankMentions(mentionPool(context, workspaceId), query, context.limit) };
}

/** Moves the selection by `delta`, wrapping at both ends. */
export function moveMention(index: number, count: number, delta: number): number {
	if (count <= 0) return -1;
	return (((index + delta) % count) + count) % count;
}

/**
 * The token inserted for a picked entity. It is plain `@Title` text: the body
 * sent to the model is built separately from the resolved ids, so the visible
 * message stays readable.
 */
export function mentionText(entity: Pick<WikiEntity, 'title'>): string {
	return `@${entity.title}`;
}

/** Swaps the typed query for the finished mention and reports the new caret. */
export function applyMention(
	value: string,
	query: Pick<MentionQuery, 'start' | 'end'>,
	entity: Pick<WikiEntity, 'title'>
): { value: string; caret: number } {
	const token = mentionText(entity);
	const next = `${value.slice(0, query.start)}${token}${value.slice(query.end)}`;
	return { value: next, caret: query.start + token.length };
}

/**
 * Extracts the note/task ids a finished message mentions, by matching each
 * `@Title` against the pool. Titles are tried longest-first and a match claims
 * its span, so `@Weekly Review Notes` beats `@Weekly` instead of counting both.
 */
export function mentionedIds(message: string, entities: WikiEntity[]): string[] {
	const byLength = [...entities].sort((a, b) => b.title.length - a.title.length);
	const found = new Map<string, WikiEntity>();
	/** Spans already claimed by a longer title. */
	const claimed: [number, number][] = [];

	const overlaps = (start: number, end: number) =>
		claimed.some(([from, to]) => start < to && end > from);

	for (const entity of byLength) {
		if (!entity.title) continue;
		const needle = `@${entity.title}`;
		let from = 0;
		while (true) {
			const at = message.indexOf(needle, from);
			if (at < 0) break;
			const end = at + needle.length;
			const after = message[end];
			const boundary = after === undefined || BOUNDARY.test(after) || /[.,!?;:)]/.test(after);
			if (boundary && !overlaps(at, end)) {
				claimed.push([at, end]);
				found.set(`${entity.kind}:${entity.id}`, entity);
				break;
			}
			from = at + 1;
		}
	}
	return [...found.values()].map((entity) => `${entity.kind}:${entity.id}`);
}
