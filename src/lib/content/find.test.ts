import { describe, it, expect } from 'vitest';
import { findMatches, findSegments, stepMatch } from '$lib/content/find';

describe('findMatches', () => {
	it('returns every non-overlapping occurrence in document order', () => {
		expect(findMatches('a cat sat on a cat', 'cat')).toEqual([
			{ start: 2, end: 5 },
			{ start: 15, end: 18 }
		]);
	});

	it('is case-insensitive by default and case-sensitive on request', () => {
		expect(findMatches('Cat cat CAT', 'cat')).toHaveLength(3);
		expect(findMatches('Cat cat CAT', 'cat', { caseSensitive: true })).toEqual([
			{ start: 4, end: 7 }
		]);
	});

	it('matches an empty query to nothing, not every offset', () => {
		expect(findMatches('text', '')).toEqual([]);
	});

	it('returns no matches when the query is absent', () => {
		expect(findMatches('text', 'zzz')).toEqual([]);
	});

	it('does not count overlapping occurrences', () => {
		// "aaa" contains one non-overlapping "aa" at 0 (from advances to 2).
		expect(findMatches('aaa', 'aa')).toEqual([{ start: 0, end: 2 }]);
	});

	it('finds a match at the very end of the text', () => {
		expect(findMatches('hello world', 'world')).toEqual([{ start: 6, end: 11 }]);
	});
});

describe('stepMatch', () => {
	it('starts at the first match forward and the last one backward', () => {
		expect(stepMatch(-1, 5, 1)).toBe(0);
		expect(stepMatch(-1, 5, -1)).toBe(4);
	});

	it('wraps around both ends', () => {
		expect(stepMatch(4, 5, 1)).toBe(0);
		expect(stepMatch(0, 5, -1)).toBe(4);
	});

	it('returns -1 when there is nothing to step to', () => {
		expect(stepMatch(-1, 0, 1)).toBe(-1);
		expect(stepMatch(3, 0, -1)).toBe(-1);
	});
});

describe('findSegments', () => {
	it('splits the text at match boundaries and flags the active one', () => {
		const segments = findSegments('a cat sat', findMatches('a cat sat', 'cat'), 0);
		expect(segments).toEqual([
			{ text: 'a ', match: false, active: false },
			{ text: 'cat', match: true, active: true },
			{ text: ' sat', match: false, active: false }
		]);
	});

	it('marks only the active match, not every match', () => {
		const text = 'x x';
		const segments = findSegments(text, findMatches(text, 'x'), 1);
		expect(segments.filter((segment) => segment.active)).toEqual([
			{ text: 'x', match: true, active: true }
		]);
	});

	it('returns the whole text untouched when there are no matches', () => {
		expect(findSegments('plain', [], 0)).toEqual([
			{ text: 'plain', match: false, active: false }
		]);
	});

	it('reconstructs the original text from its segments', () => {
		const text = 'one two one two';
		const segments = findSegments(text, findMatches(text, 'two'), 0);
		expect(segments.map((segment) => segment.text).join('')).toBe(text);
	});
});
