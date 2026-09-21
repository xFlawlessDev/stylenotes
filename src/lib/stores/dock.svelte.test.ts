import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
	list: vi.fn(),
	upsert: vi.fn(),
	remove: vi.fn(),
	clear: vi.fn(),
	replaceAll: vi.fn(),
	settingsLoad: vi.fn(),
	settingsSave: vi.fn(),
	settingsClear: vi.fn()
}));

vi.mock('$lib/db', () => ({
	tasksRepo: {
		list: repo.list,
		upsert: repo.upsert,
		remove: repo.remove,
		clear: repo.clear,
		replaceAll: repo.replaceAll
	},
	settingsRepo: { load: repo.settingsLoad, save: repo.settingsSave, clear: repo.settingsClear }
}));

import { defaultSettings, settings } from '$lib/stores/settings.svelte';
import { createTask, type Task } from '$lib/stores/tasks';
import { taskStore } from '$lib/stores/tasks.svelte';
import {
	applyDockFilters,
	dockStore,
	loadDockTasks,
	removeDockTask,
	toggleDockComplete,
	toggleDockProgress
} from '$lib/stores/dock.svelte';

const task = (over: Partial<Task> = {}): Task => createTask(over);

beforeEach(() => {
	vi.mocked(repo.list).mockReset();
	vi.mocked(repo.upsert).mockReset().mockResolvedValue(undefined);
	vi.mocked(repo.settingsLoad).mockReset().mockResolvedValue(null);
	vi.mocked(repo.settingsSave).mockReset().mockResolvedValue(undefined);
	Object.assign(settings, defaultSettings());
	taskStore.items = [];
	dockStore.tasks = [];
	dockStore.docked = 0;
});

describe('loadDockTasks', () => {
	it('keeps only docked tasks that match the dock filters', async () => {
		repo.list.mockResolvedValue([
			task({ id: 'a', overlay: true, status: 'doing' }),
			task({ id: 'b', overlay: false, status: 'doing' }),
			task({ id: 'c', overlay: true, status: 'done' })
		]);
		settings.overlayStatus = 'doing';

		await loadDockTasks();

		expect(dockStore.tasks.map((item) => item.id)).toEqual(['a']);
		expect(dockStore.docked).toBe(2);
	});

	it('applies the stored dock sort order', async () => {
		repo.list.mockResolvedValue([
			task({ id: 'a', title: 'Beta', overlay: true, priority: 'low' }),
			task({ id: 'b', title: 'Alpha', overlay: true, priority: 'high' })
		]);
		settings.overlaySort = 'title';

		await loadDockTasks();

		expect(dockStore.tasks.map((item) => item.id)).toEqual(['b', 'a']);
	});
});

describe('applyDockFilters', () => {
	it('rebuilds the dock from the last loaded tasks', async () => {
		repo.list.mockResolvedValue([
			task({ id: 'a', overlay: true, priority: 'high' }),
			task({ id: 'b', overlay: true, priority: 'low' })
		]);
		await loadDockTasks();

		settings.overlayPriority = 'high';
		applyDockFilters();

		expect(dockStore.tasks.map((item) => item.id)).toEqual(['a']);
	});
});

describe('dock task actions', () => {
	beforeEach(async () => {
		repo.list.mockResolvedValue([task({ id: 'a', overlay: true, status: 'todo' })]);
		await loadDockTasks();
	});

	it('moves a task in and out of progress', async () => {
		const next = await toggleDockProgress(dockStore.tasks[0]);

		expect(next.status).toBe('doing');
		expect(dockStore.tasks[0].status).toBe('doing');
		expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', status: 'doing' }));
	});

	it('completes a task and reopens it', async () => {
		const done = await toggleDockComplete(dockStore.tasks[0]);
		expect(done.status).toBe('done');

		const reopened = await toggleDockComplete(done);
		expect(reopened.status).toBe('todo');
	});

	it('removes a task from the dock', async () => {
		await removeDockTask(dockStore.tasks[0]);

		expect(dockStore.tasks).toHaveLength(0);
		expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', overlay: false }));
	});

	it('reloads the dock when persisting fails', async () => {
		repo.upsert.mockRejectedValueOnce(new Error('offline'));
		const loads = repo.list.mock.calls.length;

		await toggleDockProgress(dockStore.tasks[0]);

		expect(repo.list.mock.calls.length).toBe(loads + 1);
	});
});
