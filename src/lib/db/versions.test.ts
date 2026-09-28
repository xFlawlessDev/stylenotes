import { describe, it, expect, vi, beforeEach } from 'vitest';

const execute = vi.fn();
const select = vi.fn();

vi.mock('@tauri-apps/plugin-sql', () => ({
	default: { load: vi.fn(async () => ({ execute, select })) },
}));

vi.mock('$lib/windows', () => ({ isTauri: true }));

import { versionsRepo } from '$lib/db/versions';
import { noteVersionPayload, taskVersionPayload } from '$lib/content/version-types';
import { createNote } from '$lib/content/content';
import { createTask } from '$lib/stores/tasks';

beforeEach(() => {
	execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
	select.mockReset().mockResolvedValue([]);
});

const row = (over: Partial<Record<string, unknown>> = {}) => ({
	id: 'v1',
	entity: 'note',
	entity_id: 'n1',
	payload: JSON.stringify({ title: 'A', body: 'B', tags: [], folder: 'personal' }),
	updated_at: 123,
	reason: 'auto',
	created_at: '2026-09-28T00:00:00Z',
	...over,
});

describe('versionsRepo.list', () => {
	it('maps rows and parses the JSON payload', async () => {
		select.mockResolvedValueOnce([row()]);
		const [version] = await versionsRepo.list('note', 'n1');
		expect(version.entity).toBe('note');
		expect(version.entityId).toBe('n1');
		expect(version.payload).toEqual({ title: 'A', body: 'B', tags: [], folder: 'personal' });
		expect(version.updatedAt).toBe(123);
	});

	it('survives a corrupt payload', async () => {
		select.mockResolvedValueOnce([row({ payload: 'not-json' })]);
		const [version] = await versionsRepo.list('note', 'n1');
		expect(version.payload).toEqual({});
	});
});

describe('versionsRepo.insert', () => {
	it('serializes the payload and reports success', async () => {
		const ok = await versionsRepo.insert({
			id: 'v1',
			entity: 'note',
			entityId: 'n1',
			payload: { title: 'A', body: 'B', tags: ['x'], folder: 'personal' },
			updatedAt: 5,
			reason: 'auto',
			createdAt: 'now',
		});
		expect(ok).toBe(true);
		const [, params] = execute.mock.calls[0];
		expect(params[1]).toBe('note');
		expect(JSON.parse(params[3])).toEqual({ title: 'A', body: 'B', tags: ['x'], folder: 'personal' });
	});

	it('returns false when the write fails', async () => {
		execute.mockRejectedValueOnce(new Error('boom'));
		const ok = await versionsRepo.insert({
			id: 'v1',
			entity: 'note',
			entityId: 'n1',
			payload: { title: 'A', body: '', tags: [], folder: 'personal' },
			updatedAt: 5,
			reason: 'auto',
			createdAt: 'now',
		});
		expect(ok).toBe(false);
	});
});

describe('versionsRepo.removeMany', () => {
	it('is a no-op for an empty list', async () => {
		expect(await versionsRepo.removeMany([])).toBe(0);
		expect(execute).not.toHaveBeenCalled();
	});

	it('builds one placeholder per id', async () => {
		await versionsRepo.removeMany(['a', 'b']);
		const [sql, params] = execute.mock.calls[0];
		expect(sql).toContain('id IN ($1, $2)');
		expect(params).toEqual(['a', 'b']);
	});
});

describe('version payload builders', () => {
	it('keeps only editable note fields', () => {
		const note = createNote({ id: 'n1', title: 'T', body: 'body', tags: ['a'], folder: 'work' });
		expect(noteVersionPayload(note)).toEqual({
			title: 'T',
			body: 'body',
			tags: ['a'],
			folder: 'work',
		});
	});

	it('keeps only editable task fields', () => {
		const task = createTask({ id: 't1', title: 'T', noteIds: ['n1'] });
		const payload = taskVersionPayload(task);
		expect(Object.keys(payload).sort()).toEqual(
			['dueAt', 'folder', 'noteIds', 'notes', 'priority', 'startAt', 'status', 'title'].sort()
		);
		expect(payload.noteIds).toEqual(['n1']);
	});
});
