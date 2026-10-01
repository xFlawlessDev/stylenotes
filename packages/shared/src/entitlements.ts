/**
 * Entitlements — the tier limits as *data* (business model B6, §6b).
 *
 * "Limits are data, not `if`s scattered through the code": the server is the
 * source of truth and returns the user's effective entitlements; the client
 * only reads them to decide what to *show*. Because the desktop app is OSS and
 * patchable, nothing here is a security boundary — enforcement is server-side.
 */

export type PlanId = 'free' | 'plus' | 'pro';

export type Capability =
	| 'cloud_sync'
	| 'ai'
	| 'remote_mcp'
	| 'collaboration'
	| 'version_history_cloud'
	| 'audit_export'
	| 'sso';

export type Entitlements = {
	plan: PlanId;
	capabilities: Capability[];
	/** Devices that may sync. `0` means cloud sync is off. */
	maxDevices: number;
	/** Remote MCP tools this account may call: `none` while unsynced. */
	remoteMcpAccess: 'none' | 'read' | 'write';
	/** Assistant requests per day (`0` = AI unavailable on this tier). */
	aiDailyQuota: number;
	/** Paid seats for a Pro organisation; `1` on personal tiers. */
	seats: number;
	/** Cloud version-history retention, in days. */
	versionHistoryDays: number;
	/** Free-form feature flags the server may add without a client release. */
	flags: Record<string, boolean>;
};

/**
 * The offline default: a logged-out, not-yet-synced install. Deliberately the
 * *most* restricted set, so the app must never assume it has more than this.
 */
export const FREE_ENTITLEMENTS: Entitlements = {
	plan: 'free',
	capabilities: [],
	maxDevices: 0,
	remoteMcpAccess: 'none',
	aiDailyQuota: 0,
	seats: 1,
	versionHistoryDays: 0,
	flags: {},
};

/** Whether an entitlement list grants a capability. */
export function hasCapability(entitlements: Entitlements | null, capability: Capability): boolean {
	return Boolean(entitlements?.capabilities.includes(capability));
}

/** Helper for UI gates: is cloud sync available at all on this tier? */
export function cloudSyncEnabled(entitlements: Entitlements | null): boolean {
	return hasCapability(entitlements, 'cloud_sync') && (entitlements?.maxDevices ?? 0) > 0;
}

/** Maps a `PlanId` to its display order, for a stable UI sort. */
export const PLAN_ORDER: PlanId[] = ['free', 'plus', 'pro'];
