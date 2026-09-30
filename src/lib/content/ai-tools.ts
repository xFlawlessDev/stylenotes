/**
 * Executor for AI chat tool calls.
 *
 * Reads filter the in-app snapshot (`buildMcpSnapshot`), the same document the
 * MCP shim answers from, so a chat answer can never disagree with what the UI
 * shows. Writes delegate to `mcp-write-actions.ts` — the validated, event-
 * emitting actions the MCP bridge already uses — so there is a single write
 * path in the app.
 *
 * Pure-ish: it takes the snapshot and write context as arguments, so it is
 * unit-testable without Tauri or the database.
 */

import type { McpSnapshot, McpSnapshotNote, McpSnapshotTask } from '$lib/content/mcp-types';
import {
	completeTaskAction,
	createNoteAction,
	createTaskAction,
	deleteNoteAction,
	deleteTaskAction,
	editNoteBodyAction,
	updateNoteAction,
	updateNoteBodyAction,
	updateTaskAction,
	type WriteContext,
	type WriteOutcome
} from '$lib/content/mcp-write-actions';
import { findAiTool } from '$lib/content/ai-tool-schema';
import { parseQuestions, answerSummary, type AnsweredQuestion, type QuestionItem } from '$lib/content/ai-questions';
import {
	bareId,
	bool,
	findByTitle,
	findNote,
	findTask,
	matchesQuery,
	noteSummary,
	notesOf,
	num,
	ref,
	sortTasks,
	str,
	taskSummary,
	tasksOf
} from '$lib/content/ai-read-helpers';

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
};

/** The two network calls the web tools need, provided by the store. */
export type WebHooks = {
	search: (query: string, limit: number) => Promise<ToolResult>;
	fetch: (url: string, maxChars?: number) => Promise<ToolResult>;
};

const DEFAULT_LIMIT = 50;
// --- read tools -------------------------------------------------------------

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
	const notes = notesOf(ctx.snapshot, workspace).filter((note) => matchesQuery(note, query));
	return {
		ok: true,
		data: { total: notes.length, notes: notes.slice(0, limit).map(noteSummary) }
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

	return { ok: true, data: { ...noteSummary(note), body: note.body ?? '', links: linked } };
}

function listTasks(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const workspace = str(args, 'workspace');
	const status = str(args, 'status');
	const priority = str(args, 'priority');
	const folder = str(args, 'folder');
	const includeDone = bool(args, 'includeDone') ?? true;
	const limit = num(args, 'limit', DEFAULT_LIMIT);

	const tasks = tasksOf(ctx.snapshot, workspace).filter(
		(task) =>
			(!status || task.status === status) &&
			(!priority || task.priority === priority) &&
			(!folder || task.folder === folder) &&
			(includeDone || task.status !== 'done')
	);
	const sorted = sortTasks(tasks);
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

// --- dispatch ---------------------------------------------------------------

/** Runs a read tool. Returns null when `name` is not a known read tool. */
function runRead(ctx: ToolContext, name: string, args: Record<string, unknown>): ToolResult | null {
	switch (name) {
		case 'list_notes':
			return listNotes(ctx, args);
		case 'search_notes':
			return searchNotes(ctx, args);
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

/** Maps a write action's coded failure into the model-facing error string. */
function fromWrite(outcome: WriteOutcome): ToolResult {
	return outcome.ok ? { ok: true, data: outcome.data } : { ok: false, error: outcome.message };
}

/**
 * Runs a write tool. Returns null when `name` is not a known write tool.
 * The caller must have already confirmed the action with the user.
 */
async function runWrite(
	ctx: ToolContext,
	name: string,
	args: Record<string, unknown>
): Promise<ToolResult | null> {
	switch (name) {
		case 'create_note':
			return fromWrite(await createNoteAction(ctx.write, args));
		case 'update_note_body':
			return fromWrite(await updateNoteBodyAction(ctx.write, args));
		case 'edit_note_body':
			return fromWrite(await editNoteBodyAction(ctx.write, args));
		case 'update_note':
			return fromWrite(await updateNoteAction(ctx.write, args));
		case 'delete_note':
			if (args.confirm !== true) return { ok: false, error: '`confirm` must be true to delete.' };
			return fromWrite(await deleteNoteAction(ctx.write, args));
		case 'create_task':
			return fromWrite(await createTaskAction(ctx.write, args));
		case 'update_task':
			return fromWrite(await updateTaskAction(ctx.write, args));
		case 'complete_task':
			return fromWrite(await completeTaskAction(ctx.write, args));
		case 'delete_task':
			if (args.confirm !== true) return { ok: false, error: '`confirm` must be true to delete.' };
			return fromWrite(await deleteTaskAction(ctx.write, args));
		default:
			return null;
	}
}

// --- assistant-only tools ---------------------------------------------------

/** Web search, or a clear message when it is not configured. */
async function webSearch(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
	if (!ctx.web) {
		return { ok: false, error: 'Web access is only available in the desktop app.' };
	}
	const query = str(args, 'query');
	if (!query) return { ok: false, error: '`query` is required.' };
	return ctx.web.search(query, num(args, 'limit', 5));
}

async function webFetch(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
	if (!ctx.web) {
		return { ok: false, error: 'Web access is only available in the desktop app.' };
	}
	const url = str(args, 'url');
	if (!url) return { ok: false, error: '`url` is required.' };
	const maxChars = num(args, 'maxChars', 12_000);
	return ctx.web.fetch(url, maxChars);
}

/**
 * Puts the model's questions to the user and waits for their answers.
 *
 * The wait is what makes this a real tool: the turn parks here until the card
 * is answered, and the answers become the tool result the model reads next.
 */
function askUserQuestion(
	ctx: ToolContext,
	rawArgs: string
): Promise<ToolResult> | ToolResult {
	if (!ctx.ask) {
		return { ok: false, error: 'Asking the user is not available here.' };
	}
	const parsed = parseQuestions(rawArgs);
	if ('error' in parsed) return { ok: false, error: parsed.error };

	return new Promise<ToolResult>((resolve) => {
		ctx.ask?.(parsed.questions, (answered) => {
			const summary = answerSummary(answered);
			resolve({ ok: true, data: summary });
		});
	});
}

/**
 * Executes one tool call. Read tools run immediately; write tools run only when
 * `confirmed` is true, so an unconfirmed write returns a refusal the model can
 * relay instead of mutating anything.
 *
 * `ask_user_question` is a read tool that blocks on the user rather than on
 * data, so it is awaited like a write.
 */
export async function executeToolCall(
	ctx: ToolContext,
	name: string,
	rawArgs: string,
	options: { confirmed: boolean }
): Promise<ToolResult> {
	const spec = findAiTool(name);
	if (!spec) return { ok: false, error: `Unknown tool \`${name}\`.` };

	if (spec.interactive) {
		return await askUserQuestion(ctx, rawArgs);
	}

	let args: Record<string, unknown>;
	try {
		args = rawArgs.trim() ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
	} catch {
		return { ok: false, error: 'Tool arguments were not valid JSON.' };
	}

	if (spec.kind === 'read') {
		if (name === 'web_search') return webSearch(ctx, args);
		if (name === 'web_fetch') return webFetch(ctx, args);
		return runRead(ctx, name, args) ?? { ok: false, error: `Unknown tool \`${name}\`.` };
	}
	if (!options.confirmed) {
		return { ok: false, error: 'The user declined this action.' };
	}
	return (await runWrite(ctx, name, args)) ?? { ok: false, error: `Unknown tool \`${name}\`.` };
}

/**
 * A readable sentence for an `edit_note_body` confirmation card.
 *
 * The confirmation is the user's only chance to catch a runaway sweep, so it
 * shows the needle and the scope rather than a generic "edit a note".
 */
function describeBodyEdit(args: Record<string, unknown>): string {
	if (args.op === 'insert') {
		const where = args.position === 'start' ? 'the start' : 'the end';
		return `Add text to ${where} of a note`;
	}
	const find = typeof args.find === 'string' ? args.find : '';
	const scope = args.occurrence === 'once' ? 'the first exact match' : 'every match';
	const shown = find.length > 60 ? `${find.slice(0, 60)}…` : find;
	return shown ? `Replace ${scope} of “${shown}” in a note` : 'Replace text in a note';
}

/** A short, human sentence describing what a call will do, for confirmation. */
export function describeToolCall(name: string, rawArgs: string): string {
	let args: Record<string, unknown> = {};
	try {
		args = rawArgs.trim() ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
	} catch {
		/* fall through to the generic label */
	}
	const title = typeof args.title === 'string' ? args.title : undefined;
	const query = typeof args.query === 'string' ? args.query : undefined;
	const url = typeof args.url === 'string' ? args.url : undefined;
	switch (name) {
		case 'create_note':
			return `Create a note${title ? ` “${title}”` : ''}`;
		case 'create_task':
			return `Create a task${title ? ` “${title}”` : ''}`;
		case 'update_note_body':
			return 'Replace a note’s body';
		case 'edit_note_body':
			return describeBodyEdit(args);
		case 'update_note':
			return 'Update a note’s title, folder, tags or pin';
		case 'update_task':
			return 'Update a task';
		case 'complete_task':
			return 'Mark a task done';
		case 'delete_note':
			return 'Delete a note';
		case 'delete_task':
			return 'Delete a task';
		case 'web_search':
			return `Search the web${query ? ` for “${query}”` : ''}`;
		case 'web_fetch':
			return `Read ${url ?? 'a web page'}`;
		case 'ask_user_question':
			return 'Ask you a question';
		default:
			return name;
	}
}
