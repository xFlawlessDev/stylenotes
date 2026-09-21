import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { setDesktopUnderlay } from 'tauri-plugin-desktop-underlay-api';
import { settings, updateSettings } from '$lib/stores/settings.svelte';
import { isTauri, KANBAN_LABEL } from '$lib/windows';

/** Global shortcut that locks the Kanban window to the desktop or floats it. */
export const KANBAN_SHORTCUT = 'CommandOrControl+Shift+K';
/** Same shortcut, spelled for the UI. */
export const KANBAN_SHORTCUT_LABEL = 'Ctrl+Shift+K';

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
 * Registers the global lock shortcut. Only the Kanban window calls this.
 * `unregisterAll` keeps dev reloads from failing with "already registered".
 */
export async function registerKanbanShortcut(): Promise<void> {
	if (!isTauri) return;
	try {
		await unregisterAll();
		await register(KANBAN_SHORTCUT, (event) => {
			if (event.state === 'Pressed') void toggleKanbanLock();
		});
	} catch {
		/* the shortcut is taken by another app, or permissions are missing */
	}
}
