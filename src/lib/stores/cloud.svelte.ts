import { browser } from '$app/environment';
import {
	DEFAULT_CLOUD_CONFIG,
	effectiveEntitlements,
	isValidBaseUrl,
	normalizeBaseUrl,
	type CloudConfig,
	type CloudMode,
	type CloudStatus,
} from '$lib/content/cloud-types';
import { probeCloud } from '$lib/content/cloud-client';
import { clearSessionToken } from '$lib/content/cloud-session';
import { cloudRepo } from '$lib/db/cloud';
import { t } from '$lib/i18n/index.svelte';

/**
 * Device-local cloud client state. The cloud is **off by default**; a user with
 * no server never sees an account surface. Nothing here talks to the network on
 * its own — connecting is an explicit action, and only ever a probe until the
 * sync engine lands.
 */
export const cloudStore = $state<{
	config: CloudConfig;
	status: CloudStatus;
	mode: CloudMode;
	/** Non-null when the last write/probe failed; surfaced in Settings. */
	error: string | null;
	/** True while a probe is in flight, so the UI can show a spinner. */
	probing: boolean;
}>({
	config: { ...DEFAULT_CLOUD_CONFIG },
	status: { configured: false, signedIn: false, reachable: false, account: '', lastCheckedAt: 0 },
	mode: 'disabled',
	error: null,
	probing: false,
});

let hydrated = false;

function recompute(): void {
	cloudStore.mode = cloudRepo.mode(cloudStore.config);
	cloudStore.status = cloudRepo.status(cloudStore.config, {
		reachable: cloudStore.status.reachable,
		lastCheckedAt: cloudStore.status.lastCheckedAt,
	});
}

/** Entitlements the UI gates on. Free (most restricted) until a server replies. */
export function cloudEntitlements() {
	return effectiveEntitlements(cloudStore.config);
}

/** Loads the stored configuration once. Safe to call from any window. */
export async function hydrateCloud(): Promise<void> {
	if (!browser || hydrated) return;
	hydrated = true;
	cloudStore.config = await cloudRepo.loadConfig();
	if (!cloudStore.config.deviceId) {
		const id = crypto.randomUUID();
		const ok = await cloudRepo.saveDeviceId(id);
		if (ok) cloudStore.config.deviceId = id;
	}
	recompute();
}

/**
 * Saves the server URL. An empty string turns cloud off. Returns `false` on an
 * invalid URL or a failed write, and surfaces the reason in `cloudStore.error`.
 */
export async function setCloudBaseUrl(raw: string): Promise<boolean> {
	const value = normalizeBaseUrl(raw);
	if (value && !isValidBaseUrl(value)) {
		cloudStore.error = t('settings.cloud.error.invalidUrl');
		return false;
	}
	const previous = cloudStore.config.baseUrl;
	cloudStore.config.baseUrl = value;
	if (!browser) return true;
	if (!(await cloudRepo.saveBaseUrl(value))) {
		cloudStore.config.baseUrl = previous;
		cloudStore.error = t('settings.cloud.error.save');
		return false;
	}
	cloudStore.error = null;
	recompute();
	return true;
}

/** Clears the account and server, returning the app to its offline default. */
export async function disconnectCloud(): Promise<boolean> {
	cloudStore.config.account = '';
	cloudStore.config.baseUrl = '';
	if (!browser) return true;
	const [a, b, session] = await Promise.all([
		cloudRepo.saveAccount(''),
		cloudRepo.saveBaseUrl(''),
		clearSessionToken(),
	]);
	if (!a || !b || !session) {
		cloudStore.error = t('settings.cloud.error.save');
		return false;
	}
	cloudStore.error = null;
	recompute();
	return true;
}

/** Probes the configured server and records reachability. `false` if it cannot. */
export async function checkCloudConnection(): Promise<boolean> {
	if (!cloudStore.config.baseUrl) return false;
	cloudStore.probing = true;
	cloudStore.error = null;
	try {
		const result = await probeCloud(cloudStore.config);
		cloudStore.status = cloudRepo.status(cloudStore.config, {
			reachable: result.ok,
			lastCheckedAt: Date.now(),
		});
		if (!result.ok) cloudStore.error = t('settings.cloud.error.unreachable');
		return result.ok;
	} finally {
		cloudStore.probing = false;
	}
}
