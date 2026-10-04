import { describe, expect, it } from 'vitest';
import {
	UPDATE_CHECK_INTERVAL_MS,
	compareVersions,
	isNewerVersion,
	shouldCheckForUpdate,
	updateNotificationId,
	versionFromUpdateId
} from '$lib/content/update-types';

describe('compareVersions', () => {
	it('orders numeric parts, ignoring a leading v', () => {
		expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
		expect(compareVersions('v1.3.0', '1.2.9')).toBeGreaterThan(0);
		expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
	});

	it('treats a missing part as zero', () => {
		expect(compareVersions('1.2', '1.2.0')).toBe(0);
		expect(compareVersions('2', '1.9.9')).toBeGreaterThan(0);
	});

	it('compares a prerelease on its numeric core', () => {
		expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(0);
	});
});

describe('isNewerVersion', () => {
	it('is true only for a strictly newer version', () => {
		expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true);
		expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
		expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false);
	});
});

describe('shouldCheckForUpdate', () => {
	const now = 1_000_000_000_000;

	it('is due when never checked', () => {
		expect(shouldCheckForUpdate(null, now)).toBe(true);
	});

	it('is not due inside the window, and due past it', () => {
		expect(shouldCheckForUpdate(now - 1000, now)).toBe(false);
		expect(shouldCheckForUpdate(now - UPDATE_CHECK_INTERVAL_MS, now)).toBe(true);
		expect(shouldCheckForUpdate(now - UPDATE_CHECK_INTERVAL_MS - 1, now)).toBe(true);
	});

	it('treats a nonsense stored value as never checked', () => {
		expect(shouldCheckForUpdate(Number.NaN, now)).toBe(true);
	});
});

describe('update notification ids', () => {
	it('round-trip a version', () => {
		const id = updateNotificationId('1.4.2');
		expect(id).toBe('n-update:1.4.2');
		expect(versionFromUpdateId(id)).toBe('1.4.2');
	});

	it('reject a foreign or empty id', () => {
		expect(versionFromUpdateId('n-memory')).toBeNull();
		expect(versionFromUpdateId('n-update:')).toBeNull();
	});
});
