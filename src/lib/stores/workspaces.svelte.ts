import { browser } from '$app/environment';
import { metaRepo } from '$lib/db';
import { workspacesRepo } from '$lib/db/workspaces';
import { DEFAULT_WORKSPACE_ID, type Workspace } from '$lib/workspace';

export const ACTIVE_WORKSPACE_KEY = 'active_workspace_id';

export const workspaceStore = $state<{
	items: Workspace[];
	activeId: string;
	loaded: boolean;
}>({ items: [], activeId: DEFAULT_WORKSPACE_ID, loaded: false });

const defaultWorkspace = (): Workspace => ({
	id: DEFAULT_WORKSPACE_ID,
	name: 'Personal',
	color: 'primary',
	createdAt: new Date(0).toISOString(),
});

export async function hydrateWorkspaces(): Promise<Workspace[]> {
	if (!browser) {
		workspaceStore.items = [defaultWorkspace()];
		workspaceStore.loaded = true;
		return workspaceStore.items;
	}
	try {
		const [items, activeId] = await Promise.all([
			workspacesRepo.list(),
			metaRepo.get(ACTIVE_WORKSPACE_KEY),
		]);
		workspaceStore.items = items.length ? items : [defaultWorkspace()];
		workspaceStore.activeId = workspaceStore.items.some((item) => item.id === activeId)
			? activeId!
			: workspaceStore.items[0].id;
		if (!activeId || workspaceStore.activeId !== activeId) {
			await metaRepo.set(ACTIVE_WORKSPACE_KEY, workspaceStore.activeId);
		}
	} catch {
		workspaceStore.items = [defaultWorkspace()];
		workspaceStore.activeId = DEFAULT_WORKSPACE_ID;
	}
	workspaceStore.loaded = true;
	return workspaceStore.items;
}

export async function setActiveWorkspace(id: string): Promise<boolean> {
	if (!workspaceStore.items.some((item) => item.id === id)) return false;
	workspaceStore.activeId = id;
	if (!browser) return true;
	try {
		await metaRepo.set(ACTIVE_WORKSPACE_KEY, id);
		return true;
	} catch {
		return false;
	}
}

export async function createWorkspace(name: string, color = 'primary'): Promise<Workspace | null> {
	const trimmed = name.trim();
	if (!trimmed || !browser) return null;
	const workspace: Workspace = {
		id: crypto.randomUUID(),
		name: trimmed,
		color,
		createdAt: new Date().toISOString(),
	};
	if (!(await workspacesRepo.create(workspace))) return null;
	workspaceStore.items = [...workspaceStore.items, workspace];
	await setActiveWorkspace(workspace.id);
	return workspace;
}

/** Renames a workspace, rolling the list back when the write fails. */
export async function renameWorkspace(id: string, name: string): Promise<boolean> {
	const trimmed = name.trim();
	const target = workspaceStore.items.find((item) => item.id === id);
	if (!target || !trimmed) return false;
	if (trimmed === target.name) return true;
	workspaceStore.items = workspaceStore.items.map((item) =>
		item.id === id ? { ...item, name: trimmed } : item
	);
	if (!browser) return true;
	if (await workspacesRepo.rename(id, trimmed)) return true;
	workspaceStore.items = workspaceStore.items.map((item) =>
		item.id === id ? { ...item, name: target.name } : item
	);
	return false;
}

/**
 * Deletes a workspace together with its notes, tasks and folders. The active
 * workspace is never removed: the next one takes over, so `items` stays
 * non-empty. Returns `false` (and restores the list) when the write fails or
 * this is the last workspace.
 */
export async function deleteWorkspace(id: string): Promise<boolean> {
	const previous = workspaceStore.items;
	const previousActiveId = workspaceStore.activeId;
	if (previous.length <= 1 || !previous.some((item) => item.id === id)) return false;
	const nextActiveId =
		previousActiveId === id ? previous.find((item) => item.id !== id)!.id : previousActiveId;
	workspaceStore.items = previous.filter((item) => item.id !== id);
	workspaceStore.activeId = nextActiveId;
	if (!browser) return true;
	if (!(await workspacesRepo.remove(id))) {
		workspaceStore.items = previous;
		workspaceStore.activeId = previousActiveId;
		return false;
	}
	if (nextActiveId !== previousActiveId) {
		// A failed persist is harmless: `hydrateWorkspaces` falls back to the
		// first workspace when the stored id no longer exists.
		await metaRepo.set(ACTIVE_WORKSPACE_KEY, nextActiveId).catch(() => {});
	}
	return true;
}

export function activeWorkspace(): Workspace {
	return workspaceStore.items.find((item) => item.id === workspaceStore.activeId) ?? defaultWorkspace();
}
