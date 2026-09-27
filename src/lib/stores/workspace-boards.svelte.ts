import { browser } from '$app/environment';
import type { Note } from '$lib/content/content';
import { listNotes, loadFolders, type CustomFolder } from '$lib/stores/notes';
import { listWorkspaceTasks, persistTask } from '$lib/stores/tasks.svelte';
import { createTask, nextPosition, type Task, type TaskStatus } from '$lib/stores/tasks';
import { settings, updateSettings } from '$lib/stores/settings.svelte';
import { workspaceStore } from '$lib/stores/workspaces.svelte';
import { DEFAULT_WORKSPACE_ID } from '$lib/workspace';

/** Records of a single board: everything scoped to one workspace. */
export type BoardData = {
	workspaceId: string;
	tasks: Task[];
	notes: Note[];
	folders: CustomFolder[];
	loading: boolean;
};

const emptyData = (workspaceId: string): BoardData => ({
	workspaceId,
	tasks: [],
	notes: [],
	folders: [],
	loading: false
});

/**
 * The Kanban window's boards.
 *
 * The window is a *view*: it renders one or more boards, each showing exactly
 * one workspace. With a single board the window follows the app's active
 * workspace; splitting it adds boards, and a split window stops following —
 * two boards cannot both follow the same selection.
 *
 * All workspace ids are stored as strings, so the state round-trips through
 * `settings.kanbanBoards` (JSON) unchanged.
 */
export const boardStore = $state<{
	/** Workspace per board, left to right. Never empty. */
	workspaces: string[];
	/** Loaded records per workspace; `boards[id]` may lag behind `workspaces`. */
	boards: Record<string, BoardData>;
}>({ workspaces: [], boards: {} });

/** Broadcast so the header (and tests) can tell a split from a single board. */
export function isSplit(): boolean {
	return boardStore.workspaces.length > 1;
}

function ensureData(workspaceId: string): BoardData {
	let data = boardStore.boards[workspaceId];
	if (!data) {
		data = emptyData(workspaceId);
		boardStore.boards[workspaceId] = data;
	}
	return data;
}

/** Reads one board's records; marks it loading so the UI can show a skeleton. */
export async function loadBoard(workspaceId: string): Promise<BoardData> {
	const data = ensureData(workspaceId);
	if (!browser) {
		data.loading = false;
		return data;
	}
	data.loading = true;
	try {
		const [tasks, notes, folders] = await Promise.all([
			listWorkspaceTasks(workspaceId),
			listNotes(workspaceId),
			loadFolders(workspaceId)
		]);
		// Another refresh may have swapped the entry while we awaited.
		const current = ensureData(workspaceId);
		current.tasks = tasks;
		current.notes = notes;
		current.folders = folders;
		current.loading = false;
		return current;
	} catch {
		data.loading = false;
		return data;
	}
}

/** Reloads every board the window shows. */
export async function reloadBoards(): Promise<void> {
	await Promise.all(boardStore.workspaces.map((id) => loadBoard(id)));
}

/**
 * Sets the board layout. `workspaceIds` is normalised: de-duplicated, never
 * empty, and unknown workspaces are dropped so a deleted workspace cannot
 * leave a ghost board. The layout is persisted so it survives a restart.
 */
export function setBoards(workspaceIds: string[]): void {
	const known = new Set(workspaceStore.items.map((item) => item.id));
	const next: string[] = [];
	for (const id of workspaceIds) {
		if (next.includes(id)) continue;
		if (known.size && !known.has(id)) continue;
		next.push(id);
	}
	if (!next.length) next.push(fallbackWorkspaceId());
	boardStore.workspaces = next;
	updateSettings({ kanbanBoards: next });
}

/** Workspace a new board starts on: the first workspace not already shown. */
export function nextBoardWorkspace(): string {
	const shown = new Set(boardStore.workspaces);
	const free = workspaceStore.items.find((workspace) => !shown.has(workspace.id));
	return free?.id ?? boardStore.workspaces[0] ?? fallbackWorkspaceId();
}

export function splitBoard(): void {
	setBoards([...boardStore.workspaces, nextBoardWorkspace()]);
}

/** Removes a board; the last one is never removed. */
export function closeBoard(workspaceId: string): void {
	if (boardStore.workspaces.length <= 1) return;
	setBoards(boardStore.workspaces.filter((id) => id !== workspaceId));
}

/** Points one board at another workspace (its own view, not the app's). */
export function setBoardWorkspace(index: number, workspaceId: string): void {
	const next = [...boardStore.workspaces];
	next[index] = workspaceId;
	setBoards(next);
	void loadBoard(workspaceId);
}

/** Writes the rows a board's list changed, and swaps in the new list. */
export async function persistBoardTasks(workspaceId: string, tasks: Task[]): Promise<boolean> {
	const data = ensureData(workspaceId);
	const before = new Map(data.tasks.map((task) => [task.id, task]));
	data.tasks = tasks;
	const results = await Promise.all(
		tasks.map((task) => {
			const previous = before.get(task.id);
			if (previous && JSON.stringify(previous) === JSON.stringify(task)) return true;
			return persistTask(task);
		})
	);
	return results.every(Boolean);
}

/** Builds a task scoped to a board's workspace, at the end of its column. */
export function boardTask(workspaceId: string, tasks: Task[], seed: Partial<Task>): Task {
	return createTask({
		...seed,
		workspaceId,
		status: seed.status,
		position: nextPosition(tasks, seed.status ?? 'todo', workspaceId)
	});
}

/**
 * Starts the boards from the stored layout, or from the active workspace when
 * there is none. A single board follows the active workspace afterwards.
 */
export async function startBoards(): Promise<void> {
	const stored = settings.kanbanBoards;
	boardStore.workspaces = stored.length ? [...stored] : [workspaceStore.activeId];
	setBoards(boardStore.workspaces);
	await reloadBoards();
}

/** Drops the boards that no longer exist and loads any new ones. */
export async function reconcileBoards(): Promise<void> {
	setBoards(boardStore.workspaces);
	await reloadBoards();
}

/** Every task of a board in its column order. */
export function boardTasks(workspaceId: string): Task[] {
	return boardStore.boards[workspaceId]?.tasks ?? [];
}

export function boardsFollowActive(): boolean {
	return !isSplit();
}

function fallbackWorkspaceId(): string {
	return workspaceStore.activeId || workspaceStore.items[0]?.id || DEFAULT_WORKSPACE_ID;
}
