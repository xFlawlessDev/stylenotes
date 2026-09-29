import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
import { activeNodeId, edgeAlpha, nodeSize, nodeStrength, type GraphFocus } from '$lib/components/graph/graph-appearance';
import { VERTICES_PER_LINK, type GraphScene } from '$lib/components/graph/graph-scene';

/**
 * The animated appearance layer: per-node size/brightness and per-link opacity.
 *
 * Targets are recomputed from focus state and then eased on every frame, so a
 * hover or a highlight sweep reads as motion instead of a hard cut. Kept apart
 * from `graph-engine` because it is pure buffer bookkeeping with no camera,
 * pointer or input concerns.
 */

const TRANSITION_RATE = 15;
const SIZE_EPSILON = 0.005;
const STRENGTH_EPSILON = 0.002;
const OPACITY_EPSILON = 0.002;

export type GraphAppearance = {
	/** Recompute every target from the current focus. Cheap; safe on any change. */
	retarget(
		scene: GraphScene,
		nodes: GraphNode[],
		links: GraphEdge[],
		focus: GraphFocus,
		kinds: Record<GraphEdgeKind, boolean>,
	): void;
	/** Snap every live buffer to its target (used right after a rebuild). */
	settle(scene: GraphScene, nodes: GraphNode[], links: GraphEdge[]): void;
	/** Ease toward the targets; returns false once nothing is moving. */
	step(scene: GraphScene, nodes: GraphNode[], links: GraphEdge[], delta: number, reducedMotion: boolean): boolean;
};

export function createGraphAppearance(adjacency: Map<string, Set<string>>): GraphAppearance {
	let sizeTargets = new Float32Array(0);
	let strengthTargets = new Float32Array(0);
	let edgeTargets = new Float32Array(0);

	function ensure(nodes: GraphNode[], links: GraphEdge[]): void {
		if (sizeTargets.length !== nodes.length) {
			sizeTargets = new Float32Array(nodes.length);
			strengthTargets = new Float32Array(nodes.length);
		}
		// One target slot per *vertex*, not per link: `retarget` writes the link
		// alpha at `index * VERTICES_PER_LINK`, and an undersized buffer silently
		// dropped every write past the halfway mark, leaving half the links at
		// opacity zero (and `step` reading `undefined` past the end).
		if (edgeTargets.length !== links.length * VERTICES_PER_LINK) {
			edgeTargets = new Float32Array(links.length * VERTICES_PER_LINK);
		}
	}

	return {
		retarget(scene, nodes, links, focus, kinds) {
			ensure(nodes, links);
			const active = activeNodeId(focus);
			scene.nodeMaterial.uniforms.uSelected.value = focus.selectedId ? scene.ids.indexOf(focus.selectedId) : -10;

			nodes.forEach((node, index) => {
				sizeTargets[index] = nodeSize(node, focus);
				strengthTargets[index] = nodeStrength(node.id, active, focus, adjacency);
			});

			links.forEach((edge, index) => {
				const alpha = edgeAlpha(edge, active, kinds);
				// Each link is one quad: every vertex in it shares its alpha.
				const base = index * VERTICES_PER_LINK;
				for (let vertex = 0; vertex < VERTICES_PER_LINK; vertex += 1) edgeTargets[base + vertex] = alpha;
			});
		},

		settle(scene, nodes, links) {
			ensure(nodes, links);
			for (let index = 0; index < nodes.length; index += 1) {
				scene.sizes[index] = sizeTargets[index];
				scene.strengths[index] = strengthTargets[index];
			}
			scene.edgeOpacity.set(edgeTargets);
			scene.sizeAttribute.needsUpdate = true;
			scene.strengthAttribute.needsUpdate = true;
			scene.edgeOpacityAttribute.needsUpdate = true;
		},

		step(scene, nodes, links, delta, reducedMotion) {
			ensure(nodes, links);
			const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * TRANSITION_RATE);
			let unsettled = false;

			for (let index = 0; index < nodes.length; index += 1) {
				scene.sizes[index] += (sizeTargets[index] - scene.sizes[index]) * blend;
				scene.strengths[index] += (strengthTargets[index] - scene.strengths[index]) * blend;
				if (
					Math.abs(sizeTargets[index] - scene.sizes[index]) > SIZE_EPSILON ||
					Math.abs(strengthTargets[index] - scene.strengths[index]) > STRENGTH_EPSILON
				) {
					unsettled = true;
				}
			}

			for (let index = 0; index < scene.edgeOpacity.length; index += 1) {
				scene.edgeOpacity[index] += (edgeTargets[index] - scene.edgeOpacity[index]) * blend;
				if (Math.abs(edgeTargets[index] - scene.edgeOpacity[index]) > OPACITY_EPSILON) unsettled = true;
			}

			scene.sizeAttribute.needsUpdate = true;
			scene.strengthAttribute.needsUpdate = true;
			scene.edgeOpacityAttribute.needsUpdate = true;
			return unsettled;
		},
	};
}
