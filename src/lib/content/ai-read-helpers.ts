/**
 * Shared helpers for the AI chat's read tools.
 *
 * Extracted from `ai-tools.ts` so the executor file stays under the repo's LOC
 * cap and so the id/title resolution rules live in one reviewable place. Pure:
 * it only reads the injected snapshot.
 */

import type { McpSnapshot, McpSnapshotNote, McpSnapshotTask } from '$lib/content/mcp-types';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/** Reads a positive integer argument, clamped to the tool budget. */
export function num(args: Record<string, unknown>, key: string, fallback: number): number {
	const value = args[key];
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(Math.floor(parsed), MAX_LIMIT);
}

/** Reads a non-empty trimmed string argument. */
export function str(args: Record<string, unknown>, key: string): string | undefined {
	const value = args[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Reads a boolean argument, leaving anything else undefined. */
export function bool(args: Record<string, unknown>, key: string): boolean | undefined {
	const value = args[key];
	return typeof value === 'boolean' ? value : undefined;
}

/** `<workspaceId>/<entityId>` — the ref every id in a response carries. */
export function ref(item: { id: string; workspaceId: string }): string {
	return `${item.workspaceId}/${item.id}`;
}

function inWorkspace(item: { workspaceId: string }, workspace?: string): boolean {
	return !workspace || item.workspaceId === workspace;
}

/** Strips a `<workspaceId>/` prefix, returning the bare id. */
export function bareId(raw: string): string {
	const slash = raw.indexOf('/');
	return slash > 0 ? raw.slice(slash + 1) : raw;
}

export function notesOf(snapshot: McpSnapshot, workspace?: string): McpSnapshotNote[] {
	return snapshot.notes.filter((note) => inWorkspace(note, workspace));
}

export function tasksOf(snapshot: McpSnapshot, workspace?: string): McpSnapshotTask[] {
	return snapshot.tasks.filter((task) => inWorkspace(task, workspace));
}

/** Substring search over titles, tags and bodies, case-insensitive. */
export function matchesQuery(note: McpSnapshotNote, query: string): boolean {
	const needle = query.toLowerCase();
	return (
		note.title.toLowerCase().includes(needle) ||
		note.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
		(note.body ?? '').toLowerCase().includes(needle) ||
		note.excerpt.toLowerCase().includes(needle)
	);
}

/**
 * Finds one item by bare id or prefixed ref. Ambiguous ids resolve to null so
 * the caller can explain rather than act on the wrong record.
 */
function findById<T extends { id: string; workspaceId: string }>(
	items: T[],
	raw: string,
	workspace?: string
): T | null {
	const id = bareId(raw);
	const matches = items.filter(
		(item) => item.id === id && (!workspace || item.workspaceId === workspace)
	);
	return matches.length === 1 ? matches[0] : null;
}

export function findNote(
	snapshot: McpSnapshot,
	raw: string,
	workspace?: string
): McpSnapshotNote | null {
	return findById(notesOf(snapshot), raw, workspace);
}

export function findTask(
	snapshot: McpSnapshot,
	raw: string,
	workspace?: string
): McpSnapshotTask | null {
	return findById(tasksOf(snapshot), raw, workspace);
}

/**
 * Falls back to a case-insensitive title match, so a model that passes a title
 * instead of an id still gets a useful result rather than a dead end.
 */
export function findByTitle<T extends { title: string }>(items: T[], raw: string): T | null {
	const wanted = raw.trim().toLowerCase();
	const matches = items.filter((item) => item.title.trim().toLowerCase() === wanted);
	return matches.length === 1 ? matches[0] : null;
}

/** A compact note view — bodies are only included for `get_note`. */
export function noteSummary(note: McpSnapshotNote) {
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

export function taskSummary(task: McpSnapshotTask) {
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

export function sortTasks(tasks: McpSnapshotTask[]): McpSnapshotTask[] {
	return [...tasks].sort((a, b) => {
		const rank = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
		if (rank !== 0) return rank;
		const dueA = a.dueAt ?? '9999-12-31';
		const dueB = b.dueAt ?? '9999-12-31';
		if (dueA !== dueB) return dueA < dueB ? -1 : 1;
		return a.position - b.position;
	});
}
