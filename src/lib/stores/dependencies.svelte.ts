import { browser } from '$app/environment';
import { emit } from '@tauri-apps/api/event';
import { dependenciesRepo } from '$lib/db';
import { canAddDependency, type Task, type TaskDependency } from '$lib/stores/tasks';
import { isTauri } from '$lib/windows';
import { workspaceStore } from '$lib/stores/workspaces.svelte';

/** Broadcast after a dependency is added or removed, so other windows reload the store. */
export const DEPENDENCIES_CHANGED = 'dependencies:changed';

export const dependencyStore = $state<{ items: TaskDependency[] }>({ items: [] });

function notifyDependenciesChanged() {
	if (!browser || !isTauri) return;
	void emit(DEPENDENCIES_CHANGED).catch(() => undefined);
}

/**
 * Loads the dependency rows of `workspaceId` (the active workspace by
 * default). Callers that show a specific record — the task detail window —
 * pass that record's workspace, because they may be pinned to a workspace the
 * rest of the app is not showing.
 */
export async function refreshDependencies(
	workspaceId = workspaceStore.activeId
): Promise<TaskDependency[]> {
	if (!browser) {
		dependencyStore.items = [];
		return dependencyStore.items;
	}
	try {
		dependencyStore.items = await dependenciesRepo.list(workspaceId);
	} catch {
		dependencyStore.items = [];
	}
	return dependencyStore.items;
}

export async function addDependency(
	taskId: string,
	dependsOnTaskId: string,
	tasks: Task[]
): Promise<boolean> {
	if (!canAddDependency(taskId, dependsOnTaskId, tasks, dependencyStore.items)) return false;
	const workspaceId =
		tasks.find((task) => task.id === taskId)?.workspaceId ?? workspaceStore.activeId;
	try {
		await dependenciesRepo.add(taskId, dependsOnTaskId, workspaceId);
		await refreshDependencies(workspaceId);
		notifyDependenciesChanged();
		return true;
	} catch {
		return false;
	}
}

export async function removeDependency(dependency: TaskDependency): Promise<boolean> {
	try {
		await dependenciesRepo.remove(dependency.taskId, dependency.dependsOnTaskId);
		dependencyStore.items = dependencyStore.items.filter(
			(item) =>
				item.taskId !== dependency.taskId || item.dependsOnTaskId !== dependency.dependsOnTaskId
		);
		notifyDependenciesChanged();
		return true;
	} catch {
		return false;
	}
}
