import { describe, expect, it } from 'vitest';
import type { GraphNode } from '$lib/content/workspace-graph';
import { buildGraphLayout, distinctFolders, ringCount, ORBIT_RINGS } from './graph-layout';

function node(id: string, folder: string): GraphNode {
	return { id, entityId: id, kind: 'note', title: id, folder, orphan: false, degree: 1 };
}

describe('graph-layout', () => {
	it('lists folders in first-seen order without duplicates', () => {
		const nodes = [node('a', 'Work'), node('b', 'Home'), node('c', 'Work')];
		expect(distinctFolders(nodes)).toEqual(['Work', 'Home']);
	});

	it('assigns every node a position, index-aligned with the input', () => {
		const nodes = [node('a', 'Work'), node('b', 'Home'), node('c', 'Work')];
		const layout = buildGraphLayout(nodes);
		expect(layout.positions).toHaveLength(3);
		for (const position of layout.positions) {
			expect(Number.isFinite(position.x)).toBe(true);
			expect(Number.isFinite(position.y)).toBe(true);
			expect(Number.isFinite(position.z)).toBe(true);
		}
	});

	it('gives each folder its own ring', () => {
		const layout = buildGraphLayout([node('a', 'Work'), node('b', 'Home')]);
		expect(layout.folderRing.get('Work')).toBe(0);
		expect(layout.folderRing.get('Home')).toBe(1);
	});

	// With <=8 nodes each folder keeps its own ring, so same-folder nodes share
	// a plane while different folders are separated by the ring transform.
	it('separates folders spatially', () => {
		const layout = buildGraphLayout([node('a', 'Work'), node('b', 'Home')]);
		expect(layout.positions[0].distanceTo(layout.positions[1])).toBeGreaterThan(5);
	});

	// Ported from the reference orbit: a folder fills its ring, so two same-folder
	// nodes sit opposite each other rather than in a short arc.
	it('spreads a folder around its whole ring', () => {
		const nodes = [node('a', 'Work'), node('b', 'Work')];
		const layout = buildGraphLayout(nodes);
		// A half-turn apart: far more than a partial arc would allow.
		expect(layout.positions[0].distanceTo(layout.positions[1])).toBeGreaterThan(30);
	});

	it('keeps a single-node folder off the exact centre of its ring', () => {
		const layout = buildGraphLayout([node('only', 'Home')]);
		expect(layout.positions[0].length()).toBeGreaterThan(1);
	});

	it('reuses rings past the ring count, keeping layout deterministic', () => {
		const folders = Array.from({ length: ORBIT_RINGS.length + 3 }, (_, index) => `F${index}`);
		const nodes = folders.map((folder, index) => node(`n${index}`, folder));

		const first = buildGraphLayout(nodes);
		const second = buildGraphLayout(nodes);

		expect(first.rings).toHaveLength(ORBIT_RINGS.length);
		expect(first.folderRing.get(`F${ORBIT_RINGS.length}`)).toBe(ORBIT_RINGS.length);
		expect(first.positions.map((p) => p.toArray())).toEqual(second.positions.map((p) => p.toArray()));
	});

	it('builds one closed guide polyline per ring', () => {
		const layout = buildGraphLayout([node('a', 'Work')]);
		expect(layout.guides).toHaveLength(1);
		expect(layout.guides[0]).toHaveLength(193);
		expect(layout.guides[0][0].distanceTo(layout.guides[0][192])).toBeLessThan(1e-6);
	});

	it('always reports at least one ring', () => {
		expect(ringCount(0)).toBe(1);
		expect(ringCount(3)).toBe(3);
		expect(ringCount(99)).toBe(ORBIT_RINGS.length);
	});
});
