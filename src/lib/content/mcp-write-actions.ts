/**
 * Write actions for MCP tool calls (docs/design/mcp-local-free.md #D2, §13b).
 *
 * These run inside the always-alive `workspace` window, not in the shim. They
 * go through repositories with an explicit `workspaceId` — the stores are
 * workspace-scoped and would write to the wrong workspace for a cross-workspace
 * call — but they validate explicitly first (`canAddDependency`,
 * `applyTaskPatch`) and then emit the same `*-changed` events the UI already
 * listens for, so every open window refreshes without a restart.
 */

import { browser } from '$app/environment';
import { emit } from '@tauri-apps/api/event';
import { buildExcerpt, countWords, createNote, type Note } from '$lib/content/content';
import type { McpErrorCode } from '$lib/content/mcp-types';
import { dependenciesRepo, foldersRepo, notesRepo, tasksRepo } from '$lib/db';
import { NOTES_CHANGED } from '$lib/stores/notes';
import { DEPENDENCIES_CHANGED } from '$lib/stores/dependencies.svelte';
import { TASKS_CHANGED } from '$lib/stores/tasks.svelte';
import {
	applyTaskPatch,
	canAddDependency,
	createTask,
	isTaskPriority,
	isTaskStatus,
	normalizeNoteIds,
	taskNoteIds,
	type Task,
	type TaskDependency,
	type TaskPatch,
} from '$lib/stores/tasks';
import { isTauri } from '$lib/windows';

/** Outcome of a write: either data for the shim, or a coded error. */
export type WriteOutcome =
	| { ok: true; data: unknown }
	| { ok: false; error: McpErrorCode; message: string };

/** Everything a write action may read and mutate. */
export type WriteContext = {
	notes: Note[];
	tasks: Task[];
	dependencies: TaskDependency[];
	workspaceIds: Set<string>;
};

export function fail(error: McpErrorCode, message: string): WriteOutcome {
	return { ok: false, error, message };
}

/** Resolves a workspace argument, rejecting an unknown id instead of guessing. */
export function resolveWorkspace(
	context: WriteContext,
	workspace: string | undefined
): { ok: true; id: string } | { ok: false; error: McpErrorCode; message: string } {
	if (!workspace) return { ok: true, id: 'workspace-default' };
	if (!context.workspaceIds.has(workspace)) {
		return { ok: false, error: 'unknown_workspace', message: `Unknown workspace \`${workspace}\`.` };
	}
	return { ok: true, id: workspace };
}

async function notify(channel: string): Promise<void> {
	if (!browser || !isTauri) return;
	await emit(channel).catch(() => undefined);
}

/**
 * Splits a `<workspaceId>/<entityId>` reference into its parts, or returns the
 * bare id. Every id in an MCP response is prefixed (§13b), so an agent will
 * usually echo one back and the write path must accept it just like reads do.
 */
export function parseEntityRef(raw: string): { workspaceId: string | null; id: string } {
	const slash = raw.indexOf('/');
	if (slash <= 0 || slash === raw.length - 1) return { workspaceId: null, id: raw };
	return { workspaceId: raw.slice(0, slash), id: raw.slice(slash + 1) };
}

type RecordLike = { id: string; workspaceId?: string };

/**
 * Resolves a record by bare id or prefixed ref. Returns an error when a bare id
 * matches more than one workspace, so an ambiguous call never edits the wrong
 * record (§13b).
 */
function resolveRecord<T extends RecordLike>(
	records: T[],
	raw: string
): { found: T } | WriteOutcome {
	const { workspaceId, id } = parseEntityRef(raw);
	const matches = records.filter(
		(record) =>
			record.id === id &&
			(workspaceId === null || (record.workspaceId || 'workspace-default') === workspaceId)
	);
	if (matches.length === 0) return { ok: false, error: 'not_found', message: `No record with id \`${raw}\`.` };
	if (matches.length > 1) {
		return {
			ok: false,
			error: 'ambiguous_id',
			message: `\`${id}\` exists in more than one workspace; use a <workspaceId>/<id> prefix.`,
		};
	}
	return { found: matches[0] };
}

function findNote(context: WriteContext, id: string): Note | undefined {
	const resolved = resolveRecord(context.notes, id);
	return 'found' in resolved ? resolved.found : undefined;
}

/** Resolves a task id for a tool call, surfacing `ambiguous_id`/`not_found`. */
function taskOrError(context: WriteContext, raw: string): { found: Task } | WriteOutcome {
	return resolveRecord(context.tasks, raw);
}

/** Resolves a note id for a tool call, surfacing `ambiguous_id`/`not_found`. */
function noteOrError(context: WriteContext, raw: string): { found: Note } | WriteOutcome {
	return resolveRecord(context.notes, raw);
}

// --- notes ------------------------------------------------------------------

export type CreateNoteArgs = {
	title?: unknown;
	body?: unknown;
	folder?: unknown;
	tags?: unknown;
	workspace?: string;
};

export async function createNoteAction(
	context: WriteContext,
	args: CreateNoteArgs
): Promise<WriteOutcome> {
	const workspace = resolveWorkspace(context, args.workspace);
	if (!workspace.ok) return workspace;
	const note = createNote({
		title: typeof args.title === 'string' ? args.title : undefined,
		body: typeof args.body === 'string' ? args.body : undefined,
		folder: typeof args.folder === 'string' ? args.folder : undefined,
		tags: Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
		workspaceId: workspace.id,
		updatedAt: Date.now(),
	});
	note.updated = 'Just now';
	try {
		await notesRepo.upsert(note);
	} catch {
		return fail('write_failed', 'The note could not be saved.');
	}
	await notify(NOTES_CHANGED);
	return { ok: true, data: { note: { id: note.id, workspaceId: note.workspaceId, title: note.title } } };
}

export type UpdateNoteBodyArgs = { id?: unknown; body?: unknown; workspace?: string };

/**
 * Replaces a note body. The host writes a backup first (§13a), so this stays a
 * plain, validated mutation.
 */
export async function updateNoteBodyAction(
	context: WriteContext,
	args: UpdateNoteBodyArgs
): Promise<WriteOutcome> {
	if (typeof args.body !== 'string') return fail('bad_arguments', '`body` is required.');
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	const found = noteOrError(context, args.id);
	if (!('found' in found)) return found;
	const note = found.found;
	const next = {
		...note,
		body: args.body,
		excerpt: buildExcerpt(args.body),
		words: countWords(args.body),
		chars: args.body.length,
		updated: 'Just now',
		updatedAt: Date.now(),
	};
	try {
		await notesRepo.upsert(next);
	} catch {
		return fail('write_failed', 'The note could not be saved.');
	}
	await notify(NOTES_CHANGED);
	return { ok: true, data: { note: { id: next.id, workspaceId: next.workspaceId, chars: next.chars } } };
}

export type DeleteNoteArgs = { id?: unknown; workspace?: string };

export async function deleteNoteAction(
	context: WriteContext,
	args: DeleteNoteArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	const found = noteOrError(context, args.id);
	if (!('found' in found)) return found;
	const note = found.found;
	try {
		await notesRepo.remove(note.id);
	} catch {
		return fail('write_failed', 'The note could not be deleted.');
	}
	await notify(NOTES_CHANGED);
	return { ok: true, data: { deleted: note.id, workspaceId: note.workspaceId } };
}

// --- tasks ------------------------------------------------------------------

export type CreateTaskArgs = {
	title?: unknown;
	status?: unknown;
	priority?: unknown;
	folder?: unknown;
	dueAt?: unknown;
	startAt?: unknown;
	notes?: unknown;
	noteIds?: unknown;
	workspace?: string;
};

export async function createTaskAction(
	context: WriteContext,
	args: CreateTaskArgs
): Promise<WriteOutcome> {
	const workspace = resolveWorkspace(context, args.workspace);
	if (!workspace.ok) return workspace;
	if (typeof args.title !== 'string' || !args.title.trim()) {
		return fail('bad_arguments', '`title` is required.');
	}
	const status = typeof args.status === 'string' && isTaskStatus(args.status) ? args.status : 'todo';
	const priority =
		typeof args.priority === 'string' && isTaskPriority(args.priority) ? args.priority : 'medium';
	const noteIds = normalizeNoteIds(
		Array.isArray(args.noteIds)
			? args.noteIds.filter((id): id is string => typeof id === 'string')
			: typeof args.notes === 'string'
				? [args.notes]
				: []
	).filter((id) => findNote(context, id));
	const task = createTask({
		title: args.title,
		status,
		priority,
		folder: typeof args.folder === 'string' ? args.folder : undefined,
		dueAt: typeof args.dueAt === 'string' ? args.dueAt : null,
		startAt: typeof args.startAt === 'string' ? args.startAt : null,
		noteIds,
		workspaceId: workspace.id,
		position: nextTaskPosition(context, workspace.id, status),
	});
	try {
		await tasksRepo.upsert(task);
	} catch {
		return fail('write_failed', 'The task could not be saved.');
	}
	await notify(TASKS_CHANGED);
	return { ok: true, data: { task: { id: task.id, workspaceId: task.workspaceId, title: task.title } } };
}

function nextTaskPosition(context: WriteContext, workspaceId: string, status: string): number {
	const column = context.tasks.filter(
		(task) => (task.workspaceId || 'workspace-default') === workspaceId && task.status === status
	);
	return column.reduce((max, task) => Math.max(max, task.position), -1) + 1;
}

export type UpdateTaskArgs = { id?: unknown; patch?: unknown; workspace?: string };

export async function updateTaskAction(
	context: WriteContext,
	args: UpdateTaskArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	const found = taskOrError(context, args.id);
	if (!('found' in found)) return found;
	const task = found.found;
	const rawPatch = args.patch;
	if (!rawPatch || typeof rawPatch !== 'object') return fail('bad_arguments', '`patch` is required.');
	const patch = sanitizeTaskPatch(rawPatch as Record<string, unknown>);
	const next = applyTaskPatch(task, patch);
	try {
		await tasksRepo.upsert(next);
	} catch {
		return fail('write_failed', 'The task could not be saved.');
	}
	await notify(TASKS_CHANGED);
	return { ok: true, data: { task: { id: next.id, workspaceId: next.workspaceId, status: next.status } } };
}

function sanitizeTaskPatch(raw: Record<string, unknown>): TaskPatch {
	const patch: TaskPatch = {};
	if (typeof raw.title === 'string') patch.title = raw.title;
	if (typeof raw.notes === 'string') patch.notes = raw.notes;
	if (typeof raw.status === 'string' && isTaskStatus(raw.status)) patch.status = raw.status;
	if (typeof raw.priority === 'string' && isTaskPriority(raw.priority)) patch.priority = raw.priority;
	if (typeof raw.folder === 'string') patch.folder = raw.folder;
	if (typeof raw.dueAt === 'string' || raw.dueAt === null) patch.dueAt = raw.dueAt as string | null;
	if (typeof raw.startAt === 'string' || raw.startAt === null) patch.startAt = raw.startAt as string | null;
	if (typeof raw.completed === 'boolean') patch.completed = raw.completed;
	if (typeof raw.overlay === 'boolean') patch.overlay = raw.overlay;
	if (Array.isArray(raw.noteIds)) {
		patch.noteIds = normalizeNoteIds(raw.noteIds.filter((id): id is string => typeof id === 'string'));
	}
	return patch;
}

export type TaskIdArgs = { id?: unknown; workspace?: string };

export async function completeTaskAction(
	context: WriteContext,
	args: TaskIdArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	const found = taskOrError(context, args.id);
	if (!('found' in found)) return found;
	const task = found.found;
	const next = applyTaskPatch(task, { status: 'done' });
	try {
		await tasksRepo.upsert(next);
	} catch {
		return fail('write_failed', 'The task could not be completed.');
	}
	await notify(TASKS_CHANGED);
	return { ok: true, data: { task: { id: next.id, workspaceId: next.workspaceId, status: next.status } } };
}

export async function deleteTaskAction(
	context: WriteContext,
	args: TaskIdArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	const found = taskOrError(context, args.id);
	if (!('found' in found)) return found;
	const task = found.found;
	try {
		await tasksRepo.remove(task.id);
	} catch {
		return fail('write_failed', 'The task could not be deleted.');
	}
	await notify(TASKS_CHANGED);
	return { ok: true, data: { deleted: task.id, workspaceId: task.workspaceId } };
}

// --- dependencies -----------------------------------------------------------

export type LinkTasksArgs = { id?: unknown; dependsOn?: unknown; workspace?: string };

export async function linkTasksAction(
	context: WriteContext,
	args: LinkTasksArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string' || typeof args.dependsOn !== 'string') {
		return fail('bad_arguments', '`id` and `dependsOn` are required.');
	}
	const foundTask = taskOrError(context, args.id);
	if (!('found' in foundTask)) return foundTask;
	const foundDependency = taskOrError(context, args.dependsOn);
	if (!('found' in foundDependency)) return foundDependency;
	const task = foundTask.found;
	const dependency = foundDependency.found;
	if (!canAddDependency(task.id, dependency.id, context.tasks, context.dependencies)) {
		// `canAddDependency` covers self-links, cross-workspace and cycles.
		return fail(
			'dependency_cycle',
			'That dependency is invalid: it repeats an existing link, crosses workspaces, or creates a cycle.'
		);
	}
	try {
		await dependenciesRepo.add(task.id, dependency.id, task.workspaceId || 'workspace-default');
	} catch {
		return fail('write_failed', 'The dependency could not be saved.');
	}
	await notify(DEPENDENCIES_CHANGED);
	return { ok: true, data: { taskId: task.id, dependsOnTaskId: dependency.id } };
}

export async function unlinkTasksAction(
	context: WriteContext,
	args: LinkTasksArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string' || typeof args.dependsOn !== 'string') {
		return fail('bad_arguments', '`id` and `dependsOn` are required.');
	}
	const taskId = parseEntityRef(args.id).id;
	const dependsOnTaskId = parseEntityRef(args.dependsOn).id;
	try {
		await dependenciesRepo.remove(taskId, dependsOnTaskId);
	} catch {
		return fail('write_failed', 'The dependency could not be removed.');
	}
	await notify(DEPENDENCIES_CHANGED);
	return { ok: true, data: { taskId, dependsOnTaskId } };
}

/** Notes a task links to, exposed for the audit detail. */
export { taskNoteIds };
