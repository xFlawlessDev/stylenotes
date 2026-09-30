/**
 * Snapshot builder for the local MCP bridge (docs/design/mcp-local-free.md #D3).
 *
 * Pure and unit-tested: given the app's notes, tasks, dependencies, folders and
 * workspaces it produces the JSON document the shim reads. It reuses the same
 * `isTaskBlocked` / `taskBlockers` / `taskDependents` and `buildWorkspaceGraph`
 * the UI uses, so a tool answer can never disagree with what the user sees.
 */

import type { Note } from '$lib/content/content';
import {
	MCP_FLAG_BODY_BYTES,
	MCP_MAX_BODY_BYTES,
	MCP_MAX_NOTES,
	MCP_MAX_SNAPSHOT_BYTES,
	MCP_MAX_TASKS,
	MCP_PROTOCOL,
	type McpSnapshot,
	type McpSnapshotFolder,
	type McpSnapshotNote,
	type McpSnapshotTask,
} from '$lib/content/mcp-types';
import { buildWorkspaceGraph } from '$lib/content/workspace-graph';
import { isTaskBlocked, taskBlockers, taskDependents, taskNoteIds, taskStatus, type Task, type TaskDependency } from '$lib/stores/tasks';
import type { CustomFolder } from '$lib/stores/notes';
import type { Workspace } from '$lib/workspace';

export type SnapshotInput = {
	notes: Note[];
	tasks: Task[];
	dependencies: TaskDependency[];
	folders: CustomFolder[];
	workspaces: Workspace[];
	revision: number;
	appRunning: boolean;
	generatedAt: string;
	/**
	 * The user's civil day as `YYYY-MM-DD` (#D19). Callers derive it from
	 * `settings.timezone`; omitting it falls back to the UTC day so the snapshot
	 * is never left without a usable date.
	 */
	today?: string;
};

/**
 * The `YYYY-MM-DD` day a timestamp falls on in `timeZone`.
 *
 * An invalid or empty zone yields the UTC day rather than throwing: `timezone`
 * is free-form user input, and a bad value must not be able to break the bridge.
 */
export function localDay(at: Date, timeZone?: string): string {
	const iso = at.toISOString();
	if (!timeZone) return iso.slice(0, 10);
	try {
		// `en-CA` formats as YYYY-MM-DD, which is the shape `dueAt` already uses,
		// so a date comparison stays a plain string compare.
		return new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(at);
	} catch {
		return iso.slice(0, 10);
	}
}

/** Workspace id an entity belongs to, with the same fallback the DB uses. */
function workspaceOf(record: { workspaceId?: string }): string {
	return record.workspaceId || 'workspace-default';
}

/** Epoch millis of a note's last write, from `updatedAt` or the created date. */
function noteUpdatedAt(note: Note): number {
	if (typeof note.updatedAt === 'number' && Number.isFinite(note.updatedAt)) return note.updatedAt;
	if (typeof note.createdAt === 'number' && Number.isFinite(note.createdAt)) return note.createdAt;
	return 0;
}

/**
 * Builds the snapshot, downgrading to index-only mode when it would be too
 * large. The limits live here (app-side), never in the shim (#D3, Q4).
 */
export function buildMcpSnapshot(input: SnapshotInput): McpSnapshot {
	const noteCap = input.notes.length > MCP_MAX_NOTES;
	const taskCap = input.tasks.length > MCP_MAX_TASKS;
	const oversized = input.notes.some((note) => byteLength(note.body) > MCP_FLAG_BODY_BYTES);
	const reason = noteCap
		? 'note_count'
		: taskCap
			? 'task_count'
			: oversized
				? 'body_size'
				: null;
	let truncated = reason !== null;

	let notes = input.notes.slice(0, MCP_MAX_NOTES).map((note) => toSnapshotNote(note, !truncated));
	if (truncated) notes = notes.map((note) => stripBody(note));

	const snapshot: McpSnapshot = {
		protocol: MCP_PROTOCOL,
		revision: input.revision,
		generatedAt: input.generatedAt,
		today: input.today ?? input.generatedAt.slice(0, 10),
		truncated,
		truncatedReason: reason ?? undefined,
		appRunning: input.appRunning,
		workspaces: input.workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
		notes,
		tasks: input.tasks.slice(0, MCP_MAX_TASKS).map((task) => toSnapshotTask(task, input.tasks, input.dependencies)),
		dependencies: input.dependencies.map((dependency) => ({
			taskId: dependency.taskId,
			dependsOnTaskId: dependency.dependsOnTaskId,
		})),
		folders: toSnapshotFolders(input.folders, input.workspaces),
		graph: toSnapshotGraph(input),
	};

	// A final size guard: if bodies still push the document past the cap, fall
	// back to index-only rather than writing a file the shim may choke on.
	if (!truncated && byteLength(JSON.stringify(snapshot)) > MCP_MAX_SNAPSHOT_BYTES) {
		return buildIndexOnlySnapshot(input, snapshot);
	}
	return snapshot;
}

function buildIndexOnlySnapshot(input: SnapshotInput, base: McpSnapshot): McpSnapshot {
	return {
		...base,
		truncated: true,
		truncatedReason: 'snapshot_size',
		notes: base.notes.map(stripBody),
	};
}

function stripBody(note: McpSnapshotNote): McpSnapshotNote {
	const copy = { ...note };
	delete copy.body;
	return copy;
}

function toSnapshotNote(note: Note, includeBody: boolean): McpSnapshotNote {
	const capped = byteLength(note.body) > MCP_MAX_BODY_BYTES ? truncateBody(note.body) : note.body;
	const snapshot: McpSnapshotNote = {
		id: note.id,
		workspaceId: workspaceOf(note),
		title: note.title,
		folder: note.folder,
		tags: [...note.tags],
		pinned: note.pinned,
		overlay: note.overlay,
		excerpt: note.excerpt,
		createdAt: note.createdAt ?? noteUpdatedAt(note),
		updatedAt: noteUpdatedAt(note),
	};
	if (includeBody) snapshot.body = capped;
	return snapshot;
}

/** Keeps a body under the cap on a word boundary where possible. */
function truncateBody(body: string): string {
	const slice = body.slice(0, MCP_MAX_BODY_BYTES);
	const lastBreak = slice.lastIndexOf('\n');
	return lastBreak > MCP_MAX_BODY_BYTES / 2 ? slice.slice(0, lastBreak) : slice;
}

function byteLength(value: string): number {
	// `TextEncoder` exists in Node (tests) and the browser; fall back to a
	// conservative char count when it does not.
	if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
	return value.length * 2;
}

function toSnapshotTask(task: Task, all: Task[], dependencies: TaskDependency[]): McpSnapshotTask {
	return {
		id: task.id,
		workspaceId: workspaceOf(task),
		title: task.title,
		notes: task.notes,
		status: taskStatus(task),
		priority: task.priority,
		folder: task.folder,
		noteIds: taskNoteIds(task),
		startAt: task.startAt,
		dueAt: task.dueAt,
		position: task.position,
		completed: task.completed,
		overlay: task.overlay,
		blocked: isTaskBlocked(task, all, dependencies),
		blockedBy: taskBlockers(task.id, all, dependencies).map((blocker) => blocker.id),
		blocking: taskDependents(task.id, all, dependencies).map((dependent) => dependent.id),
	};
}

function toSnapshotFolders(folders: CustomFolder[], workspaces: Workspace[]): McpSnapshotFolder[] {
	// Folder rows carry no workspace in the store's type, so attribute them to
	// the workspaces that exist; an unknown folder is reported workspace-less.
	const known = new Set(workspaces.map((workspace) => workspace.id));
	return folders.map((folder) => ({
		id: folder.id,
		label: folder.label,
		workspaceId: known.has(folder.id) ? folder.id : 'workspace-default',
	}));
}

/** Precomputes the graph so `graph_query` never reimplements link resolution. */
function toSnapshotGraph(input: SnapshotInput) {
	const graph = buildWorkspaceGraph(input.notes, input.tasks, {
		folders: input.folders,
		dependencies: input.dependencies,
	});
	const workspaceByRecord = new Map<string, string>();
	for (const note of input.notes) workspaceByRecord.set(`note:${note.id}`, workspaceOf(note));
	for (const task of input.tasks) workspaceByRecord.set(`task:${task.id}`, workspaceOf(task));
	return {
		nodes: graph.nodes.map((node) => ({
			id: node.id,
			entityId: node.entityId,
			kind: node.kind,
			workspaceId: workspaceByRecord.get(node.id) ?? 'workspace-default',
			title: node.title,
			folder: node.folder,
			orphan: node.orphan,
			degree: node.degree,
			status: node.status,
		})),
		// Only the three real kinds ever reach the snapshot: suggestions are
		// dashed proposals the shim never sees (#D15), so the type stays narrow.
		edges: graph.edges
			.filter((edge): edge is typeof edge & { kind: 'wiki' | 'dependency' | 'link' } =>
				edge.kind === 'wiki' || edge.kind === 'dependency' || edge.kind === 'link'
			)
			.map((edge) => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				kind: edge.kind,
			})),
	};
}
