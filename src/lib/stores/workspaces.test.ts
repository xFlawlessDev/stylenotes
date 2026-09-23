import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
	list: vi.fn(),
	create: vi.fn(),
	rename: vi.fn(),
	remove: vi.fn(),
}));
const meta = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('$lib/db', () => ({ metaRepo: meta }));
vi.mock('$lib/db/workspaces', () => ({ workspacesRepo: repo }));

import { deleteWorkspace, renameWorkspace, workspaceStore } from '$lib/stores/workspaces.svelte';

const workspace = (id: string, name: string) => ({
	id,
	name,
	color: 'primary',
	createdAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
	workspaceStore.items = [workspace('one', 'Personal'), workspace('two', 'Work')];
	workspaceStore.activeId = 'one';
	workspaceStore.loaded = true;
	meta.set.mockResolvedValue(undefined);
	repo.rename.mockResolvedValue(true);
	repo.remove.mockResolvedValue(true);
});

describe('renameWorkspace', () => {
	it('persists the new name', async () => {
		await expect(renameWorkspace('two', 'Office')).resolves.toBe(true);
		expect(workspaceStore.items.find((item) => item.id === 'two')?.name).toBe('Office');
		expect(repo.rename).toHaveBeenCalledWith('two', 'Office');
	});

	it('rolls the list back when the write fails', async () => {
		repo.rename.mockResolvedValue(false);
		await expect(renameWorkspace('two', 'Office')).resolves.toBe(false);
		expect(workspaceStore.items.find((item) => item.id === 'two')?.name).toBe('Work');
	});

	it('rejects unknown ids and blank names without writing', async () => {
		await expect(renameWorkspace('missing', 'Nope')).resolves.toBe(false);
		await expect(renameWorkspace('two', '   ')).resolves.toBe(false);
		expect(repo.rename).not.toHaveBeenCalled();
	});
});

describe('deleteWorkspace', () => {
	it('refuses to remove the last workspace', async () => {
		workspaceStore.items = [workspace('one', 'Personal')];
		await expect(deleteWorkspace('one')).resolves.toBe(false);
		expect(workspaceStore.items).toHaveLength(1);
		expect(repo.remove).not.toHaveBeenCalled();
	});

	it('removes a background workspace and keeps the active one', async () => {
		await expect(deleteWorkspace('two')).resolves.toBe(true);
		expect(workspaceStore.items.map((item) => item.id)).toEqual(['one']);
		expect(workspaceStore.activeId).toBe('one');
		expect(repo.remove).toHaveBeenCalledWith('two');
		expect(meta.set).not.toHaveBeenCalled();
	});

	it('falls over to the next workspace when the active one goes', async () => {
		await expect(deleteWorkspace('one')).resolves.toBe(true);
		expect(workspaceStore.items.map((item) => item.id)).toEqual(['two']);
		expect(workspaceStore.activeId).toBe('two');
		expect(meta.set).toHaveBeenCalledWith('active_workspace_id', 'two');
	});

	it('restores the list when the write fails', async () => {
		repo.remove.mockResolvedValue(false);
		await expect(deleteWorkspace('one')).resolves.toBe(false);
		expect(workspaceStore.items).toHaveLength(2);
		expect(workspaceStore.activeId).toBe('one');
	});
});
