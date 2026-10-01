import { browser } from '$app/environment';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from '$lib/windows';

/** Emitted by the Rust side when the user quits; every window must flush. */
export const QUIT_REQUESTED_EVENT = 'app:quit-requested';

type Flusher = () => Promise<void> | void;

/**
 * Flushers registered by this window. A window may hold more than one — the
 * layout flushes settings while a detail window also flushes its save queue —
 * so the quit listener collects them all and acknowledges once.
 */
const flushers = new Set<Flusher>();
let listening = false;

function ensureListener(): void {
	if (listening) return;
	listening = true;
	const label = getCurrentWindow().label;
	void listen(QUIT_REQUESTED_EVENT, () => {
		void (async () => {
			try {
				// Sequential: keeps two writers off the same connection at once,
				// and each flush is cheap.
				for (const flush of flushers) {
					try {
						await flush();
					} catch {
						/* one failed flush must not block the others */
					}
				}
			} finally {
				await invoke('app_quit_ready', { label }).catch(() => undefined);
			}
		})();
	});
}

/**
 * Registers a flush to run when the app is quitting. Rust waits for every
 * window to acknowledge (with a timeout), so the last debounced write is not
 * lost. Returns an unregister function (a no-op off Tauri).
 *
 * The window acknowledges only after *all* its flushers resolve, so a settings
 * flush cannot be skipped just because another handler acked first.
 */
export async function registerQuitFlush(flush: Flusher): Promise<() => void> {
	if (!browser || !isTauri) return () => undefined;
	ensureListener();
	flushers.add(flush);
	return () => {
		flushers.delete(flush);
	};
}
