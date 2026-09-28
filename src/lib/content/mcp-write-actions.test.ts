import { describe, expect, it, vi, beforeEach } from 'vitest';

const execute = vi.fn();
const select = vi.fn();

vi.mock('@tauri-apps/plugin-sql', () => ({
	default: { load: vi.fn(async () => ({ execute, select })) },
}));
vi.mock('$lib/windows', () => ({ isTauri: true }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(async () => undefined) }));

import {
	completeTaskAction,
	createTaskAction,
	linkTasksAction,
	parseEntityRef,
	resolveWorkspace,
	updateNoteBodyAction,
	type WriteContext,
} from '$lib/content/mcp-write-actions';
import { createNote } from '$lib/content/content';
import { createTask, type TaskDependency } from '$lib/stores/tasks';

function context(overrides: Partial<WriteContext> = {}): WriteContext {
	return {
		notes: [],
		tasks: [],
		dependencies: [],
		workspaceIds: new Set(['workspace-default', 'ws-two']),
		...overrides,
	};
}

beforeEach(() => {
	execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
	select.mockReset().mockResolvedValue([]);
});

describe('parseEntityRef', () => {
	it('splits a workspace-prefixed ref', () => {
		expect(parseEntityRef('ws-two/abc')).toEqual({ workspaceId: 'ws-two', id: 'abc' });
	});

	it('passes a bare id through', () => {
		expect(parseEntityRef('abc')).toEqual({ workspaceId: null, id: 'abc' });
		// A trailing slash is not a valid prefix, so the id is kept whole.
		expect(parseEntityRef('abc/')).toEqual({ workspaceId: null, id: 'abc/' });
	});
});

describe('resolveWorkspace', () => {
	it('rejects an unknown workspace instead of falling back', () => {
		const result = resolveWorkspace(context(), 'ws-missing');
		expect(result).toEqual({ ok: false, error: 'unknown_workspace', message: expect.any(String) });
	});

	it('defaults to workspace-default when omitted', () => {
		expect(resolveWorkspace(context(), undefined)).toEqual({ ok: true, id: 'workspace-default' });
	});
});

describe('linkTasksAction', () => {
	it('rejects a self dependency', async () => {
		const task = createTask({ id: 'a', title: 'A', workspaceId: 'workspace-default' });
		const result = await linkTasksAction(context({ tasks: [task] }), { id: 'a', dependsOn: 'a' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('dependency_cycle');
	});

	it('rejects a cross-workspace dependency', async () => {
		const a = createTask({ id: 'a', title: 'A', workspaceId: 'workspace-default' });
		const b = createTask({ id: 'b', title: 'B', workspaceId: 'ws-two' });
		const result = await linkTasksAction(context({ tasks: [a, b] }), { id: 'a', dependsOn: 'b' });
		expect(result.ok).toBe(false);
	});

	it('rejects a cycle', async () => {
		const a = createTask({ id: 'a', title: 'A', workspaceId: 'workspace-default' });
		const b = createTask({ id: 'b', title: 'B', workspaceId: 'workspace-default' });
		const dependencies: TaskDependency[] = [{ taskId: 'b', dependsOnTaskId: 'a' }];
		// b already depends on a, so a depending on b closes a cycle.
		const result = await linkTasksAction(context({ tasks: [a, b], dependencies }), { id: 'a', dependsOn: 'b' });
		expect(result.ok).toBe(false);
	});

	it('accepts a valid dependency', async () => {
		const a = createTask({ id: 'a', title: 'A', workspaceId: 'workspace-default' });
		const b = createTask({ id: 'b', title: 'B', workspaceId: 'workspace-default' });
		// `dependenciesRepo.add` re-checks both tasks share a workspace.
		select.mockResolvedValueOnce([{ total: 2 }]);
		const result = await linkTasksAction(context({ tasks: [a, b] }), { id: 'a', dependsOn: 'b' });
		expect(result.ok).toBe(true);
		expect(execute).toHaveBeenCalledWith(
			'INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)',
			['a', 'b']
		);
	});
});

describe('createTaskAction', () => {
	it('requires a title', async () => {
		const result = await createTaskAction(context(), { title: '   ' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('bad_arguments');
	});

	it('drops note links that do not exist', async () => {
		const note = createNote({ id: 'n1', title: 'N', workspaceId: 'workspace-default' });
		const result = await createTaskAction(context({ notes: [note] }), {
			title: 'Follow up',
			noteIds: ['n1', 'ghost'],
			workspace: 'workspace-default',
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toMatchObject({ task: { title: 'Follow up' } });
	});
});

describe('completeTaskAction', () => {
	it('marks a task done', async () => {
		const task = createTask({ id: 'a', title: 'A', status: 'doing', workspaceId: 'workspace-default' });
		const result = await completeTaskAction(context({ tasks: [task] }), { id: 'a' });
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toMatchObject({ task: { status: 'done' } });
	});

	it('accepts a workspace-prefixed id', async () => {
		const task = createTask({ id: 'a', title: 'A', status: 'doing', workspaceId: 'ws-two' });
		const result = await completeTaskAction(context({ tasks: [task] }), { id: 'ws-two/a' });
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toMatchObject({ task: { status: 'done' } });
	});

	it('reports ambiguous_id when a bare id spans workspaces', async () => {
		const one = createTask({ id: 'dup', title: 'One', workspaceId: 'workspace-default' });
		const two = createTask({ id: 'dup', title: 'Two', workspaceId: 'ws-two' });
		const result = await completeTaskAction(context({ tasks: [one, two] }), { id: 'dup' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('ambiguous_id');
	});
});

describe('updateNoteBodyAction', () => {
	it('recomputes derived fields', async () => {
		const note = createNote({ id: 'n1', title: 'N', body: 'old', workspaceId: 'workspace-default' });
		const result = await updateNoteBodyAction(context({ notes: [note] }), { id: 'n1', body: 'new words here' });
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toMatchObject({ note: { chars: 14 } });
	});

	it('reports a missing note', async () => {
		const result = await updateNoteBodyAction(context(), { id: 'ghost', body: 'x' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('not_found');
	});
});
