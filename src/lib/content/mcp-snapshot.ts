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
 * Builds the snapshot, trimming it to the byte budget when it would be too
 * large. The limits live here (app-side), never in the shim (#D3, Q4).
 *
 * Trimming is progressive, not all-or-nothing: a body over
 * `MCP_MAX_BODY_BYTES` is cut and flagged on its own note, and only the
 * snapshot budget can take bodies away wholesale. One pathological note must
 * not leave the model staring at titles and excerpts for the other 19,999.
 */
export function buildMcpSnapshot(input: SnapshotInput): McpSnapshot {
	const noteCap = input.notes.length > MCP_MAX_NOTES;
	const taskCap = input.tasks.length > MCP_MAX_TASKS;
	const oversized = input.notes.some((note) => byteLength(note.body) > MCP_MAX_BODY_BYTES);
	const reason = noteCap
		? 'note_count'
		: taskCap
			? 'task_count'
			: oversized
				? 'body_size'
				: null;

	const snapshot: McpSnapshot = {
		protocol: MCP_PROTOCOL,
		revision: input.revision,
		generatedAt: input.generatedAt,
		today: input.today ?? input.generatedAt.slice(0, 10),
		truncated: reason !== null,
		indexOnly: false,
		truncatedReason: reason ?? undefined,
		appRunning: input.appRunning,
		workspaces: input.workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
		notes: input.notes.slice(0, MCP_MAX_NOTES).map(toSnapshotNote),
		tasks: input.tasks.slice(0, MCP_MAX_TASKS).map((task) => toSnapshotTask(task, input.tasks, input.dependencies)),
		dependencies: input.dependencies.map((dependency) => ({
			taskId: dependency.taskId,
			dependsOnTaskId: dependency.dependsOnTaskId,
		})),
		folders: toSnapshotFolders(input.folders, input.workspaces),
		graph: toSnapshotGraph(input),
	};

	// The final size guard: fits the document by withholding bodies, smallest
	// bodies kept first, rather than writing a file the shim may choke on.
	return packSnapshotBodies(snapshot, MCP_MAX_SNAPSHOT_BYTES);
}

/**
 * Fits `snapshot` into `maxBytes` by withholding note bodies, dropping the
 * largest first so the greatest number of notes keeps its text. Exported so
 * the test can pass a small budget instead of building a 32 MB document.
 *
 * The budget is the space left after removing every body, so the estimate is
 * made once instead of re-serializing per note; a final check falls back to
 * index-only when the estimate was optimistic.
 */
export function packSnapshotBodies(snapshot: McpSnapshot, maxBytes: number): McpSnapshot {
	if (byteLength(JSON.stringify(snapshot)) <= maxBytes) return snapshot;

	const withheld: McpSnapshot = { ...snapshot, notes: snapshot.notes.map(withholdBody) };
	const budget = maxBytes - byteLength(JSON.stringify(withheld));
	// Ascending by size: the loop keeps what fits, so the bloated note is the
	// first to go and the last one worth shipping when space runs out.
	const ranked = snapshot.notes
		.map((note, index) => ({ index, size: note.body ? jsonByteLength(note.body) : 0 }))
		.filter((entry) => entry.size > 0)
		.sort((left, right) => left.size - right.size);

	const kept = new Set<number>();
	let used = 0;
	for (const entry of ranked) {
		if (used + entry.size > budget) break;
		used += entry.size;
		kept.add(entry.index);
	}

	const notes = snapshot.notes.map((note, index) => (kept.has(index) ? note : withholdBody(note)));
	const packed: McpSnapshot = {
		...snapshot,
		notes,
		truncated: true,
		truncatedReason: snapshot.truncatedReason ?? 'snapshot_size',
		indexOnly: notes.every((note) => note.body === undefined),
	};
	return byteLength(JSON.stringify(packed)) <= maxBytes ? packed : toIndexOnly(packed);
}

/** Bodies dropped wholesale: every note keeps its index, none keeps its text. */
function toIndexOnly(snapshot: McpSnapshot): McpSnapshot {
	return {
		...snapshot,
		truncated: true,
		indexOnly: true,
		truncatedReason: snapshot.truncatedReason ?? 'snapshot_size',
		notes: snapshot.notes.map(withholdBody),
	};
}

/**
 * Drops a body and flags the note, so an omitted body can never be read as an
 * empty one. This is the signal both the shim and the chat relay to the model.
 */
function withholdBody(note: McpSnapshotNote): McpSnapshotNote {
	const copy = { ...note };
	delete copy.body;
	copy.truncated = true;
	return copy;
}

function toSnapshotNote(note: Note): McpSnapshotNote {
	const cut = byteLength(note.body) > MCP_MAX_BODY_BYTES;
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
		body: cut ? truncateBody(note.body) : note.body,
	};
	// Flag the cut, not the note: the reader must be able to tell "there is
	// more" apart from "that was all of it".
	if (cut) snapshot.truncated = true;
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

/**
 * What a body costs inside the serialized snapshot: its UTF-8 length plus the
 * JSON escaping that makes the written file larger than the source string —
 * every newline in a note becomes two bytes, every quote and control
 * character more. The budget is a byte budget, so counting characters here
 * would ship a document that overshoots the cap it is meant to respect.
 */
function jsonByteLength(value: string): number {
	let extra = 2; // surrounding quotes
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code === 0x22 || code === 0x5c) extra += 1; // " \
		else if (code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) {
			extra += 1; // \b \t \n \f \r
		} else if (code < 0x20) extra += 5; // \uXXXX
		// Surrogate pairs need no extra: they are 4 UTF-8 bytes and are
		// written through as-is, which `byteLength` already counted.
	}
	return byteLength(value) + extra;
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
