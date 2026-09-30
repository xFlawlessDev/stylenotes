import { describe, expect, it } from 'vitest';
import { clusterCohesion, clusterVectors, labelFor, type ClusterItem } from '$lib/content/clusters';

function item(id: string, vec: number[], text = id): ClusterItem {
	return { entityKind: 'note', entityId: id, vec, text };
}

describe('clusterVectors', () => {
	it('returns no clusters for no items', () => {
		expect(clusterVectors([], 3)).toEqual([]);
	});

	it('puts one item in one cluster', () => {
		const clusters = clusterVectors([item('a', [1, 0])], 3);
		expect(clusters).toHaveLength(1);
		expect(clusters[0].members.map((member) => member.entityId)).toEqual(['a']);
	});

	it('separates two obviously different groups', () => {
		const items = [
			item('a1', [1, 0, 0]),
			item('a2', [0.99, 0.01, 0]),
			item('b1', [0, 0, 1]),
			item('b2', [0, 0.01, 0.99])
		];
		const clusters = clusterVectors(items, 2);
		expect(clusters).toHaveLength(2);
		const groups = clusters.map((cluster) =>
			cluster.members.map((member) => member.entityId).sort()
		);
		expect(groups).toEqual([
			['a1', 'a2'],
			['b1', 'b2']
		]);
	});

	it('is deterministic for the same input and seed', () => {
		const items = Array.from({ length: 12 }, (_, index) =>
			item(`n${index}`, [Math.cos(index), Math.sin(index), index / 12])
		);
		const first = clusterVectors(items, 4).map((cluster) =>
			cluster.members.map((member) => member.entityId)
		);
		const second = clusterVectors(items, 4).map((cluster) =>
			cluster.members.map((member) => member.entityId)
		);
		expect(first).toEqual(second);
	});

	it('never asks for more clusters than items', () => {
		const clusters = clusterVectors([item('a', [1, 0]), item('b', [0, 1])], 10);
		expect(clusters).toHaveLength(2);
	});

	it('assigns every item exactly once', () => {
		const items = Array.from({ length: 9 }, (_, index) => item(`n${index}`, [index % 3, index / 9]));
		const clusters = clusterVectors(items, 3);
		const seen = clusters.flatMap((cluster) => cluster.members.map((member) => member.entityId));
		expect(seen.sort()).toEqual(items.map((entry) => entry.entityId).sort());
	});

	it('keeps a degenerate k of 1 as a single cluster', () => {
		const clusters = clusterVectors([item('a', [1, 0]), item('b', [0, 1])], 1);
		expect(clusters).toHaveLength(1);
		expect(clusters[0].members).toHaveLength(2);
	});
});

describe('labelFor', () => {
	it('picks the most shared distinctive words', () => {
		const members = [
			item('a', [1], 'vector retrieval notes about embeddings'),
			item('b', [1], 'vector retrieval across documents'),
			item('c', [1], 'banana bread recipe')
		];
		const label = labelFor(members);
		expect(label.toLowerCase()).toContain('vector');
		expect(label.toLowerCase()).toContain('retrieval');
	});

	it('falls back to the first title when nothing stands out', () => {
		const members = [item('a', [1], 'Untitled note')];
		expect(labelFor(members)).toBe('Untitled note');
	});

	it('never returns an empty label', () => {
		expect(labelFor([item('a', [1], '')])).not.toBe('');
	});
});

describe('clusterCohesion', () => {
	it('is 1 for a single member', () => {
		expect(clusterCohesion([item('a', [1, 0])])).toBe(1);
	});

	it('is 1 for identical members', () => {
		expect(clusterCohesion([item('a', [1, 0]), item('b', [1, 0])])).toBeCloseTo(1, 6);
	});

	it('drops for divergent members', () => {
		const value = clusterCohesion([item('a', [1, 0]), item('b', [0, 1])]);
		expect(value).toBeLessThan(0.5);
	});
});
