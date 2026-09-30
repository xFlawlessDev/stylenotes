import { describe, expect, it } from 'vitest';
import {
	candidatePairs,
	parseVerdict,
	verificationPrompt,
	verifiedContradictions,
	type ContradictionItem,
} from '$lib/content/contradictions';

function item(id: string, vec: number[], text = `text ${id}`, title = `Title ${id}`): ContradictionItem {
	return { entityKind: 'note', entityId: id, title, text, vec };
}

describe('candidatePairs', () => {
	it('keeps only pairs above the floor', () => {
		const pairs = candidatePairs([item('a', [1, 0]), item('b', [1, 0]), item('c', [0, 1])], {
			minScore: 0.5,
			limit: 10,
		});
		expect(pairs).toHaveLength(1);
		expect(pairs[0].source.entityId).toBe('a');
		expect(pairs[0].target.entityId).toBe('b');
	});

	it('lists each unordered pair once', () => {
		const pairs = candidatePairs([item('a', [1, 0]), item('b', [1, 0])], {
			minScore: 0,
			limit: 10,
		});
		expect(pairs).toHaveLength(1);
	});

	it('orders by similarity descending and honours the limit', () => {
		const items = [
			item('a', [1, 0]),
			item('b', [1, 0]),
			item('c', [0.9, 0.1]),
			item('d', [0.8, 0.2])
		];
		const pairs = candidatePairs(items, { minScore: 0, limit: 2 });
		expect(pairs).toHaveLength(2);
		expect(pairs[0].score).toBeGreaterThanOrEqual(pairs[1].score);
	});

	it('returns nothing when no pair clears the floor', () => {
		expect(candidatePairs([item('a', [1, 0]), item('b', [0, 1])], { minScore: 0.5, limit: 5 })).toEqual([]);
	});
});

describe('verificationPrompt', () => {
	it('names both notes and fixes the answer vocabulary', () => {
		const pair = { source: item('a', [1], 'First body', 'First'), target: item('b', [1], 'Second body', 'Second'), score: 0.9 };
		const prompt = verificationPrompt(pair);
		expect(prompt).toContain('First body');
		expect(prompt).toContain('Second body');
		expect(prompt).toContain('contradicts, consistent, or unrelated');
	});

	it('truncates a very long body', () => {
		const long = 'x'.repeat(5000);
		const prompt = verificationPrompt({
			source: item('a', [1], long),
			target: item('b', [1], 'short'),
			score: 0.9,
		});
		expect(prompt.length).toBeLessThan(long.length);
		expect(prompt).toContain('…');
	});
});

describe('parseVerdict', () => {
	it('reads a contradiction with its reason', () => {
		const result = parseVerdict('contradicts\nThe budget is unlimited.');
		expect(result.verdict).toBe('contradicts');
		expect(result.reason).toContain('unlimited');
	});

	it('reads a consistent verdict', () => {
		expect(parseVerdict('consistent').verdict).toBe('consistent');
	});

	it('reads an unrelated verdict', () => {
		expect(parseVerdict('unrelated').verdict).toBe('unrelated');
	});

	it('treats a garbage answer as unrelated, never as a contradiction', () => {
		expect(parseVerdict('I cannot help with that').verdict).toBe('unrelated');
		expect(parseVerdict('').verdict).toBe('unrelated');
	});

	it('is case-insensitive on the first word', () => {
		expect(parseVerdict('CONTRADICTS').verdict).toBe('contradicts');
	});
});

describe('verifiedContradictions', () => {
	const pair = { source: item('a', [1, 0]), target: item('b', [1, 0]), score: 0.88 };

	it('keeps only explicit contradictions', () => {
		const out = verifiedContradictions([
			{ pair, raw: 'contradicts\nOne says up, the other down.' },
			{ pair, raw: 'consistent' },
			{ pair, raw: 'unrelated' }
		]);
		expect(out).toHaveLength(1);
		expect(out[0].reason).toContain('up');
	});

	it('falls back to a score-based reason when none was given', () => {
		const out = verifiedContradictions([{ pair, raw: 'contradicts' }]);
		expect(out[0].reason).toBe('Contradicts (0.88)');
	});
});
