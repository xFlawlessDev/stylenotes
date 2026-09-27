import { describe, expect, it } from 'vitest';
import { createNote } from '$lib/content/content';
import { createTask } from '$lib/stores/tasks';
import {
	DEFAULT_WORKSPACE_ID,
	overlayWorkspaceIds,
	workspaceLookupIn,
	workspaceOf
} from '$lib/workspace';
import type { Workspace } from '$lib/workspace';

const workspace = (id: string, name: string, color = 'primary'): Workspace => ({
	id,
	name,
	color,
	createdAt: '2026-01-01T00:00:00.000Z'
});

const items = [
	workspace(DEFAULT_WORKSPACE_ID, 'Personal'),
	workspace('work', 'Work', 'secondary')
];

describe('workspaceOf', () => {
	it('falls back to the default workspace when an id is missing', () => {
		expect(workspaceOf(items, 'work').name).toBe('Work');
		expect(workspaceOf(items, undefined).id).toBe(DEFAULT_WORKSPACE_ID);
	});

	it('synthesises a stable label for an unknown workspace', () => {
		const missing = workspaceOf(items, 'ghost');
		expect(missing.id).toBe('ghost');
		expect(missing.name).toBe('Personal');
		expect(missing.color).toBe('primary');
	});
});

describe('workspaceLookupIn', () => {
	it('resolves record workspaces and tolerates an empty list', () => {
		const lookup = workspaceLookupIn(items);
		expect(lookup('work').name).toBe('Work');
		expect(workspaceLookupIn([])('work').id).toBe('work');
	});
});

describe('overlayWorkspaceIds', () => {
	it('colours docked records by their own workspace', () => {
		const ids = overlayWorkspaceIds(
			[createTask({ id: 't1', workspaceId: 'work' }), createTask({ id: 't2', overlay: true })],
			[createNote({ id: 'n1', workspaceId: DEFAULT_WORKSPACE_ID })]
		);

		expect(ids).toEqual(['work', DEFAULT_WORKSPACE_ID]);
	});
});
