import { describe, expect, it } from 'vitest';
import { createNote } from '$lib/content/content';
import { createTask } from '$lib/stores/tasks';
import { captureWorkspaceId, hoverWorkspaceId, recordWorkspaceId } from '$lib/dock-workspace';

describe('captureWorkspaceId', () => {
	it('prefers the workspace the capture menu was opened from', () => {
		expect(captureWorkspaceId('work', 'home')).toBe('work');
	});

	it('falls back to the followed workspace for a bare + click', () => {
		expect(captureWorkspaceId('', 'home')).toBe('home');
	});
});

describe('hoverWorkspaceId', () => {
	it('reads the workspace off either record kind', () => {
		expect(hoverWorkspaceId({ kind: 'note', note: createNote({ workspaceId: 'work' }) })).toBe(
			'work'
		);
		expect(hoverWorkspaceId({ kind: 'task', task: createTask({ workspaceId: 'home' }) })).toBe(
			'home'
		);
	});

	it('is empty for the records that predate workspaces', () => {
		const note = { ...createNote({}), workspaceId: undefined };
		expect(hoverWorkspaceId({ kind: 'note', note })).toBe('');
	});
});

describe('recordWorkspaceId', () => {
	it('normalises the missing workspace of pre-workspace records', () => {
		expect(recordWorkspaceId({ workspaceId: undefined })).toBe('');
		expect(recordWorkspaceId({ workspaceId: 'work' })).toBe('work');
	});
});
