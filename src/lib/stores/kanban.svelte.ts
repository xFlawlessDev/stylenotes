import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { setDesktopUnderlay } from 'tauri-plugin-desktop-underlay-api';
import { settings, updateSettings } from '$lib/stores/settings.svelte';
import { isTauri, KANBAN_LABEL } from '$lib/windows';

/**
 * Global shortcut that locks the Kanban window to the desktop or floats it.
 * Registered in Rust (`lib.rs`, `kanban_lock_shortcut`); keep this label in sync.
 */
export const KANBAN_SHORTCUT_LABEL = 'Ctrl+Shift+\\';

/** Event emitted by the Rust shortcut handler with the new lock state. */
export const KANBAN_LOCK_EVENT = 'kanban:lock-changed';

async function kanbanWindow(): Promise<WebviewWindow | null> {
	if (!isTauri) return null;
	try {
		return await WebviewWindow.getByLabel(KANBAN_LABEL);
	} catch {
		return null;
	}
}

/**
 * Locked turns the window into a desktop underlay (below the icons, above the
 * wallpaper); unlocked puts it back on top of every other window.
 */
export async function applyKanbanLock(locked: boolean): Promise<boolean> {
	const win = await kanbanWindow();
	if (!win) return false;
	try {
		if (locked) {
			await win.setAlwaysOnTop(false);
			await setDesktopUnderlay(true, KANBAN_LABEL);
		} else {
			await setDesktopUnderlay(false, KANBAN_LABEL);
			await win.setAlwaysOnTop(true);
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Flips the lock state, applies it, and makes sure the window is visible.
 * Returns whether the native state change succeeded.
 */
export async function toggleKanbanLock(): Promise<boolean> {
	const locked = !settings.kanbanLocked;
	updateSettings({ kanbanLocked: locked });
	const applied = await applyKanbanLock(locked);
	if (!applied) {
		// The window may be gone; keep the stored state honest.
		updateSettings({ kanbanLocked: !locked });
		return false;
	}
	const win = await kanbanWindow();
	if (win) {
		try {
			if (!(await win.isVisible())) await win.show();
			if (!locked) await win.setFocus();
		} catch {
			/* the window is hidden or not focusable */
		}
	}
	return true;
}

/** Re-applies the persisted lock state, used when the Kanban window mounts. */
export async function restoreKanbanLock(): Promise<boolean> {
	if (!settings.kanbanLocked) return true;
	return applyKanbanLock(true);
}

/**
 * Mirrors lock changes made through the global shortcut (handled in Rust) into
 * the settings store. Returns an unlisten function.
 */
export async function listenKanbanLockChanged(): Promise<() => void> {
	if (!isTauri) return () => {};
	return listen<boolean>(KANBAN_LOCK_EVENT, (event) => {
		if (typeof event.payload !== 'boolean') return;
		if (settings.kanbanLocked !== event.payload) {
			updateSettings({ kanbanLocked: event.payload });
		}
	});
}
