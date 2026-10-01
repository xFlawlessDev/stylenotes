import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GRAPH_EDGE_KINDS, type GraphEdge, type GraphNode } from '$lib/content/workspace-graph';
import {
	VERTICES_PER_LINK,
	buildGraphScene,
	retintGraphScene,
} from '$lib/components/graph/graph-scene';
import { graphEdgeColor, graphNodeColor } from '$lib/components/graph/graph-palette';

function node(id: string, kind: 'note' | 'task'): GraphNode {
	return {
		id,
		entityId: id.slice(id.indexOf(':') + 1),
		kind,
		title: id,
		folder: 'Work',
		orphan: false,
		degree: 1,
	};
}

function link(kind: GraphEdge['kind'], source: string, target: string): GraphEdge {
	return { id: `${kind}:${source}->${target}`, source, target, kind };
}

/**
 * The colour a vertex of that kind must hold, written into a `Float32Array` so
 * the comparison against the geometry's own buffer is exact instead of losing to
 * Float32 rounding. `graphEdgeColor` is the same token the legend swatch reads.
 */
function kindVertices(kind: GraphEdge['kind']): number[] {
	const buffer = new Float32Array(3);
	new THREE.Color(graphEdgeColor(kind)).toArray(buffer, 0);
	return Array.from(buffer);
}

function vertexColors(scene: ReturnType<typeof buildGraphScene>): number[][] {
	const attribute = scene.edges.geometry.getAttribute('aColor') as THREE.BufferAttribute;
	const array = attribute.array as Float32Array;
	return Array.from({ length: array.length / (VERTICES_PER_LINK * 3) }, (_, link) =>
		Array.from(array.slice(link * VERTICES_PER_LINK * 3, (link + 1) * VERTICES_PER_LINK * 3)),
	);
}

describe('graph scene link colours', () => {
	it('paints every vertex of a link with the legend colour of its kind', () => {
		const nodes = [node('note:a', 'note'), node('task:b', 'task')];
		const links = GRAPH_EDGE_KINDS.map((kind) => link(kind, 'note:a', 'task:b'));
		const scene = buildGraphScene(nodes, links);

		const drawn = vertexColors(scene);
		links.forEach((edge, index) => {
			const expected = kindVertices(edge.kind);
			for (let vertex = 0; vertex < VERTICES_PER_LINK; vertex += 1) {
				const slot = vertex * 3;
				expect(drawn[index].slice(slot, slot + 3)).toEqual(expected);
			}
		});

		scene.dispose();
	});

	it('gives every kind a distinct colour instead of blending its endpoints', () => {
		const nodes = [node('note:a', 'note'), node('task:b', 'task')];
		const links = GRAPH_EDGE_KINDS.map((kind) => link(kind, 'note:a', 'task:b'));
		const scene = buildGraphScene(nodes, links);

		// Six kinds, six different ribbons — and none of them is the note blue the
		// old endpoint blend would have produced for every note-to-note link.
		const drawn = vertexColors(scene).map((values) => values.slice(0, 3).join(','));
		expect(new Set(drawn).size).toBe(links.length);

		const noteColor = new Float32Array(3);
		new THREE.Color(graphNodeColor(nodes[0])).toArray(noteColor, 0);
		expect(drawn[0]).not.toBe(Array.from(noteColor).join(','));

		scene.dispose();
	});

	it('keeps the kind colour on a theme retint and only fades links outside it', () => {
		const nodes = [node('note:a', 'note'), node('task:b', 'task'), node('task:c', 'task')];
		const links = [
			link('wiki', 'note:a', 'task:b'),
			link('dependency', 'task:b', 'task:c'),
		];
		const scene = buildGraphScene(nodes, links);

		// `note:a` is the theme's only member: the wiki link touches it, the
		// dependency does not and is therefore context.
		retintGraphScene(scene, nodes, links, new Map([['note:a', 0xff0000]]));
		const themed = vertexColors(scene);
		expect(themed[0].slice(0, 3)).toEqual(kindVertices('wiki'));
		expect(themed[1].slice(0, 3)).not.toEqual(kindVertices('dependency'));

		// Clearing the theme returns both to the legend's colours.
		retintGraphScene(scene, nodes, links, null);
		const restored = vertexColors(scene);
		expect(restored[0].slice(0, 3)).toEqual(kindVertices('wiki'));
		expect(restored[1].slice(0, 3)).toEqual(kindVertices('dependency'));

		scene.dispose();
	});
});
