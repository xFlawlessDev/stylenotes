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

describe('createSaveQueue minGap', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('holds a settled edit until the gap since the last write elapses', async () => {
		const save = vi.fn().mockResolvedValue(true);
		const queue = createSaveQueue<string>(save, { delay: 300, minGap: 2500 });

		queue.enqueue('first');
		await vi.advanceTimersByTimeAsync(300);
		expect(save).toHaveBeenCalledTimes(1);

		// A second edit settles quickly, but the gap floor delays the write.
		queue.enqueue('second');
		await vi.advanceTimersByTimeAsync(300);
		expect(save).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(2200);
		expect(save).toHaveBeenCalledTimes(2);
		expect(save).toHaveBeenLastCalledWith('second');
		expect(queue.state.dirty).toBe(false);
	});

	it('flush bypasses the gap and writes the pending value immediately', async () => {
		const save = vi.fn().mockResolvedValue(true);
		const queue = createSaveQueue<string>(save, { delay: 300, minGap: 2500 });

		queue.enqueue('a');
		await vi.advanceTimersByTimeAsync(300);

		queue.enqueue('b');
		await queue.flush();

		expect(save).toHaveBeenCalledTimes(2);
		expect(save).toHaveBeenLastCalledWith('b');
		expect(queue.state.dirty).toBe(false);
	});

	it('keeps coalescing while edits keep arriving, writing only the newest', async () => {
		const save = vi.fn().mockResolvedValue(true);
		const queue = createSaveQueue<string>(save, { delay: 300, minGap: 2500 });

		queue.enqueue('a');
		await vi.advanceTimersByTimeAsync(300);
		expect(save).toHaveBeenLastCalledWith('a');

		// Keep typing every 200ms for a second: no write should land meanwhile.
		for (let i = 0; i < 5; i += 1) {
			queue.enqueue(`edit-${i}`);
			await vi.advanceTimersByTimeAsync(200);
		}
		expect(save).toHaveBeenCalledTimes(1);
		expect(queue.state.dirty).toBe(true);

		await vi.advanceTimersByTimeAsync(2500);
		expect(save).toHaveBeenCalledTimes(2);
		expect(save).toHaveBeenLastCalledWith('edit-4');
	});
});
