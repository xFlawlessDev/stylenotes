/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import cargoLockUpdater from '../../scripts/cargo-lock-updater.cjs';
import cargoUpdater from '../../scripts/cargo-toml-updater.cjs';
import confUpdater from '../../scripts/json-conf-updater.cjs';
import cargoLock from '../../src-tauri/Cargo.lock?raw';
import cargoToml from '../../src-tauri/Cargo.toml?raw';
import conf from '../../src-tauri/tauri.conf.json';
import confRaw from '../../src-tauri/tauri.conf.json?raw';

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const BUMPED = '9.9.9';

type LineUpdater = {
	readVersion: (contents: string) => string;
	writeVersion: (contents: string, version: string) => string;
};

type Target = {
	file: string;
	contents: string;
	updater: LineUpdater;
	versionLine: string;
};

const asLf = (text: string): string => text.replace(/\r\n/g, '\n');
const asCrlf = (text: string): string => asLf(text).replace(/\n/g, '\r\n');

/**
 * `bun run release` bumps all four version files in lockstep
 * (see `.versionrc.json`); these tests fail if they ever drift apart.
 */
describe('version files', () => {
	it('hold the same version in package.json, tauri.conf.json, Cargo.toml, and Cargo.lock', () => {
		expect(conf.version).toBe(pkg.version);
		expect(cargoUpdater.readVersion(cargoToml)).toBe(pkg.version);
		expect(confUpdater.readVersion(confRaw)).toBe(pkg.version);
		expect(cargoLockUpdater.readVersion(cargoLock)).toBe(pkg.version);
	});

	it('hold a valid semantic version everywhere', () => {
		const versions = [
			pkg.version,
			conf.version,
			cargoUpdater.readVersion(cargoToml),
			confUpdater.readVersion(confRaw),
			cargoLockUpdater.readVersion(cargoLock)
		];
		for (const version of versions) expect(version).toMatch(SEMVER);
	});
});

const targets: Target[] = [
	{
		file: 'Cargo.toml updater',
		contents: cargoToml,
		updater: cargoUpdater,
		versionLine: `version = "${BUMPED}"`
	},
	{
		file: 'Cargo.lock updater',
		contents: cargoLock,
		updater: cargoLockUpdater,
		versionLine: `version = "${BUMPED}"`
	},
	{
		file: 'tauri.conf.json updater',
		contents: confRaw,
		updater: confUpdater,
		// the trailing comma of the JSON line must survive the rewrite
		versionLine: `"version": "${BUMPED}",`
	}
];

for (const target of targets) {
	describe(target.file, () => {
		it('reads the current version', () => {
			expect(target.updater.readVersion(target.contents)).toMatch(SEMVER);
		});

		it('rewrites only the version line, byte for byte elsewhere', () => {
			const bumped = target.updater.writeVersion(target.contents, BUMPED);
			expect(target.updater.readVersion(bumped)).toBe(BUMPED);

			const before = asLf(target.contents).split('\n');
			const after = asLf(bumped).split('\n');
			expect(after).toHaveLength(before.length);

			const changed = after.flatMap((line, i) => (line === before[i] ? [] : [i]));
			expect(changed).toHaveLength(1);
			expect(after[changed[0]].trim()).toBe(target.versionLine);
		});

		it('handles CRLF content (tauri.conf.json and Windows checkouts)', () => {
			const bumped = target.updater.writeVersion(asCrlf(target.contents), BUMPED);
			expect(target.updater.readVersion(bumped)).toBe(BUMPED);
			expect(asLf(bumped)).toBe(asLf(target.updater.writeVersion(target.contents, BUMPED)));
		});
	});
}

describe('cargo-toml-updater', () => {
	it('leaves dependency version declarations untouched', () => {
		const bumped = cargoUpdater.writeVersion(cargoToml, BUMPED);
		expect(bumped).toContain(
			'tauri = { version = "2", features = ["protocol-asset", "tray-icon"] }'
		);
		expect(bumped).toContain('tauri-plugin-sql = { version = "2.4.1", features = ["sqlite"] }');
	});
});

describe('cargo-lock-updater', () => {
	it('rewrites only the stylenotes block, never another package', () => {
		const bumped = cargoLockUpdater.writeVersion(cargoLock, BUMPED);
		const occurrences = bumped.split(`version = "${BUMPED}"`).length - 1;
		expect(occurrences).toBe(1);
	});
});

describe('json-conf-updater', () => {
	it('preserves inline arrays that a JSON re-serialization would expand', () => {
		const bumped = confUpdater.writeVersion(confRaw, BUMPED);
		expect(bumped).toContain('"scope": ["**"]');
		expect(bumped).toContain('"preload": ["sqlite:stylenotes.db"]');
	});

	it('prefers the shallowest (top-level) version over nested ones', () => {
		const synthetic = [
			'{',
			'  "version": "1.2.3",',
			'  "plugins": {',
			'    "updater": {',
			'      "version": "9.9.9"',
			'    }',
			'  }',
			'}',
			''
		].join('\n');
		expect(confUpdater.readVersion(synthetic)).toBe('1.2.3');

		const bumped = confUpdater.writeVersion(synthetic, '2.0.0');
		expect(bumped).toContain('"version": "2.0.0",');
		expect(bumped).toContain('"version": "9.9.9"');
	});
});
