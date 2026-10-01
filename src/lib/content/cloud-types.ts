/**
 * Cloud client contract (cloud sync design).
 *
 * This is the *seam* between the OSS desktop app and the closed-source cloud
 * service. The app ships the client and the empty default; the business logic
 * lives entirely behind HTTP. Nothing here performs network I/O — it is the
 * shape of the configuration and the status the UI renders.
 */
import { FREE_ENTITLEMENTS, type Entitlements, type PlanId } from '@stylenotes/shared';

export type { Entitlements, PlanId };

/**
 * Cloud is **off until a server is configured** — the default for an offline,
 * account-less install. `disabled` is not an error: it is the honest initial
 * state and it hides every cloud/account surface.
 */
export type CloudMode = 'disabled' | 'connected';

/** Device-local cloud configuration. Never synced (see `db/cloud.ts`). */
export type CloudConfig = {
	/** Base URL of the cloud service, e.g. `https://api.stylenotes.app`. Empty = off. */
	baseUrl: string;
	/** Account email when signed in; `''` while signed out. */
	account: string;
	/** The device's stable id, generated on first use. */
	deviceId: string;
	/** The last plan the server reported; `free` until proven otherwise. */
	plan: PlanId;
};

export type CloudStatus = {
	/** Whether a server is configured at all. */
	configured: boolean;
	/** Whether an account session is held. */
	signedIn: boolean;
	/** Whether the last reachability probe succeeded. */
	reachable: boolean;
	/** The account email, when signed in. */
	account: string;
	/** Epoch ms of the last successful probe, or `0`. */
	lastCheckedAt: number;
};

export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
	baseUrl: '',
	account: '',
	deviceId: '',
	plan: 'free',
};

/**
 * The effective entitlements. Until a server answers `GET /me/entitlements`,
 * the app uses the most restricted set, so no cloud feature can be assumed.
 */
export function effectiveEntitlements(config: CloudConfig): Entitlements {
	if (!config.baseUrl || !config.account) return FREE_ENTITLEMENTS;
	return { ...FREE_ENTITLEMENTS, plan: config.plan };
}

/**
 * Normalises a user-entered base URL: trims, drops a trailing slash, and adds
 * `https://` when no scheme is present. A non-http(s) scheme is left intact so
 * the validator can reject it rather than silently coercing it to https.
 */
export function normalizeBaseUrl(raw: string): string {
	const trimmed = raw.trim().replace(/\/+$/, '');
	if (!trimmed) return '';
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}

/**
 * A base URL is usable when it normalises to an absolute `http(s)` origin. Used
 * to refuse saving garbage before any request is attempted.
 */
export function isValidBaseUrl(raw: string): boolean {
	const url = normalizeBaseUrl(raw);
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:';
	} catch {
		return false;
	}
}

export function isCloudConfigured(config: CloudConfig): boolean {
	return Boolean(config.baseUrl);
}

export function isSignedIn(config: CloudConfig): boolean {
	return Boolean(config.baseUrl && config.account);
}
