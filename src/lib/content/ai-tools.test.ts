import { describe, expect, it, vi } from 'vitest';

const writeActions = vi.hoisted(() => ({
	createNoteAction: vi.fn(),
	updateNoteBodyAction: vi.fn(),
	deleteNoteAction: vi.fn(),
	createTaskAction: vi.fn(),
	updateTaskAction: vi.fn(),
	completeTaskAction: vi.fn(),
	deleteTaskAction: vi.fn()
}));

vi.mock('$lib/content/mcp-write-actions', () => ({
	...writeActions,
	fail: (error: string, message: string) => ({ ok: false, error, message })
}));

import { executeToolCall, describeToolCall, type ToolContext } from '$lib/content/ai-tools';
import { toolDefinitions, toolLabel } from '$lib/content/ai-tool-schema';
import type { McpSnapshot } from '$lib/content/mcp-types';

function snapshot(): McpSnapshot {
	return {
		protocol: 1,
		revision: 1,
		generatedAt: '2026-01-01',
		truncated: false,
		appRunning: true,
		workspaces: [{ id: 'w1', name: 'Main' }],
		notes: [
			{
				id: 'n1',
				workspaceId: 'w1',
				title: 'Roadmap',
				folder: 'work',
				tags: ['plan'],
				pinned: true,
				overlay: false,
				excerpt: 'The plan',
				body: 'Full roadmap body',
				createdAt: 0,
				updatedAt: 100
			},
			{
				id: 'n2',
				workspaceId: 'w1',
				title: 'Notes about coffee',
				folder: 'personal',
				tags: [],
				pinned: false,
				overlay: false,
				excerpt: 'beans',
				body: 'I like beans',
				createdAt: 0,
				updatedAt: 200
			}
		],
		tasks: [
			{
				id: 't1',
				workspaceId: 'w1',
				title: 'Ship it',
				notes: '',
				status: 'doing',
				priority: 'high',
				folder: 'work',
				noteIds: ['n1'],
				startAt: null,
				dueAt: '2026-01-05',
				position: 0,
				completed: false,
				overlay: false,
				blocked: false,
				blockedBy: [],
				blocking: []
			}
		],
		dependencies: [],
		folders: [],
		graph: {
			nodes: [
				{ id: 'note:n1', entityId: 'n1', kind: 'note', workspaceId: 'w1', title: 'Roadmap', folder: 'work', orphan: false, degree: 1 },
				{ id: 'task:t1', entityId: 't1', kind: 'task', workspaceId: 'w1', title: 'Ship it', folder: 'work', orphan: false, degree: 1 }
			],
			edges: [{ id: 'e1', source: 'task:t1', target: 'note:n1', kind: 'link' }]
		}
	};
}

function context(): ToolContext {
	return {
		snapshot: snapshot(),
		write: { notes: [], tasks: [], dependencies: [], workspaceIds: new Set(['w1']) }
	};
}

describe('read tools', () => {
	it('lists notes filtered by tag', async () => {
		const result = await executeToolCall(context(), 'list_notes', '{"tag":"plan"}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((result.data as { notes: unknown[] }).notes).toHaveLength(1);
	});

	it('searches titles and bodies', async () => {
		const result = await executeToolCall(context(), 'search_notes', '{"query":"beans"}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const notes = (result.data as { notes: { ref: string }[] }).notes;
		expect(notes[0].ref).toBe('w1/n2');
	});

	it('returns a note body and its links', async () => {
		const result = await executeToolCall(context(), 'get_note', '{"id":"n1"}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const data = result.data as { body: string; links: unknown[] };
		expect(data.body).toBe('Full roadmap body');
		expect(data.links).toHaveLength(1);
	});

	it('errors on an unknown note id', async () => {
		const result = await executeToolCall(context(), 'get_note', '{"id":"nope"}', { confirmed: false });
		expect(result.ok).toBe(false);
	});

	it('falls back to a title when given one instead of an id', async () => {
		const result = await executeToolCall(context(), 'get_note', '{"id":"Roadmap"}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((result.data as { title: string }).title).toBe('Roadmap');
	});

	it('errors on an unknown task id', async () => {
		const result = await executeToolCall(context(), 'get_task', '{"id":"nope"}', { confirmed: false });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('list_tasks');
	});

	it('sorts tasks priority-first', async () => {
		const result = await executeToolCall(context(), 'list_tasks', '{}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((result.data as { tasks: unknown[] }).tasks).toHaveLength(1);
	});

	it('errors on invalid JSON arguments', async () => {
		const result = await executeToolCall(context(), 'list_notes', '{not json', { confirmed: false });
		expect(result).toEqual({ ok: false, error: 'Tool arguments were not valid JSON.' });
	});

	it('errors on an unknown tool', async () => {
		const result = await executeToolCall(context(), 'nope', '{}', { confirmed: false });
		expect(result.ok).toBe(false);
	});
});

describe('write tools', () => {
	it('refuses an unconfirmed write', async () => {
		const result = await executeToolCall(context(), 'create_task', '{"title":"X"}', { confirmed: false });
		expect(result).toEqual({ ok: false, error: 'The user declined this action.' });
		expect(writeActions.createTaskAction).not.toHaveBeenCalled();
	});

	it('runs a confirmed write through the shared action', async () => {
		writeActions.createTaskAction.mockResolvedValue({ ok: true, data: { task: { id: 't9' } } });
		const result = await executeToolCall(context(), 'create_task', '{"title":"X"}', { confirmed: true });
		expect(result.ok).toBe(true);
		expect(writeActions.createTaskAction).toHaveBeenCalled();
	});

	it('requires confirm:true for delete', async () => {
		const result = await executeToolCall(context(), 'delete_task', '{"id":"t1"}', { confirmed: true });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('confirm');
		expect(writeActions.deleteTaskAction).not.toHaveBeenCalled();
	});
});

describe('toolDefinitions', () => {
	it('hides write tools without a write grant', () => {
		const read = toolDefinitions({ access: 'read', scopes: [] });
		expect(read.every((definition) => !definition.function.name.startsWith('create'))).toBe(true);
		expect(read.some((definition) => definition.function.name === 'list_notes')).toBe(true);
	});

	it('includes a write tool only when its scope is granted', () => {
		const tasks = toolDefinitions({ access: 'write', scopes: ['tasks'] });
		expect(tasks.some((d) => d.function.name === 'create_task')).toBe(true);
		expect(tasks.some((d) => d.function.name === 'create_note')).toBe(false);
	});
});

describe('describeToolCall', () => {
	it('names a create call with its title', () => {
		expect(describeToolCall('create_task', '{"title":"Ship"}')).toContain('Ship');
	});

	it('falls back to the raw name for unknown tools', () => {
		expect(describeToolCall('mystery', '{}')).toBe('mystery');
	});
});

describe('toolLabel', () => {
	it('returns a human label', () => {
		expect(toolLabel('get_note')).toBe('Read note');
	});
});
