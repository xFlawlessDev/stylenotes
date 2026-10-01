import { beforeEach, describe, expect, it, vi } from 'vitest';

const meta = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('$lib/db/meta', () => ({ metaRepo: meta }));

import { memoryNudgeNotification, raiseMemoryNudgeOnce } from '$lib/stores/memory-nudge';

describe('memoryNudgeNotification', () => {
	it('carries the id the notification panel localizes by', () => {
		const item = memoryNudgeNotification();
		expect(item.id).toBe('n-memory');
		expect(item.kind).toBe('tip');
		expect(item.read).toBe(false);
		// Stored English: the row is written once and read by every language.
		expect(item.title).toBe('Semantic memory is off');
	});
});

describe('raiseMemoryNudgeOnce', () => {
	const raise = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		raise.mockReset();
	});

	it('raises on the first failure and remembers that it did', async () => {
		meta.get.mockResolvedValue(null);
		await expect(raiseMemoryNudgeOnce(raise)).resolves.toBe(true);
		expect(raise).toHaveBeenCalledTimes(1);
		expect(meta.set).toHaveBeenCalledWith('meta:memory/nudge', '1');
	});

	it('stays quiet once the flag is set, even if the list was cleared', async () => {
		meta.get.mockResolvedValue('1');
		await expect(raiseMemoryNudgeOnce(raise)).resolves.toBe(false);
		expect(raise).not.toHaveBeenCalled();
		expect(meta.set).not.toHaveBeenCalled();
	});

	it('stays quiet when the flag cannot be read', async () => {
		meta.get.mockRejectedValue(new Error('no database'));
		await expect(raiseMemoryNudgeOnce(raise)).resolves.toBe(false);
		expect(raise).not.toHaveBeenCalled();
	});
});
