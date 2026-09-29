import { describe, expect, it } from 'vitest';
import { noteUpdatedLabel } from '$lib/i18n/format';
import { createNote } from '$lib/content/content';
import type { Note } from '$lib/content/content';

const base: Note = createNote({ id: 'n1', title: 'Alpha' });

describe('noteUpdatedLabel', () => {
	it('derives the label from the machine-readable updatedAt', () => {
		const minutesAgo = Date.now() - 12 * 60_000;
		const note = { ...base, updated: 'Just now', updatedAt: minutesAgo };

		expect(noteUpdatedLabel(note)).toBe('12m ago');
	});

	it('shows "just now" for a very recent write', () => {
		const note = { ...base, updated: 'Just now', updatedAt: Date.now() };
		expect(noteUpdatedLabel(note)).toBe('just now');
	});

	it('falls back to the stored string when updatedAt is missing', () => {
		const legacy: Note = { ...base, updated: 'Recently' };
		delete legacy.updatedAt;

		expect(noteUpdatedLabel(legacy)).toBe('Recently');
	});
});
