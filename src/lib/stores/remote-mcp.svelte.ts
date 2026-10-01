/**
 * Remote MCP orchestration (docs/design/constella-features.md #D12).
 *
 * Owns the listener lifecycle, the token (encrypted at rest, shown once), and
 * the exposure mode. The token is **reused across restarts** so a client
 * config survives a laptop being closed and reopened; it is rotated only on an
 * explicit rotate, or when the exposure mode changes — a credential seen on a
 * narrower interface must not carry to a wider one.
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

/**
 * Serializes lifecycle operations (start/stop/mode-change/rotate).
 *
 * Every one of them stops and restarts the listener, and the Rust side binds a
 * fixed port. Two overlapping calls would tear down each other's listener and
 * race the bind (`os error 10048`), so a call that arrives while one is running
 * waits for it instead of starting a parallel cycle.
 */
let inFlight: Promise<boolean> | null = null;

function runExclusive(task: () => Promise<boolean>): Promise<boolean> {
	if (inFlight) return inFlight;
	inFlight = task().finally(() => {
		inFlight = null;
	});
	return inFlight;
}

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
	// Whether the listener is live is decided by `resumeRemoteMcp`; hydration
	// only reflects the stored preference.
	remoteMcpStore.enabled = record.enabled;
	remoteMcpStore.running = false;
	remoteMcpStore.hydrated = true;
}

/**
 * Encrypts a token for storage, so the plaintext never lands in SQLite.
 *
 * Reuses the AI cipher: Rust owns crypto, the frontend owns persistence.
 */
async function sealToken(token: string): Promise<string | null> {
	try {
		return await invoke<string>('ai_encrypt_key', { key: token });
	} catch {
		return null;
	}
}

/** Decrypts a stored token; `null` when it is missing or cannot be opened. */
async function openToken(stored: string): Promise<string | null> {
	if (!stored) return null;
	try {
		return await invoke<string>('ai_decrypt_key', { stored });
	} catch {
		return null;
	}
}

/**
 * Turns remote MCP on at `mode`.
 *
 * `token` is reused when supplied (a resume); otherwise a fresh one is minted,
 * which is what a mode change or an explicit rotate wants. Only the encrypted
 * token and its hash are persisted.
 */
export function enableRemoteMcp(
	mode: RemoteMcpMode,
	token?: string | null
): Promise<boolean> {
	return runExclusive(() => enableRemoteMcpImpl(mode, token));
}

async function enableRemoteMcpImpl(
	mode: RemoteMcpMode,
	token?: string | null
): Promise<boolean> {
	if (!browser || !isTauri) return false;
	remoteMcpStore.busy = true;
	remoteMcpStore.error = null;
	try {
		const args: { mode: string; token?: string } = { mode };
		if (token) args.token = token;
		const result = await invoke<{
			token: string;
			hash: string;
			hint: string;
			mode: string;
			addresses: string[];
		}>('remote_mcp_start', args);

		const enc = await sealToken(result.token);
		if (enc === null) {
			await invoke('remote_mcp_stop').catch(() => undefined);
			remoteMcpStore.error = 'Could not encrypt the token';
			return false;
		}
		const saved = await remoteMcpRepo.saveToken(result.hash, result.hint, enc);
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
		// Only surface the token when it is newly minted; a resume keeps the one
		// the user already copied.
		if (!token) remoteMcpStore.token = result.token;
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

/**
 * Restores the listener at app start when the user last left it enabled.
 *
 * Cheap enough to call from the workspace window: if remote MCP is off, or the
 * stored token cannot be opened, it is a no-op.
 */
export async function resumeRemoteMcp(): Promise<void> {
	if (!browser || !isTauri) return;
	await hydrateRemoteMcp();
	if (!remoteMcpStore.enabled || remoteMcpStore.running) return;
	const record = await remoteMcpRepo.load();
	if (!record.enabled) return;
	const token = await openToken(record.tokenEnc);
	if (!token) return;
	await enableRemoteMcp(record.mode, token);
}

/** Stops the listener while keeping the token, so it can resume later. */
export function disableRemoteMcp(): Promise<boolean> {
	return runExclusive(disableRemoteMcpImpl);
}

async function disableRemoteMcpImpl(): Promise<boolean> {
	if (!browser || !isTauri) return false;
	remoteMcpStore.busy = true;
	try {
		await invoke('remote_mcp_stop');
		// Keep the token: turning remote MCP back on should not force the user
		// to update every client. The kill switch is "stop", not "forget".
		const ok = await remoteMcpRepo.saveState({ enabled: false, mode: remoteMcpStore.mode });
		remoteMcpStore.enabled = false;
		remoteMcpStore.running = false;
		remoteMcpStore.token = null;
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
export function changeRemoteMode(mode: RemoteMcpMode): Promise<boolean> {
	return runExclusive(() => changeRemoteModeImpl(mode));
}

async function changeRemoteModeImpl(mode: RemoteMcpMode): Promise<boolean> {
	if (mode === remoteMcpStore.mode && remoteMcpStore.running) return true;
	if (remoteMcpStore.enabled) {
		// Restart at the new mode with no token, which mints and persists a fresh
		// one; the old credential must not reach a wider interface.
		return enableRemoteMcpImpl(mode);
	}
	remoteMcpStore.mode = mode;
	return remoteMcpRepo.saveState({ enabled: false, mode });
}

/** Issues a fresh token without changing exposure. */
export function rotateRemoteToken(): Promise<boolean> {
	return runExclusive(rotateRemoteTokenImpl);
}

async function rotateRemoteTokenImpl(): Promise<boolean> {
	if (!browser || !isTauri) return false;
	remoteMcpStore.busy = true;
	remoteMcpStore.error = null;
	try {
		const result = await invoke<{ token: string; hash: string; hint: string }>(
			'remote_mcp_rotate'
		);
		const enc = await sealToken(result.token);
		if (enc === null) {
			remoteMcpStore.error = 'Could not encrypt the token';
			return false;
		}
		const saved = await remoteMcpRepo.saveToken(result.hash, result.hint, enc);
		if (!saved) {
			remoteMcpStore.error = 'Could not store the token';
			return false;
		}
		if (remoteMcpStore.running) {
			// The live listener still holds the old hash; restart with the new
			// token so the rotation takes effect immediately.
			await enableRemoteMcpImpl(remoteMcpStore.mode, result.token);
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
