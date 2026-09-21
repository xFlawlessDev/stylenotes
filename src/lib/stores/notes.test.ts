import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/db', () => ({
	notesRepo: {
		list: vi.fn(),
		upsert: vi.fn(),
		remove: vi.fn(),
		replaceAll: vi.fn(),
	},
	foldersRepo: {
		list: vi.fn(),
		upsert: vi.fn(),
		remove: vi.fn(),
		replaceAll: vi.fn(),
	},
	metaRepo: {
		get: vi.fn(),
		set: vi.fn(),
	},
}));

import { notesRepo, foldersRepo, metaRepo } from '$lib/db';
import {
	foldersFor,
	folderLabels,
	hydrateNotes,
	loadFolders,
	persistNote,
	removeNote,
	persistNotes,
	persistFolders,
	resetNotesToSeed,
	uniqueFolderId,
	slugifyFolder,
	parseChecklist,
	toggleChecklistItem,
	exportNotes,
	reorderFolders,
	renameFolderInList,
	setFolderIconInList,
	removeFolderFromList,
	reassignNotesFolder,
	type CustomFolder,
} from '$lib/stores/notes';
import { notes as seedNotes, createNote } from '$lib/content/content';
import type { Note } from '$lib/content/content';

const note = (over: Partial<Note> = {}): Note => createNote(over);

beforeEach(() => {
	vi.mocked(notesRepo.list).mockReset();
	vi.mocked(notesRepo.upsert).mockReset();
	vi.mocked(notesRepo.remove).mockReset();
	vi.mocked(notesRepo.replaceAll).mockReset().mockResolvedValue(undefined);
	vi.mocked(foldersRepo.list).mockReset();
	vi.mocked(foldersRepo.replaceAll).mockReset().mockResolvedValue(undefined);
	vi.mocked(metaRepo.get).mockReset();
	vi.mocked(metaRepo.set).mockReset().mockResolvedValue(undefined);
});

describe('foldersFor', () => {
	it('always includes the all folder with the total count', () => {
		const folders = foldersFor([note({ folder: 'work' }), note({ folder: 'ideas' })]);
		expect(folders[0]).toEqual({
			id: 'all',
			label: folderLabels.all,
			count: 2,
			tone: 'primary',
			icon: 'all',
		});
	});

	it('counts notes per folder and merges custom folder labels', () => {
		const all = [
			note({ folder: 'work' }),
			note({ folder: 'work' }),
			note({ folder: 'research' }),
		];
		const custom: CustomFolder[] = [{ id: 'research', label: 'Research', icon: 'rocket' }];
		const folders = foldersFor(all, custom);
		const work = folders.find((f) => f.id === 'work');
		const research = folders.find((f) => f.id === 'research');
		expect(work?.count).toBe(2);
		expect(work?.label).toBe(folderLabels.work);
		expect(research?.count).toBe(1);
		expect(research?.label).toBe('Research');
		expect(research?.icon).toBe('rocket');
	});

it('defaults a folder icon to its id when none is set', () => {
		const folders = foldersFor([note({ folder: 'deep-work' })]);
		expect(folders.find((f) => f.id === 'deep-work')?.icon).toBe('deep-work');
	});

	it('title-cases unknown folder ids', () => {
		const folders = foldersFor([note({ folder: 'deep-work' })]);
		expect(folders.find((f) => f.id === 'deep-work')?.label).toBe('Deep Work');
	});

	it('orders folders by the custom list, then known defaults, then note folders', () => {
		const all = [note({ folder: 'research' }), note({ folder: 'work' })];
		const custom: CustomFolder[] = [
			{ id: 'research', label: 'Research', icon: 'rocket' },
			{ id: 'work', label: 'Work', icon: 'briefcase' },
		];
		const ids = foldersFor(all, custom).map((f) => f.id);
		expect(ids).toEqual(['all', 'research', 'work', 'ideas', 'dev', 'personal', 'archive']);
	});
});

describe('folder list mutations', () => {
	const list: CustomFolder[] = [
		{ id: 'a', label: 'A' },
		{ id: 'b', label: 'B' },
		{ id: 'c', label: 'C' },
	];

	it('renames by merging an unknown folder into the list', () => {
		expect(renameFolderInList(list, 'b', 'Beta')[1]).toEqual({ id: 'b', label: 'Beta' });
		expect(renameFolderInList(list, 'work', 'Job')).toContainEqual({
			id: 'work',
			label: 'Job',
			icon: 'work',
		});
	});

	it('sets an icon by merging an unknown folder into the list', () => {
		expect(setFolderIconInList(list, 'a', 'rocket')[0]).toEqual({
			id: 'a',
			label: 'A',
			icon: 'rocket',
		});
	});

	it('removes a folder from the list', () => {
		expect(removeFolderFromList(list, 'b').map((f) => f.id)).toEqual(['a', 'c']);
	});

	it('reassigns notes to personal', () => {
		const notes = [note({ folder: 'a' }), note({ folder: 'b' })];
		const next = reassignNotesFolder(notes, 'a');
		expect(next[0].folder).toBe('personal');
		expect(next[1].folder).toBe('b');
	});

	it('reorders from the displayed folder order', () => {
		const display = [
			{ id: 'all', label: 'All', count: 0, tone: 'primary', icon: 'all' },
			{ id: 'a', label: 'A', count: 0, tone: 'primary', icon: 'a' },
			{ id: 'b', label: 'B', count: 0, tone: 'secondary', icon: 'b' },
			{ id: 'c', label: 'C', count: 0, tone: 'tertiary', icon: 'c' },
		];
		expect(reorderFolders(display, 'c', 'a').map((f) => f.id)).toEqual(['c', 'a', 'b']);
		expect(reorderFolders(display, 'a', 'c').map((f) => f.id)).toEqual(['b', 'c', 'a']);
	});
});

describe('slugifyFolder / uniqueFolderId', () => {
	it('slugifies labels', () => {
		expect(slugifyFolder('Deep Work!')).toBe('deep-work');
		expect(slugifyFolder('   ')).toBe('folder');
	});

	it('suffixes duplicates', () => {
		expect(uniqueFolderId('Idea', [])).toBe('idea');
		expect(uniqueFolderId('Idea', ['idea'])).toBe('idea-2');
		expect(uniqueFolderId('Idea', ['idea', 'idea-2'])).toBe('idea-3');
	});
});

describe('parseChecklist', () => {
	it('parses checkboxes and honours limit', () => {
		const body = '- [x] done\n- [ ] todo\n* [X] caps\n1. plain';
		expect(parseChecklist(body, 2)).toEqual([
			{ text: 'done', done: true },
			{ text: 'todo', done: false },
		]);
	});

	it('returns empty for bodies without checklists', () => {
		expect(parseChecklist('# heading\nsome text')).toEqual([]);
	});
});

describe('hydrateNotes', () => {
	it('seeds the database on first run then returns stored notes', async () => {
		vi.mocked(metaRepo.get).mockResolvedValue(null);
		const stored = [note({ id: 'a', title: 'Alpha' })];
		vi.mocked(notesRepo.list).mockResolvedValue(stored);

		const result = await hydrateNotes();

		expect(metaRepo.get).toHaveBeenCalled();
		expect(notesRepo.replaceAll).toHaveBeenCalledWith(seedNotes);
		expect(metaRepo.set).toHaveBeenCalled();
		expect(result).toEqual(stored);
	});

	it('skips seeding when the flag exists', async () => {
		vi.mocked(metaRepo.get).mockResolvedValue('2026-01-01T00:00:00.000Z');
		vi.mocked(notesRepo.list).mockResolvedValue([]);

		const result = await hydrateNotes();

		expect(notesRepo.replaceAll).not.toHaveBeenCalled();
		expect(result).toEqual([]);
	});

	it('falls back to seed content when the database errors', async () => {
		vi.mocked(metaRepo.get).mockRejectedValue(new Error('db down'));
		const result = await hydrateNotes();
		expect(result).toEqual(seedNotes);
	});
});

describe('loadFolders / persistFolders', () => {
	it('reads folders from the repository', async () => {
		const folders = [{ id: 'research', label: 'Research' }];
		vi.mocked(foldersRepo.list).mockResolvedValue(folders);
		expect(await loadFolders()).toEqual(folders);
	});

	it('swallows repository errors', async () => {
		vi.mocked(foldersRepo.list).mockRejectedValue(new Error('nope'));
		expect(await loadFolders()).toEqual([]);
	});

	it('replaces all folders', async () => {
		const folders = [{ id: 'research', label: 'Research' }];
		await persistFolders(folders);
		expect(foldersRepo.replaceAll).toHaveBeenCalledWith(folders);
	});
});

describe('note persistence', () => {
	it('upserts a single note and reports success', async () => {
		const n = note({ id: 'n1' });
		await expect(persistNote(n)).resolves.toBe(true);
		expect(notesRepo.upsert).toHaveBeenCalledWith(n);
	});

	it('reports failure when the upsert throws', async () => {
		vi.mocked(notesRepo.upsert).mockRejectedValueOnce(new Error('boom'));
		await expect(persistNote(note({ id: 'n1' }))).resolves.toBe(false);
	});

	it('removes a note and tolerates failures', async () => {
		await expect(removeNote('n1')).resolves.toBe(true);
		expect(notesRepo.remove).toHaveBeenCalledWith('n1');

		vi.mocked(notesRepo.remove).mockRejectedValueOnce(new Error('boom'));
		await expect(removeNote('n2')).resolves.toBe(false);
	});

	it('replaces all notes', async () => {
		await expect(persistNotes(seedNotes)).resolves.toBe(true);
		expect(notesRepo.replaceAll).toHaveBeenCalledWith(seedNotes);
	});

	it('reports failure when persisting all notes throws', async () => {
		vi.mocked(notesRepo.replaceAll).mockRejectedValueOnce(new Error('boom'));
		await expect(persistNotes(seedNotes)).resolves.toBe(false);
	});

	it('resets to seed data and clears folders', async () => {
		const result = await resetNotesToSeed();
		expect(notesRepo.replaceAll).toHaveBeenCalledWith(seedNotes);
		expect(foldersRepo.replaceAll).toHaveBeenCalledWith([]);
		expect(result).toEqual(seedNotes);
	});
});

describe('createNote defaults', () => {
	it('falls back to Untitled note for empty titles', () => {
		expect(createNote({ title: '' }).title).toBe('Untitled note');
		expect(createNote({ title: '   ' }).title).toBe('Untitled note');
		expect(createNote({ title: 'Alpha' }).title).toBe('Alpha');
	});

	it('derives excerpt, word and char counts from the body', () => {
		const n = createNote({ body: 'hello world' });
		expect(n.words).toBe(2);
		expect(n.chars).toBe(11);
		expect(n.excerpt).toContain('hello world');
	});
});

describe('toggleChecklistItem', () => {
	it('checks an unchecked item and unchecks a checked one', () => {
		const body = '- [ ] one\n- [x] two\n- [X] three';
		expect(toggleChecklistItem(body, 0)).toBe('- [x] one\n- [x] two\n- [X] three');
		expect(toggleChecklistItem(body, 1)).toBe('- [ ] one\n- [ ] two\n- [X] three');
	});

	it('ignores blank option lines and preserves indentation and CRLF', () => {
		const body = 'para\n  * [ ] indented\r\n* [X] done';
		expect(toggleChecklistItem(body, 0)).toBe('para\r\n  * [x] indented\r\n* [X] done');
	});

	it('returns the body unchanged for out-of-range indexes', () => {
		const body = '- [ ] only';
		expect(toggleChecklistItem(body, 5)).toBe(body);
		expect(toggleChecklistItem(body, -1)).toBe(body);
	});
});

describe('exportNotes', () => {
	it('renders frontmatter for every note', () => {
		const out = exportNotes([
			note({ title: 'Alpha', folder: 'work', tags: ['x', 'y'], pinned: true, body: 'Body' }),
		]);
		expect(out).toContain('title: Alpha');
		expect(out).toContain('folder: work');
		expect(out).toContain('tags: [x, y]');
		expect(out).toContain('pinned: true');
		expect(out).toContain('Body');
	});
});