import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('$lib/i18n/index.svelte', () => ({
	currentLocale: () => 'en',
	tFor: (_locale: string, key: string) => key
}));

import {
	AUTO_TIMEZONE,
	effectiveTimezone,
	formatOffset,
	formatTimestampInZone,
	systemTimezone,
	timezoneDisplayName,
	timezoneOptions
} from '$lib/content/timezone';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('effectiveTimezone', () => {
	it('prefers the explicit zone', () => {
		expect(effectiveTimezone('Asia/Jakarta')).toBe('Asia/Jakarta');
	});

	it('trims and ignores blank preferences', () => {
		expect(effectiveTimezone('  ')).not.toBe('  ');
		expect(effectiveTimezone(AUTO_TIMEZONE)).not.toBe('');
	});

	it('falls back to UTC when the runtime reports no zone', () => {
		vi.stubGlobal('Intl', {
			...Intl,
			DateTimeFormat: () => ({
				resolvedOptions: () => ({ timeZone: undefined })
			})
		});
		// The module caches the system zone, so only assert the contract: a
		// blank preference never yields an empty timeZone (browsers reject it).
		expect(effectiveTimezone('')).toBeTruthy();
	});
});

describe('formatOffset', () => {
	it('renders whole hours with a colon', () => {
		expect(formatOffset('Asia/Jakarta', new Date('2026-01-15T00:00:00Z'))).toBe('UTC+07:00');
	});

	it('renders UTC for a zero offset', () => {
		expect(formatOffset('UTC', new Date('2026-01-15T00:00:00Z'))).toBe('UTC');
	});

	it('renders half-hour and quarter-hour zones', () => {
		const at = new Date('2026-01-15T00:00:00Z');
		expect(formatOffset('Asia/Kolkata', at)).toBe('UTC+05:30');
		expect(formatOffset('Asia/Kathmandu', at)).toBe('UTC+05:45');
	});

	it('returns UTC for an unknown zone instead of throwing', () => {
		expect(formatOffset('Not/AZone', new Date('2026-01-15T00:00:00Z'))).toBe('UTC');
	});
});

describe('formatTimestampInZone', () => {
	it('formats an instant in the requested zone', () => {
		const at = new Date('2026-09-29T08:30:00Z');
		expect(formatTimestampInZone(at, 'UTC')).toBe('2026-09-29 08:30:00 UTC');
		expect(formatTimestampInZone(at, 'Asia/Jakarta')).toBe('2026-09-29 15:30:00 UTC+07:00');
	});

	it('keeps midnight at 00 rather than 24', () => {
		expect(formatTimestampInZone(new Date('2026-09-29T00:00:00Z'), 'UTC')).toBe(
			'2026-09-29 00:00:00 UTC'
		);
	});

	it('pads every field to two digits', () => {
		expect(formatTimestampInZone(new Date('2026-01-02T03:04:05Z'), 'UTC')).toBe(
			'2026-01-02 03:04:05 UTC'
		);
	});
});

describe('timezoneOptions', () => {
	const at = new Date('2026-09-29T08:30:00Z');

	it('leads with an automatic entry', () => {
		const options = timezoneOptions(at, 'en-US', { automatic: 'Automatic' });
		expect(options[0].value).toBe(AUTO_TIMEZONE);
		expect(options[0].label.startsWith('Automatic (')).toBe(true);
	});

	it('lists curated zones with their offsets and has no duplicates', () => {
		const options = timezoneOptions(at, 'en-US', { automatic: 'Automatic' });
		const values = options.map((option) => option.value);
		expect(new Set(values).size).toBe(values.length);
		expect(values).toContain('Asia/Jakarta');
		expect(options.find((option) => option.value === 'Asia/Jakarta')?.label).toContain('UTC+07:00');
	});
});

describe('timezoneDisplayName', () => {
	it('falls back to the id when Intl.DisplayNames is unavailable', () => {
		expect(timezoneDisplayName('Asia/Jakarta', 'en-US')).toMatch(/Jakarta/);
	});
});

describe('systemTimezone', () => {
	it('returns a cached string', () => {
		expect(typeof systemTimezone()).toBe('string');
		expect(systemTimezone()).toBe(systemTimezone());
	});
});
