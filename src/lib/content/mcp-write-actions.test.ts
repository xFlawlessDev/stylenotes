import { describe, expect, it, vi, beforeEach } from 'vitest';

const execute = vi.fn();
const select = vi.fn();
const invoke = vi.hoisted(() =>
	vi.fn(async (..._args: unknown[]) => ({ ok: true }))
);

vi.mock('@tauri-apps/plugin-sql', () => ({
	default: { load: vi.fn(async () => ({ execute, select })) },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('$lib/windows', () => ({ isTauri: true }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(async () => undefined) }));
// The live workspace list starts empty outside the app; `workspaceExists`
// consults it only when it holds something. Pin it to a non-empty list that
// lacks `ws-gone`, so the context alone decides — which is what these tests
// exercise. (`$state` is not available under vitest's SSR transform.)
vi.mock('$lib/stores/workspaces.svelte', () => ({
	workspaceStore: {
		items: [{ id: 'workspace-default', name: 'Personal', color: 'primary', createdAt: '' }],
		activeId: 'workspace-default',
		loaded: true
	},
	WORKSPACES_CHANGED: 'workspaces:changed',
	reloadWorkspaces: vi.fn()
}));

import {
	completeTaskAction,
	createTaskAction,
	linkTasksAction,
	parseEntityRef,
	resolveWorkspace,
	unsavedInWorkspace,
	updateNoteAction,
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
	invoke.mockClear();
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

describe('workspace guard', () => {
	it('refuses to write a note whose workspace no longer exists', async () => {
		const note = createNote({ id: 'n1', title: 'N', workspaceId: 'ws-gone' });
		// `ws-gone` is absent from the context: it was deleted mid-turn.
		const result = await updateNoteBodyAction(
			context({ notes: [note], workspaceIds: new Set(['workspace-default']) }),
			{ id: 'n1', body: 'new body' }
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('not_found');
		expect(execute).not.toHaveBeenCalled();
	});

	it('refuses to complete a task whose workspace no longer exists', async () => {
		const task = createTask({ id: 't1', title: 'T', workspaceId: 'ws-gone' });
		const result = await completeTaskAction(
			context({ tasks: [task], workspaceIds: new Set(['workspace-default']) }),
			{ id: 't1' }
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('not_found');
	});

	it('refuses to patch a note whose workspace no longer exists', async () => {
		const note = createNote({ id: 'n1', title: 'N', workspaceId: 'ws-gone' });
		const result = await updateNoteAction(
			context({ notes: [note], workspaceIds: new Set(['workspace-default']) }),
			{ id: 'n1', patch: { title: 'Renamed' } }
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('not_found');
		expect(execute).not.toHaveBeenCalled();
	});

	it('still writes records that belong to the fallback workspace', async () => {
		const note = createNote({ id: 'n1', title: 'N', workspaceId: undefined });
		const result = await updateNoteBodyAction(
			context({ notes: [note], workspaceIds: new Set(['workspace-default']) }),
			{ id: 'n1', body: 'new body' }
		);
		expect(result.ok).toBe(true);
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

describe('updateNoteAction', () => {
	function seeded() {
		return context({
			notes: [
				createNote({
					id: 'n1',
					title: 'Untitled note',
					folder: 'personal',
					tags: [],
					workspaceId: 'workspace-default'
				})
			]
		});
	}

	it('patches title, folder, tags and pinned', async () => {
		const result = await updateNoteAction(seeded(), {
			id: 'n1',
			patch: { title: 'Pricing model', folder: 'launch', tags: ['spec', 'pricing'], pinned: true }
		});
		expect(result.ok).toBe(true);
		// The write path is the tx command (write pool available in the test env).
		const written = invoke.mock.calls.at(-1);
		expect(written?.[0]).toBe('note_upsert_tx');
		expect(written?.[1]).toMatchObject({
			title: 'Pricing model',
			folder: 'launch',
			tags: ['spec', 'pricing'],
			pinned: true
		});
		expect(result.ok && (result.data as { note: { tags: string[] } }).note.tags).toEqual([
			'spec',
			'pricing'
		]);
	});

	it('leaves fields the patch omits alone', async () => {
		const ctx = seeded();
		await updateNoteAction(ctx, { id: 'n1', patch: { tags: ['one'] } });
		expect(ctx.notes[0].title).toBe('Untitled note');
		expect(ctx.notes[0].folder).toBe('personal');
	});

	it('deduplicates and trims tags', async () => {
		const result = await updateNoteAction(seeded(), {
			id: 'n1',
			patch: { tags: ['  spec ', 'spec', 'spec'] }
		});
		expect(result.ok && (result.data as { note: { tags: string[] } }).note.tags).toEqual(['spec']);
	});

	it('never writes the body', async () => {
		const result = await updateNoteAction(seeded(), {
			id: 'n1',
			patch: { title: 'Renamed' }
		});
		expect(result.ok && (result.data as { note: Record<string, unknown> }).note).not.toHaveProperty(
			'body'
		);
	});

	it('refuses an empty title and a missing patch', async () => {
		const emptyTitle = await updateNoteAction(seeded(), { id: 'n1', patch: { title: '   ' } });
		expect(emptyTitle.ok).toBe(false);
		if (!emptyTitle.ok) expect(emptyTitle.error).toBe('bad_arguments');

		const noPatch = await updateNoteAction(seeded(), { id: 'n1' });
		expect(noPatch.ok).toBe(false);
		if (!noPatch.ok) expect(noPatch.error).toBe('bad_arguments');
	});

	it('reports a missing note', async () => {
		const result = await updateNoteAction(context(), { id: 'ghost', patch: { title: 'x' } });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('not_found');
	});

	it('refuses a bare id that exists in two workspaces', async () => {
		const ctx = context({
			notes: [
				createNote({ id: 'dup', title: 'A', workspaceId: 'workspace-default' }),
				createNote({ id: 'dup', title: 'B', workspaceId: 'ws-two' })
			]
		});
		const result = await updateNoteAction(ctx, { id: 'dup', patch: { title: 'C' } });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('ambiguous_id');
	});
});

describe('unsavedInWorkspace', () => {
	it('names the dirty records that belong to the workspace', () => {
		const notes = [
			createNote({ id: 'n1', title: 'Draft', workspaceId: 'ws-two' }),
			createNote({ id: 'n2', title: 'Saved', workspaceId: 'ws-two' })
		];
		const tasks = [createTask({ id: 't1', title: 'Ship it', workspaceId: 'ws-two' })];

		const found = unsavedInWorkspace('ws-two', notes, tasks, {
			note: new Set(['n1']),
			task: new Set(['t1'])
		});

		// Only records that are both in the workspace and dirty are reported.
		expect(found.notes).toEqual(['Draft']);
		expect(found.tasks).toEqual(['Ship it']);
	});

	it('ignores dirty records of other workspaces', () => {
		const notes = [createNote({ id: 'n1', title: 'Other', workspaceId: 'ws-one' })];
		const found = unsavedInWorkspace('ws-two', notes, [], {
			note: new Set(['n1']),
			task: new Set()
		});
		expect(found).toEqual({ notes: [], tasks: [] });
	});

	it('treats a record without a workspace as the fallback', () => {
		const notes = [createNote({ id: 'n1', title: 'Loose', workspaceId: undefined })];
		const found = unsavedInWorkspace('workspace-default', notes, [], {
			note: new Set(['n1']),
			task: new Set()
		});
		expect(found.notes).toEqual(['Loose']);
	});
});
