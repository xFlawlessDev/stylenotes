/**
 * Device-local cloud client configuration.
 *
 * Stored in `meta`, deliberately **not** in the synced `settings` row: the
 * server URL, the account and the device id are per-machine (`#D7` reasoning,
 * same as `mcp_settings`). The account session token will live in the OS
 * keychain once auth lands — never in `localStorage`.
 */
import { metaRepo } from './meta';
import {
	DEFAULT_CLOUD_CONFIG,
	type CloudConfig,
	type CloudMode,
	type CloudStatus,
	type PlanId,
} from '$lib/content/cloud-types';

const KEYS = {
	baseUrl: 'cloud/baseUrl',
	account: 'cloud/account',
	deviceId: 'cloud/deviceId',
	plan: 'cloud/plan',
} as const;

const PLANS: readonly PlanId[] = ['free', 'plus', 'pro'];

function asPlan(value: string | null): PlanId {
	return value && (PLANS as readonly string[]).includes(value) ? (value as PlanId) : 'free';
}

export const cloudRepo = {
	/** Reads the stored configuration; every field has an offline-safe default. */
	async loadConfig(): Promise<CloudConfig> {
		try {
			const [baseUrl, account, deviceId, plan] = await Promise.all([
				metaRepo.get(KEYS.baseUrl),
				metaRepo.get(KEYS.account),
				metaRepo.get(KEYS.deviceId),
				metaRepo.get(KEYS.plan),
			]);
			return {
				...DEFAULT_CLOUD_CONFIG,
				baseUrl: baseUrl ?? '',
				account: account ?? '',
				deviceId: deviceId ?? '',
				plan: asPlan(plan),
			};
		} catch {
			return { ...DEFAULT_CLOUD_CONFIG };
		}
	},

	/**
	 * Persists the base URL. Returns `boolean` so the caller surfaces a failed
	 * write instead of losing it silently (repo rule).
	 */
	async saveBaseUrl(baseUrl: string): Promise<boolean> {
		try {
			await metaRepo.set(KEYS.baseUrl, baseUrl);
			return true;
		} catch {
			return false;
		}
	},

	async saveAccount(account: string): Promise<boolean> {
		try {
			await metaRepo.set(KEYS.account, account);
			return true;
		} catch {
			return false;
		}
	},

	async saveDeviceId(deviceId: string): Promise<boolean> {
		try {
			await metaRepo.set(KEYS.deviceId, deviceId);
			return true;
		} catch {
			return false;
		}
	},

	async savePlan(plan: PlanId): Promise<boolean> {
		try {
			await metaRepo.set(KEYS.plan, plan);
			return true;
		} catch {
			return false;
		}
	},

	/** The effective mode, derived from configuration (no network involved). */
	mode(config: CloudConfig): CloudMode {
		return config.baseUrl ? 'connected' : 'disabled';
	},

	status(config: CloudConfig, status: Partial<CloudStatus> = {}): CloudStatus {
		return {
			configured: Boolean(config.baseUrl),
			signedIn: Boolean(config.baseUrl && config.account),
			reachable: false,
			account: config.account,
			lastCheckedAt: 0,
			...status,
		};
	},
};
