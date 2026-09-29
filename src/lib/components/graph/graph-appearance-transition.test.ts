import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '$lib/content/workspace-graph';
import { buildAdjacency, IDLE_EDGE_ALPHA, NO_FOCUS } from './graph-appearance';
import { createGraphAppearance } from './graph-appearance-transition';
import { VERTICES_PER_LINK, type GraphScene } from './graph-scene';

/**
 * Regression cover for the per-vertex edge buffer.
 *
 * `retarget` writes each link's alpha at `index * VERTICES_PER_LINK`, so the
 * target buffer must be sized in vertices. Sizing it per *link* silently dropped
 * every write past the halfway mark: half the edges rendered at opacity zero and
 * the second half of `edgeOpacity` read `undefined` while easing.
 */

function node(id: string): GraphNode {
	return { id, entityId: id, kind: 'note', title: id, folder: 'Work', orphan: false, degree: 1 };
}

function edge(index: number, count: number): GraphEdge {
	const source = `n${index % count}`;
	const target = `n${(index + 1) % count}`;
	return { id: `e${index}`, source, target, kind: 'wiki' };
}

/** Only the buffers `createGraphAppearance` touches, plus the shared arrays. */
function stubScene(linkCount: number): GraphScene {
	return {
		edgeOpacity: new Float32Array(linkCount * VERTICES_PER_LINK),
		edgeOpacityAttribute: { needsUpdate: false },
		sizes: new Float32Array(0),
		strengths: new Float32Array(0),
		sizeAttribute: { needsUpdate: false },
		strengthAttribute: { needsUpdate: false },
		ids: [],
		nodeMaterial: { uniforms: { uSelected: { value: -10 } } },
	} as unknown as GraphScene;
}

const KINDS = { wiki: true, dependency: true, link: true };

function fixture(linkCount: number, nodeCount = 6) {
	const nodes = Array.from({ length: nodeCount }, (_, index) => node(`n${index}`));
	const links = Array.from({ length: linkCount }, (_, index) => edge(index, nodeCount));
	return { nodes, links, scene: stubScene(linkCount) };
}

describe('graph-appearance-transition', () => {
	it('gives every link a nonzero alpha, not just the first half', () => {
		const { nodes, links, scene } = fixture(6);
		const appearance = createGraphAppearance(buildAdjacency(nodes, links));

		appearance.retarget(scene, nodes, links, NO_FOCUS, KINDS);
		appearance.settle(scene, nodes, links);

		for (let index = 0; index < links.length; index += 1) {
			expect(scene.edgeOpacity[index * VERTICES_PER_LINK]).toBeCloseTo(IDLE_EDGE_ALPHA);
		}
	});

	it('keeps every opacity finite while easing', () => {
		const { nodes, links, scene } = fixture(6);
		const appearance = createGraphAppearance(buildAdjacency(nodes, links));

		appearance.retarget(scene, nodes, links, NO_FOCUS, KINDS);
		appearance.settle(scene, nodes, links);
		appearance.step(scene, nodes, links, 1 / 60, false);

		expect(Array.from(scene.edgeOpacity).every((value) => Number.isFinite(value))).toBe(true);
	});

	it('rewrites the whole buffer when the link count changes', () => {
		const { nodes, links, scene } = fixture(3);
		const appearance = createGraphAppearance(buildAdjacency(nodes, links));

		appearance.retarget(scene, nodes, links, NO_FOCUS, KINDS);
		appearance.settle(scene, nodes, links);

		const grown = { nodes, links: [...links, ...links], scene: stubScene(6) };
		appearance.retarget(grown.scene, grown.nodes, grown.links, NO_FOCUS, KINDS);
		appearance.settle(grown.scene, grown.nodes, grown.links);

		expect(grown.scene.edgeOpacity[5 * VERTICES_PER_LINK]).toBeCloseTo(IDLE_EDGE_ALPHA);
	});
});
