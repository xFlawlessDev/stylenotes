#!/usr/bin/env node
/**
 * Pure platform/version logic for the ONNX Runtime bootstrap.
 *
 * Kept separate from `setup-onnx.cjs` (which does I/O and self-executes) so the
 * asset-name mapping can be unit-tested: ONNX Runtime's release names are not
 * uniform, and getting one wrong fails only at download time on that platform.
 *
 * `ORT_VERSION` must be at least `MIN_ORT_MINOR`: `ort` is compiled with
 * `api-24`, so it requests `GetApi(24)`, and an older runtime hands back a null
 * API pointer that leaves the app hanging before its window paints.
 */

const ORT_VERSION = '1.30.0';

/** The minimum ONNX Runtime minor version `ort` asks for (see `api-24`). */
const MIN_ORT_MINOR = 24;

/**
 * The main library filename `embed/onnx/runtime.rs` looks for.
 *
 * @param {NodeJS.Platform} platform
 * @returns {string}
 */
function libraryName(platform) {
	if (platform === 'win32') return 'onnxruntime.dll';
	if (platform === 'darwin') return 'libonnxruntime.dylib';
	return 'libonnxruntime.so';
}

/**
 * The shared-provider library that must sit beside the main one.
 *
 * @param {NodeJS.Platform} platform
 * @returns {string}
 */
function providerLibraryName(platform) {
	if (platform === 'win32') return 'onnxruntime_providers_shared.dll';
	if (platform === 'darwin') return 'libonnxruntime_providers_shared.dylib';
	return 'libonnxruntime_providers_shared.so';
}

/**
 * @typedef {{ name: string, kind: 'zip' | 'tgz' }} ReleaseAsset
 */

/**
 * The release asset for a platform/arch, or `null` when the vendor publishes
 * none.
 *
 * Names are not uniform:
 *   - Windows: `.zip`, and only `x64`/`arm64` (no 32-bit build).
 *   - Linux: `.tgz`, and 64-bit ARM is spelled `aarch64`, not `arm64`.
 *   - macOS: `.tgz`, Apple-silicon only now — the Intel `osx-x86_64` build was
 *     dropped after 1.23, and `ort` needs 1.24+, so an Intel Mac has none.
 *
 * @param {NodeJS.Platform} platform
 * @param {string} arch
 * @returns {ReleaseAsset | null}
 */
function releaseAsset(platform, arch) {
	if (platform === 'win32') {
		if (arch === 'arm64') return { name: `onnxruntime-win-arm64-${ORT_VERSION}.zip`, kind: 'zip' };
		if (arch === 'x64') return { name: `onnxruntime-win-x64-${ORT_VERSION}.zip`, kind: 'zip' };
		return null;
	}
	if (platform === 'darwin') {
		if (arch !== 'arm64') return null;
		return { name: `onnxruntime-osx-arm64-${ORT_VERSION}.tgz`, kind: 'tgz' };
	}
	const cpu = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x64' : null;
	if (!cpu) return null;
	return { name: `onnxruntime-linux-${cpu}-${ORT_VERSION}.tgz`, kind: 'tgz' };
}

/**
 * The release download URL for an asset, given its `name`.
 *
 * @param {string} name
 * @returns {string}
 */
function releaseUrl(name) {
	return `https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/${name}`;
}

module.exports = {
	ORT_VERSION,
	MIN_ORT_MINOR,
	libraryName,
	providerLibraryName,
	releaseAsset,
	releaseUrl,
};
