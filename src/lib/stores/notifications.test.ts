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
	it('returns fresh copies each call', () => {
		const a = seedNotifications();
		const b = seedNotifications();
		expect(a).toEqual(b);
		expect(a).not.toBe(b);
		expect(a[0]).not.toBe(b[0]);
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

	it('seeds defaults when the table is empty', async () => {
		vi.mocked(notificationsRepo.list).mockResolvedValue([]);
		const result = await loadNotifications();
		expect(result).toEqual(seedNotifications());
		expect(notificationsRepo.replaceAll).toHaveBeenCalledWith(seedNotifications());
	});

	it('falls back to seed on error', async () => {
		vi.mocked(notificationsRepo.list).mockRejectedValue(new Error('nope'));
		expect(await loadNotifications()).toEqual(seedNotifications());
	});
});

describe('persistNotifications', () => {
	it('replaces all rows', async () => {
		const items = seedNotifications();
		await persistNotifications(items);
		expect(notificationsRepo.replaceAll).toHaveBeenCalledWith(items);
	});

	it('swallows errors', async () => {
		vi.mocked(notificationsRepo.replaceAll).mockRejectedValueOnce(new Error('nope'));
		await expect(persistNotifications([])).resolves.toBeUndefined();
	});
});

describe('resetNotifications', () => {
	it('persists and returns seed defaults', async () => {
		const result = await resetNotifications();
		expect(result).toEqual(seedNotifications());
		expect(notificationsRepo.replaceAll).toHaveBeenCalledWith(seedNotifications());
	});
});