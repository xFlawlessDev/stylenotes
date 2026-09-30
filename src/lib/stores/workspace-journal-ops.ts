/**
 * Journal operations for the workspace controller (docs/design/journal.md).
 *
 * Split out for the same reason `workspace-folder-ops.ts` is: the controller
 * coordinates, and each concern gets a testable seam. This module owns the two
 * things the UI needs — opening a day, and the day-navigation view model — and
 * knows nothing about the rest of the workspace.
 *
 * It takes what it needs as callbacks rather than importing the controller, so
 * there is no cycle and the notes it operates on stay the live `$state` array.
 */

import { journalNeighbours } from '$lib/stores/journal.svelte';
import { journalTitle } from '$lib/content/journal';
import { settings, localToday } from '$lib/stores/settings.svelte';
import { openJournalDay } from '$lib/stores/journal.svelte';
import { t } from '$lib/i18n/index.svelte';
import type { Note } from '$lib/content/content';

export type JournalOps = {
	/** Opens (or starts) `day`, selects it, and reports what happened. */
	openDay: (day: string) => Promise<void>;
	/** Opens today's entry. */
	openToday: () => Promise<void>;
	/** Day-navigation view model for the open note, or `undefined`. */
	navigationFor: (note: Note | undefined) => JournalNavigation | undefined;
	/** Feed affordance, or `undefined` when the feature is off. */
	feedAffordance: () => JournalFeedAffordance | undefined;
};

export type JournalNavigation = {
	previous: string | null;
	next: string | null;
	onstep: (day: string) => void;
};

export type JournalFeedAffordance = {
	day: string;
	label: string;
	exists: boolean;
	onopen: () => void;
};

export function createJournalOps(deps: {
	/** The live note list. A getter so it is always the current array. */
	items: () => Note[];
	/** Merges a newly created note into the list. */
	addItem: (note: Note) => void;
	/** Selects a note and clears any filter that would hide it. */
	reveal: (note: Note) => void;
	notify: (message: string) => void;
}): JournalOps {
	async function openDay(day: string): Promise<void> {
		const result = await openJournalDay(day);
		if (!result.ok) {
			deps.notify(
				result.error === 'disabled' ? t('notes.journal.disabled') : t('notes.journal.failed')
			);
			return;
		}
		const note = result.note;
		deps.addItem(note);
		// A day that exists but is hidden by the active folder or tag filter would
		// look like the click did nothing, so clear both.
		deps.reveal(note);
		const label = journalTitle(note.journalDay ?? day, settings.journalFormat);
		deps.notify(
			result.created
				? t('notes.journal.created', { date: label })
				: t('notes.journal.opened', { date: label })
		);
	}

	return {
		openDay,
		openToday: () => openDay(localToday()),
		navigationFor: (note) => {
			if (!note?.journalDay) return undefined;
			const { previous, next } = journalNeighbours(deps.items(), note.journalDay);
			return { previous, next, onstep: (day: string) => void openDay(day) };
		},
		feedAffordance: () => {
			if (!settings.journalEnabled) return undefined;
			const day = localToday();
			const exists = deps
				.items()
				.some((note) => note.journalDay === day);
			return {
				day,
				label: journalTitle(day, settings.journalFormat),
				exists,
				onopen: () => void openDay(day)
			};
		},
	};
}
