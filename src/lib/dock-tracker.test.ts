import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_VISIBILITY_EVENT } from '$lib/windows';

const mocks = vi.hoisted(() => ({
	outerPosition: vi.fn(),
	scaleFactor: vi.fn(),
	cursorPosition: vi.fn(),
	isVisible: vi.fn(),
	onMoved: vi.fn(),
	onScaleChanged: vi.fn(),
	onFocusChanged: vi.fn(),
	listen: vi.fn(),
	unlisten: vi.fn()
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen, emit: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
	getCurrentWindow: () => ({
		outerPosition: mocks.outerPosition,
		scaleFactor: mocks.scaleFactor,
		isVisible: mocks.isVisible,
		onMoved: mocks.onMoved,
		onScaleChanged: mocks.onScaleChanged,
		onFocusChanged: mocks.onFocusChanged
	}),
	cursorPosition: mocks.cursorPosition
}));
vi.mock('@tauri-apps/api/webviewWindow', () => ({ WebviewWindow: { getByLabel: vi.fn() } }));

let createDockCursorTracker: typeof import('$lib/dock-tracker').createDockCursorTracker;
/** Handler registered for `OVERLAY_VISIBILITY_EVENT`, called by the workspace. */
let onVisibility: ((event: { payload: boolean }) => void) | undefined;

/** Flushes the tracker's startup promises (geometry refresh, visibility). */
async function settle() {
	await vi.advanceTimersByTimeAsync(0);
	await vi.advanceTimersByTimeAsync(0);
}

/** Runs `ticks` polls worth of the tracker's interval. */
async function poll(ticks: number) {
	await vi.advanceTimersByTimeAsync(ticks * 40);
}

beforeEach(async () => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	onVisibility = undefined;
	// The dock is hidden at launch; tests opt in by resolving `isVisible`.
	mocks.outerPosition.mockResolvedValue({ x: 100, y: 200 });
	mocks.scaleFactor.mockResolvedValue(2);
	mocks.cursorPosition.mockResolvedValue({ x: 140, y: 260 });
	mocks.isVisible.mockResolvedValue(false);
	mocks.onMoved.mockResolvedValue(mocks.unlisten);
	mocks.onScaleChanged.mockResolvedValue(mocks.unlisten);
	mocks.listen.mockImplementation(
		async (_event: string, handler: (event: { payload: boolean }) => void) => {
			onVisibility = handler;
			return mocks.unlisten;
		}
	);
	({ createDockCursorTracker } = await import('$lib/dock-tracker'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('createDockCursorTracker', () => {
	it('stays silent while the dock window is hidden', async () => {
		const onCursor = vi.fn();
		createDockCursorTracker({ interval: 40, onCursor });

		await settle();
		await poll(10);

		expect(onCursor).not.toHaveBeenCalled();
		expect(mocks.cursorPosition).not.toHaveBeenCalled();
		expect(mocks.outerPosition).not.toHaveBeenCalled();
	});

	it('converts the cursor with cached geometry, not a fetch per tick', async () => {
		mocks.isVisible.mockResolvedValue(true);
		const onCursor = vi.fn();
		createDockCursorTracker({ interval: 40, onCursor });

		await settle();
		await poll(1);

		// (140 - 100) / 2 and (260 - 200) / 2 in window-local CSS pixels.
		expect(onCursor).toHaveBeenLastCalledWith({ x: 20, y: 30 });

		await poll(10);

		expect(mocks.cursorPosition).toHaveBeenCalledTimes(11);
		expect(mocks.outerPosition).toHaveBeenCalledTimes(1);
		expect(mocks.scaleFactor).toHaveBeenCalledTimes(1);
	});

	it('follows the show/hide events emitted by the dock toggle', async () => {
		createDockCursorTracker({ interval: 40, onCursor: vi.fn() });
		await settle();
		expect(mocks.listen).toHaveBeenCalledWith(OVERLAY_VISIBILITY_EVENT, expect.any(Function));

		await poll(5);
		expect(mocks.cursorPosition).not.toHaveBeenCalled();

		onVisibility?.({ payload: true });
		await poll(1);
		expect(mocks.cursorPosition).toHaveBeenCalledTimes(1);

		onVisibility?.({ payload: false });
		await poll(5);
		expect(mocks.cursorPosition).toHaveBeenCalledTimes(1);
	});

	it('skips polls while a drag owns the window position', async () => {
		mocks.isVisible.mockResolvedValue(true);
		let dragging = true;
		const onCursor = vi.fn();
		createDockCursorTracker({ interval: 40, onCursor, suspended: () => dragging });

		await settle();
		await poll(5);
		expect(onCursor).not.toHaveBeenCalled();

		dragging = false;
		await poll(1);
		expect(onCursor).toHaveBeenCalledTimes(1);
	});

	it('refresh() re-reads the window position and scale factor', async () => {
		mocks.isVisible.mockResolvedValue(true);
		const onCursor = vi.fn();
		const tracker = createDockCursorTracker({ interval: 40, onCursor });

		await settle();
		await poll(1);

		mocks.outerPosition.mockResolvedValue({ x: 0, y: 0 });
		await tracker.refresh();
		await poll(1);

		expect(onCursor).toHaveBeenLastCalledWith({ x: 70, y: 130 });
		expect(mocks.outerPosition).toHaveBeenCalledTimes(2);
	});

	it('dispose() stops polling and unlistens', async () => {
		mocks.isVisible.mockResolvedValue(true);
		const onCursor = vi.fn();
		const tracker = createDockCursorTracker({ interval: 40, onCursor });

		await settle();
		await poll(2);
		expect(mocks.cursorPosition).toHaveBeenCalledTimes(2);

		tracker.dispose();
		await poll(5);

		expect(mocks.cursorPosition).toHaveBeenCalledTimes(2);
		expect(onCursor).toHaveBeenCalledTimes(2);
		expect(mocks.unlisten).toHaveBeenCalledTimes(3);
	});
});
