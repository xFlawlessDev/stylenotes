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

import { buildExcerpt, countWords, createNote, type Note } from '$lib/content/content';
import { formatRelative } from '$lib/content/version-format';
import {
	fail,
	findNote,
	noteOrError,
	notify,
	parseEntityRef,
	resolveWorkspace,
	taskOrError,
	workspaceGone,
	type WriteContext,
	type WriteOutcome
} from '$lib/content/mcp-write-context';
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

/** Re-exported so existing importers keep working; the source is the context module. */
export type { WriteContext, WriteOutcome } from '$lib/content/mcp-write-context';
export { parseEntityRef, resolveWorkspace, unsavedInWorkspace } from '$lib/content/mcp-write-context';

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
	note.updated = formatRelative(note.updatedAt ?? Date.now());
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
	const gone = workspaceGone(context, note.workspaceId);
	if (gone) return gone;
	const updatedAt = Date.now();
	const next = {
		...note,
		body: args.body,
		excerpt: buildExcerpt(args.body),
		words: countWords(args.body),
		chars: args.body.length,
		updated: formatRelative(updatedAt),
		updatedAt,
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

/**
 * Metadata-only patch for a note: title, folder, tags, pinned.
 *
 * `update_note_body` owns the prose; this owns everything around it, so an
 * agent that captured a note into the wrong folder or without tags can fix it
 * afterwards (#D17). An absent key means "leave it"; `null` is ignored too,
 * because there is no meaningful null for a title or a folder.
 */
export type NotePatch = {
	title?: string;
	folder?: string;
	tags?: string[];
	pinned?: boolean;
};

export type UpdateNoteArgs = { id?: unknown; patch?: unknown; workspace?: string };

export function sanitizeNotePatch(raw: Record<string, unknown>): NotePatch {
	const patch: NotePatch = {};
	if (typeof raw.title === 'string' && raw.title.trim()) patch.title = raw.title.trim();
	if (typeof raw.folder === 'string' && raw.folder.trim()) patch.folder = raw.folder.trim();
	if (Array.isArray(raw.tags)) {
		patch.tags = [
			...new Set(raw.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean))
		];
	}
	if (typeof raw.pinned === 'boolean') patch.pinned = raw.pinned;
	return patch;
}

/**
 * True when the patch asks for a title that is blank.
 *
 * A blank title is rejected rather than dropped: dropping it would turn the call
 * into a silent no-op that still reports success, and a model that meant to
 * rename a note has no way to notice.
 */
export function hasBlankTitle(raw: unknown): boolean {
	if (!raw || typeof raw !== 'object') return false;
	const title = (raw as Record<string, unknown>).title;
	return typeof title === 'string' && !title.trim();
}

export async function updateNoteAction(
	context: WriteContext,
	args: UpdateNoteArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	const found = noteOrError(context, args.id);
	if (!('found' in found)) return found;
	const note = found.found;
	const gone = workspaceGone(context, note.workspaceId);
	if (gone) return gone;
	if (!args.patch || typeof args.patch !== 'object') {
		return fail('bad_arguments', '`patch` is required.');
	}
	if (hasBlankTitle(args.patch)) {
		return fail('bad_arguments', '`title` must not be empty.');
	}
	const patch = sanitizeNotePatch(args.patch as Record<string, unknown>);
	const next = { ...note, ...patch };
	// A note cannot be without a title, and an empty patch would otherwise
	// report success while changing nothing.
	if (!next.title.trim()) return fail('bad_arguments', '`title` must not be empty.');
	try {
		await notesRepo.upsert(next);
	} catch {
		return fail('write_failed', 'The note could not be saved.');
	}
	await notify(NOTES_CHANGED);
	return {
		ok: true,
		data: {
			note: {
				id: next.id,
				workspaceId: next.workspaceId,
				title: next.title,
				folder: next.folder,
				tags: next.tags,
				pinned: next.pinned
			}
		}
	};
}

export async function deleteNoteAction(
	context: WriteContext,
	args: DeleteNoteArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	const found = noteOrError(context, args.id);
	if (!('found' in found)) return found;
	const note = found.found;
	const gone = workspaceGone(context, note.workspaceId);
	if (gone) return gone;
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
	const gone = workspaceGone(context, task.workspaceId);
	if (gone) return gone;
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
	const gone = workspaceGone(context, task.workspaceId);
	if (gone) return gone;
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
	const gone = workspaceGone(context, task.workspaceId);
	if (gone) return gone;
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
