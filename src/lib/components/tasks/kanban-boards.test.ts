import { flushSync, mount, unmount } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
	tasksList: vi.fn(),
	notesList: vi.fn(),
	foldersList: vi.fn(),
	dependenciesList: vi.fn(),
	metaGet: vi.fn(),
	metaSet: vi.fn(),
	settingsLoad: vi.fn(),
	settingsSave: vi.fn()
}));

vi.mock('$lib/db', () => ({
	tasksRepo: { list: repo.tasksList, upsert: vi.fn() },
	notesRepo: { list: repo.notesList },
	foldersRepo: { list: repo.foldersList },
	dependenciesRepo: { list: repo.dependenciesList },
	metaRepo: { get: repo.metaGet, set: repo.metaSet },
	settingsRepo: { load: repo.settingsLoad, save: repo.settingsSave, clear: vi.fn() }
}));
vi.mock('$lib/db/workspaces', () => ({
	workspacesRepo: { list: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn() }
}));

import { createTask } from '$lib/stores/tasks';
import { defaultSettings, settings } from '$lib/stores/settings.svelte';
import { workspaceStore } from '$lib/stores/workspaces.svelte';
import { boardStore, reloadBoards, setBoards } from '$lib/stores/workspace-boards.svelte';
import Host from '$lib/components/tasks/kanban-test-host.svelte';

const workspace = (id: string, name: string) => ({
	id,
	name,
	color: 'primary',
	createdAt: '2026-01-01T00:00:00.000Z'
});

beforeEach(() => {
	vi.mocked(repo.tasksList).mockReset().mockResolvedValue([]);
	vi.mocked(repo.notesList).mockReset().mockResolvedValue([]);
	vi.mocked(repo.foldersList).mockReset().mockResolvedValue([]);
	vi.mocked(repo.dependenciesList).mockReset().mockResolvedValue([]);
	vi.mocked(repo.metaGet).mockReset().mockResolvedValue('home');
	vi.mocked(repo.settingsLoad).mockReset().mockResolvedValue(null);
	Object.assign(settings, defaultSettings());
	workspaceStore.items = [workspace('home', 'Personal'), workspace('work', 'Work')];
	workspaceStore.activeId = 'home';
	workspaceStore.loaded = true;
	boardStore.workspaces = ['home'];
	boardStore.boards = {};
	setBoards(['home']);
});

describe('kanban window boards', () => {
	it('renders one board for the followed workspace', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);

		const app = mount(Host, { target });
		flushSync();

		const boards = target.querySelectorAll('section[aria-label^="Kanban board"]');
		expect(boards).toHaveLength(1);
		expect(boards[0]?.getAttribute('aria-label')).toContain('Personal');
		expect(target.textContent).toContain('Following the app');

		unmount(app);
		target.remove();
	});

	it('renders one board per workspace when split', async () => {
		repo.tasksList.mockImplementation((id?: string) =>
			Promise.resolve([createTask({ id: `${id}-task`, workspaceId: id, title: `${id} card` })])
		);
		boardStore.workspaces = ['home', 'work'];
		await reloadBoards();
		const target = document.createElement('div');
		document.body.appendChild(target);

		const app = mount(Host, { target });
		flushSync();

		const boards = target.querySelectorAll('section[aria-label^="Kanban board"]');
		expect(boards).toHaveLength(2);
		expect(target.textContent).toContain('2 workspaces');
		// Both boards keep their own cards.
		expect(target.textContent).toContain('home card');
		expect(target.textContent).toContain('work card');

		unmount(app);
		target.remove();
	});

	it('labels the boards with their own workspace badge', () => {
		boardStore.workspaces = ['home', 'work'];
		const target = document.createElement('div');
		document.body.appendChild(target);

		const app = mount(Host, { target });
		flushSync();

		const labels = [...target.querySelectorAll('section[aria-label^="Kanban board"]')].map((node) =>
			node.getAttribute('aria-label')
		);
		expect(labels).toEqual(['Kanban board: Personal', 'Kanban board: Work']);

		unmount(app);
		target.remove();
	});
});
