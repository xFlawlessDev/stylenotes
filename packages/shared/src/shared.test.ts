import { describe, expect, it } from 'vitest';
import { compareHlc, encodeHlc, parseHlc, tickHlc } from './hlc';
import { SYNC_PROTOCOL_VERSION } from './sync';
import { FREE_ENTITLEMENTS, cloudSyncEnabled, hasCapability } from './entitlements';

describe('hlc', () => {
	it('round-trips an encoded clock', () => {
		const encoded = encodeHlc(1788249600000, 3, 'device-a');
		expect(parseHlc(encoded)).toEqual({ physical: 1788249600000, counter: 3, deviceId: 'device-a' });
	});

	it('rejects malformed values instead of sorting them last', () => {
		for (const bad of ['', '1', 'a:b:c', '1:2:', '1:x:d', '1:2']) {
			expect(parseHlc(bad)).toBeNull();
		}
	});

	it('orders by physical, then counter, then device', () => {
		const a = encodeHlc(100, 0, 'a');
		const b = encodeHlc(100, 1, 'a');
		const c = encodeHlc(101, 0, 'a');
		const d = encodeHlc(100, 0, 'b');
		expect(compareHlc(a, b)).toBeLessThan(0);
		expect(compareHlc(b, c)).toBeLessThan(0);
		expect(compareHlc(a, d)).toBeLessThan(0);
	});

	it('sorts a missing clock oldest', () => {
		expect(compareHlc(null, encodeHlc(1, 0, 'a'))).toBeLessThan(0);
		expect(compareHlc(encodeHlc(1, 0, 'a'), null)).toBeGreaterThan(0);
		expect(compareHlc(null, null)).toBe(0);
	});

	it('is strictly monotonic when the wall clock stalls', () => {
		const first = tickHlc(null, 1000, 'd');
		const second = tickHlc(first, 1000, 'd');
		const third = tickHlc(second, 999, 'd');
		expect(compareHlc(first, second)).toBeLessThan(0);
		expect(compareHlc(second, third)).toBeLessThan(0);
		expect(parseHlc(second)?.counter).toBe(1);
	});

	it('jumps to wall time when the clock advances past the previous tick', () => {
		const first = tickHlc(null, 1000, 'd');
		const next = tickHlc(first, 5000, 'd');
		expect(parseHlc(next)).toMatchObject({ physical: 5000, counter: 0 });
	});
});

describe('sync contract', () => {
	it('pins a protocol version', () => {
		expect(SYNC_PROTOCOL_VERSION).toBeGreaterThan(0);
	});
});

describe('entitlements', () => {
	it('treats a logged-out install as the most restricted set', () => {
		expect(cloudSyncEnabled(FREE_ENTITLEMENTS)).toBe(false);
		expect(hasCapability(FREE_ENTITLEMENTS, 'cloud_sync')).toBe(false);
		expect(hasCapability(null, 'cloud_sync')).toBe(false);
	});

	it('reads capabilities as data', () => {
		const plus = { ...FREE_ENTITLEMENTS, capabilities: ['cloud_sync' as const], maxDevices: 3 };
		expect(cloudSyncEnabled(plus)).toBe(true);
	});
});
