import { describe, expect, it, vi, beforeEach } from 'vitest';

const execute = vi.fn();
const select = vi.fn();

vi.mock('@tauri-apps/plugin-sql', () => ({
	default: { load: vi.fn(async () => ({ execute, select })) },
}));
vi.mock('$lib/windows', () => ({ isTauri: true }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(async () => undefined) }));

import {
	createWorkspaceAction,
	deleteWorkspaceAction,
	renameWorkspaceAction,
} from '$lib/content/mcp-workspace-actions';
import type { WriteContext } from '$lib/content/mcp-write-actions';

type Workspace = { id: string; name: string; color: string; createdAt: string };

function ws(id: string, name: string): Workspace {
	return { id, name, color: 'primary', createdAt: '2026-01-01T00:00:00.000Z' };
}

function context(workspaces: Workspace[]): WriteContext {
	return {
		notes: [],
		tasks: [],
		dependencies: [],
		workspaceIds: new Set(workspaces.map((workspace) => workspace.id)),
		workspaces,
	};
}

beforeEach(() => {
	execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
	select.mockReset().mockResolvedValue([]);
});

describe('createWorkspaceAction', () => {
	it('requires a name', async () => {
		const result = await createWorkspaceAction(context([]), { name: '   ' });
		expect(result.ok).toBe(false);
	});

	it('rejects a duplicate name case-insensitively', async () => {
		const result = await createWorkspaceAction(context([ws('w1', 'Personal')]), {
			name: 'personal',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('bad_arguments');
	});

	it('creates a workspace and reports its id and colour', async () => {
		const result = await createWorkspaceAction(context([ws('w1', 'Personal')]), {
			name: 'Launch',
			color: 'tertiary',
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			const data = result.data as { workspace: { name: string; color: string } };
			expect(data.workspace.name).toBe('Launch');
			expect(data.workspace.color).toBe('tertiary');
		}
	});
});

describe('renameWorkspaceAction', () => {
	it('reports not_found for an unknown id', async () => {
		const result = await renameWorkspaceAction(context([ws('w1', 'A')]), { id: 'missing', name: 'B' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('not_found');
	});

	it('renames an existing workspace', async () => {
		const result = await renameWorkspaceAction(context([ws('w1', 'A')]), { id: 'w1', name: 'B' });
		expect(result.ok).toBe(true);
		if (result.ok) {
			const data = result.data as { workspace: { id: string; name: string } };
			expect(data.workspace).toMatchObject({ id: 'w1', name: 'B' });
		}
	});
});

describe('deleteWorkspaceAction', () => {
	it('requires confirm: true', async () => {
		const result = await deleteWorkspaceAction(context([ws('w1', 'A'), ws('w2', 'B')]), { id: 'w1' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('bad_arguments');
	});

	/**
	 * Regression: the default workspace is the fallback for records without a
	 * workspace, so deleting it strands rows. It must be refused even though
	 * other workspaces exist.
	 */
	it('never deletes the default workspace', async () => {
		const result = await deleteWorkspaceAction(context([ws('workspace-default', 'Personal'), ws('w2', 'B')]), {
			id: 'workspace-default',
			confirm: true,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('last_workspace');
		expect(execute).not.toHaveBeenCalled();
	});

	it('never deletes the last remaining workspace', async () => {
		const result = await deleteWorkspaceAction(context([ws('w1', 'A')]), { id: 'w1', confirm: true });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('last_workspace');
	});

	it('deletes a non-default workspace when another one remains', async () => {
		const result = await deleteWorkspaceAction(
			context([ws('workspace-default', 'Personal'), ws('w2', 'B')]),
			{ id: 'w2', confirm: true }
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			const data = result.data as { deleted: string };
			expect(data.deleted).toBe('w2');
		}
	});
});
