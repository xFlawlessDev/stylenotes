import { onMount } from 'svelte';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
	hydrateNotes,
	loadFolders,
	listNotes,
	NOTES_CHANGED,
	type CustomFolder,
	type NotesChangedPayload,
} from '$lib/stores/notes';
import { hydrateSettings } from '$lib/stores/settings.svelte';
import { hydrateCloud } from '$lib/stores/cloud.svelte';
import { loadNotifications, type AppNotification } from '$lib/stores/notifications';
import { hydrateTasks } from '$lib/stores/tasks.svelte';
import type { Task } from '$lib/stores/tasks';
import type { Note } from '$lib/content/content';
import type { TaskView } from '$lib/components/tasks/TaskBoard.svelte';
import { isTauri, NAVIGATE_EVENT, type WorkspaceNavigate, type WorkspaceSection } from '$lib/windows';
import { hydrateWorkspaces, WORKSPACES_CHANGED } from '$lib/stores/workspaces.svelte';
import {
	applyExternalWorkspaces,
	startWorkspaceSync,
	type WorkspacesChangedPayload,
} from '$lib/workspace-sync.svelte';
import { DEPENDENCIES_CHANGED, refreshDependencies } from '$lib/stores/dependencies.svelte';
import { hydrateMemory, reindexEntity, startMemorySync } from '$lib/stores/memory.svelte';
import { resumeRemoteMcp } from '$lib/stores/remote-mcp.svelte';
import { startVaultSync, stopVaultSync } from '$lib/stores/vault.svelte';

/** The slice of workspace state the session hydration and listeners write to. */
export type WorkspaceSessionState = {
	items: Note[];
	customFolders: CustomFolder[];
	notifications: AppNotification[];
	tasks: Task[];
	selectedId: string;
	selectedTaskId: string;
	taskView: TaskView;
	taskFocusToken: number;
	section: WorkspaceSection;
};

/**
 * Boots the workspace window: hydrates every store, starts the cross-window
 * workspace sync, and subscribes to navigation/notes/dependencies events from
 * the dock, Kanban and note windows. Returns the effect cleanup.
 */
export function startWorkspaceSession(
	state: WorkspaceSessionState,
	reloadWorkspaceRecords: () => Promise<void>,
	isSavingLocally: () => boolean
) {
	onMount(() => {
		void (async () => {
			// Bring the remote MCP listener back if the user left it on, so a
			// restart does not silently drop a running agent (#D12). Rust binds
			// it from `setup` first; this is the fallback when the write pool was
			// unavailable there, so it runs before the slower hydration below.
			void resumeRemoteMcp().catch(() => undefined);
			await hydrateWorkspaces();
			await hydrateSettings();
			await hydrateCloud().catch(() => undefined);
			await hydrateMemory().catch(() => undefined);
			const [storedNotes, storedFolders, storedNotifications, storedTasks] = await Promise.all([
				hydrateNotes(),
				loadFolders(),
				loadNotifications(),
				hydrateTasks(),
				refreshDependencies(),
			]);
			state.items = storedNotes;
			state.customFolders = storedFolders;
			state.notifications = storedNotifications;
			state.tasks = storedTasks;
			if (!state.selectedId && state.items.length) state.selectedId = state.items[0].id;
		})();

		void startWorkspaceSync();
		void startMemorySync().catch(() => undefined);
		// Bring back automatic two-way vault sync for a `vault` workspace; a no-op
		// for any other mode (docs/design/vault-mirror.md).
		startVaultSync();

		let unlisten: (() => void) | undefined;
		let unlistenNotes: (() => void) | undefined;
		let unlistenDependencies: (() => void) | undefined;
		let unlistenWorkspaces: (() => void) | undefined;
		let disposed = false;
		if (isTauri) {
			void listen<WorkspaceNavigate>(NAVIGATE_EVENT, (event) => {
				const payload = event.payload;
				if (!payload) return;
				state.section = payload.section;
				if (payload.view) state.taskView = payload.view;
				if (payload.section === 'tasks') {
					if (payload.recordId) state.selectedTaskId = payload.recordId;
					state.taskFocusToken += 1;
				}
			}).then((fn) => {
				if (disposed) fn();
				else unlisten = fn;
			});

			// The Kanban window (and any other window) may switch, create,
			// rename or delete a workspace: reload everything it changed and,
			// when the selection moved, follow it.
			void listen<WorkspacesChangedPayload>(WORKSPACES_CHANGED, (event) => {
				void applyExternalWorkspaces(event.payload).then((activeChanged) => {
					if (activeChanged) void reloadWorkspaceRecords();
				});
			}).then((fn) => {
				if (disposed) fn();
				else unlistenWorkspaces = fn;
			});

			// Quick-captured notes arrive from the dock or a note window; mirror
			// them here unless a local save is still in flight.
			void listen<NotesChangedPayload>(NOTES_CHANGED, (event) => {
				if (event.payload?.source === getCurrentWindow().label) return;
				if (isSavingLocally()) return;
				void listNotes().then((next) => {
					if (isSavingLocally()) return;
					state.items = next;
					if (!next.some((note) => note.id === state.selectedId)) {
						state.selectedId = next[0]?.id ?? '';
					}
					// Keep the semantic index fresh for notes this window did not
					// write (#D16). A no-op when nothing changed, thanks to the
					// content hash, and silently skipped when memory is off.
					for (const noteId of event.payload?.changedIds ?? []) {
						void reindexEntity('note', noteId).catch(() => undefined);
					}
				});
			}).then((fn) => {
				if (disposed) fn();
				else unlistenNotes = fn;
			});

			// Dependencies changed in another window (task detail / Kanban).
			void listen(DEPENDENCIES_CHANGED, () => void refreshDependencies()).then((fn) => {
				if (disposed) fn();
				else unlistenDependencies = fn;
			});
		}
		return () => {
			disposed = true;
			stopVaultSync();
			unlisten?.();
			unlistenNotes?.();
			unlistenDependencies?.();
			unlistenWorkspaces?.();
		};
	});
}