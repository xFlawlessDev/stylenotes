import type { Note } from '$lib/content/content';
import { refreshSettings, settings } from '$lib/stores/settings.svelte';
import { dockedNotes, listAllNotes, listNotes, persistNote } from '$lib/stores/notes';
import {
	applyTaskPatch,
	matchesOverlayFilter,
	overlayTasks,
	sortOverlayTasks,
	taskStatus,
	type Task
} from '$lib/stores/tasks';
import { listAllTasks, persistTask } from '$lib/stores/tasks.svelte';

/** Docked quick notes and tasks, plus how many are docked in total. */
export const dockStore = $state<{ tasks: Task[]; notes: Note[]; docked: number }>({
	tasks: [],
	notes: [],
	docked: 0
});

let loadedTasks: Task[] = [];
let loadedNotes: Note[] = [];
let loadToken = 0;

/**
 * Rebuilds the dock from the last loaded items and the current settings.
 * Docked records are a cross-workspace inbox: every workspace is listed and
 * the UI labels each item with its workspace instead of filtering it out.
 */
export function applyDockFilters() {
	const docked = overlayTasks(loadedTasks);
	const notes = dockedNotes(loadedNotes);
	dockStore.docked = docked.length + notes.length;
	dockStore.tasks = sortOverlayTasks(
		docked.filter((task) =>
			matchesOverlayFilter(task, {
				status: settings.overlayStatus,
				priority: settings.overlayPriority
			})
		),
		settings.overlaySort
	);
	dockStore.notes = notes;
}

/** Re-reads settings, tasks, and notes, then rebuilds the dock. */
export async function loadDockItems(): Promise<void> {
	const token = ++loadToken;
	await refreshSettings();
	const [tasks, notes] = await Promise.all([listAllTasks(), listAllNotes()]);
	if (token !== loadToken) return;
	loadedTasks = tasks;
	loadedNotes = notes;
	applyDockFilters();
}

async function patchDockTask(task: Task, patch: Partial<Task>): Promise<Task> {
	const next = applyTaskPatch(task, patch);
	dockStore.tasks = dockStore.tasks.map((item) => (item.id === task.id ? next : item));
	if (!(await persistTask(next))) await loadDockItems();
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
	if (!(await persistTask(applyTaskPatch(task, { overlay: false })))) await loadDockItems();
}

export async function removeDockNote(note: Note): Promise<void> {
	dockStore.notes = dockStore.notes.filter((item) => item.id !== note.id);
	if (!(await persistNote({ ...note, overlay: false }))) await loadDockItems();
}
