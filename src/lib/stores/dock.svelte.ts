import { refreshSettings, settings } from '$lib/stores/settings.svelte';
import {
	applyTaskPatch,
	matchesOverlayFilter,
	overlayTasks,
	sortOverlayTasks,
	taskStatus,
	type Task
} from '$lib/stores/tasks';
import { persistTask, refreshTasks } from '$lib/stores/tasks.svelte';

/** Tasks shown in the overlay dock, plus how many are docked in total. */
export const dockStore = $state<{ tasks: Task[]; docked: number }>({ tasks: [], docked: 0 });

let loaded: Task[] = [];
let loadToken = 0;

/** Rebuilds the dock from the last loaded tasks and the current settings. */
export function applyDockFilters() {
	const docked = overlayTasks(loaded);
	dockStore.docked = docked.length;
	dockStore.tasks = sortOverlayTasks(
		docked.filter((task) =>
			matchesOverlayFilter(task, {
				status: settings.overlayStatus,
				priority: settings.overlayPriority
			})
		),
		settings.overlaySort
	);
}

/** Re-reads settings and tasks, then rebuilds the dock. */
export async function loadDockTasks(): Promise<void> {
	const token = ++loadToken;
	await refreshSettings();
	const tasks = await refreshTasks();
	if (token !== loadToken) return;
	loaded = tasks;
	applyDockFilters();
}

async function patchDockTask(task: Task, patch: Partial<Task>): Promise<Task> {
	const next = applyTaskPatch(task, patch);
	dockStore.tasks = dockStore.tasks.map((item) => (item.id === task.id ? next : item));
	if (!(await persistTask(next))) await loadDockTasks();
	return next;
}

export function toggleDockProgress(task: Task): Promise<Task> {
	return patchDockTask(task, { status: taskStatus(task) === 'doing' ? 'todo' : 'doing' });
}

export function toggleDockComplete(task: Task): Promise<Task> {
	return patchDockTask(task, { status: taskStatus(task) === 'done' ? 'todo' : 'done' });
}

export async function removeDockTask(task: Task): Promise<void> {
	dockStore.tasks = dockStore.tasks.filter((item) => item.id !== task.id);
	if (!(await persistTask(applyTaskPatch(task, { overlay: false })))) await loadDockTasks();
}
