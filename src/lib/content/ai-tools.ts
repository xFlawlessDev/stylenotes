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
	updateNoteBodyAction,
	updateTaskAction,
	type WriteContext,
	type WriteOutcome
} from '$lib/content/mcp-write-actions';
import { findAiTool } from '$lib/content/ai-tool-schema';

/** Result handed back to the model as the tool message content. */
export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Everything the executor needs, injected so it stays testable. */
export type ToolContext = {
	snapshot: McpSnapshot;
	write: WriteContext;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function num(args: Record<string, unknown>, key: string, fallback: number): number {
	const value = args[key];
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function str(args: Record<string, unknown>, key: string): string | undefined {
	const value = args[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function bool(args: Record<string, unknown>, key: string): boolean | undefined {
	const value = args[key];
	return typeof value === 'boolean' ? value : undefined;
}

/** `<workspaceId>/<entityId>` — the ref every id in a response carries. */
function ref(item: { id: string; workspaceId: string }): string {
	return `${item.workspaceId}/${item.id}`;
}

function inWorkspace(item: { workspaceId: string }, workspace?: string): boolean {
	return !workspace || item.workspaceId === workspace;
}

/** Strips a `<workspaceId>/` prefix, returning the bare id. */
function bareId(raw: string): string {
	const slash = raw.indexOf('/');
	return slash > 0 ? raw.slice(slash + 1) : raw;
}

function notesOf(ctx: ToolContext, workspace?: string): McpSnapshotNote[] {
	return ctx.snapshot.notes.filter((note) => inWorkspace(note, workspace));
}

function tasksOf(ctx: ToolContext, workspace?: string): McpSnapshotTask[] {
	return ctx.snapshot.tasks.filter((task) => inWorkspace(task, workspace));
}

/** Substring search over titles, tags and bodies, case-insensitive. */
function matchesQuery(note: McpSnapshotNote, query: string): boolean {
	const needle = query.toLowerCase();
	return (
		note.title.toLowerCase().includes(needle) ||
		note.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
		(note.body ?? '').toLowerCase().includes(needle) ||
		note.excerpt.toLowerCase().includes(needle)
	);
}

/** Finds one note by bare id or prefixed ref; ambiguous ids are errors. */
function findNote(ctx: ToolContext, raw: string, workspace?: string): McpSnapshotNote | null {
	const id = bareId(raw);
	const matches = notesOf(ctx).filter(
		(note) => note.id === id && (!workspace || note.workspaceId === workspace)
	);
	return matches.length === 1 ? matches[0] : null;
}

function findTask(ctx: ToolContext, raw: string, workspace?: string): McpSnapshotTask | null {
	const id = bareId(raw);
	const matches = tasksOf(ctx).filter(
		(task) => task.id === id && (!workspace || task.workspaceId === workspace)
	);
	return matches.length === 1 ? matches[0] : null;
}

/** A compact note view — bodies are only included for `get_note`. */
function noteSummary(note: McpSnapshotNote) {
	return {
		ref: ref(note),
		title: note.title,
		folder: note.folder,
		tags: note.tags,
		pinned: note.pinned,
		excerpt: note.excerpt,
		updatedAt: note.updatedAt
	};
}

function taskSummary(task: McpSnapshotTask) {
	return {
		ref: ref(task),
		title: task.title,
		status: task.status,
		priority: task.priority,
		folder: task.folder,
		dueAt: task.dueAt,
		blocked: task.blocked,
		noteIds: task.noteIds
	};
}

/** Priority high-first, then due date, then board position. */
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
function sortTasks(tasks: McpSnapshotTask[]): McpSnapshotTask[] {
	return [...tasks].sort((a, b) => {
		const rank = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
		if (rank !== 0) return rank;
		const dueA = a.dueAt ?? '9999-12-31';
		const dueB = b.dueAt ?? '9999-12-31';
		if (dueA !== dueB) return dueA < dueB ? -1 : 1;
		return a.position - b.position;
	});
}

// --- read tools -------------------------------------------------------------

function listNotes(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const workspace = str(args, 'workspace');
	const folder = str(args, 'folder');
	const tag = str(args, 'tag');
	const pinnedOnly = bool(args, 'pinnedOnly') ?? false;
	const limit = num(args, 'limit', DEFAULT_LIMIT);

	const notes = notesOf(ctx, workspace).filter(
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
	const notes = notesOf(ctx, workspace).filter((note) => matchesQuery(note, query));
	return {
		ok: true,
		data: { total: notes.length, notes: notes.slice(0, limit).map(noteSummary) }
	};
}

function getNote(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const raw = str(args, 'id');
	if (!raw) return { ok: false, error: '`id` is required.' };
	const note = findNote(ctx, raw, str(args, 'workspace'));
	if (!note) return { ok: false, error: `No note with id \`${raw}\`.` };

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

	const tasks = tasksOf(ctx, workspace).filter(
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
	const task = findTask(ctx, raw, str(args, 'workspace'));
	if (!task) return { ok: false, error: `No task with id \`${raw}\`.` };
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
		const tasks = tasksOf(ctx, workspace)
			.filter((task) => task.status === status)
			.sort((a, b) => a.position - b.position);
		return { status, count: tasks.length, tasks: tasks.map((task) => ({ ref: ref(task), title: task.title })) };
	});
	return { ok: true, data: { columns } };
}

function dailySummary(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
	const workspace = str(args, 'workspace');
	const tasks = tasksOf(ctx, workspace);
	const inProgress = tasks
		.filter((task) => task.status === 'doing')
		.sort((a, b) => a.position - b.position)
		.map(taskSummary);
	const recentNotes = [...notesOf(ctx, workspace)]
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

/**
 * Executes one tool call. Read tools run immediately; write tools run only when
 * `confirmed` is true, so an unconfirmed write returns a refusal the model can
 * relay instead of mutating anything.
 */
export async function executeToolCall(
	ctx: ToolContext,
	name: string,
	rawArgs: string,
	options: { confirmed: boolean }
): Promise<ToolResult> {
	const spec = findAiTool(name);
	if (!spec) return { ok: false, error: `Unknown tool \`${name}\`.` };

	let args: Record<string, unknown>;
	try {
		args = rawArgs.trim() ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
	} catch {
		return { ok: false, error: 'Tool arguments were not valid JSON.' };
	}

	if (spec.kind === 'read') {
		return runRead(ctx, name, args) ?? { ok: false, error: `Unknown tool \`${name}\`.` };
	}
	if (!options.confirmed) {
		return { ok: false, error: 'The user declined this action.' };
	}
	return (await runWrite(ctx, name, args)) ?? { ok: false, error: `Unknown tool \`${name}\`.` };
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
	switch (name) {
		case 'create_note':
			return `Create a note${title ? ` “${title}”` : ''}`;
		case 'create_task':
			return `Create a task${title ? ` “${title}”` : ''}`;
		case 'update_note_body':
			return 'Replace a note’s body';
		case 'update_task':
			return 'Update a task';
		case 'complete_task':
			return 'Mark a task done';
		case 'delete_note':
			return 'Delete a note';
		case 'delete_task':
			return 'Delete a task';
		default:
			return name;
	}
}
