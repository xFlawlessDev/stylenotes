import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Captured quit handler, so a test can play the Rust `app:quit-requested` event. */
const quitHandler = vi.hoisted(() => ({ fn: null as null | (() => void) }));

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(async () => undefined),
	unlisten: vi.fn(),
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/windows', () => ({ isTauri: true }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/window', () => ({
	getCurrentWindow: () => ({ label: 'note-abc' }),
}));
vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn(async (_event: string, handler: () => void) => {
		quitHandler.fn = handler;
		return mocks.unlisten;
	}),
}));

type QuitFlush = typeof import('$lib/stores/quit-flush');

async function load(): Promise<QuitFlush> {
	vi.resetModules();
	quitHandler.fn = null;
	mocks.invoke.mockClear();
	return import('$lib/stores/quit-flush');
}

/** Runs the quit handler and awaits the async work it schedules. */
async function triggerQuit(): Promise<void> {
	quitHandler.fn?.();
	await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
}

beforeEach(() => {
	quitHandler.fn = null;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('registerQuitFlush', () => {
	it('flushes registered handlers, then acknowledges once', async () => {
		const { registerQuitFlush } = await load();
		const flush = vi.fn(async () => undefined);
		await registerQuitFlush(flush);

		await triggerQuit();

		expect(flush).toHaveBeenCalledTimes(1);
		expect(mocks.invoke).toHaveBeenCalledWith('app_quit_ready', { label: 'note-abc' });
		expect(mocks.invoke).toHaveBeenCalledTimes(1);
	});

	it('waits for every handler before acknowledging', async () => {
		const { registerQuitFlush } = await load();
		const order: string[] = [];
		await registerQuitFlush(async () => {
			await Promise.resolve();
			order.push('queue');
		});
		await registerQuitFlush(async () => {
			order.push('settings');
		});

		await triggerQuit();

		// Both flushes ran before Rust was told the window is done.
		expect(order).toEqual(['queue', 'settings']);
		expect(mocks.invoke).toHaveBeenCalledTimes(1);
	});

	it('does not let one failing handler block the others or the ack', async () => {
		const { registerQuitFlush } = await load();
		const second = vi.fn(async () => undefined);
		await registerQuitFlush(async () => {
			throw new Error('nope');
		});
		await registerQuitFlush(second);

		await triggerQuit();

		expect(second).toHaveBeenCalledTimes(1);
		expect(mocks.invoke).toHaveBeenCalledWith('app_quit_ready', { label: 'note-abc' });
	});

	it('unregisters a handler', async () => {
		const { registerQuitFlush } = await load();
		const flush = vi.fn(async () => undefined);
		const off = await registerQuitFlush(flush);
		off();

		await triggerQuit();

		expect(flush).not.toHaveBeenCalled();
		// The ack still happens, so an empty window never stalls the quit.
		expect(mocks.invoke).toHaveBeenCalledWith('app_quit_ready', { label: 'note-abc' });
	});
});
