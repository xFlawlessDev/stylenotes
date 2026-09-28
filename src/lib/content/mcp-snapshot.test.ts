import { describe, expect, it } from 'vitest';
import { createNote } from '$lib/content/content';
import { createTask, isTaskBlocked, type TaskDependency } from '$lib/stores/tasks';
import { buildMcpSnapshot } from '$lib/content/mcp-snapshot';

const workspaces = [{ id: 'workspace-default', name: 'Personal', color: 'primary', createdAt: '' }];

function build(overrides: Partial<Parameters<typeof buildMcpSnapshot>[0]> = {}) {
	return buildMcpSnapshot({
		notes: [],
		tasks: [],
		dependencies: [],
		folders: [],
		workspaces,
		revision: 1,
		appRunning: true,
		generatedAt: '2026-09-27T10:00:00.000Z',
		...overrides,
	});
}

describe('buildMcpSnapshot', () => {
	it('never exposes the display `updated` column', () => {
		const note = createNote({ id: 'n1', title: 'A', updated: 'Baru saja' });
		const snapshot = build({ notes: [note] });
		expect(snapshot.notes[0]).not.toHaveProperty('updated');
		expect(snapshot.notes[0]).toHaveProperty('updatedAt');
	});

	it('precomputes blocked state exactly like isTaskBlocked', () => {
		const tasks = [
			createTask({ id: 'a', title: 'A', status: 'todo', workspaceId: 'workspace-default' }),
			createTask({ id: 'b', title: 'B', status: 'done', workspaceId: 'workspace-default' }),
			createTask({ id: 'c', title: 'C', status: 'todo', workspaceId: 'workspace-default' }),
		];
		const dependencies: TaskDependency[] = [
			{ taskId: 'a', dependsOnTaskId: 'b' },
			{ taskId: 'a', dependsOnTaskId: 'c' },
		];
		const snapshot = build({ tasks, dependencies });
		const a = snapshot.tasks.find((task) => task.id === 'a')!;
		expect(a.blocked).toBe(isTaskBlocked(tasks[0], tasks, dependencies));
		expect(a.blockedBy.sort()).toEqual(['b', 'c']);
		const b = snapshot.tasks.find((task) => task.id === 'b')!;
		expect(b.blocking).toEqual(['a']);
		expect(b.blocked).toBe(false);
	});

	it('embeds a graph whose nodes carry the workspace', () => {
		const note = createNote({ id: 'n1', title: 'A', body: '[[B]]' });
		const other = createNote({ id: 'n2', title: 'B' });
		const snapshot = build({ notes: [note, other] });
		expect(snapshot.graph.nodes.map((node) => node.id)).toEqual(['note:n1', 'note:n2']);
		expect(snapshot.graph.edges).toHaveLength(1);
		expect(snapshot.graph.nodes[0].workspaceId).toBe('workspace-default');
	});

	it('falls back to index-only mode when a body is oversized', () => {
		const huge = 'x'.repeat(600 * 1024);
		const note = createNote({ id: 'big', title: 'Big', body: huge });
		const snapshot = build({ notes: [note] });
		expect(snapshot.truncated).toBe(true);
		expect(snapshot.truncatedReason).toBe('body_size');
		expect(snapshot.notes[0].body).toBeUndefined();
	});

	it('caps a single note body under the byte limit', () => {
		const large = 'word '.repeat(120_000); // ~600 KB
		const note = createNote({ id: 'large', title: 'Large', body: large });
		const snapshot = build({ notes: [note] });
		// A single oversized body trips index-only mode rather than shipping it.
		expect(snapshot.truncated).toBe(true);
	});

	it('keeps small snapshots intact', () => {
		const note = createNote({ id: 'n1', title: 'A', body: 'hello' });
		const snapshot = build({ notes: [note] });
		expect(snapshot.truncated).toBe(false);
		expect(snapshot.notes[0].body).toBe('hello');
		expect(snapshot.protocol).toBe(1);
		expect(snapshot.appRunning).toBe(true);
	});
});
