import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
	tasksList: vi.fn(),
	tasksUpsert: vi.fn(),
	tasksRemove: vi.fn(),
	tasksClear: vi.fn(),
	tasksReplaceAll: vi.fn(),
	notesList: vi.fn(),
	notesUpsert: vi.fn(),
	notesRemove: vi.fn(),
	notesReplaceAll: vi.fn(),
	metaGet: vi.fn(),
	metaSet: vi.fn(),
	settingsLoad: vi.fn(),
	settingsSave: vi.fn(),
	settingsClear: vi.fn()
}));

vi.mock('$lib/db', () => ({
	tasksRepo: {
		list: repo.tasksList,
		upsert: repo.tasksUpsert,
		remove: repo.tasksRemove,
		clear: repo.tasksClear,
		replaceAll: repo.tasksReplaceAll
	},
	notesRepo: {
		list: repo.notesList,
		upsert: repo.notesUpsert,
		remove: repo.notesRemove,
		clear: vi.fn(),
		replaceAll: repo.notesReplaceAll
	},
	foldersRepo: { list: vi.fn(), upsert: vi.fn(), remove: vi.fn(), replaceAll: vi.fn() },
	metaRepo: { get: repo.metaGet, set: repo.metaSet },
	settingsRepo: { load: repo.settingsLoad, save: repo.settingsSave, clear: repo.settingsClear }
}));

import { createNote, type Note } from '$lib/content/content';
import { defaultSettings, settings } from '$lib/stores/settings.svelte';
import { createTask, type Task } from '$lib/stores/tasks';
import { taskStore } from '$lib/stores/tasks.svelte';
import {
	applyDockFilters,
	dockStore,
	loadDockItems,
	removeDockNote,
	removeDockTask,
	toggleDockComplete,
	toggleDockProgress
} from '$lib/stores/dock.svelte';

const task = (over: Partial<Task> = {}): Task => createTask(over);
const note = (over: Partial<Note> = {}): Note => createNote(over);

function mockItems(tasks: Task[] = [], notes: Note[] = []) {
	vi.mocked(repo.tasksList).mockResolvedValue(tasks);
	vi.mocked(repo.notesList).mockResolvedValue(notes);
}

beforeEach(() => {
	vi.mocked(repo.tasksList).mockReset();
	vi.mocked(repo.tasksUpsert).mockReset().mockResolvedValue(undefined);
	vi.mocked(repo.notesList).mockReset();
	vi.mocked(repo.notesUpsert).mockReset().mockResolvedValue(undefined);
	vi.mocked(repo.settingsLoad).mockReset().mockResolvedValue(null);
	vi.mocked(repo.settingsSave).mockReset().mockResolvedValue(undefined);
	Object.assign(settings, defaultSettings());
	taskStore.items = [];
	dockStore.tasks = [];
	dockStore.notes = [];
	dockStore.docked = 0;
});

describe('loadDockItems', () => {
	it('keeps only docked tasks that match the dock filters', async () => {
		mockItems([
			task({ id: 'a', overlay: true, status: 'doing' }),
			task({ id: 'b', overlay: false, status: 'doing' }),
			task({ id: 'c', overlay: true, status: 'done' })
		]);
		settings.overlayStatus = 'doing';

		await loadDockItems();

		expect(dockStore.tasks.map((item) => item.id)).toEqual(['a']);
		expect(dockStore.docked).toBe(2);
	});

	it('applies the stored dock sort order', async () => {
		mockItems([
			task({ id: 'a', title: 'Beta', overlay: true, priority: 'low' }),
			task({ id: 'b', title: 'Alpha', overlay: true, priority: 'high' })
		]);
		settings.overlaySort = 'title';

		await loadDockItems();

		expect(dockStore.tasks.map((item) => item.id)).toEqual(['b', 'a']);
	});

	it('lists docked notes with pinned notes first and counts them', async () => {
		mockItems(
			[task({ id: 't', overlay: true })],
			[
				note({ id: 'n1', title: 'Zebra', overlay: true }),
				note({ id: 'n2', title: 'Alpha', overlay: true, pinned: true }),
				note({ id: 'n3', title: 'Hidden', overlay: false })
			]
		);

		await loadDockItems();

		expect(dockStore.notes.map((item) => item.id)).toEqual(['n2', 'n1']);
		expect(dockStore.docked).toBe(3);
	});

	it('keeps docked notes when the task filters exclude everything', async () => {
		mockItems([task({ id: 't', overlay: true, priority: 'low' })], [
			note({ id: 'n1', title: 'Note', overlay: true })
		]);
		settings.overlayPriority = 'high';

		await loadDockItems();

		expect(dockStore.tasks).toHaveLength(0);
		expect(dockStore.notes.map((item) => item.id)).toEqual(['n1']);
		expect(dockStore.docked).toBe(2);
	});
});

describe('applyDockFilters', () => {
	it('rebuilds the dock from the last loaded tasks', async () => {
		mockItems([
			task({ id: 'a', overlay: true, priority: 'high' }),
			task({ id: 'b', overlay: true, priority: 'low' })
		]);
		await loadDockItems();

		settings.overlayPriority = 'high';
		applyDockFilters();

		expect(dockStore.tasks.map((item) => item.id)).toEqual(['a']);
	});
});

describe('dock task actions', () => {
	beforeEach(async () => {
		mockItems([task({ id: 'a', overlay: true, status: 'todo' })]);
		await loadDockItems();
	});

	it('moves a task in and out of progress', async () => {
		const next = await toggleDockProgress(dockStore.tasks[0]);

		expect(next.status).toBe('doing');
		expect(dockStore.tasks[0].status).toBe('doing');
		expect(repo.tasksUpsert).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'a', status: 'doing' })
		);
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
		expect(repo.tasksUpsert).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'a', overlay: false })
		);
	});

	it('reloads the dock when persisting fails', async () => {
		repo.tasksUpsert.mockRejectedValueOnce(new Error('offline'));
		const loads = repo.tasksList.mock.calls.length;

		await toggleDockProgress(dockStore.tasks[0]);

		expect(repo.tasksList.mock.calls.length).toBe(loads + 1);
	});
});

describe('dock note actions', () => {
	beforeEach(async () => {
		mockItems([], [note({ id: 'n1', title: 'Note', overlay: true })]);
		await loadDockItems();
	});

	it('removes a note from the dock', async () => {
		await removeDockNote(dockStore.notes[0]);

		expect(dockStore.notes).toHaveLength(0);
		expect(repo.notesUpsert).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'n1', overlay: false })
		);
	});

	it('restores the note when persisting fails', async () => {
		repo.notesUpsert.mockRejectedValueOnce(new Error('offline'));

		await removeDockNote(dockStore.notes[0]);

		expect(repo.notesList.mock.calls.length).toBeGreaterThan(1);
		expect(dockStore.notes.map((item) => item.id)).toEqual(['n1']);
	});
});
