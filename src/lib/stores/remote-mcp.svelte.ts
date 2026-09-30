/**
 * Remote MCP orchestration (docs/design/constella-features.md #D12).
 *
 * Owns the listener lifecycle, the token (shown once, stored as a hash), and the
 * exposure mode. Switching mode rotates the token, because a token that was
 * visible on a narrower interface must not carry to a wider one.
 *
 * Device-local and secret-bearing: this state never enters the synced settings.
 */

import { browser } from '$app/environment';
import { invoke } from '@tauri-apps/api/core';
import { remoteMcpRepo, type RemoteMcpMode } from '$lib/db/remote-mcp';
import { isTauri } from '$lib/windows';

/** Reactive state for the Settings page. */
export const remoteMcpStore = $state<{
	enabled: boolean;
	mode: RemoteMcpMode;
	tokenHint: string;
	/** Addresses an agent should use, once the listener is bound. */
	addresses: string[];
	/** The token, held in memory only, right after a start/rotate. */
	token: string | null;
	running: boolean;
	busy: boolean;
	error: string | null;
	hydrated: boolean;
}>({
	enabled: false,
	mode: 'local',
	tokenHint: '',
	addresses: [],
	token: null,
	running: false,
	busy: false,
	error: null,
	hydrated: false
});

let hydrated = false;

/** Loads the persisted state; does not start a listener. */
export async function hydrateRemoteMcp(): Promise<void> {
	if (hydrated || !browser) {
		remoteMcpStore.hydrated = true;
		return;
	}
	hydrated = true;
	const record = await remoteMcpRepo.load();
	remoteMcpStore.mode = record.mode;
	remoteMcpStore.tokenHint = record.tokenHint;
	// A listener does not survive an app restart, so a stored `enabled: true` is
	// reported as off rather than pretending the endpoint is live.
	remoteMcpStore.enabled = false;
	remoteMcpStore.running = false;
	remoteMcpStore.hydrated = true;
}

/**
 * Turns remote MCP on at `mode`.
 *
 * Returns the token once so the UI can show it; only the hash is persisted. The
 * listener binds loopback for `local`/`tunnel` and a detected private interface
 * for `lan` (never `0.0.0.0`).
 */
export async function enableRemoteMcp(mode: RemoteMcpMode): Promise<boolean> {
	if (!browser || !isTauri) return false;
	remoteMcpStore.busy = true;
	remoteMcpStore.error = null;
	try {
		const result = await invoke<{
			token: string;
			hash: string;
			hint: string;
			mode: string;
			addresses: string[];
		}>('remote_mcp_start', { mode });

		const saved = await remoteMcpRepo.saveToken(result.hash, result.hint);
		if (!saved) {
			await invoke('remote_mcp_stop').catch(() => undefined);
			remoteMcpStore.error = 'Could not store the token';
			return false;
		}
		const stateSaved = await remoteMcpRepo.saveState({ enabled: true, mode });
		if (!stateSaved) {
			remoteMcpStore.error = 'Could not save the remote MCP state';
			return false;
		}

		remoteMcpStore.enabled = true;
		remoteMcpStore.mode = mode;
		remoteMcpStore.token = result.token;
		remoteMcpStore.tokenHint = result.hint;
		remoteMcpStore.addresses = result.addresses;
		remoteMcpStore.running = true;
		return true;
	} catch (error) {
		remoteMcpStore.error = error instanceof Error ? error.message : String(error);
		return false;
	} finally {
		remoteMcpStore.busy = false;
	}
}

/** Stops the listener and forgets the token. The kill switch (#D12). */
export async function disableRemoteMcp(): Promise<boolean> {
	if (!browser || !isTauri) return false;
	remoteMcpStore.busy = true;
	try {
		await invoke('remote_mcp_stop');
		const ok = await remoteMcpRepo.saveState({ enabled: false, mode: remoteMcpStore.mode });
		await remoteMcpRepo.clearToken();
		remoteMcpStore.enabled = false;
		remoteMcpStore.running = false;
		remoteMcpStore.token = null;
		remoteMcpStore.tokenHint = '';
		remoteMcpStore.addresses = [];
		return ok;
	} catch (error) {
		remoteMcpStore.error = error instanceof Error ? error.message : String(error);
		return false;
	} finally {
		remoteMcpStore.busy = false;
	}
}

/**
 * Changes exposure mode. Always rotates the token: the old one may have been
 * seen on the previous interface and must not travel (#D12).
 */
export async function changeRemoteMode(mode: RemoteMcpMode): Promise<boolean> {
	if (mode === remoteMcpStore.mode && remoteMcpStore.running) return true;
	if (remoteMcpStore.enabled) {
		// Restart at the new mode, which mints and persists a fresh token.
		return enableRemoteMcp(mode);
	}
	remoteMcpStore.mode = mode;
	return remoteMcpRepo.saveState({ enabled: false, mode });
}

/** Issues a fresh token without changing exposure. */
export async function rotateRemoteToken(): Promise<boolean> {
	if (!browser || !isTauri) return false;
	remoteMcpStore.busy = true;
	try {
		const result = await invoke<{ token: string; hash: string; hint: string }>(
			'remote_mcp_rotate'
		);
		const saved = await remoteMcpRepo.saveToken(result.hash, result.hint);
		if (!saved) {
			remoteMcpStore.error = 'Could not store the token';
			return false;
		}
		remoteMcpStore.token = result.token;
		remoteMcpStore.tokenHint = result.hint;
		return true;
	} catch (error) {
		remoteMcpStore.error = error instanceof Error ? error.message : String(error);
		return false;
	} finally {
		remoteMcpStore.busy = false;
	}
}

/** Drops the in-memory token once the user has copied it. */
export function forgetToken(): void {
	remoteMcpStore.token = null;
}
