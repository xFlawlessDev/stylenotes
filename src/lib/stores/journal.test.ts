import { describe, expect, it, vi, beforeEach } from 'vitest';

const execute = vi.fn();
const select = vi.fn();
const invoke = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ ok: true })));

vi.mock('@tauri-apps/plugin-sql', () => ({
	default: { load: vi.fn(async () => ({ execute, select })) },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(async () => undefined) }));
vi.mock('$lib/windows', () => ({ isTauri: true }));

const settings = vi.hoisted(() => ({
	journalEnabled: true,
	journalFolder: 'journal',
	journalFormat: 'YYYY-MM-DD',
	journalTemplate: '',
	timezone: 'Asia/Jakarta'
}));

vi.mock('$lib/stores/settings.svelte', () => ({
	settings,
	// `localToday` is the seam the whole store depends on: pinning it to a fixed
	// day makes "today" deterministic without mocking the clock.
	localToday: () => '2026-09-30'
}));

const workspaceStore = vi.hoisted(() => ({ items: [], activeId: 'ws-1', loaded: true }));
vi.mock('$lib/stores/workspaces.svelte', () => ({
	workspaceStore,
	WORKSPACES_CHANGED: 'workspaces:changed',
	reloadWorkspaces: vi.fn()
}));

vi.mock('$lib/stores/notes', () => ({
	listAllNotes: vi.fn(async () => []),
	persistNote: vi.fn(async () => true),
	NOTES_CHANGED: 'notes:changed'
}));

import { createNote, type Note } from '$lib/content/content';
import { listAllNotes, persistNote } from '$lib/stores/notes';
import {
	journalDaysWithEntries,
	journalDraftFor,
	journalEntryForDay,
	journalNeighbours,
	openJournalDay,
	openTodayJournal,
	todayEntry
} from '$lib/stores/journal.svelte';

const mockedList = vi.mocked(listAllNotes);
const mockedPersist = vi.mocked(persistNote);

function entry(day: string, workspaceId = 'ws-1', id = `j-${day}`): Note {
	return createNote({ id, title: day, workspaceId, journalDay: day });
}

beforeEach(() => {
	execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
	select.mockReset().mockResolvedValue([]);
	invoke.mockClear();
	mockedList.mockReset().mockResolvedValue([]);
	mockedPersist.mockReset().mockResolvedValue(true);
	settings.journalEnabled = true;
	settings.journalFolder = 'journal';
	settings.journalFormat = 'YYYY-MM-DD';
	settings.journalTemplate = '';
	workspaceStore.activeId = 'ws-1';
});

describe('journalDraftFor', () => {
	it('derives title, folder and journal day from settings', () => {
		const note = journalDraftFor('2026-09-30');
		expect(note.journalDay).toBe('2026-09-30');
		expect(note.title).toBe('2026-09-30');
		expect(note.folder).toBe('journal');
		expect(note.workspaceId).toBe('ws-1');
	});

	it('honours the configured format and template', () => {
		settings.journalFormat = 'ddd, DD MMM YYYY';
		settings.journalTemplate = '# {date}\n\n## Fokus\n';
		const note = journalDraftFor('2026-09-30');
		expect(note.title).toBe('Wed, 30 Sep 2026');
		expect(note.body).toBe('# 2026-09-30\n\n## Fokus\n');
	});

	it('starts empty when no template is set', () => {
		expect(journalDraftFor('2026-09-30').body).toBe('');
	});

	it('falls back to the journal folder when the setting is blank', () => {
		settings.journalFolder = '   ';
		expect(journalDraftFor('2026-09-30').folder).toBe('journal');
	});
});

describe('find helpers', () => {
	it('finds an entry by day in the active workspace', () => {
		const notes = [entry('2026-09-30'), entry('2026-09-29')];
		expect(journalEntryForDay(notes, '2026-09-30')?.id).toBe('j-2026-09-30');
		expect(journalEntryForDay(notes, '2026-01-01')).toBeNull();
	});

	it('does not match an entry from another workspace', () => {
		const notes = [entry('2026-09-30', 'ws-2')];
		expect(journalEntryForDay(notes, '2026-09-30')).toBeNull();
	});

	it('leaves ordinary notes alone', () => {
		const notes = [createNote({ id: 'n1', workspaceId: 'ws-1' })];
		expect(journalEntryForDay(notes, '2026-09-30')).toBeNull();
	});

	it('resolves today from the store, not a cached value', () => {
		expect(todayEntry([entry('2026-09-30')])?.id).toBe('j-2026-09-30');
	});
});

describe('openJournalDay', () => {
	it('returns the existing entry without writing', async () => {
		mockedList.mockResolvedValue([entry('2026-09-30')]);
		const result = await openJournalDay('2026-09-30');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.created).toBe(false);
			expect(result.note.id).toBe('j-2026-09-30');
		}
		expect(mockedPersist).not.toHaveBeenCalled();
	});

	it('creates the entry when the day is empty', async () => {
		const result = await openJournalDay('2026-09-30');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.created).toBe(true);
		expect(mockedPersist).toHaveBeenCalledOnce();
		const saved = mockedPersist.mock.calls[0][0];
		expect(saved.journalDay).toBe('2026-09-30');
	});

	it('refuses when journal is switched off', async () => {
		settings.journalEnabled = false;
		const result = await openJournalDay('2026-09-30');
		expect(result).toEqual({ ok: false, error: 'disabled' });
		expect(mockedPersist).not.toHaveBeenCalled();
	});

	it('refuses a future day instead of creating an empty one', async () => {
		const result = await openJournalDay('2026-10-01');
		expect(result).toEqual({ ok: false, error: 'future' });
		expect(mockedPersist).not.toHaveBeenCalled();
	});

	it('reads the other window&#39;s entry when the insert loses the race', async () => {
		// The unique index refuses our write because another window created the
		// same day; the re-read finds theirs, so the user sees an entry, not an error.
		mockedPersist.mockResolvedValue(false);
		mockedList.mockResolvedValueOnce([]).mockResolvedValueOnce([entry('2026-09-30', 'ws-1', 'theirs')]);
		const result = await openJournalDay('2026-09-30');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.note.id).toBe('theirs');
			expect(result.created).toBe(false);
		}
	});

	it('reports failure only when the entry genuinely is not there', async () => {
		mockedPersist.mockResolvedValue(false);
		mockedList.mockResolvedValue([]);
		const result = await openJournalDay('2026-09-30');
		expect(result).toEqual({ ok: false, error: 'failed' });
	});

	it('opens today through openTodayJournal', async () => {
		const result = await openTodayJournal();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.note.journalDay).toBe('2026-09-30');
	});
});

describe('journalDaysWithEntries', () => {
	it('lists the active workspace&#39;s days, newest first', () => {
		const notes = [entry('2026-09-29'), entry('2026-09-30'), entry('2026-09-28', 'ws-2')];
		expect(journalDaysWithEntries(notes)).toEqual(['2026-09-30', '2026-09-29']);
	});

	it('ignores ordinary notes', () => {
		expect(journalDaysWithEntries([createNote({ id: 'n', workspaceId: 'ws-1' })])).toEqual([]);
	});
});

describe('journalNeighbours', () => {
	const notes = [entry('2026-09-25'), entry('2026-09-29'), entry('2026-09-30')];

	it('finds the surrounding days that have entries', () => {
		expect(journalNeighbours(notes, '2026-09-29')).toEqual({
			previous: '2026-09-25',
			next: '2026-09-30'
		});
	});

	it('does not step past today', () => {
		// Today is 2026-09-30, so the newest entry has no `next`.
		expect(journalNeighbours(notes, '2026-09-30')).toEqual({
			previous: '2026-09-29',
			next: null
		});
	});

	it('reports no neighbours for a day with none', () => {
		expect(journalNeighbours([], '2026-09-30')).toEqual({ previous: null, next: null });
	});
});
