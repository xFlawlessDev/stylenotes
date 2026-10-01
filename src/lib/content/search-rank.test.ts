import { describe, expect, it } from 'vitest';
import {
	NOTE_BODY_WEIGHT,
	NOTE_EXCERPT_WEIGHT,
	NOTE_TAGS_WEIGHT,
	NOTE_TITLE_WEIGHT,
	TASK_NOTES_WEIGHT,
	TASK_TITLE_WEIGHT,
	countOccurrences,
	rankNotes,
	rankTasks,
	scoreNote,
	scoreTask
} from '$lib/content/search-rank';

describe('countOccurrences', () => {
	it('counts non-overlapping hits only', () => {
		expect(countOccurrences('aaa', 'aa')).toBe(1);
		expect(countOccurrences('aaaa', 'aa')).toBe(2);
		expect(countOccurrences('anything', '')).toBe(0);
	});

	it('is case-sensitive, so callers lower-case both sides first', () => {
		expect(countOccurrences('Roadmap', 'roadmap')).toBe(0);
		expect(countOccurrences('roadmap', 'roadmap')).toBe(1);
	});
});

describe('scoreNote', () => {
	const base = { title: '', tags: [] as string[], excerpt: '', body: '' };

	it('weights title > tags > excerpt > body', () => {
		expect(scoreNote({ ...base, title: 'x' }, 'x')).toBe(NOTE_TITLE_WEIGHT);
		expect(scoreNote({ ...base, tags: ['x'] }, 'x')).toBe(NOTE_TAGS_WEIGHT);
		expect(scoreNote({ ...base, excerpt: 'x' }, 'x')).toBe(NOTE_EXCERPT_WEIGHT);
		expect(scoreNote({ ...base, body: 'x' }, 'x')).toBe(NOTE_BODY_WEIGHT);
	});

	it('treats a withheld body as no body, not as empty text', () => {
		const withBody = scoreNote({ ...base, body: 'x' }, 'x');
		const withheld = scoreNote({ title: '', tags: [], excerpt: '' }, 'x');
		expect(withheld).toBe(0);
		expect(withheld).toBeLessThan(withBody);
	});
});

describe('scoreTask', () => {
	it('weights title over the task notes field', () => {
		expect(scoreTask({ title: 'ship', notes: '' }, 'ship')).toBe(TASK_TITLE_WEIGHT);
		expect(scoreTask({ title: '', notes: 'ship' }, 'ship')).toBe(TASK_NOTES_WEIGHT);
	});
});

describe('rankNotes / rankTasks', () => {
	it('drops non-matches and sorts by score', () => {
		const notes = [
			{ title: 'other', tags: [], excerpt: '', body: 'roadmap' },
			{ title: 'roadmap', tags: [], excerpt: '', body: '' },
			{ title: 'nothing', tags: [], excerpt: '', body: '' }
		];
		const ranked = rankNotes(notes, 'roadmap');
		expect(ranked).toHaveLength(2);
		expect(ranked[0].item.title).toBe('roadmap');
		expect(ranked[1].item.title).toBe('other');
	});

	it('keeps input order on ties', () => {
		const notes = [
			{ title: 'a', tags: [], excerpt: '', body: '' },
			{ title: 'b', tags: [], excerpt: '', body: '' }
		];
		expect(rankNotes(notes, 'a').map((entry) => entry.item.title)).toEqual(['a']);
		const tasks = [
			{ title: 'one', notes: '' },
			{ title: 'two', notes: '' }
		];
		// Two equal scores are both kept, in their original order.
		const ranked = rankTasks([...tasks, { title: 'one', notes: '' }], 'one');
		expect(ranked.map((entry) => entry.item.title)).toEqual(['one', 'one']);
	});
});
