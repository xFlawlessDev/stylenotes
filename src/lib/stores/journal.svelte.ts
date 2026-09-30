/**
 * Journal store (docs/design/journal.md #J1, J4, J8).
 *
 * Find-or-create for a day's entry. Two things make this more than a lookup:
 *
 *  - **"Today" is resolved at call time**, never cached. A user who leaves the
 *    app open past midnight must get the new day's entry, not yesterday's.
 *  - **A unique index can refuse the insert.** Two windows (or the app and an
 *    MCP agent) racing to create the same day means one of them loses; the
 *    loser must read the winner's note, not report a failure. Creating a
 *    journal is idempotent from the user's point of view.
 *
 * The day is always the user's civil day from `localToday()` (#D19), so the
 * entry a user opens at 07:00 in Jakarta is the one dated today there.
 */

import { browser } from '$app/environment';
import { createNote, type Note } from '$lib/content/content';
import {
	isFutureDay,
	journalBody,
	journalFolder,
	journalTitle
} from '$lib/content/journal';
import { notesRepo } from '$lib/db';
import { settings, localToday } from '$lib/stores/settings.svelte';
import { workspaceStore } from '$lib/stores/workspaces.svelte';
import { listAllNotes, persistNote } from '$lib/stores/notes';

/** Outcome of opening a day. `created` drives the "new entry" affordance. */
export type JournalOpenResult =
	| { ok: true; note: Note; created: boolean }
	| { ok: false; error: 'disabled' | 'future' | 'failed' };

/** Whether journal is switched on. Off by default: it writes notes. */
export function journalEnabled(): boolean {
	return settings.journalEnabled === true;
}

/**
 * The note representing `day` in the active workspace, or null.
 *
 * Reads every note rather than querying by `journal_day` because the feed
 * already loads them; a second query would risk disagreeing with what is on
 * screen. Revisit if a vault ever grows large enough for that to matter.
 */
export function findJournalEntry(notes: Note[], day: string, workspaceId: string): Note | null {
	return (
		notes.find(
			(note) =>
				note.journalDay === day && (note.workspaceId ?? 'workspace-default') === workspaceId
		) ?? null
	);
}

export function journalEntryForDay(notes: Note[], day: string): Note | null {
	return findJournalEntry(notes, day, workspaceStore.activeId);
}

/** The note for today, or null. Always resolves today fresh. */
export function todayEntry(notes: Note[]): Note | null {
	return journalEntryForDay(notes, localToday());
}

function draftFor(day: string): Note {
	return createNote({
		title: journalTitle(day, settings.journalFormat),
		body: journalBody(day, settings.journalTemplate ?? ''),
		folder: journalFolder(settings.journalFolder),
		workspaceId: workspaceStore.activeId,
		journalDay: day
	});
}

/**
 * Opens `day`'s entry, creating it if it does not exist.
 *
 * `created` is true only when this call wrote the note, so the caller can say
 * "started a new entry" without guessing from an id it has not seen before.
 */
export async function openJournalDay(day: string): Promise<JournalOpenResult> {
	if (!journalEnabled()) return { ok: false, error: 'disabled' };
	if (isFutureDay(day, localToday())) return { ok: false, error: 'future' };
	if (!browser) return { ok: false, error: 'failed' };

	const workspaceId = workspaceStore.activeId;
	const notes = await listAllNotes();
	const existing = findJournalEntry(notes, day, workspaceId);
	if (existing) return { ok: true, note: existing, created: false };

	const note = draftFor(day);
	const saved = await persistNote(note);
	if (saved) return { ok: true, note, created: true };

	// The save failed. The most likely cause is the unique index: another
	// window created this day between our read and our write. Re-read before
	// reporting failure — from the user's side the entry exists either way.
	const after = await listAllNotes();
	const raced = findJournalEntry(after, day, workspaceId);
	if (raced) return { ok: true, note: raced, created: false };
	return { ok: false, error: 'failed' };
}

/** Opens today's entry. The common case, and the one an agent calls. */
export function openTodayJournal(): Promise<JournalOpenResult> {
	return openJournalDay(localToday());
}

/** Days in the active workspace that already have an entry, newest first. */
export function journalDaysWithEntries(notes: Note[]): string[] {
	const workspaceId = workspaceStore.activeId;
	return notes
		.filter((note) => note.journalDay && (note.workspaceId ?? 'workspace-default') === workspaceId)
		.map((note) => note.journalDay as string)
		.sort((a, b) => b.localeCompare(a));
}

/**
 * Notes the user can step to from `day`: the previous day with an entry, and
 * the next one. `next` is capped at today — there is nothing to read ahead.
 */
export function journalNeighbours(
	notes: Note[],
	day: string
): { previous: string | null; next: string | null } {
	const days = journalDaysWithEntries(notes);
	const today = localToday();
	const previous = days.find((entry) => entry < day) ?? null;
	const next = days.filter((entry) => entry > day).sort((a, b) => a.localeCompare(b))[0] ?? null;
	return { previous, next: next && next <= today ? next : null };
}

/** Exported for tests that need the draft shape without touching a database. */
export { draftFor as journalDraftFor };
