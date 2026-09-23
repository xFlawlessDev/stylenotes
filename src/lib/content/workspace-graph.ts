import type { Note } from '$lib/content/content';
import type { CustomFolder } from '$lib/stores/notes';
import type { Task, TaskDependency, TaskStatus } from '$lib/stores/tasks';
import { taskStatus } from '$lib/stores/tasks';
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

export type GraphEdgeKind = 'wiki' | 'dependency' | 'link';

export type GraphEdge = {
	id: string;
	source: string;
	target: string;
	kind: GraphEdgeKind;
};

export type WorkspaceGraph = {
	nodes: GraphNode[];
	edges: GraphEdge[];
	counts: Record<GraphEdgeKind, number>;
};

export type GraphOptions = {
	folders?: CustomFolder[];
	dependencies?: TaskDependency[];
};

export function graphNodeId(kind: GraphNodeKind, id: string): string {
	return `${kind}:${id}`;
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
		if (task.noteId) addEdge('link', graphNodeId('task', task.id), graphNodeId('note', task.noteId));
	}

	for (const dependency of options.dependencies ?? []) {
		addEdge(
			'dependency',
			graphNodeId('task', dependency.taskId),
			graphNodeId('task', dependency.dependsOnTaskId),
		);
	}

	const edgeList = [...edges.values()];
	const counts: Record<GraphEdgeKind, number> = { wiki: 0, dependency: 0, link: 0 };
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
	};
}
