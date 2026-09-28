import { browser } from '$app/environment';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from '$lib/windows';

/** Emitted by the Rust side when the user quits; detail windows must flush. */
export const QUIT_REQUESTED_EVENT = 'app:quit-requested';

/**
 * Flushes the save queue when the app is quitting, then tells Rust this window
 * is done so it can exit. Returns an unlisten function (a no-op off Tauri).
 *
 * Without this, a window closed by the tray's Quit could drop the last debounced
 * edit; Rust waits for every detail window (with a timeout) before exiting.
 */
export async function registerQuitFlush(flush: () => Promise<void>): Promise<() => void> {
	if (!browser || !isTauri) return () => undefined;
	const label = getCurrentWindow().label;
	const off = await listen(QUIT_REQUESTED_EVENT, () => {
		void (async () => {
			try {
				await flush();
			} finally {
				await invoke('app_quit_ready', { label }).catch(() => undefined);
			}
		})();
	});
	return off;
}
