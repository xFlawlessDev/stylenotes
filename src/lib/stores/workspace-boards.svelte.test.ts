import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
	tasksList: vi.fn(),
	tasksUpsert: vi.fn(),
	notesList: vi.fn(),
	foldersList: vi.fn(),
	settingsSave: vi.fn(),
	settingsLoad: vi.fn()
}));

vi.mock('$lib/db', () => ({
	tasksRepo: { list: repo.tasksList, upsert: repo.tasksUpsert },
	notesRepo: { list: repo.notesList },
	foldersRepo: { list: repo.foldersList },
	metaRepo: { get: vi.fn(), set: vi.fn() },
	settingsRepo: { load: repo.settingsLoad, save: repo.settingsSave, clear: vi.fn() }
}));

import { createTask, type Task } from '$lib/stores/tasks';
import { defaultSettings, settings } from '$lib/stores/settings.svelte';
import { workspaceStore } from '$lib/stores/workspaces.svelte';
import {
	boardStore,
	boardTask,
	closeBoard,
	isSplit,
	loadBoard,
	nextBoardWorkspace,
	persistBoardTasks,
	setBoardWorkspace,
	setBoards,
	splitBoard
} from '$lib/stores/workspace-boards.svelte';

const workspace = (id: string, name: string) => ({
	id,
	name,
	color: 'primary',
	createdAt: '2026-01-01T00:00:00.000Z'
});

beforeEach(() => {
	vi.mocked(repo.tasksList).mockReset().mockResolvedValue([]);
	vi.mocked(repo.tasksUpsert).mockReset().mockResolvedValue(undefined);
	vi.mocked(repo.notesList).mockReset().mockResolvedValue([]);
	vi.mocked(repo.foldersList).mockReset().mockResolvedValue([]);
	vi.mocked(repo.settingsSave).mockReset().mockResolvedValue(undefined);
	Object.assign(settings, defaultSettings());
	workspaceStore.items = [
		workspace('home', 'Personal'),
		workspace('work', 'Work'),
		workspace('solo', 'Solo')
	];
	workspaceStore.activeId = 'home';
	workspaceStore.loaded = true;
	boardStore.workspaces = ['home'];
	boardStore.boards = {};
});

describe('board layout', () => {
	it('starts from the stored layout and persists changes', () => {
		settings.kanbanBoards = ['home', 'work'];

		setBoards(settings.kanbanBoards);

		expect(boardStore.workspaces).toEqual(['home', 'work']);
		expect(settings.kanbanBoards).toEqual(['home', 'work']);
		expect(isSplit()).toBe(true);
	});

	it('never leaves the window without a board', () => {
		setBoards([]);

		expect(boardStore.workspaces).toEqual(['home']);
		expect(isSplit()).toBe(false);
	});

	it('drops duplicate and unknown workspaces', () => {
		setBoards(['home', 'home', 'ghost']);

		expect(boardStore.workspaces).toEqual(['home']);
	});

	it('splits onto the first workspace that is not shown yet', async () => {
		setBoards(['home']);

		expect(nextBoardWorkspace()).toBe('work');
		splitBoard();

		expect(boardStore.workspaces).toEqual(['home', 'work']);
		await loadBoard('work');
		expect(repo.tasksList).toHaveBeenCalledWith('work');
	});

	it('keeps at least one board when closing', () => {
		setBoards(['home', 'work']);

		closeBoard('work');
		expect(boardStore.workspaces).toEqual(['home']);

		closeBoard('home');
		expect(boardStore.workspaces).toEqual(['home']);
	});

	it('repoints a single board at another workspace', async () => {
		setBoards(['home', 'work']);

		setBoardWorkspace(1, 'solo');

		expect(boardStore.workspaces).toEqual(['home', 'solo']);
		await loadBoard('solo');
		expect(repo.tasksList).toHaveBeenCalledWith('solo');
	});
});

describe('board records', () => {
	it('loads a board without touching the other boards', async () => {
		repo.tasksList.mockImplementation((id?: string) =>
			Promise.resolve([createTask({ id: `${id}-task`, workspaceId: id })])
		);
		setBoards(['home', 'work']);

		await loadBoard('work');

		expect(boardStore.boards.work.tasks.map((task) => task.id)).toEqual(['work-task']);
		expect(boardStore.boards.home).toBeUndefined();
	});

	it('writes only the rows a board changed', async () => {
		const kept = createTask({ id: 'h1', workspaceId: 'home' });
		repo.tasksList.mockResolvedValue([kept]);
		await loadBoard('home');

		await persistBoardTasks('home', [kept, createTask({ id: 'h2', workspaceId: 'home' })]);

		expect(repo.tasksUpsert).toHaveBeenCalledTimes(1);
		expect(repo.tasksUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'h2' }));
	});

	it('reports a failed write so the window can warn', async () => {
		repo.tasksUpsert.mockRejectedValueOnce(new Error('offline'));

		await expect(
			persistBoardTasks('home', [createTask({ id: 'h1', workspaceId: 'home' })])
		).resolves.toBe(false);
	});

	it('builds a board task scoped and positioned in its workspace', () => {
		const existing: Task[] = [
			createTask({ id: 'w1', workspaceId: 'work', status: 'todo', position: 4 }),
			createTask({ id: 'h1', workspaceId: 'home', status: 'todo', position: 0 })
		];

		const created = boardTask('work', existing, { title: 'New', status: 'todo' });

		expect(created.workspaceId).toBe('work');
		expect(created.position).toBe(5);
	});
});
