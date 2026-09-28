import { browser } from '$app/environment';
import { emit } from '@tauri-apps/api/event';
import { tasksRepo } from '$lib/db';
import { versionsRepo } from '$lib/db/versions';
import type { Task } from '$lib/stores/tasks';
import { isTauri } from '$lib/windows';
import { workspaceStore } from '$lib/stores/workspaces.svelte';

export const TASKS_CHANGED = 'tasks:changed';

export const taskStore = $state<{ items: Task[] }>({ items: [] });

let hydrated = false;

function notifyTasksChanged() {
	if (!browser || !isTauri) return;
	void emit(TASKS_CHANGED).catch(() => undefined);
}

export async function hydrateTasks(): Promise<Task[]> {
	if (!browser) {
		taskStore.items = [];
		return taskStore.items;
	}
	if (hydrated) return taskStore.items;
	return refreshTasks();
}

/**
 * Reads the tasks of the active workspace and merges them into `taskStore`.
 *
 * Windows that show more than one workspace (the Kanban window, the dock)
 * keep their extra rows: rows of `workspaceId` are replaced, everything else
 * is preserved, so refreshing after a switch cannot drop them.
 */
export async function refreshTasks(workspaceId = workspaceStore.activeId): Promise<Task[]> {
	if (!browser) return taskStore.items;
	try {
		const rows = await tasksRepo.list(workspaceId);
		const seen = new Set(rows.map((task) => task.id));
		taskStore.items = [
			...rows,
			...taskStore.items.filter((task) => !seen.has(task.id) && (task.workspaceId ?? DEFAULT_ID) !== workspaceId)
		];
	} catch {
		/* keep the last known tasks */
	}
	hydrated = true;
	return taskStore.items;
}

/**
 * Swaps a window's loaded task list over to the records of `workspaceId`.
 * The caller owns the list (Kanban window, dock); `taskStore` is left alone.
 */
export async function listWorkspaceTasks(workspaceId: string): Promise<Task[]> {
	if (!browser) return [];
	try {
		return await tasksRepo.list(workspaceId);
	} catch {
		return [];
	}
}

/** Constraint: the DB and the UI both fall back to this id when a record has none. */
const DEFAULT_ID = 'workspace-default';

/**
 * Workspace a record belongs to, normalised for the two representations the
 * app uses: an explicit id, or the pre-workspace fallback.
 */
export function recordWorkspaceId(record: { workspaceId?: string } | null | undefined): string {
	return record?.workspaceId || DEFAULT_ID;
}

/**
 * Resolves the workspace a detail window should load, given the record it
 * shows. The windows are universal, so the record — not the app's active
 * workspace — decides which folders, notes and tasks are relevant.
 */
export function detailWorkspaceId(records: { id: string; workspaceId?: string }[], recordId: string | null): string {
	if (!recordId) return DEFAULT_ID;
	return recordWorkspaceId(records.find((item) => item.id === recordId));
}

/** Reads every task across workspaces, for windows that resolve wiki links by record. */
export async function listAllTasks(): Promise<Task[]> {
	if (!browser) return [];
	try {
		return await tasksRepo.list();
	} catch {
		return [];
	}
}

export async function persistTask(task: Task): Promise<boolean> {
	if (!browser) return false;
	try {
		await tasksRepo.upsert({ ...task, workspaceId: task.workspaceId || workspaceStore.activeId });
		notifyTasksChanged();
		return true;
	} catch {
		return false;
	}
}

export async function persistTaskList(tasks: Task[]): Promise<boolean> {
	if (!browser) return false;
	try {
		await tasksRepo.replaceAll(tasks.map((task) => ({ ...task, workspaceId: task.workspaceId || workspaceStore.activeId })));
		notifyTasksChanged();
		return true;
	} catch {
		return false;
	}
}

export async function removeTask(id: string): Promise<boolean> {
	if (!browser) return false;
	try {
		await tasksRepo.remove(id);
		// Version history is not foreign-keyed, so drop it explicitly.
		await versionsRepo.removeAll('task', id).catch(() => false);
		notifyTasksChanged();
		return true;
	} catch {
		return false;
	}
}

export async function clearTasks(): Promise<void> {
	if (!browser) return;
	try {
		await tasksRepo.clear();
		notifyTasksChanged();
	} catch {
		/* ignore */
	}
	taskStore.items = [];
}
