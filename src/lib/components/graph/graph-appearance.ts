import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';

/**
 * Pure highlight/appearance rules for the 3D graph.
 *
 * The Three.js scene owns geometry and shaders; everything that decides *how
 * bright* a node or link should be lives here, so the rules stay testable
 * without a WebGL context.
 */

/** Node brightness when nothing is hovered or selected. */
export const IDLE_STRENGTH = 1;
/** Neighbour of the focused node. */
export const NEIGHBOUR_STRENGTH = 0.92;
/** Everything outside the focused neighbourhood. */
export const DIMMED_STRENGTH = 0.27;
/** A focused node that is pinned by the drawer but not hovered. */
export const PINNED_STRENGTH = 0.8;

/**
 * Idle link opacity. Blended across every link, this is what makes the graph
 * legible as a whole without any one connection shouting — matching the
 * reference's faint resting state.
 */
export const IDLE_EDGE_ALPHA = 0.16;
/**
 * A link touching the focused node. Bright enough to read as the subject of the
 * interaction from any camera angle, including nearly edge-on.
 */
export const FOCUSED_EDGE_ALPHA = 0.85;
/**
 * A link unrelated to the focused node. Deliberately near-zero: it should melt
 * away rather than linger as visual noise.
 */
export const DIMMED_EDGE_ALPHA = 0.02;

export type GraphFocus = {
	hoveredId: string | null;
	selectedId: string | null;
	/** Search highlight; when set, matching nodes stay lit even with no focus. */
	highlight: Set<string> | null;
};

/** The node that drives dimming: hover previews, otherwise the pinned selection. */
export function activeNodeId(focus: Pick<GraphFocus, 'hoveredId' | 'selectedId'>): string | null {
	return focus.hoveredId ?? focus.selectedId;
}

/** Direct neighbours of every node, built once per graph build. */
export function buildAdjacency(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): Map<string, Set<string>> {
	const adjacency = new Map<string, Set<string>>();
	for (const node of nodes) adjacency.set(node.id, new Set());
	for (const edge of edges) {
		adjacency.get(edge.source)?.add(edge.target);
		adjacency.get(edge.target)?.add(edge.source);
	}
	return adjacency;
}

/**
 * Brightness for one node. `active` is `activeNodeId(focus)`.
 *
 * Search matches stay lit on their own so a highlight reads even while a
 * different node is pinned.
 */
export function nodeStrength(nodeId: string, active: string | null, focus: GraphFocus, adjacency: Map<string, Set<string>>): number {
	if (active === null) return IDLE_STRENGTH;
	if (active === nodeId) return IDLE_STRENGTH;
	if (adjacency.get(active)?.has(nodeId)) return NEIGHBOUR_STRENGTH;
	if (focus.selectedId === nodeId) return PINNED_STRENGTH;
	if (focus.highlight?.has(nodeId)) return NEIGHBOUR_STRENGTH;
	return DIMMED_STRENGTH;
}

/** Opacity for one link, mirrored to every vertex of its ribbon. */
export function edgeAlpha(edge: GraphEdge, active: string | null, kinds: Record<GraphEdgeKind, boolean>): number {
	if (!kinds[edge.kind]) return 0;
	if (active === null) return IDLE_EDGE_ALPHA;
	return edge.source === active || edge.target === active ? FOCUSED_EDGE_ALPHA : DIMMED_EDGE_ALPHA;
}

/** Resting radius bounds for a node, in CSS pixels. */
export const NODE_MIN_SIZE = 14;
export const NODE_MAX_SIZE = 26;

/** Idle focus state, for callers that want the resting radius only. */
export const NO_FOCUS: GraphFocus = { hoveredId: null, selectedId: null, highlight: null };

/**
 * Absolute point size for a node, including the hover/selection bump.
 *
 * Busier nodes are noticeably larger, so structural hubs stand out before any
 * interaction.
 */
export function nodeSize(node: GraphNode | undefined, focus: GraphFocus): number {
	const multiplier = focus.hoveredId === node?.id ? 1.24 : focus.selectedId === node?.id ? 1.16 : 1;
	return Math.min(NODE_MAX_SIZE, NODE_MIN_SIZE + Math.sqrt(node?.degree ?? 0) * 4.4) * multiplier;
}
