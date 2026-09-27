import type { CustomFolder } from '$lib/stores/notes';
import {
	resolveWikiReference,
	type WikiEntity,
	type WikiEntityKind,
	type WikiSource,
} from '$lib/content/wiki-links';

/**
 * Wiki-link autocomplete: reads the `[[` query under the caret, ranks the notes
 * and tasks that match it, and turns a pick into the link text.
 *
 * The popover component and every editor drive this module, so the matching
 * rules and the inserted syntax never live in a component.
 */

/** What the user typed after an opening `[[`, up to the caret. */
export type WikiQuery = {
	/** Index of the first `[` of the opening `[[`. */
	start: number;
	/** Caret the query was read at; the selection is replaced up to here. */
	end: number;
	/** Target text, i.e. what precedes `#` and `|`. May hold `folder/title`. */
	text: string;
	/** Heading typed after `#`, without the marker. */
	heading: string | null;
	/** Alias typed after `|`. */
	alias: string | null;
};

export type WikiSuggestion = {
	entity: WikiEntity;
	/** Title split around the matched run, for highlighting. */
	highlight: [string, string, string];
};

export type WikiSuggestionSet = {
	query: WikiQuery;
	items: WikiSuggestion[];
	/** Index of the item to preselect; -1 when the list is empty. */
	index: number;
};

export type WikiContext = {
	/** The record being edited; never suggested to itself. */
	source: WikiSource;
	notes: WikiSource[];
	tasks?: WikiSource[];
	folders?: CustomFolder[];
	limit?: number;
};

const DEFAULT_LIMIT = 8;
const LINE_BREAK = /[\r\n]/;
/** Sort weight: exact title, then prefix, then substring, then no match. */
const EXACT = 0;
const PREFIX = 1;
const SUBSTRING = 2;
const MISS = 3;

function normalize(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * Reads the `[[` query containing `caret`, or null when the caret is not in one.
 * A `]]`, a newline, or a nested `[[` cancels it, mirroring what the renderer
 * accepts as a wiki link.
 */
export function wikiQueryAt(value: string, caret: number): WikiQuery | null {
	let start = -1;
	for (let i = caret - 2; i >= 0; i -= 1) {
		if (value.slice(i, i + 2) !== '[[') continue;
		// `[[[` is not an opener, so keep walking left for a real one.
		if (value[i - 1] === '[') continue;
		start = i;
		break;
	}
	if (start < 0) return null;

	const raw = value.slice(start + 2, caret);
	if (raw.includes(']]') || raw.includes('[[') || LINE_BREAK.test(raw)) return null;

	const bar = raw.indexOf('|');
	const beforeAlias = bar < 0 ? raw : raw.slice(0, bar);
	const hash = beforeAlias.indexOf('#');
	return {
		start,
		end: caret,
		text: hash < 0 ? beforeAlias : beforeAlias.slice(0, hash),
		heading: hash < 0 ? null : beforeAlias.slice(hash + 1),
		alias: bar < 0 ? null : raw.slice(bar + 1),
	};
}

/** Splits `folder/title` so the folder narrows the pool and the title filters it. */
export function splitWikiPath(text: string): { folder: string; title: string } {
	const slash = text.lastIndexOf('/');
	return slash < 0 ? { folder: '', title: text } : { folder: text.slice(0, slash), title: text.slice(slash + 1) };
}

/** Titles are matched case-insensitively and a prefix is highlighted if present. */
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

/**
 * Resolves the query the way the renderer would, so an exactly typed title
 * preselects the entity Enter would open — including the ambiguous case.
 */
export function resolveWikiQuery(
	query: WikiQuery,
	context: WikiContext
): WikiEntity[] {
	const resolution = resolveWikiReference(
		{ target: query.text, path: query.text.trim(), heading: query.heading, alias: query.alias, embed: false },
		context.source,
		context.notes,
		context.folders ?? [],
		context.tasks ?? []
	);
	if (resolution.status === 'resolved') return [resolution.entity];
	if (resolution.status === 'ambiguous') return resolution.entities;
	return [];
}

/**
 * The notes and tasks the popover may offer, already scoped to the source's
 * workspace and never including the record being edited.
 */
function autocompletePool(context: WikiContext): WikiEntity[] {
	const id = context.source.workspaceId ?? 'workspace-default';
	const sharesWorkspace = (item: WikiSource) => (item.workspaceId ?? 'workspace-default') === id;
	return [
		...context.notes
			.filter((note) => note.id !== context.source.id && sharesWorkspace(note))
			.map((note) => ({ ...note, kind: 'note' as const })),
		...(context.tasks ?? [])
			.filter(sharesWorkspace)
			.map((task) => ({ ...task, kind: 'task' as const })),
	];
}

/** A typed title wins only when this workspace can resolve it. */
function resolvedPool(query: WikiQuery, context: WikiContext): WikiEntity[] {
	const id = context.source.workspaceId ?? 'workspace-default';
	return resolveWikiQuery(query, context).filter(
		(entity) => (entity.workspaceId ?? 'workspace-default') === id
	);
}

function matchesFolder(entities: WikiEntity[], folderPath: string, folders: CustomFolder[]): WikiEntity[] {
	const ids = new Set<string>();
	for (const folder of folders) {
		if (normalize(folder.id) === folderPath || normalize(folder.label) === folderPath) ids.add(folder.id);
	}
	return entities.filter((entity) => ids.has(entity.folder) || normalize(entity.folder) === folderPath);
}

/** Candidates are already in pool order, so the sort stays stable for ties. */
export function rankWikiCandidates(
	entities: WikiEntity[],
	query: WikiQuery,
	folders: CustomFolder[] = [],
	limit = DEFAULT_LIMIT
): WikiSuggestion[] {
	const { folder, title } = splitWikiPath(query.text);
	const folderPath = normalize(folder);
	const pool = folderPath ? matchesFolder(entities, folderPath, folders) : entities;
	const wanted = normalize(title);

	const ranked = pool
		.map((entity) => ({ entity, highlight: highlight(entity.title, wanted), score: sortRank(entity, wanted) }))
		.sort((a, b) => a.score - b.score || a.entity.title.localeCompare(b.entity.title));

	// An empty query lists the pool; a typed query only shows real matches.
	return ranked
		.filter((item) => item.score !== MISS)
		.slice(0, limit)
		.map(({ entity, highlight: parts }) => ({ entity, highlight: parts }));
}

/** Builds the suggestion set for the caret, or null when no `[[` is open. */
export function wikiSuggestionsFor(
	value: string,
	caret: number,
	context: WikiContext
): WikiSuggestionSet | null {
	const query = wikiQueryAt(value, caret);
	if (!query) return null;
	// An exactly typed title narrows the list to what the link resolves to.
	const exact = resolvedPool(query, context);
	const items = rankWikiCandidates(
		exact.length ? exact : autocompletePool(context),
		query,
		context.folders,
		context.limit
	);
	return { query, items, index: items.length ? 0 : -1 };
}

/** Moves the selection by `delta`, wrapping at both ends. */
export function moveSuggestion(index: number, count: number, delta: number): number {
	if (count <= 0) return -1;
	return (((index + delta) % count) + count) % count;
}

export function kindLabel(kind: WikiEntityKind): string {
	return kind === 'task' ? 'Task' : 'Note';
}

/**
 * The link text a suggestion inserts, carrying over any heading or alias that
 * was already typed. Headings apply to notes only: tasks have no sections.
 */
export function wikilinkText(
	entity: Pick<WikiEntity, 'title' | 'kind'>,
	options: Pick<WikiQuery, 'heading' | 'alias'>
): string {
	const heading = entity.kind === 'note' && options.heading ? `#${options.heading}` : '';
	return `[[${entity.title}${heading}${options.alias ? `|${options.alias}` : ''}]]`;
}

/** Swaps the typed query for the finished link and reports the new caret. */
export function applyWikilink(
	value: string,
	query: Pick<WikiQuery, 'start' | 'end'>,
	entity: Pick<WikiEntity, 'title' | 'kind'>,
	options: Pick<WikiQuery, 'heading' | 'alias'> = { heading: null, alias: null }
): { value: string; caret: number } {
	const link = wikilinkText(entity, options);
	// Only the typed query is ours to replace; anything past the caret survives.
	const next = `${value.slice(0, query.start)}${link}${value.slice(query.end)}`;
	return { value: next, caret: query.start + link.length };
}
