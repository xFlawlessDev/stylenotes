import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveQueue } from '$lib/stores/save-queue.svelte';

describe('createSaveQueue', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('coalesces rapid edits into one write of the latest value', async () => {
		const save = vi.fn().mockResolvedValue(true);
		const queue = createSaveQueue<{ value: string }>(save, 300);

		queue.enqueue({ value: 'a' });
		queue.enqueue({ value: 'b' });
		queue.enqueue({ value: 'c' });

		expect(save).not.toHaveBeenCalled();
		expect(queue.state.dirty).toBe(true);

		vi.advanceTimersByTime(300);
		await vi.runAllTimersAsync();

		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith({ value: 'c' });
		expect(queue.state.dirty).toBe(false);
		expect(queue.state.saving).toBe(false);
	});

	it('reports a failed write', async () => {
		const save = vi.fn().mockResolvedValue(false);
		const queue = createSaveQueue<number>(save, 300);

		queue.enqueue(1);
		await queue.flush();

		expect(save).toHaveBeenCalledWith(1);
		expect(queue.state.failed).toBe(true);
		expect(queue.state.dirty).toBe(false);
	});

	it('flush writes immediately without waiting for the debounce', async () => {
		const save = vi.fn().mockResolvedValue(true);
		const queue = createSaveQueue<string>(save, 300);

		queue.enqueue('now');
		await queue.flush();

		expect(save).toHaveBeenCalledWith('now');
		expect(vi.getTimerCount()).toBe(0);
	});

	it('flush is a no-op without pending edits', async () => {
		const save = vi.fn().mockResolvedValue(true);
		const queue = createSaveQueue<string>(save, 300);

		await queue.flush();

		expect(save).not.toHaveBeenCalled();
	});
});
