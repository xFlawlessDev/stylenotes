/**
 * Cloud session token — the frontend side of the OS-keychain seam.
 *
 * The token never touches `localStorage` or SQLite (`#4`). These wrappers are
 * the only callers of the `cloud_session_*` Rust commands; outside Tauri (plain
 * browser dev) they resolve to "no session" so nothing breaks.
 */
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '$lib/windows';

/** Stores (or replaces) the session token in the OS credential store. */
export async function storeSessionToken(token: string): Promise<boolean> {
	if (!isTauri) return false;
	try {
		await invoke('cloud_session_set', { token });
		return true;
	} catch {
		return false;
	}
}

/** Reads the stored token, or `null` when signed out / outside Tauri. */
export async function loadSessionToken(): Promise<string | null> {
	if (!isTauri) return null;
	try {
		return (await invoke<string | null>('cloud_session_get')) ?? null;
	} catch {
		return null;
	}
}

/** Clears the token. Idempotent: a missing entry is success. */
export async function clearSessionToken(): Promise<boolean> {
	if (!isTauri) return true;
	try {
		await invoke('cloud_session_clear');
		return true;
	} catch {
		return false;
	}
}
