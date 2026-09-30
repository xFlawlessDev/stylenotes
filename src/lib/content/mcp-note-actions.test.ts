import { describe, expect, it, vi, beforeEach } from 'vitest';

const execute = vi.fn();
const select = vi.fn();
const invoke = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ ok: true })));

vi.mock('@tauri-apps/plugin-sql', () => ({
	default: { load: vi.fn(async () => ({ execute, select })) },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('$lib/windows', () => ({ isTauri: true }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(async () => undefined) }));
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
	editNoteBodyAction,
	journalTodayAction,
	resolveBodyEdit,
	updateNoteAction
} from '$lib/content/mcp-note-actions';
import type { WriteContext } from '$lib/content/mcp-write-context';
import { createNote } from '$lib/content/content';

function context(overrides: Partial<WriteContext> = {}): WriteContext {
	return {
		notes: [],
		tasks: [],
		dependencies: [],
		workspaceIds: new Set(['workspace-default', 'ws-two']),
		...overrides
	};
}

/** A context holding one note with the given body. */
function withNote(body: string, id = 'n1') {
	return context({
		notes: [createNote({ id, title: 'N', body, workspaceId: 'workspace-default' })]
	});
}

beforeEach(() => {
	execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
	select.mockReset().mockResolvedValue([]);
	invoke.mockClear();
});

describe('editNoteBodyAction / replace', () => {
	it('sweeps every occurrence and reports the count', async () => {
		const result = await editNoteBodyAction(withNote('alnair docs, alnair app'), {
			id: 'n1',
			op: 'replace',
			find: 'alnair',
			replace: 'stylenotes'
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toMatchObject({ op: 'replace', matched: 2, replaced: 2 });
		}
		const written = invoke.mock.calls.at(-1);
		expect(written?.[0]).toBe('note_upsert_tx');
		expect(written?.[1]).toMatchObject({ body: 'stylenotes docs, stylenotes app' });
	});

	it('defaults occurrence to all, because a rename means all', async () => {
		const result = await editNoteBodyAction(withNote('a b a'), {
			id: 'n1',
			op: 'replace',
			find: 'a',
			replace: 'z'
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toMatchObject({ replaced: 2 });
	});

	it('honours occurrence once', async () => {
		const result = await editNoteBodyAction(withNote('0.1.0\ntext\nmore'), {
			id: 'n1',
			op: 'replace',
			find: '0.1.0',
			replace: '0.2.0',
			occurrence: 'once'
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toMatchObject({ matched: 1, replaced: 1 });
	});

	it('refuses a missing needle without writing anything', async () => {
		const result = await editNoteBodyAction(withNote('hello'), {
			id: 'n1',
			op: 'replace',
			find: 'absent',
			replace: 'x'
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('bad_arguments');
		expect(invoke).not.toHaveBeenCalled();
	});

	it('refuses an ambiguous once without writing anything', async () => {
		const result = await editNoteBodyAction(withNote('alnair x alnair'), {
			id: 'n1',
			op: 'replace',
			find: 'alnair',
			replace: 'stylenotes',
			occurrence: 'once'
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('bad_arguments');
		expect(invoke).not.toHaveBeenCalled();
	});

	it('rejects an unknown occurrence value', async () => {
		const result = await editNoteBodyAction(withNote('hi'), {
			id: 'n1',
			op: 'replace',
			find: 'hi',
			replace: 'yo',
			occurrence: 'first'
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('bad_arguments');
	});

	it('requires both find and replace', async () => {
		const noFind = await editNoteBodyAction(withNote('hi'), { id: 'n1', op: 'replace', replace: 'x' });
		expect(noFind.ok).toBe(false);
		const noReplace = await editNoteBodyAction(withNote('hi'), { id: 'n1', op: 'replace', find: 'hi' });
		expect(noReplace.ok).toBe(false);
	});
});

describe('editNoteBodyAction / insert', () => {
	it('appends by default', async () => {
		const result = await editNoteBodyAction(withNote('existing'), {
			id: 'n1',
			op: 'insert',
			text: '- new thought'
		});
		expect(result.ok).toBe(true);
		const written = invoke.mock.calls.at(-1);
		expect(written?.[1]).toMatchObject({ body: 'existing\n\n- new thought' });
	});

	it('prepends at the start', async () => {
		const result = await editNoteBodyAction(withNote('body'), {
			id: 'n1',
			op: 'insert',
			text: 'Header',
			position: 'start'
		});
		expect(result.ok).toBe(true);
		const written = invoke.mock.calls.at(-1);
		expect(written?.[1]).toMatchObject({ body: 'Header\n\nbody' });
	});

	it('rejects an unknown position and an unknown op', async () => {
		const badPosition = await editNoteBodyAction(withNote('b'), {
			id: 'n1',
			op: 'insert',
			text: 'x',
			position: 'middle'
		});
		expect(badPosition.ok).toBe(false);

		const badOp = await editNoteBodyAction(withNote('b'), { id: 'n1', op: 'put', text: 'x' });
		expect(badOp.ok).toBe(false);
		if (!badOp.ok) expect(badOp.error).toBe('bad_arguments');
	});
});

describe('editNoteBodyAction guards', () => {
	it('reports a missing note', async () => {
		const result = await editNoteBodyAction(context(), { id: 'ghost', op: 'insert', text: 'x' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('not_found');
	});

	it('refuses a note whose workspace is gone', async () => {
		const ctx = context({
			notes: [createNote({ id: 'n1', title: 'N', workspaceId: 'ws-gone' })],
			workspaceIds: new Set(['workspace-default'])
		});
		const result = await editNoteBodyAction(ctx, { id: 'n1', op: 'insert', text: 'x' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('not_found');
		expect(invoke).not.toHaveBeenCalled();
	});

	it('refuses a bare id that spans two workspaces', async () => {
		const ctx = context({
			notes: [
				createNote({ id: 'dup', title: 'A', workspaceId: 'workspace-default' }),
				createNote({ id: 'dup', title: 'B', workspaceId: 'ws-two' })
			]
		});
		const result = await editNoteBodyAction(ctx, { id: 'dup', op: 'insert', text: 'x' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('ambiguous_id');
	});

	it('recomputes excerpt, words and chars from the edited body', async () => {
		const result = await editNoteBodyAction(withNote('short'), {
			id: 'n1',
			op: 'replace',
			find: 'short',
			replace: 'a longer replacement body'
		});
		expect(result.ok).toBe(true);
		const written = invoke.mock.calls.at(-1);
		expect(written?.[1]).toMatchObject({ chars: 'a longer replacement body'.length });
	});
});

describe('resolveBodyEdit', () => {
	it('is a pure transform: same input, same verdict, no side effects', () => {
		const first = resolveBodyEdit({ op: 'replace', find: 'a', replace: 'b' }, 'a a');
		const second = resolveBodyEdit({ op: 'replace', find: 'a', replace: 'b' }, 'a a');
		expect(first).toEqual(second);
		expect(select).not.toHaveBeenCalled();
	});

	it('returns a coded refusal rather than throwing', () => {
		const result = resolveBodyEdit({ op: 'replace', find: 'zzz', replace: 'x' }, 'abc');
		expect(result.ok).toBe(false);
	});

	it('does not touch metadata patching', async () => {
		// updateNoteAction and editNoteBodyAction are deliberately separate tools.
		const result = await updateNoteAction(withNote('body', 'n1'), {
			id: 'n1',
			patch: { title: 'Renamed' }
		});
		expect(result.ok).toBe(true);
		const written = invoke.mock.calls.at(-1);
		expect(written?.[1]).toMatchObject({ title: 'Renamed', body: 'body' });
	});
});

describe('journalTodayAction', () => {
	it('reports an unknown workspace instead of writing into it', async () => {
		const result = await journalTodayAction(context(), { workspace: 'ws-missing' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('unknown_workspace');
		expect(invoke).not.toHaveBeenCalled();
	});
});
