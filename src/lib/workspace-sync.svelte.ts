import { browser } from '$app/environment';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { DEFAULT_WORKSPACE_ID, workspaceOf, type Workspace } from '$lib/workspace';
import {
	ACTIVE_WORKSPACE_KEY,
	ensureActiveWorkspace,
	reloadWorkspaces,
	WORKSPACES_CHANGED,
	workspaceStore
} from '$lib/stores/workspaces.svelte';
import { isTauri } from '$lib/windows';

/**
 * Keeps the workspaces themselves (name, colour, membership and the active
 * selection) in step across every window: the workspace window, the Kanban
 * window, the dock and any open note/task window each own a copy of
 * `workspaceStore`, while `meta.active_workspace_id` is shared.
 *
 * Record lists are *not* reloaded here. The dock and detail windows are
 * cross-workspace: they keep showing the records they loaded (matched by id),
 * and the owning window reloads its own lists.
 */

/** Payload of {@link WORKSPACES_CHANGED}: `true` when the selection moved. */
export type WorkspacesChangedPayload = { activeId: string };

/** Broadcast the workspace list and/or the active selection. */
export function notifyWorkspacesChanged(): void {
	if (!browser || !isTauri) return;
	void emit(WORKSPACES_CHANGED, {
		activeId: workspaceStore.activeId
	} satisfies WorkspacesChangedPayload).catch(() => undefined);
}

/**
 * Adopts a broadcast from another window: the active workspace is taken
 * verbatim (it is a global choice), while the list is only re-read when the
 * incoming change is not something this window already applied.
 *
 * Returns `true` when the active workspace changed and the caller should
 * reload the records it is showing.
 */
export async function applyExternalWorkspaces(payload?: WorkspacesChangedPayload | null): Promise<boolean> {
	if (!browser) return false;
	if (payload?.activeId && workspaceStore.items.some((item) => item.id === payload.activeId)) {
		const changed = workspaceStore.activeId !== payload.activeId;
		workspaceStore.activeId = payload.activeId;
		return changed;
	}
	await loadWorkspaces();
	return true;
}

/** Copy of a workspace entry used for the cheap equality check. */
function fingerprint(items: Workspace[]): string {
	return items.map((item) => `${item.id}:${item.name}:${item.color}`).join('|');
}

let started = false;
let unlisten: UnlistenFn | undefined;

/**
 * Starts listening for workspace changes from the other windows. Idempotent:
 * the first caller wins, so a component may call it without tracking state.
 */
export async function startWorkspaceSync(): Promise<void> {
	if (started || !browser || !isTauri) return;
	started = true;
	unlisten = await listen<WorkspacesChangedPayload>(WORKSPACES_CHANGED, (event) => {
		void loadWorkspaces(event.payload);
	});
}

/** Stops the listener (tests and window teardown). */
export function stopWorkspaceSync(): void {
	unlisten?.();
	unlisten = undefined;
	started = false;
}

/**
 * Re-reads the workspace list and the stored selection, then broadcasts when
 * something actually changed. The active workspace is preserved unless another
 * window moved it: `active_workspace_id` is shared, but a window that is still
 * on a valid workspace keeps it (see `hydrateWorkspaces`).
 */
export async function loadWorkspaces(
	payload?: WorkspacesChangedPayload | null
): Promise<Workspace[]> {
	if (!browser) return workspaceStore.items;
	if (payload?.activeId && workspaceStore.items.some((item) => item.id === payload.activeId)) {
		// Announced move: the sender owns the shared selection.
		workspaceStore.activeId = payload.activeId;
	}
	const previous = fingerprint(workspaceStore.items);
	const previousActive = workspaceStore.activeId;
	const items = await reloadWorkspaces();
	if (workspaceStore.items.some((item) => item.id === previousActive)) {
		workspaceStore.activeId = previousActive;
	}
	ensureActiveWorkspace();
	if (fingerprint(items) === previous && workspaceStore.activeId === previousActive) {
		return workspaceStore.items;
	}
	if (isTauri) {
		await rememberActiveWorkspace(workspaceStore.activeId).catch(() => undefined);
	}
	notifyWorkspacesChanged();
	return workspaceStore.items;
}

/** Stores `id` as the active workspace; also used when the local state was kept. */
export async function rememberActiveWorkspace(id: string): Promise<boolean> {
	try {
		const { metaRepo } = await import('$lib/db');
		await metaRepo.set(ACTIVE_WORKSPACE_KEY, id);
		return true;
	} catch {
		return false;
	}
}

export type WorkspaceNameLookup = (workspaceId: string | undefined) => Workspace;

/**
 * Resolves a record's workspace for display, against the workspaces this
 * window currently knows. Falls back to the followed workspace and then to a
 * stable "Personal" default, so a badge never renders empty.
 */
export function workspaceLookup(): WorkspaceNameLookup {
	return (workspaceId) => workspaceOf(workspaceStore.items, workspaceId);
}
