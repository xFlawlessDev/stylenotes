/**
 * Workspace management for the workspace controller.
 *
 * Extracted for the same reason as the other `workspace-*-ops.ts` modules: the
 * controller coordinates, and each concern gets a testable seam. This module
 * owns switching, creating, renaming and deleting a workspace, plus the record
 * reload that follows a switch.
 *
 * It takes its dependencies as callbacks rather than importing the controller,
 * so there is no cycle and the state it writes stays the live `$state` object.
 */

import { listAllNotes } from '$lib/stores/notes';
import { listAllTasks } from '$lib/stores/tasks.svelte';
import { pendingEdits } from '$lib/stores/mcp-pending-edits';
import { t } from '$lib/i18n/index.svelte';
import { notifyWorkspacesChanged } from '$lib/workspace-sync.svelte';
import {
	createWorkspace,
	deleteWorkspace,
	renameWorkspace,
	setActiveWorkspace,
	workspaceStore,
} from '$lib/stores/workspaces.svelte';

export type WorkspaceOps = {
	/** Switches the active workspace and reloads its records. */
	change: (id: string) => Promise<void>;
	createByName: (name: string) => Promise<boolean>;
	renameById: (id: string, name: string) => Promise<boolean>;
	deleteById: (id: string) => Promise<boolean>;
	/** Dirty records of a workspace, for the delete confirmation. */
	unsavedRecords: (workspaceId: string) => Promise<{ notes: string[]; tasks: string[] }>;
};

export function createWorkspaceOps(deps: {
	/** Reloads notes, folders, tasks and dependencies for a workspace. */
	reload: (workspaceId: string) => Promise<void>;
	notify: (message: string) => void;
}): WorkspaceOps {
	/**
	 * Guards against two overlapping switches or deletes. Both reload records,
	 * so letting them interleave could leave the UI showing the lists of a
	 * workspace that was just removed.
	 */
	let busy = false;

	async function change(id: string): Promise<void> {
		if (busy) return;
		busy = true;
		if (await setActiveWorkspace(id)) {
			await deps.reload(id);
			// The dock, Kanban and detail windows follow the selection.
			notifyWorkspacesChanged();
		} else {
			deps.notify(t('editor.actions.workspaceSaveFailed'));
		}
		busy = false;
	}

	return {
		change,

		async createByName(name) {
			const workspace = await createWorkspace(name);
			if (!workspace) {
				deps.notify(t('editor.actions.workspaceCreateFailed'));
				return false;
			}
			await change(workspace.id);
			return true;
		},

		async renameById(id, name) {
			if (!(await renameWorkspace(id, name))) {
				deps.notify(t('editor.actions.workspaceRenameFailed'));
				return false;
			}
			notifyWorkspacesChanged();
			deps.notify(t('editor.actions.workspaceRenamed'));
			return true;
		},

		async deleteById(id) {
			if (busy) return false;
			busy = true;
			try {
				const wasActive = id === workspaceStore.activeId;
				if (!(await deleteWorkspace(id))) {
					deps.notify(t('editor.actions.workspaceDeleteFailed'));
					return false;
				}
				if (wasActive) {
					// Re-assert the selection and re-read the records of the
					// workspace that took over, so the deleted notes and tasks
					// cannot linger in the view. Re-asserting can itself fail;
					// surface that instead of claiming everything is saved.
					if (!(await setActiveWorkspace(workspaceStore.activeId))) {
						notifyWorkspacesChanged();
						deps.notify(t('editor.actions.workspaceDeleteFailed'));
						return false;
					}
					await deps.reload(workspaceStore.activeId);
					notifyWorkspacesChanged();
				} else {
					// The remaining lists did not change, but a board or the dock
					// may have been showing the removed workspace.
					notifyWorkspacesChanged();
				}
				deps.notify(t('editor.actions.workspaceDeleted'));
				return true;
			} finally {
				busy = false;
			}
		},

		async unsavedRecords(workspaceId) {
			// Reads across workspaces on purpose: the records being removed are
			// not necessarily the ones this window is showing, and the pending
			// sets are cross-window truth (`mcp-pending-edits` is written by
			// every detail window's save queue).
			const pending = pendingEdits();
			if (!pending.note.size && !pending.task.size) return { notes: [], tasks: [] };
			const [notes, tasks] = await Promise.all([listAllNotes(), listAllTasks()]);
			const inWorkspace = (record: { workspaceId?: string }) =>
				(record.workspaceId || 'workspace-default') === workspaceId;
			return {
				notes: notes
					.filter((note) => inWorkspace(note) && pending.note.has(note.id))
					.map((note) => note.title),
				tasks: tasks
					.filter((task) => inWorkspace(task) && pending.task.has(task.id))
					.map((task) => task.title),
			};
		},
	};
}
