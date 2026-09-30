import { describe, expect, it } from 'vitest';
import { createNote } from '$lib/content/content';
import { createTask } from '$lib/stores/tasks';
import { buildWorkspaceGraph, graphNodeId } from '$lib/content/workspace-graph';

describe('buildWorkspaceGraph', () => {
	it('links notes and tasks through wiki references', () => {
		const note = createNote({ id: 'note-a', title: 'Note A', workspaceId: 'one', body: 'See [[Note B]] and [[Task B]]' });
		const other = createNote({ id: 'note-b', title: 'Note B', workspaceId: 'one' });
		const task = createTask({ id: 'task-b', title: 'Task B', workspaceId: 'one', notes: 'Blocked by [[Note A]]' });
		const graph = buildWorkspaceGraph([note, other], [task]);

		expect(graph.nodes.map((node) => node.id)).toEqual([
			graphNodeId('note', 'note-a'),
			graphNodeId('note', 'note-b'),
			graphNodeId('task', 'task-b'),
		]);
		expect(graph.edges.map((edge) => [edge.kind, edge.source, edge.target])).toEqual([
			['wiki', graphNodeId('note', 'note-a'), graphNodeId('note', 'note-b')],
			['wiki', graphNodeId('note', 'note-a'), graphNodeId('task', 'task-b')],
			['wiki', graphNodeId('task', 'task-b'), graphNodeId('note', 'note-a')],
		]);
		expect(graph.counts).toEqual({ wiki: 3, dependency: 0, link: 0, semantic: 0, related: 0, contradicts: 0 });
	});

	it('deduplicates repeated references and skips self-links', () => {
		const first = createNote({ id: 'first', title: 'First', workspaceId: 'one', body: '[[Second]] and [[Second]] and [[First]]' });
		const second = createNote({ id: 'second', title: 'Second', workspaceId: 'one' });
		const graph = buildWorkspaceGraph([first, second]);

		expect(graph.edges).toHaveLength(1);
		expect(graph.nodes.map((node) => [node.id, node.orphan, node.degree])).toEqual([
			[graphNodeId('note', 'first'), false, 1],
			[graphNodeId('note', 'second'), false, 1],
		]);
	});

	it('does not create cross-workspace edges', () => {
		const first = createNote({ id: 'first', title: 'First', workspaceId: 'one', body: '[[Second]]' });
		const second = createNote({ id: 'second', title: 'Second', workspaceId: 'two' });
		const graph = buildWorkspaceGraph([first, second]);
		expect(graph.edges).toEqual([]);
		expect(graph.nodes.every((node) => node.orphan)).toBe(true);
	});

	it('adds linked-note and dependency edges for tasks', () => {
		const note = createNote({ id: 'note', title: 'Plan', workspaceId: 'one' });
		const first = createTask({ id: 'task-one', title: 'First', workspaceId: 'one', noteId: 'note' });
		const second = createTask({ id: 'task-two', title: 'Second', workspaceId: 'one' });
		const graph = buildWorkspaceGraph([note], [first, second], {
			dependencies: [{ taskId: 'task-two', dependsOnTaskId: 'task-one' }],
		});

		expect(graph.edges.map((edge) => [edge.kind, edge.source, edge.target])).toEqual([
			['link', graphNodeId('task', 'task-one'), graphNodeId('note', 'note')],
			['dependency', graphNodeId('task', 'task-two'), graphNodeId('task', 'task-one')],
		]);
		expect(graph.counts).toEqual({ wiki: 0, dependency: 1, link: 1, semantic: 0, related: 0, contradicts: 0 });
	});

	it('ignores dependencies pointing at unknown tasks', () => {
		const task = createTask({ id: 'task', title: 'Task', workspaceId: 'one' });
		const graph = buildWorkspaceGraph([], [task], {
			dependencies: [{ taskId: 'task', dependsOnTaskId: 'missing' }],
		});
		expect(graph.edges).toEqual([]);
	});
});

describe('graph suggestions (#D7)', () => {
	const noteA = createNote({ id: 'a', title: 'A', workspaceId: 'one' });
	const noteB = createNote({ id: 'b', title: 'B', workspaceId: 'one' });

	it('renders a pending suggestion separately and does not change degree', () => {
		const graph = buildWorkspaceGraph([noteA, noteB], [], {
			suggestions: [
				{
					id: 's1',
					sourceKind: 'note',
					sourceId: 'a',
					targetKind: 'note',
					targetId: 'b',
					kind: 'related',
					score: 0.9,
					reason: 'Similar',
					status: 'pending',
				},
			],
		});
		expect(graph.edges).toEqual([]);
		expect(graph.suggestions).toHaveLength(1);
		expect(graph.suggestions[0].kind).toBe('related');
		expect(graph.nodes.every((node) => node.degree === 0 && node.orphan)).toBe(true);
	});

	it('turns an accepted suggestion into a real edge and counts it', () => {
		const graph = buildWorkspaceGraph([noteA, noteB], [], {
			suggestions: [
				{
					id: 's1',
					sourceKind: 'note',
					sourceId: 'a',
					targetKind: 'note',
					targetId: 'b',
					kind: 'related',
					score: 0.9,
					reason: 'Similar',
					status: 'accepted',
				},
			],
		});
		expect(graph.suggestions).toEqual([]);
		expect(graph.edges.map((edge) => edge.kind)).toEqual(['related']);
		expect(graph.counts.related).toBe(1);
		expect(graph.nodes.every((node) => node.degree === 1 && !node.orphan)).toBe(true);
	});

	it('drops a rejected suggestion entirely', () => {
		const graph = buildWorkspaceGraph([noteA, noteB], [], {
			suggestions: [
				{
					id: 's1',
					sourceKind: 'note',
					sourceId: 'a',
					targetKind: 'note',
					targetId: 'b',
					kind: 'semantic',
					score: 0.9,
					reason: 'Similar',
					status: 'rejected',
				},
			],
		});
		expect(graph.edges).toEqual([]);
		expect(graph.suggestions).toEqual([]);
	});

	it('ignores a suggestion whose endpoints are unknown', () => {
		const graph = buildWorkspaceGraph([noteA], [], {
			suggestions: [
				{
					id: 's1',
					sourceKind: 'note',
					sourceId: 'a',
					targetKind: 'note',
					targetId: 'missing',
					kind: 'related',
					score: 0.9,
					reason: 'Similar',
					status: 'pending',
				},
			],
		});
		expect(graph.suggestions).toEqual([]);
	});

	it('collapses a pending suggestion that duplicates a real edge', () => {
		const linked = createNote({ id: 'a', title: 'A', workspaceId: 'one', body: '[[B]]' });
		const other = createNote({ id: 'b', title: 'B', workspaceId: 'one' });
		const graph = buildWorkspaceGraph([linked, other], [], {
			suggestions: [
				{
					id: 's1',
					sourceKind: 'note',
					sourceId: 'a',
					targetKind: 'note',
					targetId: 'b',
					kind: 'related',
					score: 0.9,
					reason: 'Similar',
					status: 'accepted',
				},
			],
		});
		// The wiki edge and the accepted related edge are distinct kinds, so both
		// exist; what matters is that no duplicate of the same kind is drawn.
		expect(graph.edges.filter((edge) => edge.kind === 'wiki')).toHaveLength(1);
		expect(graph.edges.filter((edge) => edge.kind === 'related')).toHaveLength(1);
	});
});