import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
	tasksList: vi.fn(),
	tasksUpsert: vi.fn(),
	metaGet: vi.fn(),
	metaSet: vi.fn()
}));

vi.mock('$lib/db', () => ({
	tasksRepo: { list: repo.tasksList, upsert: repo.tasksUpsert },
	notesRepo: { list: vi.fn() },
	foldersRepo: { list: vi.fn() },
	metaRepo: { get: repo.metaGet, set: repo.metaSet }
}));

import { createTask, type Task } from '$lib/stores/tasks';
import {
	detailWorkspaceId,
	listWorkspaceTasks,
	refreshTasks,
	taskStore
} from '$lib/stores/tasks.svelte';
import { workspaceStore } from '$lib/stores/workspaces.svelte';

const task = (over: Partial<Task> = {}): Task => createTask(over);

beforeEach(() => {
	vi.mocked(repo.tasksList).mockReset();
	vi.mocked(repo.tasksUpsert).mockReset().mockResolvedValue(undefined);
	vi.mocked(repo.metaGet).mockReset();
	vi.mocked(repo.metaSet).mockReset().mockResolvedValue(undefined);
	taskStore.items = [];
	workspaceStore.items = [];
	workspaceStore.activeId = 'work';
	workspaceStore.loaded = true;
});

describe('refreshTasks', () => {
	it('reads the active workspace and replaces its rows', async () => {
		vi.mocked(repo.tasksList).mockResolvedValue([task({ id: 'w1', workspaceId: 'work' })]);

		await refreshTasks();

		expect(repo.tasksList).toHaveBeenCalledWith('work');
		expect(taskStore.items.map((item) => item.id)).toEqual(['w1']);
	});

	it('drops rows of other workspaces when switching the active one', async () => {
		// Regression: the workspace window renders `taskStore` directly, so a
		// refresh after a workspace switch must not keep the previous
		// workspace's rows in the shared store.
		taskStore.items = [
			task({ id: 'home-old', workspaceId: 'home' }),
			task({ id: 'work-old', workspaceId: 'work' })
		];
		workspaceStore.activeId = 'home';
		vi.mocked(repo.tasksList).mockResolvedValue([task({ id: 'home-new', workspaceId: 'home' })]);

		await refreshTasks();

		expect(repo.tasksList).toHaveBeenCalledWith('home');
		expect(taskStore.items.map((item) => item.id)).toEqual(['home-new']);
	});

	it('keeps the last known tasks when the read fails', async () => {
		taskStore.items = [task({ id: 'kept', workspaceId: 'home' })];
		vi.mocked(repo.tasksList).mockRejectedValue(new Error('offline'));

		await refreshTasks();

		expect(taskStore.items.map((item) => item.id)).toEqual(['kept']);
	});
});

describe('listWorkspaceTasks', () => {
	it('reads one workspace without touching the shared store', async () => {
		taskStore.items = [task({ id: 'shared', workspaceId: 'home' })];
		vi.mocked(repo.tasksList).mockResolvedValue([task({ id: 'other', workspaceId: 'other' })]);

		const rows = await listWorkspaceTasks('other');

		expect(repo.tasksList).toHaveBeenCalledWith('other');
		expect(rows.map((item) => item.id)).toEqual(['other']);
		expect(taskStore.items.map((item) => item.id)).toEqual(['shared']);
	});

	it('returns an empty list when the store is unavailable', async () => {
		vi.mocked(repo.tasksList).mockRejectedValue(new Error('offline'));

		await expect(listWorkspaceTasks('work')).resolves.toEqual([]);
	});
});

describe('detailWorkspaceId', () => {
	it('resolves the workspace of the record the window shows', () => {
		const records = [
			{ id: 'a', workspaceId: 'work' },
			{ id: 'b', workspaceId: 'home' }
		];

		expect(detailWorkspaceId(records, 'a')).toBe('work');
		expect(detailWorkspaceId(records, 'b')).toBe('home');
	});

	it('falls back to the base workspace for unknown or missing records', () => {
		expect(detailWorkspaceId([{ id: 'a', workspaceId: 'work' }], 'gone')).toBe('workspace-default');
		expect(detailWorkspaceId([{ id: 'a' }], 'a')).toBe('workspace-default');
		expect(detailWorkspaceId([], null)).toBe('workspace-default');
	});
});
