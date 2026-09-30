import type { Note } from '$lib/content/content';
import type { CustomFolder } from '$lib/stores/notes';
import type { Task, TaskDependency, TaskStatus } from '$lib/stores/tasks';
import { taskNoteIds, taskStatus } from '$lib/stores/tasks';
import { parseWikiReferences, resolveWikiReference, type WikiEntityKind } from '$lib/content/wiki-links';

export type GraphNodeKind = WikiEntityKind;

export type GraphNode = {
	/** Prefixed id (`note:<id>` / `task:<id>`) so the two lists can share one graph. */
	id: string;
	entityId: string;
	kind: GraphNodeKind;
	title: string;
	folder: string;
	orphan: boolean;
	degree: number;
	/** Tasks only. */
	status?: TaskStatus;
};

/**
 * Edge kinds the graph renders.
 *
 * `wiki`/`dependency`/`link` are real edges, created by the user through
 * `[[references]]`, task links and dependencies. `semantic`/`related`/
 * `contradicts` join them once the user *accepts* a suggestion (#D7) — auto-link
 * never writes the graph on its own.
 */
export type GraphEdgeKind =
	| 'wiki'
	| 'dependency'
	| 'link'
	| 'semantic'
	| 'related'
	| 'contradicts';

/** Every edge kind, in display order. `counts` is keyed by these. */
export const GRAPH_EDGE_KINDS: readonly GraphEdgeKind[] = [
	'wiki',
	'dependency',
	'link',
	'semantic',
	'related',
	'contradicts',
];

/** Real (accepted) edge kinds; suggestions are the only source of the rest. */
export const GRAPH_REAL_EDGE_KINDS: readonly GraphEdgeKind[] = ['wiki', 'dependency', 'link'];

export type GraphEdge = {
	id: string;
	source: string;
	target: string;
	kind: GraphEdgeKind;
};

/**
 * A proposed edge (#D7), keyed by entity rather than node id so the caller can
 * build it from `graph_suggestions` rows without knowing the graph's id scheme.
 */
export type GraphSuggestion = {
	id: string;
	sourceKind: GraphNodeKind;
	sourceId: string;
	targetKind: GraphNodeKind;
	targetId: string;
	kind: Exclude<GraphEdgeKind, 'wiki' | 'dependency' | 'link'>;
	score: number;
	reason: string;
	status: 'pending' | 'accepted' | 'rejected';
};

export type WorkspaceGraph = {
	nodes: GraphNode[];
	edges: GraphEdge[];
	counts: Record<GraphEdgeKind, number>;
	/**
	 * Suggestions resolved to node-id form, rendered separately (dashed).
	 * Empty unless the caller asks for them. They never affect `degree`.
	 */
	suggestions: GraphEdge[];
};

export type GraphOptions = {
	folders?: CustomFolder[];
	dependencies?: TaskDependency[];
	/** Accepted suggestions become real edges; pending ones stay dashed (#D7). */
	suggestions?: GraphSuggestion[];
};

/**
 * Which edge kinds are drawn by default: the three real kinds on, the three
 * suggestion kinds off. Accepted suggestions are real edges and show with their
 * own kind; a pending suggestion is dashed and starts hidden so a fresh index
 * does not change the graph without the user asking.
 */
export function defaultEdgeKinds(): Record<GraphEdgeKind, boolean> {
	return {
		wiki: true,
		dependency: true,
		link: true,
		semantic: false,
		related: false,
		contradicts: false,
	};
}

export function graphNodeId(kind: GraphNodeKind, id: string): string {
	return `${kind}:${id}`;
}

function emptyCounts(): Record<GraphEdgeKind, number> {
	return { wiki: 0, dependency: 0, link: 0, semantic: 0, related: 0, contradicts: 0 };
}

export function buildWorkspaceGraph(
	notes: Note[],
	tasks: Task[] = [],
	options: GraphOptions = {},
): WorkspaceGraph {
	const folders = options.folders ?? [];
	const nodes: GraphNode[] = [
		...notes.map((note) => ({
			id: graphNodeId('note', note.id),
			entityId: note.id,
			kind: 'note' as const,
			title: note.title || 'Untitled note',
			folder: note.folder,
			orphan: true,
			degree: 0,
		})),
		...tasks.map((task) => ({
			id: graphNodeId('task', task.id),
			entityId: task.id,
			kind: 'task' as const,
			title: task.title || 'Untitled task',
			folder: task.folder,
			orphan: true,
			degree: 0,
			status: taskStatus(task),
		})),
	];
	const known = new Set(nodes.map((node) => node.id));
	const edges = new Map<string, GraphEdge>();
	const addEdge = (kind: GraphEdgeKind, source: string, target: string) => {
		if (source === target || !known.has(source) || !known.has(target)) return;
		edges.set(`${kind}\0${source}\0${target}`, {
			id: `${kind}:${source}->${target}`,
			source,
			target,
			kind,
		});
	};

	for (const note of notes) {
		for (const reference of parseWikiReferences(note.body)) {
			const resolution = resolveWikiReference(reference, note, notes, folders, tasks);
			if (resolution.status !== 'resolved') continue;
			addEdge('wiki', graphNodeId('note', note.id), graphNodeId(resolution.entity.kind, resolution.entity.id));
		}
	}

	for (const task of tasks) {
		for (const reference of parseWikiReferences(task.notes)) {
			const resolution = resolveWikiReference(reference, task, notes, folders, tasks);
			if (resolution.status !== 'resolved') continue;
			addEdge('wiki', graphNodeId('task', task.id), graphNodeId(resolution.entity.kind, resolution.entity.id));
		}
		for (const noteId of taskNoteIds(task)) {
			addEdge('link', graphNodeId('task', task.id), graphNodeId('note', noteId));
		}
	}

	for (const dependency of options.dependencies ?? []) {
		addEdge(
			'dependency',
			graphNodeId('task', dependency.taskId),
			graphNodeId('task', dependency.dependsOnTaskId),
		);
	}

	// Accepted suggestions join the real edge set; pending/rejected stay dashed.
	// Both go through `addEdge`, so a suggestion that duplicates a real edge
	// collapses instead of drawing twice.
	const suggestionEdges: GraphEdge[] = [];
	const seenSuggestion = new Set<string>();
	for (const suggestion of options.suggestions ?? []) {
		const source = graphNodeId(suggestion.sourceKind, suggestion.sourceId);
		const target = graphNodeId(suggestion.targetKind, suggestion.targetId);
		if (source === target || !known.has(source) || !known.has(target)) continue;

		if (suggestion.status === 'accepted') {
			addEdge(suggestion.kind, source, target);
			continue;
		}
		if (suggestion.status !== 'pending') continue;

		const key = `${suggestion.kind}\0${source}\0${target}`;
		if (seenSuggestion.has(key)) continue;
		seenSuggestion.add(key);
		suggestionEdges.push({
			id: `suggestion:${suggestion.id}`,
			source,
			target,
			kind: suggestion.kind,
		});
	}

	const edgeList = [...edges.values()];
	const counts = emptyCounts();
	const degree = new Map<string, number>();
	for (const edge of edgeList) {
		counts[edge.kind] += 1;
		degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
		degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
	}

	return {
		nodes: nodes.map((node) => ({
			...node,
			degree: degree.get(node.id) ?? 0,
			orphan: !degree.has(node.id),
		})),
		edges: edgeList,
		counts,
		suggestions: suggestionEdges,
	};
}
