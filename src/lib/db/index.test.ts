import { describe, it, expect, vi, beforeEach } from 'vitest';

const execute = vi.fn();
const select = vi.fn();

vi.mock('@tauri-apps/plugin-sql', () => ({
	default: { load: vi.fn(async () => ({ execute, select })) },
}));

vi.mock('$lib/windows', () => ({ isTauri: true }));

import { notesRepo, foldersRepo, notificationsRepo, settingsRepo, metaRepo } from '$lib/db';

beforeEach(() => {
	execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
	select.mockReset().mockResolvedValue([]);
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
				updated: 'Just now',
				tags: ['a', 'b'],
			},
		]);
	});
});

describe('notesRepo.upsert', () => {
	it('binds values and rewrites tags', async () => {
		await notesRepo.upsert({
			id: 'n1',
			title: 'Alpha',
			folder: 'work',
			body: 'body',
			excerpt: 'body',
			words: 1,
			chars: 4,
			pinned: true,
			updated: 'Just now',
			tags: ['a', 'b'],
		});

		const insert = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO notes'));
		expect(insert).toBeDefined();
		expect(insert![1]).toEqual(['n1', 'Alpha', 'work', 'body', 'body', 1, 4, 1, 'Just now']);

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
});

describe('notesRepo.remove', () => {
	it('deletes tags before the note', async () => {
		await notesRepo.remove('n1');
		expect(execute.mock.calls.map(([sql]) => sql)).toEqual([
			'DELETE FROM tags WHERE note_id = $1',
			'DELETE FROM notes WHERE id = $1',
		]);
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
			accent: 'steel',
			density: 'comfortable',
			reduceMotion: false,
			editorView: 'preview',
			focusMode: false,
			spellcheck: true,
			showWordCount: true,
			confirmDelete: true,
			overlayStatus: 'all',
			overlayPriority: 'all',
			overlaySort: 'smart',
			overlayPosition: 'right',
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