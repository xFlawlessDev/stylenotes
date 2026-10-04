import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/db', () => ({
	notificationsRepo: {
		list: vi.fn(),
		replaceAll: vi.fn(),
		upsert: vi.fn(),
		remove: vi.fn(),
		clear: vi.fn(),
	},
}));

import { notificationsRepo } from '$lib/db';
import {
	loadNotifications,
	persistNotifications,
	resetNotifications,
	seedNotifications,
} from '$lib/stores/notifications';

beforeEach(() => {
	vi.mocked(notificationsRepo.list).mockReset();
	vi.mocked(notificationsRepo.replaceAll).mockReset().mockResolvedValue(undefined);
});

describe('seedNotifications', () => {
	it('seeds nothing: the panel is computed, not canned', () => {
		expect(seedNotifications()).toEqual([]);
	});
});

describe('loadNotifications', () => {
	it('returns stored rows when present', async () => {
		const stored = [
			{ id: 'x', kind: 'tip' as const, title: 'T', body: 'B', time: 'now', read: true },
		];
		vi.mocked(notificationsRepo.list).mockResolvedValue(stored);
		expect(await loadNotifications()).toEqual(stored);
		expect(notificationsRepo.replaceAll).not.toHaveBeenCalled();
	});

	it('drops legacy static seed rows', async () => {
		vi.mocked(notificationsRepo.list).mockResolvedValue([
			{ id: 'n-weekly', kind: 'reminder' as const, title: 'T', body: 'B', time: 'now', read: false },
			{ id: 'n-memory', kind: 'tip' as const, title: 'M', body: 'B', time: 'now', read: false },
		]);
		const result = await loadNotifications();
		expect(result.map((item) => item.id)).toEqual(['n-memory']);
	});

	it('clears the table when only legacy rows remain', async () => {
		vi.mocked(notificationsRepo.list).mockResolvedValue([
			{ id: 'n-tip', kind: 'tip' as const, title: 'T', body: 'B', time: 'now', read: false },
		]);
		expect(await loadNotifications()).toEqual([]);
		expect(notificationsRepo.replaceAll).toHaveBeenCalledWith([]);
	});

	it('returns empty on an empty table', async () => {
		vi.mocked(notificationsRepo.list).mockResolvedValue([]);
		expect(await loadNotifications()).toEqual([]);
	});

	it('falls back to empty on error', async () => {
		vi.mocked(notificationsRepo.list).mockRejectedValue(new Error('nope'));
		expect(await loadNotifications()).toEqual([]);
	});
});

describe('persistNotifications', () => {
	it('replaces all rows', async () => {
		const items = [
			{ id: 'x', kind: 'tip' as const, title: 'T', body: 'B', time: 'now', read: false },
		];
		await persistNotifications(items);
		expect(notificationsRepo.replaceAll).toHaveBeenCalledWith(items);
	});

	it('swallows errors', async () => {
		vi.mocked(notificationsRepo.replaceAll).mockRejectedValueOnce(new Error('nope'));
		await expect(persistNotifications([])).resolves.toBeUndefined();
	});
});

describe('resetNotifications', () => {
	it('persists and returns the (empty) defaults', async () => {
		const result = await resetNotifications();
		expect(result).toEqual([]);
		expect(notificationsRepo.replaceAll).toHaveBeenCalledWith([]);
	});
});
