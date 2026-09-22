import { describe, expect, it } from 'vitest';
import conf from '../../src-tauri/tauri.conf.json';
import { appInfo } from '$lib/app-info';

describe('appInfo', () => {
	it('mirrors tauri.conf.json so the About panel has one source of truth', () => {
		expect(appInfo.name).toBe(conf.productName);
		expect(appInfo.version).toBe(conf.version);
		expect(appInfo.description).toBe(conf.bundle.longDescription);
	});

	it('exposes a semver version and a real description', () => {
		expect(appInfo.version).toMatch(/^\d+\.\d+\.\d+/);
		expect(appInfo.description.length).toBeGreaterThan(20);
	});
});
