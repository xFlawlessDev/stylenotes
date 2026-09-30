import { describe, expect, it } from 'vitest';
import {
	formatJournalDay,
	isJournalDay,
	isJournalFormat,
	isFutureDay,
	journalBody,
	journalFolder,
	journalTitle,
	recentJournalDays,
	stepJournalDay
} from '$lib/content/journal';

describe('isJournalDay', () => {
	it('accepts a real YYYY-MM-DD day', () => {
		expect(isJournalDay('2026-09-30')).toBe(true);
		expect(isJournalDay('2026-01-01')).toBe(true);
	});

	it('rejects a wrong shape', () => {
		expect(isJournalDay('30-09-2026')).toBe(false);
		expect(isJournalDay('2026-9-30')).toBe(false);
		expect(isJournalDay('')).toBe(false);
		expect(isJournalDay(undefined)).toBe(false);
		expect(isJournalDay(20260930)).toBe(false);
	});

	it('rejects a well-shaped but impossible date', () => {
		// The shape check alone would accept these; the round-trip catches them.
		expect(isJournalDay('2026-02-31')).toBe(false);
		expect(isJournalDay('2026-13-01')).toBe(false);
		expect(isJournalDay('2026-00-10')).toBe(false);
	});

	it('accepts a leap day only in a leap year', () => {
		expect(isJournalDay('2028-02-29')).toBe(true);
		expect(isJournalDay('2026-02-29')).toBe(false);
	});
});

describe('stepJournalDay', () => {
	it('steps forward and back', () => {
		expect(stepJournalDay('2026-09-30', 1)).toBe('2026-10-01');
		expect(stepJournalDay('2026-09-30', -1)).toBe('2026-09-29');
		expect(stepJournalDay('2026-09-30', 0)).toBe('2026-09-30');
	});

	it('crosses a month and a year boundary', () => {
		expect(stepJournalDay('2026-12-31', 1)).toBe('2027-01-01');
		expect(stepJournalDay('2027-01-01', -1)).toBe('2026-12-31');
		expect(stepJournalDay('2026-01-31', 1)).toBe('2026-02-01');
	});

	it('handles leap years', () => {
		expect(stepJournalDay('2028-02-28', 1)).toBe('2028-02-29');
		expect(stepJournalDay('2028-02-29', 1)).toBe('2028-03-01');
		expect(stepJournalDay('2026-02-28', 1)).toBe('2026-03-01');
	});

	it('does not lose or repeat a day across a DST boundary', () => {
		// Stepping in local time can land on 23:00 of the previous day; UTC cannot.
		// US DST starts 2026-03-08, EU DST starts 2026-03-29.
		let day = '2026-03-06';
		const seen: string[] = [];
		for (let index = 0; index < 6; index += 1) {
			seen.push(day);
			day = stepJournalDay(day, 1);
		}
		expect(seen).toEqual([
			'2026-03-06',
			'2026-03-07',
			'2026-03-08',
			'2026-03-09',
			'2026-03-10',
			'2026-03-11'
		]);
		// And the round trip is exact.
		expect(stepJournalDay(stepJournalDay('2026-03-08', 1), -1)).toBe('2026-03-08');
	});

	it('passes an invalid day through untouched', () => {
		expect(stepJournalDay('not-a-day', 1)).toBe('not-a-day');
	});
});

describe('formatJournalDay', () => {
	it('formats in each supported format', () => {
		expect(formatJournalDay('2026-09-30', 'YYYY-MM-DD')).toBe('2026-09-30');
		expect(formatJournalDay('2026-09-30', 'YYYY/MM/DD')).toBe('2026/09/30');
		expect(formatJournalDay('2026-09-30', 'DD MMM YYYY')).toBe('30 Sep 2026');
		expect(formatJournalDay('2026-09-30', 'ddd, DD MMM YYYY')).toBe('Wed, 30 Sep 2026');
	});

	it('defaults to the ISO shape', () => {
		expect(formatJournalDay('2026-09-30')).toBe('2026-09-30');
	});

	it('uses English month and weekday names regardless of locale', () => {
		// This text becomes a persisted note title, and persisted text is never
		// translated (the i18n rule), so it must not follow the UI language.
		for (const day of ['2026-01-05', '2026-12-25']) {
			expect(formatJournalDay(day, 'ddd, DD MMM YYYY')).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}$/);
		}
		expect(formatJournalDay('2026-12-25', 'DD MMM YYYY')).toBe('25 Dec 2026');
	});

	it('gets the weekday right', () => {
		// 2026-09-30 is a Wednesday; 2026-10-04 a Sunday.
		expect(formatJournalDay('2026-09-30', 'ddd, DD MMM YYYY')).toBe('Wed, 30 Sep 2026');
		expect(formatJournalDay('2026-10-04', 'ddd, DD MMM YYYY')).toBe('Sun, 04 Oct 2026');
	});

	it('passes an invalid day through rather than inventing a date', () => {
		expect(formatJournalDay('nope', 'DD MMM YYYY')).toBe('nope');
	});
});

describe('isJournalFormat', () => {
	it('accepts only the closed set', () => {
		expect(isJournalFormat('YYYY-MM-DD')).toBe(true);
		expect(isJournalFormat('ddd, DD MMM YYYY')).toBe(true);
		expect(isJournalFormat('MM/DD/YY')).toBe(false);
		expect(isJournalFormat(undefined)).toBe(false);
	});
});

describe('journalTitle', () => {
	it('formats when the setting is valid', () => {
		expect(journalTitle('2026-09-30', 'DD MMM YYYY')).toBe('30 Sep 2026');
	});

	it('falls back to the ISO day when the setting is corrupt', () => {
		// A bad setting must produce a usable note, not an "undefined" title.
		expect(journalTitle('2026-09-30', 'nonsense')).toBe('2026-09-30');
		expect(journalTitle('2026-09-30', undefined)).toBe('2026-09-30');
	});
});

describe('journalBody', () => {
	it('is empty by default, so the user format wins', () => {
		expect(journalBody('2026-09-30', '')).toBe('');
	});

	it('substitutes the date and the long title', () => {
		expect(journalBody('2026-09-30', '# {date}\n\n')).toBe('# 2026-09-30\n\n');
		expect(journalBody('2026-09-30', '## {title}')).toBe('## Wed, 30 Sep 2026');
	});

	it('substitutes every occurrence', () => {
		expect(journalBody('2026-09-30', '{date} .. {date}')).toBe('2026-09-30 .. 2026-09-30');
	});

	it('leaves unknown placeholders alone rather than blanking them', () => {
		expect(journalBody('2026-09-30', '{nope}')).toBe('{nope}');
	});
});

describe('journalFolder', () => {
	it('uses the setting when it has content', () => {
		expect(journalFolder('catatan-harian')).toBe('catatan-harian');
		expect(journalFolder('  spaced  ')).toBe('spaced');
	});

	it('falls back to `journal` for a blank or non-string setting', () => {
		expect(journalFolder('')).toBe('journal');
		expect(journalFolder('   ')).toBe('journal');
		expect(journalFolder(undefined)).toBe('journal');
		expect(journalFolder(42)).toBe('journal');
	});
});

describe('isFutureDay', () => {
	it('compares against today', () => {
		expect(isFutureDay('2026-10-01', '2026-09-30')).toBe(true);
		expect(isFutureDay('2026-09-30', '2026-09-30')).toBe(false);
		expect(isFutureDay('2026-09-29', '2026-09-30')).toBe(false);
	});
});

describe('recentJournalDays', () => {
	it('lists today first, going back', () => {
		expect(recentJournalDays('2026-10-02', 3)).toEqual(['2026-10-02', '2026-10-01', '2026-09-30']);
	});

	it('never lists a future day', () => {
		const days = recentJournalDays('2026-09-30', 5);
		expect(days[0]).toBe('2026-09-30');
		expect(days.every((day) => day <= '2026-09-30')).toBe(true);
	});

	it('is bounded and tolerant of bad input', () => {
		expect(recentJournalDays('2026-09-30', 0)).toEqual([]);
		expect(recentJournalDays('2026-09-30', -3)).toEqual([]);
		expect(recentJournalDays('bad', 5)).toEqual([]);
	});
});
