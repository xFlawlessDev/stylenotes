import { describe, it, expect } from 'vitest';
import {
	AUTO_SNAPSHOT_INTERVAL_MS,
	selectVersionsToKeep,
	shouldSnapshot,
} from '$lib/content/version-retention';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('shouldSnapshot', () => {
	const base = { lastLength: 100, currentLength: 100, now: 1_000_000_000 };

	it('captures the first version', () => {
		expect(shouldSnapshot({ ...base, lastVersionAt: null })).toBe(true);
	});

	it('captures once the time gap passes', () => {
		expect(
			shouldSnapshot({ ...base, lastVersionAt: base.now - AUTO_SNAPSHOT_INTERVAL_MS })
		).toBe(true);
		expect(
			shouldSnapshot({ ...base, lastVersionAt: base.now - MIN })
		).toBe(false);
	});

	it('captures when the text changed substantially', () => {
		expect(
			shouldSnapshot({ ...base, lastVersionAt: base.now - MIN, currentLength: 300 })
		).toBe(true);
		expect(
			shouldSnapshot({ ...base, lastVersionAt: base.now - MIN, currentLength: 120 })
		).toBe(false);
	});

	it('captures for an explicit reason regardless of the gap', () => {
		expect(
			shouldSnapshot({ ...base, lastVersionAt: base.now - MIN, reason: 'close' })
		).toBe(true);
		expect(
			shouldSnapshot({ ...base, lastVersionAt: base.now - MIN, reason: 'manual' })
		).toBe(true);
	});

	it('treats an empty-to-empty change without dividing by zero', () => {
		expect(
			shouldSnapshot({ ...base, lastVersionAt: base.now - MIN, lastLength: 0, currentLength: 0 })
		).toBe(false);
	});
});

describe('selectVersionsToKeep', () => {
	const now = 10 * DAY;

	it('keeps every version from the last day', () => {
		const versions = [
			{ id: 'a', updatedAt: now - HOUR },
			{ id: 'b', updatedAt: now - 2 * HOUR },
			{ id: 'c', updatedAt: now - 23 * HOUR },
		];
		expect(selectVersionsToKeep(versions, now)).toEqual(new Set(['a', 'b', 'c']));
	});

	it('keeps one version per hour for the last week, newest in the hour', () => {
		const versions = [
			{ id: 'h1', updatedAt: now - 2 * DAY },
			{ id: 'h1-newer', updatedAt: now - 2 * DAY + 10 * MIN },
			{ id: 'h2', updatedAt: now - 3 * DAY },
		];
		const keep = selectVersionsToKeep(versions, now);
		expect(keep.has('h1-newer')).toBe(true);
		expect(keep.has('h1')).toBe(false);
		expect(keep.has('h2')).toBe(true);
	});

	it('keeps one version per day beyond a week, newest in the day', () => {
		const versions = [
			{ id: 'd1', updatedAt: now - 8 * DAY },
			{ id: 'd1-newer', updatedAt: now - 8 * DAY + 2 * HOUR },
			{ id: 'd2', updatedAt: now - 9 * DAY },
		];
		const keep = selectVersionsToKeep(versions, now);
		expect(keep.has('d1-newer')).toBe(true);
		expect(keep.has('d1')).toBe(false);
		expect(keep.has('d2')).toBe(true);
	});

	it('never keeps more than the cap, preferring the newest', () => {
		const versions = Array.from({ length: 80 }, (_, index) => ({
			id: `v${index}`,
			updatedAt: now - index * MIN,
		}));
		const keep = selectVersionsToKeep(versions, now, 10);
		expect(keep.size).toBe(10);
		expect(keep.has('v0')).toBe(true);
		expect(keep.has('v9')).toBe(true);
		expect(keep.has('v10')).toBe(false);
	});
});
