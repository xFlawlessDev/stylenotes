import { describe, expect, it } from 'vitest';
import sharedPkg from '../../packages/shared/package.json';
import { SHARED_CONTRACT_VERSION } from '@stylenotes/shared';

/**
 * The shared contract is the one inter-repo coupling: the cloud pins a version
 * of `@stylenotes/shared`, and this test keeps the code constant and the package
 * manifest from drifting apart. Bump both together, never by hand elsewhere.
 */
describe('shared contract version', () => {
	it('matches packages/shared/package.json', () => {
		expect(sharedPkg.version).toBe(SHARED_CONTRACT_VERSION);
	});

	it('is a valid semantic version', () => {
		expect(SHARED_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
	});

	it('is published under the MIT license (third parties may build on it)', () => {
		expect(sharedPkg.license).toBe('MIT');
	});
});
