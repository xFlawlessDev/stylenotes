/**
 * Read-tool executor for the AI chat.
 *
 * Split out of `ai-tools.ts` so that file stays under the repo's LOC cap. Reads
 * filter the in-app snapshot (`buildMcpSnapshot`), the same document the MCP
 * shim answers from, so a chat answer can never disagree with what the UI
 * shows. Pure-ish: it takes the snapshot as an argument, so it is unit-testable
 * without Tauri or the database.
 */

import type { McpSnapshot } from '$lib/content/mcp-types';
import type { WriteContext } from '$lib/content/mcp-write-actions';
import {
	bareId,
	bool,
	filterTasks,
	findByTitle,
	findNote,
	findTask,
	noteSummary,
	notesOf,
	num,
	ref,
	sortTasks,
	str,
	taskFiltersFrom,
	taskSummary,
	tasksOf
} from '$lib/content/ai-read-helpers';
import { rankNotes, rankTasks } from '$lib/content/search-rank';
import type { AnsweredQuestion, QuestionItem } from '$lib/content/ai-questions';

/** Result handed back to the model as the tool message content. */
export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Everything the executor needs, injected so it stays testable. */
export type ToolContext = {
	snapshot: McpSnapshot;
	write: WriteContext;
	/**
	 * Web access hooks, injected so this module stays free of Tauri imports.
	 * Absent outside the desktop app or when search is not configured.
	 */
	web?: WebHooks;
	/**
	 * Puts a question to the user and resolves with their answers. Supplied by
	 * the chat panel, which renders the choice card inline.
	 */
	ask?: (questions: QuestionItem[], resolve: (answers: AnsweredQuestion[]) => void) => void;
	/**
	 * Semantic memory access, injected so this module stays free of the
	 * embedder and the database (#D15). Absent in browser dev or when no
	 * embedder is selected, in which case the tools report "not ready".
	 */
	memory?: MemoryHooks;
};

/** Ranked semantic hits, as the memory store returns them. */
export type MemoryHit = { entityKind: 'note' | 'task'; entityId: string; score: number };

/** One theme: a label and its ranked members. */
export type MemoryTheme = { label: string; members: MemoryHit[] };

/** Semantic recall, provided by `stores/memory.svelte.ts`. */
export type MemoryHooks = {
	ready: () => boolean;
	search: (query: string, limit: number) => Promise<MemoryHit[]>;
	related: (kind: 'note' | 'task', id: string, limit: number) => Promise<MemoryHit[]>;
	themes: (limit: number) => Promise<MemoryTheme[]>;
	contradictions: (limit: number) => Promise<MemoryTheme[]>;
};

/** The two network calls the web tools need, provided by the store. */
export type WebHooks = {
	search: (query: string, limit: number) => Promise<ToolResult>;
	fetch: (url: string, maxChars?: number) => Promise<ToolResult>;
};

const DEFAULT_LIMIT = 50;

function listNotes(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const workspace = str(args, 'workspace');
	const folder = str(args, 'folder');
	const tag = str(args, 'tag');
	const pinnedOnly = bool(args, 'pinnedOnly') ?? false;
	const limit = num(args, 'limit', DEFAULT_LIMIT);

	const notes = notesOf(ctx.snapshot, workspace).filter(
		(note) =>
			(!folder || note.folder === folder) &&
			(!tag || note.tags.includes(tag)) &&
			(!pinnedOnly || note.pinned)
	);
	return {
		ok: true,
		data: { total: notes.length, notes: notes.slice(0, limit).map(noteSummary) }
	};
}

function searchNotes(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const query = str(args, 'query');
	if (!query) return { ok: false, error: '`query` is required.' };
	const workspace = str(args, 'workspace');
	const limit = num(args, 'limit', 20);
	// Score first, then take the top `limit`: slicing before ranking would drop
	// the strongest hits whenever the scan order happened to be uncorrelated.
	const ranked = rankNotes(notesOf(ctx.snapshot, workspace), query.toLowerCase());
	return {
		ok: true,
		data: {
			total: ranked.length,
			notes: ranked.slice(0, limit).map((entry) => noteSummary(entry.item))
		}
	};
}

/** Ranked text search over a task's title and its own `notes` field. */
function searchTasks(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const query = str(args, 'query');
	if (!query) return { ok: false, error: '`query` is required.' };
	const limit = num(args, 'limit', 20);
	const filters = taskFiltersFrom(args);
	const ranked = rankTasks(filterTasks(ctx.snapshot, filters), query.toLowerCase());
	return {
		ok: true,
		data: {
			total: ranked.length,
			tasks: ranked.slice(0, limit).map((entry) => taskSummary(entry.item))
		}
	};
}

/**
 * One ranked search across notes and tasks. The two score scales are not
 * directly comparable across kinds (a task's `notes` mention is not a note's
 * title hit), so the lists stay separate: interleaving would let a task's notes
 * mention outrank a note's title.
 */
function searchAll(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const query = str(args, 'query');
	if (!query) return { ok: false, error: '`query` is required.' };
	const workspace = str(args, 'workspace');
	const limit = num(args, 'limit', 20);
	const includeDone = bool(args, 'includeDone') ?? true;
	const needle = query.toLowerCase();

	const notes = rankNotes(notesOf(ctx.snapshot, workspace), needle);
	const tasks = rankTasks(filterTasks(ctx.snapshot, { workspace, includeDone }), needle);
	return {
		ok: true,
		data: {
			query,
			total: notes.length + tasks.length,
			notes: notes.slice(0, limit).map((entry) => noteSummary(entry.item)),
			tasks: tasks.slice(0, limit).map((entry) => taskSummary(entry.item))
		}
	};
}

/**
 * Meaning-based search. Falls back to a clear message when the index is off,
 * so the model switches to `search_notes` instead of retrying (#D17).
 */
async function semanticSearch(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
	const query = str(args, 'query');
	if (!query) return { ok: false, error: '`query` is required.' };
	if (!ctx.memory?.ready()) {
		return { ok: false, error: 'Semantic search is not ready. Use search_notes, or ask the user to build the memory index.' };
	}
	const limit = num(args, 'limit', 10);
	const hits = await ctx.memory.search(query, limit);
	return { ok: true, data: { total: hits.length, results: hits.map((hit) => describeHit(ctx, hit)) } };
}

/** Notes/tasks most similar to one entity. */
async function relatedNotes(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
	const raw = str(args, 'id');
	if (!raw) return { ok: false, error: '`id` is required.' };
	const kind = str(args, 'kind') === 'task' ? 'task' : 'note';
	const entity = kind === 'task' ? findTask(ctx.snapshot, raw, str(args, 'workspace')) : findNote(ctx.snapshot, raw, str(args, 'workspace'));
	const id = entity?.id ?? bareId(raw);
	if (!ctx.memory?.ready()) {
		return { ok: false, error: 'Semantic recall is not ready. Ask the user to build the memory index first.' };
	}
	const limit = num(args, 'limit', 8);
	const hits = await ctx.memory.related(kind, id, limit);
	return { ok: true, data: { total: hits.length, results: hits.map((hit) => describeHit(ctx, hit)) } };
}

/** Turns a memory hit into a titled, referenced entry the model can cite. */
function describeHit(ctx: ToolContext, hit: MemoryHit): Record<string, unknown> {
	const nodeId = `${hit.entityKind}:${hit.entityId}`;
	const node = ctx.snapshot.graph.nodes.find((item) => item.id === nodeId);
	return {
		kind: hit.entityKind,
		id: hit.entityId,
		ref: node ? `${node.workspaceId}/${node.entityId}` : hit.entityId,
		title: node?.title ?? hit.entityId,
		score: Number(hit.score.toFixed(4))
	};
}

/** The topic clusters, when the index has produced any. */
async function listThemes(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
	if (!ctx.memory?.ready()) {
		return { ok: false, error: 'Themes are not ready. Ask the user to build the memory index first.' };
	}
	const limit = num(args, 'limit', 8);
	const themes = await ctx.memory.themes(limit);
	return {
		ok: true,
		data: {
			total: themes.length,
			themes: themes.map((theme) => ({
				label: theme.label,
				members: theme.members.map((member) => describeHit(ctx, member))
			}))
		}
	};
}

/** Verified contradictions among the most similar notes (#D10). */
async function findContradictionsTool(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
	if (!ctx.memory?.ready()) {
		return { ok: false, error: 'Contradiction search needs the memory index. Ask the user to build it first.' };
	}
	const limit = num(args, 'limit', 10);
	const pairs = await ctx.memory.contradictions(limit);
	if (pairs.length === 0) {
		return {
			ok: true,
			data: { total: 0, pairs: [], note: 'No contradictions found, or the assistant is not configured.' }
		};
	}
	return {
		ok: true,
		data: {
			total: pairs.length,
			pairs: pairs.map((pair) => ({
				reason: pair.label,
				members: pair.members.map((member) => describeHit(ctx, member))
			}))
		}
	};
}

function getNote(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const raw = str(args, 'id');
	if (!raw) return { ok: false, error: '`id` is required.' };
	const note = findNote(ctx.snapshot, raw, str(args, 'workspace')) ?? findByTitle(notesOf(ctx.snapshot), raw);
	if (!note) {
		return { ok: false, error: `No note with id \`${raw}\`. Use list_notes or search_notes first.` };
	}

	const nodeId = `note:${note.id}`;
	const neighbors = ctx.snapshot.graph.edges
		.filter((edge) => edge.source === nodeId || edge.target === nodeId)
		.map((edge) => (edge.source === nodeId ? edge.target : edge.source));
	const linked = [...new Set(neighbors)]
		.map((id) => ctx.snapshot.graph.nodes.find((node) => node.id === id))
		.filter((node): node is NonNullable<typeof node> => Boolean(node))
		.map((node) => ({ ref: `${node.workspaceId}/${node.entityId}`, title: node.title, kind: node.kind }));

	// Absent means withheld by the size budget, never "the note is empty" —
	// saying that would be the most confident wrong answer we could give.
	if (note.body === undefined) {
		return {
			ok: false,
			error:
				'The body of this note was left out of the workspace snapshot to keep it within the size budget. The note is not empty: its excerpt, tags and links are in list_notes/search_notes, and the chat was told content was withheld. Ask the user to narrow the workspace if you need the full text.'
		};
	}

	return {
		ok: true,
		data: {
			...noteSummary(note),
			body: note.body,
			// Present only when the text was cut short at the byte cap, so the
			// model knows to look for the rest instead of quoting it as all.
			...(note.truncated ? { truncated: true } : {}),
			links: linked
		}
	};
}

function listTasks(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const includeDone = bool(args, 'includeDone') ?? true;
	const limit = num(args, 'limit', DEFAULT_LIMIT);
	const filtered = filterTasks(ctx.snapshot, { ...taskFiltersFrom(args), includeDone });
	const sorted = sortTasks(filtered);
	return {
		ok: true,
		data: { total: sorted.length, tasks: sorted.slice(0, limit).map(taskSummary) }
	};
}

function getTask(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const raw = str(args, 'id');
	if (!raw) return { ok: false, error: '`id` is required.' };
	const task = findTask(ctx.snapshot, raw, str(args, 'workspace')) ?? findByTitle(tasksOf(ctx.snapshot), raw);
	if (!task) {
		return { ok: false, error: `No task with id \`${raw}\`. Use list_tasks first.` };
	}
	return {
		ok: true,
		data: {
			...taskSummary(task),
			notes: task.notes,
			blockedBy: task.blockedBy,
			blocking: task.blocking
		}
	};
}

function taskBoard(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const workspace = str(args, 'workspace');
	const columns = ['todo', 'doing', 'review', 'done'].map((status) => {
		const tasks = tasksOf(ctx.snapshot, workspace)
			.filter((task) => task.status === status)
			.sort((a, b) => a.position - b.position);
		return { status, count: tasks.length, tasks: tasks.map((task) => ({ ref: ref(task), title: task.title })) };
	});
	return { ok: true, data: { columns } };
}

function dailySummary(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const workspace = str(args, 'workspace');
	const tasks = tasksOf(ctx.snapshot, workspace);
	const inProgress = tasks
		.filter((task) => task.status === 'doing')
		.sort((a, b) => a.position - b.position)
		.map(taskSummary);
	const recentNotes = [...notesOf(ctx.snapshot, workspace)]
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, 10)
		.map(noteSummary);
	return {
		ok: true,
		data: {
			openTasks: tasks.filter((task) => task.status !== 'done').length,
			doneTasks: tasks.filter((task) => task.status === 'done').length,
			blocked: tasks.filter((task) => task.blocked).map(taskSummary),
			inProgress,
			recentNotes
		}
	};
}

/** Folder ids with note counts, so a note can be filed by id (not label). */
function listFolders(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const workspace = str(args, 'workspace');
	const counts = new Map<string, { id: string; workspaceId: string; noteCount: number }>();
	for (const note of notesOf(ctx.snapshot, workspace)) {
		const key = `${note.workspaceId}\0${note.folder}`;
		const entry = counts.get(key);
		if (entry) entry.noteCount += 1;
		else counts.set(key, { id: note.folder, workspaceId: note.workspaceId, noteCount: 1 });
	}
	const folders = [...counts.values()].sort((a, b) => a.id.localeCompare(b.id));
	return { ok: true, data: { total: folders.length, folders } };
}

/** Every tag in use with its note count — the vocabulary before tagging. */
function listTags(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const workspace = str(args, 'workspace');
	const counts = new Map<string, { tag: string; workspaceId: string; noteCount: number }>();
	for (const note of notesOf(ctx.snapshot, workspace)) {
		for (const tag of note.tags) {
			const key = `${note.workspaceId}\0${tag}`;
			const entry = counts.get(key);
			if (entry) entry.noteCount += 1;
			else counts.set(key, { tag, workspaceId: note.workspaceId, noteCount: 1 });
		}
	}
	const tags = [...counts.values()].sort(
		(a, b) => b.noteCount - a.noteCount || a.tag.localeCompare(b.tag)
	);
	return { ok: true, data: { total: tags.length, tags } };
}

function graphQuery(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const raw = str(args, 'id');
	if (!raw) return { ok: false, error: '`id` is required.' };
	const id = bareId(raw);
	const kind = str(args, 'kind');
	const depth = Math.min(num(args, 'depth', 1), 3);

	// Accept either a bare entity id or a prefixed graph node id.
	const start = ctx.snapshot.graph.nodes.find(
		(node) => node.entityId === id || node.id === raw
	);
	if (!start) return { ok: false, error: `No graph node for \`${raw}\`.` };

	const seen = new Set([start.id]);
	let frontier = [start.id];
	const edges: typeof ctx.snapshot.graph.edges = [];
	for (let hop = 0; hop < depth; hop += 1) {
		const next: string[] = [];
		for (const edge of ctx.snapshot.graph.edges) {
			if (kind && edge.kind !== kind) continue;
			if (!frontier.includes(edge.source) && !frontier.includes(edge.target)) continue;
			edges.push(edge);
			const other = frontier.includes(edge.source) ? edge.target : edge.source;
			if (!seen.has(other)) {
				seen.add(other);
				next.push(other);
			}
		}
		frontier = next;
		if (!frontier.length) break;
	}
	const nodes = ctx.snapshot.graph.nodes
		.filter((node) => seen.has(node.id))
		.map((node) => ({ id: node.id, title: node.title, kind: node.kind, orphan: node.orphan }));
	return { ok: true, data: { nodes, edges } };
}

/** Runs a read tool. Returns null when `name` is not a known read tool. */
export function runRead(
	ctx: ToolContext,
	name: string,
	args: Record<string, unknown>
): ToolResult | null {
	switch (name) {
		case 'list_notes':
			return listNotes(ctx, args);
		case 'search_notes':
			return searchNotes(ctx, args);
		case 'search_tasks':
			return searchTasks(ctx, args);
		case 'search_all':
			return searchAll(ctx, args);
		case 'get_note':
			return getNote(ctx, args);
		case 'list_tasks':
			return listTasks(ctx, args);
		case 'get_task':
			return getTask(ctx, args);
		case 'task_board':
			return taskBoard(ctx, args);
		case 'daily_summary':
			return dailySummary(ctx, args);
		case 'graph_query':
			return graphQuery(ctx, args);
		case 'list_folders':
			return listFolders(ctx, args);
		case 'list_tags':
			return listTags(ctx, args);
		default:
			return null;
	}
}

/** The assistant-only reads that reach outside the snapshot. */
export const ASSISTANT_READS = {
	semanticSearch,
	relatedNotes,
	listThemes,
	findContradictions: findContradictionsTool
};
