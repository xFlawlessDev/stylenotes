/**
 * Pure helpers for turning a turn's tool traffic into a citation list.
 *
 * The assistant cites notes, tasks and web pages it read through tools. This
 * module is the single place that decides which tool results count as sources,
 * what each entry says, and how an inline `[n]` marker maps back to one — so
 * the components stay dumb and the rules are unit-tested without Svelte.
 */

import type { AiToolCall } from '$lib/content/ai-types';
import type { ToolResult } from '$lib/content/ai-tools';
import type { ToolTraceEntry } from '$lib/content/ai-trace';

/** One citable source: a note, a task or a web page. */
export type CitationSource = {
	/** 1-based number used by inline markers, assigned in first-seen order. */
	index: number;
	kind: 'note' | 'task' | 'web';
	/** `<workspaceId>/<id>` for notes/tasks; the URL for web pages. */
	ref: string;
	/** Bare entity id for notes/tasks, so a click can resolve it. */
	id: string;
	title: string;
	/** One-line description: an excerpt for notes, a snippet for web. */
	description?: string;
	/**
	 * The text the tool actually returned for this source, when it carried any:
	 * a note body for `get_note`, page text for `web_fetch`. List/search results
	 * only carry an excerpt, so this stays undefined and the popover falls back
	 * to the live record.
	 */
	content?: string;
};

/** The minimum shape a resolvable note/task needs, to preview a citation. */
export type CitationEntity = {
	id: string;
	title: string;
	/** The note/task text, when the caller has it. */
	body?: string;
};

/** Reads the first string-ish field in a record, or undefined. */
function pick(record: Record<string, unknown>, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** Tool results whose payload is a list of note/task summaries. */
const ENTITY_LIST_TOOLS = new Set([
	'list_notes',
	'search_notes',
	'semantic_search',
	'related_notes',
	'list_tasks',
	'list_themes'
]);

/** Tools whose payload is a list of web hits. */
const WEB_TOOLS = new Set(['web_search', 'web_fetch']);

/** The list key each tool uses for its results, in priority order. */
const LIST_KEYS = ['results', 'notes', 'tasks', 'themes'];

/**
 * Pulls the ranked entities out of a tool result. Semantic and search tools
 * return `{ results }` / `{ notes }`; a theme nests its members, which are
 * flattened here so the theme's member notes are still citable.
 */
function entitiesFromResult(result: ToolResult): Record<string, unknown>[] {
	if (!result.ok) return [];
	const data = result.data;
	if (Array.isArray(data)) return data.map(asRecord).filter(Boolean) as Record<string, unknown>[];
	const record = asRecord(data);
	if (!record) return [];
	const out: Record<string, unknown>[] = [];
	const lists = LIST_KEYS.map((key) => record[key]).filter(Array.isArray);
	if (!lists.length) {
		// `get_note` / `get_task` return the entity, `web_fetch` the page itself.
		if (pick(record, ['ref', 'url']) || pick(record, ['title'])) out.push(record);
		return out;
	}
	for (const list of lists as unknown[][]) {
		for (const item of list) {
			const entry = asRecord(item);
			if (!entry) continue;
			// A theme wraps its members; the members are the citable entities, so
			// the wrapper itself is only kept when it carries its own ref/title.
			if (Array.isArray(entry.members)) {
				for (const member of entry.members) {
					const nested = asRecord(member);
					if (nested) out.push(nested);
				}
				if (!pick(entry, ['ref', 'id'])) continue;
			}
			out.push(entry);
		}
	}
	return out;
}

/** A note/task summary becomes a source when it has a ref or an id. */
function entitySource(entry: Record<string, unknown>): CitationSource | null {
	const ref = pick(entry, ['ref', 'id']);
	const title = pick(entry, ['title', 'name']);
	if (!ref || !title) return null;
	const kind = entry.kind === 'task' || entry.refKind === 'task' ? 'task' : 'note';
	const id = pick(entry, ['id']) ?? ref.slice(ref.indexOf('/') + 1);
	return {
		index: 0,
		kind,
		ref,
		id,
		title,
		description: pick(entry, ['excerpt', 'snippet', 'description']),
		// Only `get_note` ships the body; a list/search hit has just the excerpt.
		content: pick(entry, ['body'])
	};
}

/** A web hit becomes a source when it has a URL. */
function webSource(entry: Record<string, unknown>): CitationSource | null {
	const url = pick(entry, ['url', 'ref']);
	if (!url) return null;
	// `web_search` hits carry a title; `web_fetch` returns a page with none, so
	// the URL itself labels it rather than dropping the page from the list.
	const title = pick(entry, ['title', 'name']) ?? url;
	return {
		index: 0,
		kind: 'web',
		ref: url,
		id: url,
		title,
		description: pick(entry, ['snippet', 'description', 'excerpt']),
		// A fetched page carries its readable text; a search hit only a snippet.
		content: pick(entry, ['text'])
	};
}

/** Same source if the same entity or URL, regardless of the tool that found it. */
function keyOf(source: CitationSource): string {
	return source.kind === 'web' ? `web:${source.ref}` : `${source.kind}:${source.ref}`;
}

/**
 * Collects the distinct sources a turn's tool calls actually returned, numbered
 * in first-seen order. Only successful reads of the tools above are counted, so
 * a failed or write call never appears as a source.
 */
export function collectCitations(entries: ToolTraceEntry[]): CitationSource[] {
	const seen = new Map<string, CitationSource>();
	for (const entry of entries) {
		if (!entry.result?.ok) continue;
		const { name } = entry.call;
		const isEntity = ENTITY_LIST_TOOLS.has(name) || name === 'get_note' || name === 'get_task';
		const isWeb = WEB_TOOLS.has(name);
		if (!isEntity && !isWeb) continue;
		for (const record of entitiesFromResult(entry.result)) {
			const source = isWeb ? webSource(record) : entitySource(record);
			if (!source) continue;
			const key = keyOf(source);
			if (seen.has(key)) continue;
			source.index = seen.size + 1;
			seen.set(key, source);
		}
	}
	return [...seen.values()];
}

/** Matches an inline `[n]` / `[n,m]` marker, not a Markdown link or a footnote. */
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g;

/**
 * Rewrites `[n]` markers in an answer as anchors with `data-cite`, so a click
 * can open the matching source. Only numbers that exist in `sources` are
 * rewritten; anything else is left exactly as the model wrote it.
 *
 * Runs on the raw Markdown before it is rendered, and returns HTML, which the
 * caller's sanitizer still owns — the anchor only carries data attributes.
 */
export function linkCiteMarkers(markdown: string, sources: CitationSource[]): string {
	if (!sources.length || !markdown) return markdown;
	const known = new Set(sources.map((source) => source.index));
	return markdown.replace(MARKER, (match, group: string) => {
		const numbers = group
			.split(',')
			.map((value) => Number(value.trim()))
			.filter((value) => known.has(value));
		if (!numbers.length) return match;
		return numbers
			.map(
				(number) =>
					`<a class="cite-marker" data-cite="${number}" href="#cite-${number}" aria-label="${number}">${number}</a>`
			)
			.join('');
	});
}

/** The source an inline marker points at, or null when it is out of range. */
export function citationAt(sources: CitationSource[], index: number): CitationSource | null {
	return sources.find((source) => source.index === index) ?? null;
}

/**
 * The text a popover should show for a source.
 *
 * Prefers the live record, because a list/search hit only carries an excerpt
 * while the note itself is right here — and the note may have been edited since
 * the turn ran. Falls back to whatever the tool returned (a note body from
 * `get_note`, page text from `web_fetch`, or the excerpt/snippet as a last
 * resort). Returns an empty string when there is genuinely nothing to show, so
 * the caller can hide the popover body rather than render a blank card.
 */
export function citationPreview(
	source: CitationSource,
	entities: CitationEntity[] = []
): string {
	if (source.kind !== 'web') {
		const live = entities.find((entity) => entity.id === source.id);
		const body = live?.body?.trim();
		if (body) return body;
	}
	return source.content?.trim() || source.description?.trim() || '';
}

/** A compact label for a web source's hostname, e.g. `example.com`. */
export function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}
