import { browser } from '$app/environment';
import { dependenciesRepo } from '$lib/db';
import { canAddDependency, type Task, type TaskDependency } from '$lib/stores/tasks';
import { workspaceStore } from '$lib/stores/workspaces.svelte';

export const dependencyStore = $state<{ items: TaskDependency[] }>({ items: [] });

export async function refreshDependencies(): Promise<TaskDependency[]> {
	if (!browser) {
		dependencyStore.items = [];
		return dependencyStore.items;
	}
	try {
		dependencyStore.items = await dependenciesRepo.list(workspaceStore.activeId);
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
	try {
		await dependenciesRepo.add(taskId, dependsOnTaskId, workspaceStore.activeId);
		await refreshDependencies();
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
		return true;
	} catch {
		return false;
	}
}
