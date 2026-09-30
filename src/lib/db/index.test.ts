import { describe, it, expect, vi, beforeEach } from 'vitest';

const execute = vi.fn();
const select = vi.fn();
const invoke = vi.fn();

vi.mock('@tauri-apps/plugin-sql', () => ({
	default: { load: vi.fn(async () => ({ execute, select })) },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

vi.mock('$lib/windows', () => ({ isTauri: true }));

import { notesRepo, foldersRepo, notificationsRepo, settingsRepo, metaRepo, tasksRepo, getDb } from '$lib/db';
import { workspacesRepo } from '$lib/db/workspaces';
import { createTask } from '$lib/stores/tasks';

beforeEach(() => {
	execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
	select.mockReset().mockResolvedValue([]);
	invoke.mockReset().mockResolvedValue(undefined);
});

describe('getDb connection setup', () => {
	it('enables WAL, a busy timeout and foreign keys before any query', async () => {
		await getDb();

		const configured = execute.mock.calls.map(([sql]) => String(sql));
		expect(configured).toContain('PRAGMA journal_mode = WAL');
		expect(configured).toContain('PRAGMA synchronous = NORMAL');
		expect(configured).toContain('PRAGMA busy_timeout = 5000');
		expect(configured).toContain('PRAGMA foreign_keys = ON');
	});

	it('still resolves when a pragma is rejected', async () => {
		execute.mockRejectedValueOnce(new Error('pragma unsupported'));
		await expect(getDb()).resolves.toBeDefined();
	});
});

describe('notesRepo.list', () => {
	it('maps rows and attaches tags per note', async () => {
		select
			.mockResolvedValueOnce([
				{
					id: 'n1',
					title: 'Alpha',
					folder: 'work',
					body: 'body',
					excerpt: 'body',
					words: 1,
					chars: 4,
					pinned: 1,
					updated: 'Just now',
				},
			])
			.mockResolvedValueOnce([
				{ note_id: 'n1', tag: 'a' },
				{ note_id: 'n1', tag: 'b' },
			]);

		const notes = await notesRepo.list();

		expect(notes).toEqual([
			{
				id: 'n1',
				title: 'Alpha',
				folder: 'work',
				body: 'body',
				excerpt: 'body',
				words: 1,
				chars: 4,
				pinned: true,
				overlay: false,
				updated: 'Just now',
				tags: ['a', 'b'],
			},
		]);
	});
});

describe('notesRepo.upsert', () => {
	it('binds values and rewrites tags when they changed', async () => {
		select.mockResolvedValueOnce([]); // no existing tags for n1
		await notesRepo.upsert({
			id: 'n1',
			title: 'Alpha',
			folder: 'work',
			body: 'body',
			excerpt: 'body',
			words: 1,
			chars: 4,
			pinned: true,
			overlay: true,
			updated: 'Just now',
			tags: ['a', 'b'],
		});

		const insert = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO notes'));
		expect(insert).toBeDefined();
		// The last binding is the machine-readable `updated_at`, taken from the
		// record or stamped with the current time (#D13).
		const bound = insert![1] as unknown[];
		expect(bound.slice(0, 10)).toEqual(['n1', 'Alpha', 'work', 'body', 'body', 1, 4, 1, 1, 'Just now']);
		expect(typeof bound[10]).toBe('number');

		expect(execute).toHaveBeenCalledWith('DELETE FROM tags WHERE note_id = $1', ['n1']);
		expect(execute).toHaveBeenCalledWith('INSERT OR IGNORE INTO tags (note_id, tag) VALUES ($1, $2)', [
			'n1',
			'a',
		]);
		expect(execute).toHaveBeenCalledWith('INSERT OR IGNORE INTO tags (note_id, tag) VALUES ($1, $2)', [
			'n1',
			'b',
		]);
	});

	it('leaves tags untouched when the stored list already matches', async () => {
		select.mockResolvedValueOnce([{ tag: 'a' }, { tag: 'b' }]);
		await notesRepo.upsert({
			id: 'n1',
			title: 'Alpha',
			folder: 'work',
			body: 'body',
			excerpt: 'body',
			words: 1,
			chars: 4,
			pinned: true,
			overlay: true,
			updated: 'Just now',
			tags: ['a', 'b'],
		});

		const tagWrites = execute.mock.calls.filter(([sql]) => String(sql).includes('tags'));
		expect(tagWrites).toEqual([]);
	});
});

describe('notesRepo.remove', () => {
	it('prefers the transactional delete', async () => {
		await notesRepo.remove('n1');
		expect(invoke).toHaveBeenCalledWith('note_remove_tx', { id: 'n1' });
		expect(execute).not.toHaveBeenCalled();
	});

	it('falls back to deleting tags before the note', async () => {
		invoke.mockRejectedValueOnce(new Error('no write pool'));
		await notesRepo.remove('n1');
		expect(execute.mock.calls.map(([sql]) => sql)).toEqual([
			'DELETE FROM tags WHERE note_id = $1',
			'DELETE FROM notes WHERE id = $1',
		]);
	});
});

describe('notesRepo.upsert transaction path', () => {
	const note = {
		id: 'n1',
		workspaceId: 'workspace-default',
		title: 'Alpha',
		folder: 'work',
		body: 'body',
		excerpt: 'body',
		words: 1,
		chars: 4,
		pinned: false,
		overlay: false,
		updated: 'Just now',
		tags: ['a'],
	};

	it('routes a workspace note through note_upsert_tx', async () => {
		await notesRepo.upsert(note);

		expect(invoke).toHaveBeenCalledWith('note_upsert_tx', expect.objectContaining({
			id: 'n1',
			workspaceId: 'workspace-default',
			body: 'body',
			tags: ['a'],
		}));
		const [, payload] = invoke.mock.calls[0] as [string, { updatedAt: number }];
		expect(typeof payload.updatedAt).toBe('number');
		expect(execute).not.toHaveBeenCalled();
	});

	it('falls back to direct writes when the pool is unavailable', async () => {
		invoke.mockRejectedValueOnce(new Error('no write pool'));
		select.mockResolvedValueOnce([]);
		await notesRepo.upsert(note);

		expect(execute.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO notes'))).toBe(true);
	});
});

describe('workspacesRepo.remove', () => {
	it('prefers the single transactional delete', async () => {
		await workspacesRepo.remove('ws-two');

		expect(invoke).toHaveBeenCalledWith('workspace_remove_tx', { id: 'ws-two' });
		// The individual DELETEs are the non-atomic fallback; the transaction
		// must be used whenever the write pool is available.
		expect(execute).not.toHaveBeenCalled();
	});

	it('falls back to deleting children before the workspace', async () => {
		invoke.mockRejectedValueOnce(new Error('no write pool'));
		await workspacesRepo.remove('ws-two');

		const statements = execute.mock.calls.map(([sql]) => String(sql));
		expect(statements[0]).toContain('DELETE FROM tags');
		// Titles/links must go before the rows they point at.
		expect(statements.findIndex((sql) => sql.includes('DELETE FROM task_notes'))).toBeLessThan(
			statements.findIndex((sql) => sql.includes('DELETE FROM tasks WHERE workspace_id'))
		);
		expect(statements.findIndex((sql) => sql.includes('DELETE FROM notes WHERE workspace_id'))).toBeLessThan(
			statements.findIndex((sql) => sql.includes('DELETE FROM folders'))
		);
		expect(statements).toContain('DELETE FROM workspaces WHERE id = $1');
	});

	it('reports failure when both paths fail', async () => {
		invoke.mockRejectedValueOnce(new Error('no write pool'));
		execute.mockRejectedValueOnce(new Error('locked'));
		await expect(workspacesRepo.remove('ws-two')).resolves.toBe(false);
	});
});

describe('foldersRepo', () => {
	it('lists folders ordered by position and maps a null icon to undefined', async () => {
		select.mockResolvedValueOnce([
			{ id: 'research', label: 'Research', icon: 'rocket', position: 0 },
			{ id: 'misc', label: 'Misc', icon: null, position: 1 },
		]);
		expect(await foldersRepo.list()).toEqual([
			{ id: 'research', label: 'Research', icon: 'rocket', position: 0 },
			{ id: 'misc', label: 'Misc', icon: undefined, position: 1 },
		]);
	});

	it('upserts with conflict handling', async () => {
		await foldersRepo.upsert({ id: 'research', label: 'Research', icon: 'rocket' }, 2);
		const [sql, params] = execute.mock.calls[0];
		expect(sql).toContain('ON CONFLICT(id) DO UPDATE');
		expect(sql).toContain('icon = excluded.icon');
		expect(sql).toContain('position = excluded.position');
		expect(params).toEqual(['research', 'Research', 'rocket', 2]);
	});

	it('binds null when a folder has no icon', async () => {
		await foldersRepo.upsert({ id: 'misc', label: 'Misc' });
		expect(execute.mock.calls[0][1]).toEqual(['misc', 'Misc', null, null]);
	});
});

describe('notificationsRepo', () => {
	it('coerces read to boolean on list', async () => {
		select.mockResolvedValueOnce([
			{ id: 'n1', kind: 'tip', title: 'T', body: 'B', time: 'now', read: 0 },
		]);
		const items = await notificationsRepo.list();
		expect(items[0].read).toBe(false);
	});

	it('persists read as 0/1', async () => {
		await notificationsRepo.upsert({
			id: 'n1',
			kind: 'tip',
			title: 'T',
			body: 'B',
			time: 'now',
			read: true,
		});
		expect(execute.mock.calls[0][1]).toEqual(['n1', 'tip', 'T', 'B', 'now', 1]);
	});
});

describe('settingsRepo', () => {
	it('returns null when nothing is stored', async () => {
		select.mockResolvedValueOnce([]);
		expect(await settingsRepo.load()).toBeNull();
	});

	it('parses stored json and survives corrupt data', async () => {
		select.mockResolvedValueOnce([{ data: '{"mode":"light"}' }]);
		expect(await settingsRepo.load()).toEqual({ mode: 'light' });

		select.mockResolvedValueOnce([{ data: 'not-json' }]);
		expect(await settingsRepo.load()).toBeNull();
	});

	it('serializes settings on save', async () => {
		await settingsRepo.save({
			mode: 'dark',
			language: 'en',
			accent: 'steel',
			density: 'comfortable',
			reduceMotion: false,
			editorView: 'preview',
			taskView: 'write',
			focusMode: false,
			spellcheck: true,
			showWordCount: true,
			confirmDelete: true,
			previewInlineEdit: true,
			overlayStatus: 'all',
			overlayPriority: 'all',
			overlaySort: 'smart',
			overlayPosition: 'right',
			kanbanLocked: false,
			kanbanPinned: false,
			kanbanBoards: [],
			detailAlwaysOnTop: true,
			versioningEnabled: true,
			timezone: '',
			journalEnabled: false,
			journalFolder: 'journal',
			journalFormat: 'YYYY-MM-DD',
			journalTemplate: '',
		});
		expect(execute.mock.calls[0][0]).toContain('ON CONFLICT(id) DO UPDATE');
		expect(JSON.parse(execute.mock.calls[0][1][0])).toMatchObject({ mode: 'dark' });
	});
});

describe('metaRepo', () => {
	it('reads and writes key/value pairs', async () => {
		select.mockResolvedValueOnce([{ value: 'yes' }]);
		expect(await metaRepo.get('k')).toBe('yes');

		select.mockResolvedValueOnce([]);
		expect(await metaRepo.get('missing')).toBeNull();

		await metaRepo.set('k', 'v');
		expect(execute.mock.calls[0][1]).toEqual(['k', 'v']);
	});
});

describe('tasksRepo note links', () => {
	const row = (over: Partial<Record<string, unknown>> = {}) => ({
		id: 'n1',
		workspace_id: 'workspace-default',
		title: 'Do it',
		notes: '',
		status: 'todo',
		priority: 'medium',
		folder: 'personal',
		note_id: 'legacy',
		start_at: null,
		due_at: null,
		position: 0,
		completed: 0,
		overlay: 0,
		...over,
	});

	it('hydrates the link list per task', async () => {
		select
			.mockResolvedValueOnce([row(), row({ id: 'n2', note_id: null })])
			.mockResolvedValueOnce([
				{ task_id: 'n1', note_id: 'a' },
				{ task_id: 'n1', note_id: 'b' },
			]);

		const tasks = await tasksRepo.list();
		expect(tasks[0].noteIds).toEqual(['a', 'b']);
		expect(tasks[0].noteId).toBe('a');
		// A task with no ledger rows falls back to the legacy column, never null.
		expect(tasks[1].noteIds).toEqual([]);
		expect(tasks[1].noteId).toBeNull();
	});

	it('rewrites the link rows and mirrors the first link on upsert', async () => {
		await tasksRepo.upsert(createTask({ id: 'n1', noteIds: ['a', 'b'] }));

		const insert = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO tasks'));
		expect(insert![1][7]).toBe('a');
		expect(execute).toHaveBeenCalledWith('DELETE FROM task_notes WHERE task_id = $1', ['n1']);
		expect(execute).toHaveBeenCalledWith(
			'INSERT OR IGNORE INTO task_notes (task_id, note_id) VALUES ($1, $2)',
			['n1', 'a']
		);
		expect(execute).toHaveBeenCalledWith(
			'INSERT OR IGNORE INTO task_notes (task_id, note_id) VALUES ($1, $2)',
			['n1', 'b']
		);
	});

	it('clears link rows before the task row', async () => {
		await tasksRepo.remove('n1');
		expect(execute.mock.calls.map(([sql]) => sql)).toEqual([
			'DELETE FROM task_dependencies WHERE task_id = $1 OR depends_on_task_id = $1',
			'DELETE FROM task_notes WHERE task_id = $1',
			'DELETE FROM tasks WHERE id = $1',
		]);
	});
});