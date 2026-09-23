import type { GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
import type { TaskStatus } from '$lib/stores/tasks';

/**
 * Dark visualization palette ported from the reference demo
 * (`svelte-pixi-d3-graph`). The graph canvas keeps this palette in every app
 * theme, so the overlays and the Pixi scene always match.
 */
export const GRAPH_COLORS = {
	background: 0x05070b,
	label: 0xf6f7fb,
	labelStroke: 0x05070b,
	note: 0x5484ff,
	task: {
		todo: 0xe4b62f,
		doing: 0x71d2df,
		review: 0xf36f75,
		done: 0x7ee787,
	} as Record<TaskStatus, number>,
	edges: {
		wiki: 0xc7d0dc,
		link: 0x71d2df,
		dependency: 0xe4b62f,
	} as Record<GraphEdgeKind, number>,
};

export const GRAPH_EDGE_LABELS: Record<GraphEdgeKind, string> = {
	wiki: 'Wiki link',
	link: 'Linked note',
	dependency: 'Dependency',
};

export function graphNodeColor(node: Pick<GraphNode, 'kind' | 'status'>): number {
	return node.kind === 'note' ? GRAPH_COLORS.note : GRAPH_COLORS.task[node.status ?? 'todo'];
}

export function graphColorHex(value: number): string {
	return `#${value.toString(16).padStart(6, '0')}`;
}
