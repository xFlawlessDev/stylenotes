import { browser } from '$app/environment';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
	type McpAccess,
	type McpAuditRecord,
	type McpClientRecord,
	type McpScope,
	type McpSettings,
} from '$lib/content/mcp-types';
import { mcpRepo } from '$lib/db/mcp';
import { MCP_SCOPE_IDS } from '$lib/content/mcp-types';
import { metaRepo } from '$lib/db';
import { isTauri } from '$lib/windows';
import { t } from '$lib/i18n/index.svelte';

/** Master switch lives in `meta` so Rust can read it before spawning (#D7). */
export const MCP_ENABLED_KEY = 'mcp/enabled';

/** Event telling the other windows the MCP settings changed. */
export const MCP_CHANGED = 'mcp:changed';

const DEFAULT_SETTINGS: McpSettings = {
	access: 'read',
	scopes: [],
	workspaces: [],
	audit: true,
	logLimit: 200,
	updatedAt: '',
};

export const mcpStore = $state<{
	enabled: boolean;
	settings: McpSettings;
	clients: McpClientRecord[];
	audit: McpAuditRecord[];
	/** Non-null when the last write failed; surfaced in Settings. */
	error: string | null;
	/** Status reported by the Rust supervisor, refreshed on demand. */
	appInfo: McpAppInfo | null;
}>({
	enabled: false,
	settings: { ...DEFAULT_SETTINGS },
	clients: [],
	audit: [],
	error: null,
	appInfo: null,
});

/** Shape returned by the `mcp_app_info` command. */
export type McpAppInfo = {
	protocol: number;
	appRunning: boolean;
	appPid: number | null;
	appVersion: string;
	dbPath: string | null;
	enabled: boolean;
	snapshotRev: number;
	generatedAt: string | null;
	/** Absolute path of the installed `stylenotes-mcp` binary, when resolvable. */
	binaryPath: string | null;
};

let hydrated = false;
let started = false;
let unlisten: UnlistenFn | undefined;

function notifyChanged() {
	if (!browser || !isTauri) return;
	void emit(MCP_CHANGED, { enabled: mcpStore.enabled }).catch(() => undefined);
}

/**
 * A scope is valid when it appears in the canonical scope list. Deriving it
 * from `MCP_SCOPE_IDS` means adding a scope (notes → tasks → dependency →
 * workspace) never needs a second edit here — a hardcoded triple silently
 * dropped `workspace`, so its toggle never stuck.
 */
function isScope(value: string): value is McpScope {
	return MCP_SCOPE_IDS.includes(value as McpScope);
}

/** Master switch: persists to `meta` and reconciles the supervisor. */
export async function setMcpEnabled(enabled: boolean): Promise<boolean> {
	if (!browser) {
		mcpStore.enabled = enabled;
		return true;
	}
	mcpStore.enabled = enabled;
	try {
		await metaRepo.set(MCP_ENABLED_KEY, enabled ? '1' : '0');
	} catch {
		mcpStore.error = t('settings.mcp.error.saveSwitch');
		mcpStore.enabled = !enabled;
		return false;
	}
	mcpStore.error = null;
	if (isTauri) {
		await invoke('mcp_reconcile').catch(() => undefined);
	}
	notifyChanged();
	return true;
}

/** Persists the grant (access + scopes + workspace selection + audit). */
export async function updateMcpSettings(patch: Partial<McpSettings>): Promise<boolean> {
	const next: McpSettings = {
		...mcpStore.settings,
		...patch,
		scopes: (patch.scopes ?? mcpStore.settings.scopes).filter((scope): scope is McpScope =>
			isScope(scope as string)
		),
		workspaces: [...(patch.workspaces ?? mcpStore.settings.workspaces)],
	};
	// Writing needs a scope; reading does not. Clearing access also clears scopes
	// so the shim never trusts a stale grant.
	if (next.access === 'read' && !patch.scopes) next.scopes = [];
	mcpStore.settings = next;
	if (!browser) return true;
	const ok = await mcpRepo.saveSettings(next);
	if (!ok) {
		mcpStore.error = t('settings.mcp.error.saveSettings');
		return false;
	}
	mcpStore.error = null;
	notifyChanged();
	return true;
}

export function toggleMcpScope(scope: McpScope, enabled: boolean): Promise<boolean> {
	const scopes = enabled
		? [...new Set([...mcpStore.settings.scopes, scope])]
		: mcpStore.settings.scopes.filter((item) => item !== scope);
	return updateMcpSettings({ scopes });
}

export async function refreshMcpClients(): Promise<void> {
	mcpStore.clients = await mcpRepo.listClients();
}

export async function refreshMcpAudit(): Promise<void> {
	mcpStore.audit = await mcpRepo.listAudit(mcpStore.settings.logLimit);
}

export async function clearMcpAudit(): Promise<boolean> {
	const ok = await mcpRepo.clearAudit();
	if (ok) mcpStore.audit = [];
	else mcpStore.error = t('settings.mcp.error.clearLog');
	return ok;
}

/** Reads the supervisor status: protocol, db path, binary path, client count. */
export async function refreshMcpAppInfo(): Promise<void> {
	if (!isTauri) return;
	try {
		mcpStore.appInfo = await invoke<McpAppInfo>('mcp_app_info');
	} catch {
		mcpStore.appInfo = null;
	}
}

/**
 * Removes `snapshot.json` when MCP is switched off: it carries full note bodies,
 * so leaving it behind would keep user text on disk after the user opted out (§7).
 */
export async function clearSnapshot(): Promise<void> {
	if (!isTauri) return;
	await invoke('mcp_clear_snapshot').catch(() => undefined);
}

export async function hydrateMcp(): Promise<void> {
	if (!browser) return;
	if (!hydrated) {
		hydrated = true;
		try {
			const raw = await metaRepo.get(MCP_ENABLED_KEY);
			mcpStore.enabled = raw === '1';
		} catch {
			mcpStore.enabled = false;
		}
		mcpStore.settings = await mcpRepo.loadSettings();
	}
	await Promise.all([refreshMcpClients(), refreshMcpAudit(), refreshMcpAppInfo()]);
}

/** Starts the settings listener shared by every window. Idempotent. */
export async function startMcpSync(): Promise<void> {
	if (started || !browser || !isTauri) return;
	started = true;
	unlisten = await listen(MCP_CHANGED, () => {
		void hydrateMcp();
	});
}

export function stopMcpSync(): void {
	unlisten?.();
	unlisten = undefined;
	started = false;
}

export function mcpScopeEnabled(scope: McpScope): boolean {
	return mcpStore.settings.scopes.includes(scope);
}

export function mcpWritesAllowedFor(scope: McpScope): boolean {
	return mcpStore.settings.access === 'write' && mcpScopeEnabled(scope);
}

export { isScope };
