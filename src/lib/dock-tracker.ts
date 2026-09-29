import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import type { DockPoint } from '$lib/dock';
import { OVERLAY_VISIBILITY_EVENT } from '$lib/windows';

export type DockCursorTrackerOptions = {
	/** Poll interval in ms while the dock is visible. */
	interval?: number;
	/** True while a drag owns the window position; those ticks are skipped. */
	suspended?: () => boolean;
	/** Cursor position in window-local CSS pixels, once per tick. */
	onCursor: (point: DockPoint) => void | Promise<void>;
};

export type DockCursorTracker = {
	/** Re-reads the window position and scale factor from the backend. */
	refresh: () => Promise<void>;
	/** Stops polling and drops every listener. */
	dispose: () => void;
};

/**
 * Tracks the global cursor while the dock window is visible.
 *
 * The dock is click-through (`setIgnoreCursorEvents`), so the webview never sees
 * DOM hover events; the cursor has to be polled and converted to window-local
 * coordinates instead. Position and scale factor only change when the window
 * moves or the display changes, so they are cached — refreshed from move/scale
 * events, on demand, and once per `start()` — rather than fetched on every tick.
 * The loop stops completely while the dock is hidden, otherwise a hidden dock
 * would hammer the IPC bridge ~25 times a second for a cursor nobody can see.
 *
 * Only call this inside a Tauri window.
 */
export function createDockCursorTracker(options: DockCursorTrackerOptions): DockCursorTracker {
	const interval = options.interval ?? 40;
	const win = getCurrentWindow();
	const unlisten: UnlistenFn[] = [];
	let position: DockPoint = { x: 0, y: 0 };
	let scale = 1;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let ready: Promise<void> = Promise.resolve();
	let running = false;
	let disposed = false;

	async function refresh() {
		const [next, factor] = await Promise.all([win.outerPosition(), win.scaleFactor()]);
		position = { x: next.x, y: next.y };
		scale = factor;
	}

	function schedule() {
		if (running) timer = setTimeout(tick, interval);
	}

	async function tick() {
		if (!running) return;
		try {
			if (!options.suspended?.()) {
				await ready;
				const cursor = await cursorPosition();
				if (running) {
					await options.onCursor({
						x: (cursor.x - position.x) / scale,
						y: (cursor.y - position.y) / scale
					});
				}
			}
		} catch {
			/* the window may be closing; the next tick retries */
		}
		schedule();
	}

	function start() {
		if (disposed || running) return;
		running = true;
		ready = refresh().catch(() => undefined);
		schedule();
	}

	/**
	 * (Re)starts polling if the window is visible, stops it otherwise.
	 *
	 * `OVERLAY_VISIBILITY_EVENT` can be emitted before this webview has
	 * registered its listener (the dock is created hidden and shown later), so
	 * the event alone is not a reliable "it is showing now" signal. Re-reading
	 * the real visibility on every call makes the loop self-correcting.
	 */
	function syncVisibility() {
		if (disposed) return;
		void win
			.isVisible()
			.then((visible) => (visible ? start() : stop()))
			.catch(() => undefined);
	}

	function stop() {
		running = false;
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
	}

	function track(registration: Promise<UnlistenFn>) {
		void registration
			.then((fn) => {
				if (disposed) fn();
				else unlisten.push(fn);
			})
			.catch(() => undefined);
	}

	// Move/scale events carry their payload, so a dragged dock keeps a fresh
	// cache without extra IPC calls.
	track(win.onMoved(({ payload }) => (position = { x: payload.x, y: payload.y })));
	track(win.onScaleChanged(({ payload }) => (scale = payload.scaleFactor)));
	// The dock is hidden at launch; only the toggle knows when it shows.
	track(
		listen<boolean>(OVERLAY_VISIBILITY_EVENT, ({ payload }) => {
			if (payload) start();
			else stop();
			// The payload is a hint; the window is the source of truth.
			if (payload) syncVisibility();
		})
	);
	syncVisibility();

	return {
		refresh,
		dispose() {
			disposed = true;
			stop();
			for (const fn of unlisten) fn();
			unlisten.length = 0;
		}
	};
}
