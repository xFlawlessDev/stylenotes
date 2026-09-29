import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '$lib/content/workspace-graph';
import {
	activeNodeId,
	buildAdjacency,
	DIMMED_EDGE_ALPHA,
	DIMMED_STRENGTH,
	FOCUSED_EDGE_ALPHA,
	IDLE_EDGE_ALPHA,
	IDLE_STRENGTH,
	NEIGHBOUR_STRENGTH,
	nodeStrength,
	edgeAlpha,
	type GraphFocus,
} from './graph-appearance';

function node(id: string): GraphNode {
	return { id, entityId: id, kind: 'note', title: id, folder: 'Work', orphan: false, degree: 1 };
}

const nodes = [node('a'), node('b'), node('c')];
const edges: GraphEdge[] = [
	{ id: 'wiki:a->b', source: 'a', target: 'b', kind: 'wiki' },
	{ id: 'dependency:b->c', source: 'b', target: 'c', kind: 'dependency' },
];
const adjacency = buildAdjacency(nodes, edges);

function focusState(overrides: Partial<GraphFocus> = {}): GraphFocus {
	return { hoveredId: null, selectedId: null, highlight: null, ...overrides };
}

describe('graph-appearance', () => {
	it('prefers hover over the pinned selection', () => {
		expect(activeNodeId({ hoveredId: 'a', selectedId: 'c' })).toBe('a');
		expect(activeNodeId({ hoveredId: null, selectedId: 'c' })).toBe('c');
		expect(activeNodeId({ hoveredId: null, selectedId: null })).toBeNull();
	});

	it('builds symmetric adjacency', () => {
		expect(adjacency.get('a')).toEqual(new Set(['b']));
		expect(adjacency.get('b')).toEqual(new Set(['a', 'c']));
		expect(adjacency.get('c')).toEqual(new Set(['b']));
	});

	it('keeps every node lit when nothing is focused', () => {
		const focus = focusState();
		const active = activeNodeId(focus);
		expect(nodeStrength('a', active, focus, adjacency)).toBe(IDLE_STRENGTH);
		expect(nodeStrength('c', active, focus, adjacency)).toBe(IDLE_STRENGTH);
	});

	it('dims everything outside the focused neighbourhood', () => {
		const focus = focusState({ hoveredId: 'a' });
		const active = activeNodeId(focus);
		expect(nodeStrength('a', active, focus, adjacency)).toBe(IDLE_STRENGTH);
		expect(nodeStrength('b', active, focus, adjacency)).toBe(NEIGHBOUR_STRENGTH);
		expect(nodeStrength('c', active, focus, adjacency)).toBe(DIMMED_STRENGTH);
	});

	it('keeps search matches readable while a different node is pinned', () => {
		const focus = focusState({ selectedId: 'a', highlight: new Set(['c']) });
		const active = activeNodeId(focus);
		expect(nodeStrength('c', active, focus, adjacency)).toBe(NEIGHBOUR_STRENGTH);
	});

	it('hides disabled edge kinds regardless of focus', () => {
		const kinds = { wiki: false, dependency: true, link: true };
		expect(edgeAlpha(edges[0], 'a', kinds)).toBe(0);
		expect(edgeAlpha(edges[1], null, kinds)).toBe(IDLE_EDGE_ALPHA);
	});

	it('spotlights the focused node links only', () => {
		const kinds = { wiki: true, dependency: true, link: true };
		expect(edgeAlpha(edges[0], 'a', kinds)).toBe(FOCUSED_EDGE_ALPHA);
		expect(edgeAlpha(edges[1], 'a', kinds)).toBe(DIMMED_EDGE_ALPHA);
	});

	it('keeps an unrelated link far dimmer than an idle one', () => {
		// The contrast is what makes a focused neighbourhood readable: an
		// unrelated link must recede well below the resting state, and a focused
		// one must stand out above it.
		expect(DIMMED_EDGE_ALPHA).toBeLessThan(IDLE_EDGE_ALPHA);
		expect(FOCUSED_EDGE_ALPHA).toBeGreaterThan(IDLE_EDGE_ALPHA);
	});
});
