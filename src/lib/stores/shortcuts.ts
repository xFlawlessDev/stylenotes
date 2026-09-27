import { listen } from '@tauri-apps/api/event';
import { createNote } from '$lib/content/content';
import { persistNote } from '$lib/stores/notes';
import { createTask, nextPosition } from '$lib/stores/tasks';
import { listWorkspaceTasks, persistTask } from '$lib/stores/tasks.svelte';
import { isTauri, openNoteWindow, openTaskWindow } from '$lib/windows';
import { workspaceStore } from '$lib/stores/workspaces.svelte';

/** Shortcut label shown in the UI; the keys are registered in Rust (`lib.rs`). */
export const QUICK_NOTE_LABEL = 'Ctrl+Shift+N';
export const QUICK_TASK_LABEL = 'Ctrl+Shift+T';

/** Event emitted from Rust when a quick-capture shortcut fires. */
export const QUICK_CAPTURE_EVENT = 'quick-capture:create';

/** What the dock's quick-capture menu can create. */
export type QuickCaptureKind = 'note' | 'task';

/**
 * Workspace quick captures land in. Defaults to the active workspace; the dock
 * passes the workspace of the item the capture was started from, so a dock
 * shared by every workspace still creates records where the user is looking.
 */
export function captureWorkspaceId(workspaceId?: string): string {
	return workspaceId ?? workspaceStore.activeId;
}

/**
 * Creates a docked note and opens its editor window. Returns the new note id,
 * or null when the database is unavailable.
 */
export async function createQuickNote(workspaceId?: string): Promise<string | null> {
	const note = createNote({
		title: 'Quick note',
		overlay: true,
		workspaceId: captureWorkspaceId(workspaceId)
	});
	if (!(await persistNote(note))) return null;
	await openNoteWindow(note.id);
	return note.id;
}

/**
 * Creates a docked task and opens its detail window. Returns the new task id,
 * or null when the database is unavailable.
 */
export async function createQuickTask(workspaceId?: string): Promise<string | null> {
	const target = captureWorkspaceId(workspaceId);
	// Positions are per workspace, so read that workspace's tasks rather than
	// assuming the dock's loaded list starts at zero.
	const tasks = await listWorkspaceTasks(target);
	const task = createTask({
		title: 'Quick task',
		overlay: true,
		workspaceId: target,
		position: nextPosition(tasks, 'todo', target)
	});
	if (!(await persistTask(task))) return null;
	await openTaskWindow(task.id);
	return task.id;
}

/**
 * Subscribes to the Rust quick-capture shortcuts. Only the dock (overlay)
 * window listens: it is alive from launch and owns the docked records.
 */
export async function listenQuickCapture(
	handler: (kind: QuickCaptureKind) => void
): Promise<() => void> {
	if (!isTauri) return () => {};
	return listen<string>(QUICK_CAPTURE_EVENT, (event) => {
		if (event.payload === 'note' || event.payload === 'task') handler(event.payload);
	});
}
