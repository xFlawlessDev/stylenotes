import { describe, expect, it } from 'vitest';
import {
	normalizeThreshold,
	orderPair,
	pairKey,
	rankBySimilarity,
	refKey,
	suggestionReason,
	suggestPairs,
	type VectorItem,
} from '$lib/content/semantic';

const note = (id: string, vec: number[]): VectorItem => ({ entityKind: 'note', entityId: id, vec });

describe('pair identity', () => {
	it('orders a pair canonically regardless of direction', () => {
		const a = { entityKind: 'note' as const, entityId: 'a' };
		const b = { entityKind: 'note' as const, entityId: 'b' };
		expect(orderPair(a, b)).toEqual([a, b]);
		expect(orderPair(b, a)).toEqual([a, b]);
	});

	it('gives both directions the same pair key', () => {
		const a = { entityKind: 'note' as const, entityId: 'a' };
		const b = { entityKind: 'task' as const, entityId: 'b' };
		expect(pairKey(a, b)).toBe(pairKey(b, a));
	});

	it('distinguishes kinds with the same id', () => {
		expect(refKey({ entityKind: 'note', entityId: 'x' })).toBe('note:x');
		expect(refKey({ entityKind: 'task', entityId: 'x' })).toBe('task:x');
	});
});

describe('rankBySimilarity', () => {
	it('orders hits by score descending', () => {
		const query = [1, 0];
		const hits = rankBySimilarity(query, [note('far', [0, 1]), note('near', [1, 0])]);
		expect(hits.map((hit) => hit.entityId)).toEqual(['near', 'far']);
	});

	it('excludes the query entity', () => {
		const hits = rankBySimilarity(
			[1, 0],
			[note('self', [1, 0]), note('other', [1, 0])],
			{ exclude: { entityKind: 'note', entityId: 'self' } }
		);
		expect(hits.map((hit) => hit.entityId)).toEqual(['other']);
	});

	it('applies the score floor', () => {
		const hits = rankBySimilarity([1, 0], [note('near', [1, 0]), note('far', [0, 1])], {
			minScore: 0.5,
		});
		expect(hits.map((hit) => hit.entityId)).toEqual(['near']);
	});

	it('breaks ties by id so the order is stable', () => {
		const hits = rankBySimilarity([1, 0], [note('b', [1, 0]), note('a', [1, 0])]);
		expect(hits.map((hit) => hit.entityId)).toEqual(['a', 'b']);
	});

	it('honours the limit', () => {
		const items = Array.from({ length: 10 }, (_, index) => note(`n${index}`, [1, 0]));
		expect(rankBySimilarity([1, 0], items, { limit: 3 })).toHaveLength(3);
	});
});

describe('suggestPairs (anti-spam, #D8)', () => {
	const source = note('self', [1, 0]);
	const threshold = 0.5;

	it('suggests a similar, unlinked pair', () => {
		const pairs = suggestPairs(source, [note('other', [1, 0])], {
			threshold,
			alreadyLinked: new Set(),
			decided: new Set(),
		});
		expect(pairs).toHaveLength(1);
		expect(pairs[0].score).toBeCloseTo(1, 5);
	});

	it('never suggests a pair that already has an edge', () => {
		const linked = new Set([pairKey(source, note('other', [1, 0]))]);
		const pairs = suggestPairs(source, [note('other', [1, 0])], {
			threshold,
			alreadyLinked: linked,
			decided: new Set(),
		});
		expect(pairs).toHaveLength(0);
	});

	it('never re-suggests a rejected pair', () => {
		const decided = new Set([pairKey(source, note('other', [1, 0]))]);
		const pairs = suggestPairs(source, [note('other', [1, 0])], {
			threshold,
			alreadyLinked: new Set(),
			decided,
		});
		expect(pairs).toHaveLength(0);
	});

	it('drops pairs below the threshold', () => {
		const pairs = suggestPairs(source, [note('orthogonal', [0, 1])], {
			threshold,
			alreadyLinked: new Set(),
			decided: new Set(),
		});
		expect(pairs).toHaveLength(0);
	});

	it('caps the number of suggestions per note', () => {
		const items = Array.from({ length: 10 }, (_, index) => note(`n${index}`, [1, 0.1 * index]));
		const pairs = suggestPairs(source, items, {
			threshold: 0.5,
			perNote: 3,
			alreadyLinked: new Set(),
			decided: new Set(),
		});
		expect(pairs).toHaveLength(3);
	});

	it('emits one entry per unordered pair', () => {
		// The same target arriving twice (e.g. from two passes) collapses.
		const target = note('other', [1, 0]);
		const pairs = suggestPairs(source, [target, target], {
			threshold,
			alreadyLinked: new Set(),
			decided: new Set(),
		});
		expect(pairs).toHaveLength(1);
	});
});

describe('suggestionReason', () => {
	it('is an English sentence with a fixed score', () => {
		expect(suggestionReason(0.834)).toBe('Semantically similar (0.83)');
	});
});

describe('normalizeThreshold', () => {
	it('falls back when unset or unparsable', () => {
		expect(normalizeThreshold(null, 0.7)).toBe(0.7);
		expect(normalizeThreshold('nope', 0.7)).toBe(0.7);
	});

	it('clamps into 0..1', () => {
		expect(normalizeThreshold('1.5', 0.7)).toBe(1);
		expect(normalizeThreshold('-0.2', 0.7)).toBe(0);
		expect(normalizeThreshold('0.6', 0.7)).toBe(0.6);
	});
});
