import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_CLOUD_CONFIG,
	effectiveEntitlements,
	isCloudConfigured,
	isSignedIn,
	isValidBaseUrl,
	normalizeBaseUrl,
	type CloudConfig,
} from './cloud-types';
import { probeCloud } from './cloud-client';

const configured: CloudConfig = {
	...DEFAULT_CLOUD_CONFIG,
	baseUrl: 'https://api.stylenotes.app',
	account: 'me@example.com',
	deviceId: 'dev-1',
	plan: 'plus',
};

describe('cloud base URL', () => {
	it('normalises a bare host to https and strips a trailing slash', () => {
		expect(normalizeBaseUrl(' api.stylenotes.app/ ')).toBe('https://api.stylenotes.app');
		expect(normalizeBaseUrl('http://localhost:3000/')).toBe('http://localhost:3000');
		expect(normalizeBaseUrl('')).toBe('');
	});

	it('accepts http(s) origins and rejects anything else', () => {
		expect(isValidBaseUrl('api.stylenotes.app')).toBe(true);
		expect(isValidBaseUrl('ftp://x')).toBe(false);
		expect(isValidBaseUrl('')).toBe(false);
	});
});

describe('cloud config predicates', () => {
	it('is off until a server URL exists', () => {
		expect(isCloudConfigured(DEFAULT_CLOUD_CONFIG)).toBe(false);
		expect(isSignedIn(DEFAULT_CLOUD_CONFIG)).toBe(false);
		expect(isCloudConfigured(configured)).toBe(true);
		expect(isSignedIn(configured)).toBe(true);
	});

	it('uses the most restricted entitlements while offline/unauthenticated', () => {
		expect(effectiveEntitlements(DEFAULT_CLOUD_CONFIG).plan).toBe('free');
		expect(effectiveEntitlements(DEFAULT_CLOUD_CONFIG).capabilities).toEqual([]);
		// Configured + signed in reflects the reported plan, but still no assumed caps.
		expect(effectiveEntitlements(configured).plan).toBe('plus');
	});
});

describe('probeCloud', () => {
	it('does not call fetch when no server is configured', async () => {
		const fetchImpl = vi.fn();
		const result = await probeCloud(DEFAULT_CLOUD_CONFIG, fetchImpl);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(result).toEqual({ ok: false, status: 0, error: 'not_configured' });
	});

	it('reports ok and a plan on a 200', async () => {
		const fetchImpl = (async () => new Response(JSON.stringify({ plan: 'pro' }), { status: 200 })) as never;
		const result = await probeCloud(configured, fetchImpl);
		expect(result).toMatchObject({ ok: true, status: 200, plan: 'pro' });
	});

	it('returns a non-throwing failure on a bad status', async () => {
		const fetchImpl = (async () => new Response('', { status: 503 })) as never;
		const result = await probeCloud(configured, fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.status).toBe(503);
	});

	it('returns a non-throwing failure when the request throws', async () => {
		const fetchImpl = (async () => {
			throw new Error('offline');
		}) as never;
		const result = await probeCloud(configured, fetchImpl);
		expect(result).toMatchObject({ ok: false, status: 0, error: 'offline' });
	});
});
