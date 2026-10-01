/**
 * The cloud HTTP seam — the only place the app talks to the cloud service.
 *
 * Kept tiny and framework-free so it can be unit-tested with an injected
 * `fetch`, and so the eventual sync engine plugs into the same base. No auth
 * header yet: account/session lands with the auth phase (`#21`), and until then
 * the only call is a reachability probe, which is harmless unauthenticated.
 */
import { isCloudConfigured, normalizeBaseUrl, type CloudConfig } from './cloud-types';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HealthResult = {
	ok: boolean;
	/** Plan the server reports for this device, when it answers with one. */
	plan?: string;
	/** HTTP status, or `0` when the request never completed (offline/DNS/TLS). */
	status: number;
	error?: string;
};

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Probes `GET {baseUrl}/health`. A failed probe is a normal outcome, not a
 * thrown error: the caller renders "unreachable" instead of crashing.
 */
export async function probeCloud(
	config: CloudConfig,
	fetchImpl: FetchLike = fetch,
	timeoutMs = 5000
): Promise<HealthResult> {
	if (!isCloudConfigured(config)) {
		return { ok: false, status: 0, error: 'not_configured' };
	}
	const url = `${normalizeBaseUrl(config.baseUrl)}/health`;
	const { signal, cancel } = withTimeout(timeoutMs);
	try {
		const response = await fetchImpl(url, { method: 'GET', signal, headers: { accept: 'application/json' } });
		if (!response.ok) return { ok: false, status: response.status, error: `http_${response.status}` };
		const body = (await response.json().catch(() => ({}))) as { plan?: unknown };
		return {
			ok: true,
			status: response.status,
			plan: typeof body.plan === 'string' ? body.plan : undefined,
		};
	} catch (error) {
		return { ok: false, status: 0, error: error instanceof Error ? error.message : 'request_failed' };
	} finally {
		cancel();
	}
}
