import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
	list: vi.fn(),
	metaGet: vi.fn(),
	metaSet: vi.fn()
}));

vi.mock('$lib/db', () => ({ metaRepo: { get: repo.metaGet, set: repo.metaSet } }));
vi.mock('$lib/db/workspaces', () => ({
	workspacesRepo: {
		list: repo.list,
		create: vi.fn(),
		rename: vi.fn(),
		remove: vi.fn()
	}
}));

import {
	applyExternalWorkspaces,
	loadWorkspaces,
	workspaceLookup
} from '$lib/workspace-sync.svelte';
import { workspaceStore } from '$lib/stores/workspaces.svelte';

const workspace = (id: string, name: string, color = 'primary') => ({
	id,
	name,
	color,
	createdAt: '2026-01-01T00:00:00.000Z'
});

beforeEach(() => {
	vi.mocked(repo.list).mockReset();
	vi.mocked(repo.metaGet).mockReset();
	vi.mocked(repo.metaSet).mockReset().mockResolvedValue(undefined);
	workspaceStore.items = [workspace('one', 'Personal'), workspace('two', 'Work')];
	workspaceStore.activeId = 'one';
	workspaceStore.loaded = true;
});

describe('applyExternalWorkspaces', () => {
	it('adopts an announced selection and reports the change', async () => {
		await expect(applyExternalWorkspaces({ activeId: 'two' })).resolves.toBe(true);
		expect(workspaceStore.activeId).toBe('two');
		expect(repo.list).not.toHaveBeenCalled();
	});

	it('reports no change when the announcement matches', async () => {
		await expect(applyExternalWorkspaces({ activeId: 'one' })).resolves.toBe(false);
	});

	it('re-reads the list when the announcement is not usable', async () => {
		repo.list.mockResolvedValue([
			workspace('one', 'Personal'),
			workspace('two', 'Renamed')
		]);
		repo.metaGet.mockResolvedValue('one');

		await expect(applyExternalWorkspaces({ activeId: 'gone' })).resolves.toBe(true);
		expect(repo.list).toHaveBeenCalled();
		expect(workspaceStore.items[1].name).toBe('Renamed');
	});
});

describe('loadWorkspaces', () => {
	it('takes an announced selection over the stored one', async () => {
		repo.list.mockResolvedValue([workspace('one', 'Personal'), workspace('two', 'Work')]);
		repo.metaGet.mockResolvedValue('one');

		await loadWorkspaces({ activeId: 'two' });

		expect(workspaceStore.activeId).toBe('two');
	});

	it('re-asserts a selection that the stored key disagrees with', async () => {
		repo.list.mockResolvedValue([workspace('one', 'Personal'), workspace('two', 'Work')]);
		repo.metaGet.mockResolvedValue('one');
		workspaceStore.activeId = 'two';

		await loadWorkspaces();

		expect(workspaceStore.activeId).toBe('two');
	});

	it('keeps a valid local selection when nothing announced a move', async () => {
		// The stored key is shared, but a window that is on a valid workspace
		// must not be dragged back by a stale value written mid-switch.
		repo.list.mockResolvedValue([workspace('one', 'Personal'), workspace('two', 'Work')]);
		repo.metaGet.mockResolvedValue('one');

		await loadWorkspaces();

		expect(workspaceStore.activeId).toBe('one');
		expect(repo.metaSet).not.toHaveBeenCalled();
	});

	it('falls back to the first workspace when the stored one is gone', async () => {
		repo.list.mockResolvedValue([workspace('two', 'Work')]);
		repo.metaGet.mockResolvedValue('deleted');
		workspaceStore.activeId = 'deleted';

		await loadWorkspaces();

		expect(workspaceStore.activeId).toBe('two');
		expect(repo.metaSet).toHaveBeenCalledWith('active_workspace_id', 'two');
	});
});

describe('workspaceLookup', () => {
	it('resolves badges against the known workspaces', () => {
		const lookup = workspaceLookup();
		expect(lookup('two').name).toBe('Work');
		expect(lookup(undefined).id).toBe('workspace-default');
	});
});
