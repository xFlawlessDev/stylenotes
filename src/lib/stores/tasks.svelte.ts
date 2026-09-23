import { browser } from '$app/environment';
import { emit } from '@tauri-apps/api/event';
import { tasksRepo } from '$lib/db';
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

export async function refreshTasks(): Promise<Task[]> {
	if (!browser) return taskStore.items;
	try {
		taskStore.items = await tasksRepo.list(workspaceStore.activeId);
	} catch {
		/* keep the last known tasks */
	}
	hydrated = true;
	return taskStore.items;
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
