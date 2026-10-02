/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import cargoToml from '../../src-tauri/Cargo.toml?raw';
import { MIN_ORT_MINOR, ORT_VERSION, releaseAsset, releaseUrl } from '../../scripts/onnx-runtime.cjs';

/** Pulls `version = "x.y.z"` for the `ort` dependency out of Cargo.toml. */
function ortVersion(cargo: string): string | null {
	const match = cargo.match(/^\s*ort\s*=\s*\{[^}]*version\s*=\s*"=?([^",]+)"?/m);
	return match?.[1] ?? null;
}

/** The `api-NN` features the `ort` pin enables, if listed explicitly. */
function ortApiFeatures(cargo: string): number[] {
	const line = cargo.match(/^\s*ort\s*=\s*\{[^}]*\}/m)?.[0] ?? '';
	return [...line.matchAll(/api-(\d+)/g)].map((match) => Number.parseInt(match[1], 10));
}

/**
 * The ONNX Runtime bootstrap is only correct if its pinned runtime satisfies the
 * API revision `ort` was compiled against. `ort` requests `GetApi(ORT_API_VERSION)`,
 * and an older runtime returns a null pointer that hangs the app — the exact
 * failure that shipped when the runtime was pinned at 1.20 against an `ort`
 * built for 1.24. These tests fail before that can happen again.
 */
describe('onnx runtime pin', () => {
	it('pins a runtime at least as new as the ort API revision', () => {
		const minor = Number.parseInt(ORT_VERSION.split('.')[1] ?? '0', 10);
		expect(minor).toBeGreaterThanOrEqual(MIN_ORT_MINOR);
	});

	it('keeps MIN_ORT_MINOR in step with the ort crate’s api-NN features', () => {
		const cargo = cargoToml as string;
		const pinned = ortVersion(cargo);
		expect(pinned, 'ort must be pinned in Cargo.toml').toBeTruthy();

		const explicit = ortApiFeatures(cargo);
		if (explicit.length > 0) {
			// An explicit api-NN in Cargo.toml is the authority.
			expect(Math.max(...explicit)).toBe(MIN_ORT_MINOR);
		} else {
			// No explicit api-NN: `ort`'s own default applies. For the rc.12 pin
			// that default is api-24. This assertion is the tripwire: bumping
			// `ort` past rc.12 must revisit MIN_ORT_MINOR and ORT_VERSION.
			expect(pinned).toBe('2.0.0-rc.12');
		}
	});
});

/**
 * ONNX Runtime release names are not uniform across platforms. A wrong guess
 * only fails at download time on the affected platform, so the mapping is
 * pinned here.
 */
describe('onnx runtime release assets', () => {
	it('uses .zip on Windows and only the architectures the vendor builds', () => {
		expect(releaseAsset('win32', 'x64')).toEqual({
			name: `onnxruntime-win-x64-${ORT_VERSION}.zip`,
			kind: 'zip',
		});
		expect(releaseAsset('win32', 'arm64')).toEqual({
			name: `onnxruntime-win-arm64-${ORT_VERSION}.zip`,
			kind: 'zip',
		});
		// No 32-bit Windows build is published for current releases.
		expect(releaseAsset('win32', 'ia32')).toBeNull();
	});

	it('uses .tgz and aarch64 (not arm64) on Linux', () => {
		expect(releaseAsset('linux', 'x64')).toEqual({
			name: `onnxruntime-linux-x64-${ORT_VERSION}.tgz`,
			kind: 'tgz',
		});
		// The vendor spells 64-bit ARM `aarch64`; `arm64` would 404.
		expect(releaseAsset('linux', 'arm64')?.name).toContain('aarch64');
	});

	it('offers macOS only for Apple silicon (Intel was dropped after 1.23)', () => {
		expect(releaseAsset('darwin', 'arm64')).toEqual({
			name: `onnxruntime-osx-arm64-${ORT_VERSION}.tgz`,
			kind: 'tgz',
		});
		expect(releaseAsset('darwin', 'x64')).toBeNull();
	});

	it('builds a release URL that names the pinned tag', () => {
		expect(releaseUrl('x.zip')).toBe(
			`https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/x.zip`,
		);
	});
});

