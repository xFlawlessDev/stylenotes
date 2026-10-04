#!/usr/bin/env node
/**
 * Ensures the ONNX Runtime dynamic library sits beside the app binary.
 *
 * The local embedder uses `load-dynamic`: `ort` does not link ONNX Runtime, it
 * loads `onnxruntime.dll` / `libonnxruntime.so` / `libonnxruntime.dylib` at
 * runtime from a path discovered next to the executable (see
 * `src-tauri/src/embed/onnx/runtime.rs`). Nothing ships that binary in the repo,
 * so this script finds a compatible copy and places it where discovery looks.
 *
 * Sources, in order:
 *   1. `ORT_DYLIB_PATH` — an explicit override for CI or a custom build.
 *   2. A previously placed copy in `src-tauri/` (a no-op re-run).
 *   3. A Python `onnxruntime` install (the most common local source).
 *   4. A sibling build directory that happens to bundle one.
 *   5. A downloaded release archive from the onnxruntime GitHub releases.
 *
 * The asset differs per platform: Windows ships `.zip`, Linux and macOS ship
 * `.tgz`, and the macOS filename is `osx-arm64` (Apple silicon). The download is
 * skipped with a clear message when the vendor publishes no build for this
 * platform/arch (Intel macOS after 1.23, for instance).
 *
 * Failure is not fatal: the app still starts and reports the model as
 * unavailable. It only means the local embedder cannot run until the library is
 * present, which is exactly the degradation the design asks for.
 */

const { execFileSync } = require('node:child_process');
const {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { platform, arch } = require('node:process');
const {
	ORT_VERSION,
	libraryName,
	providerLibraryName,
	releaseAsset: releaseAssetFor,
	releaseUrl,
} = require('./onnx-runtime.cjs');

const repoRoot = resolve(__dirname, '..');
const target = join(repoRoot, 'src-tauri');

/** This host's release asset, or `null` when the vendor publishes none. */
function releaseAsset() {
	return releaseAssetFor(platform, arch);
}

const LIB = libraryName(platform);
const PROVIDER_LIB = providerLibraryName(platform);
const DEST = join(target, LIB);
const PROVIDER_DEST = join(target, PROVIDER_LIB);

function log(message) {
	process.stdout.write(`[setup:onnx] ${message}\n`);
}

function done(source) {
	log(`ready: ${DEST} (from ${source})`);
	process.exit(0);
}

function skip(reason) {
	log(`skipped: ${reason}`);
	log('The app still starts; the local embedder will report the model unavailable.');
	process.exit(0);
}

/** Copies a found runtime into place, bringing its shared provider if present. */
function place(source) {
	copyFileSync(source, DEST);
	const provider = join(dirname(source), PROVIDER_LIB);
	if (existsSync(provider)) copyFileSync(provider, PROVIDER_DEST);
}

/**
 * Whether a library is the revision we pin.
 *
 * A local source (a Python install, a sibling build, a leftover copy) is only
 * accepted when it carries the pinned version string. A looser `>= 1.24` test
 * looked safer but scans arbitrary binary bytes, where an unrelated `1.NN.PP`
 * match can pass a too-old runtime through — and a too-old runtime does not
 * error, it hangs `ort` on a null API pointer. Exactness is the safe choice.
 */
function isPinnedVersion(path) {
	try {
		// The version string (e.g. "1.30.0") is embedded as plain text in both
		// the PE and ELF/Mach-O builds; a substring scan avoids a per-platform
		// version-info reader.
		return readFileSync(path).toString('latin1').includes(ORT_VERSION);
	} catch {
		return false;
	}
}

/**
 * The first library file at or under `dir`, preferring an exact `LIB` match and
 * falling back to a versioned Linux name (`libonnxruntime.so.1.30.0`).
 *
 * Symlinks are accepted because the release archives ship `libonnxruntime.so`
 * as a symlink to the real, versioned file.
 */
function findLibrary(dir, depth = 0) {
	if (depth > 6 || !existsSync(dir)) return null;
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return null;
	}
	let versioned = null;
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if ((entry.isFile() || entry.isSymbolicLink()) && entry.name === LIB) return full;
		if (entry.isFile() && entry.name.startsWith(`${LIB}.`)) versioned ??= full;
		if (entry.isDirectory() && !entry.name.startsWith('.')) {
			const found = findLibrary(full, depth + 1);
			if (found) return found;
		}
	}
	return versioned;
}

// 1. Explicit override.
if (process.env.ORT_DYLIB_PATH && existsSync(process.env.ORT_DYLIB_PATH)) {
	place(process.env.ORT_DYLIB_PATH);
	done('ORT_DYLIB_PATH');
}

// 2. Already placed and current (a no-op re-run, or a CI-provided copy). A copy
// from an older pin is removed so the download below can replace it.
if (existsSync(DEST) && statSync(DEST).size > 1_000_000) {
	if (isPinnedVersion(DEST)) {
		done('an existing copy');
	}
	log(`existing copy is not ${ORT_VERSION}; refreshing`);
	rmSync(DEST, { force: true });
	rmSync(PROVIDER_DEST, { force: true });
	// A stale extraction would otherwise be found again in step 5's search.
	rmSync(join(target, 'ort-extract'), { recursive: true, force: true });
}

// 3. A Python onnxruntime install. Its `capi/` directory holds the shared lib.
function pythonCandidates() {
	const candidates = [];
	for (const executable of ['python3', 'python', 'py']) {
		try {
			const output = execFileSync(
				executable,
				['-c', 'import onnxruntime, os; print(os.path.dirname(onnxruntime.__file__))'],
				{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 },
			).trim();
			if (!output) continue;
			candidates.push(join(output, 'capi', LIB));
			candidates.push(join(output, LIB));
		} catch {
			/* that interpreter is absent or has no onnxruntime */
		}
	}
	const prefix = process.env.VIRTUAL_ENV;
	if (prefix) {
		candidates.push(join(prefix, 'Lib', 'site-packages', 'onnxruntime', 'capi', LIB));
	}
	return candidates;
}

for (const candidate of pythonCandidates()) {
	if (!existsSync(candidate)) continue;
	if (!isPinnedVersion(candidate)) {
		log(`ignoring ${candidate}: not ONNX Runtime ${ORT_VERSION}; will try the release`);
		continue;
	}
	place(candidate);
	done(candidate);
}

// 4. Known sibling builds (the reference `alnair-onnx` project bundles one).
const siblingRoots = [
	resolve(repoRoot, '..', 'Alnair_Project', 'alnair-ai', 'dist', 'release'),
];
for (const root of siblingRoots) {
	const found = findLibrary(root, 0);
	if (!found) continue;
	if (!isPinnedVersion(found)) {
		log(`ignoring ${found}: not ONNX Runtime ${ORT_VERSION}; will try the release`);
		continue;
	}
	place(found);
	done(found);
}

// 5. Download from the onnxruntime release when the network is reachable.
async function download() {
	const asset = releaseAsset();
	if (!asset) {
		skip(`no ONNX Runtime ${ORT_VERSION} build for ${platform}-${arch}`);
		return;
	}
	const url = releaseUrl(asset.name);
	log(`downloading ${asset.name} …`);
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
	const archive = Buffer.from(await response.arrayBuffer());
	const tmp = join(target, `${asset.name}.tmp`);
	writeFileSync(tmp, archive);
	log(`downloaded ${(archive.length / 1_048_576).toFixed(1)} MB; extracting …`);
	// Extraction uses the platform's own tooling: adding a zip/tar dependency to
	// a build script is not worth it. Windows archives are `.zip`; the rest are
	// `.tgz`, which the system `tar` handles everywhere.
	const extractDir = join(target, 'ort-extract');
	// Clear any earlier extraction so a previous pin cannot be found here, then
	// recreate it: GNU tar (Linux) and bsdtar (macOS) abort when `-C` names a
	// directory that does not exist, while `Expand-Archive` creates its own — so
	// without this the download only worked on Windows.
	rmSync(extractDir, { recursive: true, force: true });
	mkdirSync(extractDir, { recursive: true });
	if (asset.kind === 'zip') {
		execFileSync('powershell', [
			'-NoProfile',
			'-Command',
			`Expand-Archive -LiteralPath '${tmp}' -DestinationPath '${extractDir}' -Force`,
		]);
	} else {
		execFileSync('tar', ['-xzf', tmp, '-C', extractDir]);
	}
	const found = findLibrary(extractDir, 0);
	if (!found) throw new Error('the archive did not contain the library');
	if (!isPinnedVersion(found)) {
		throw new Error(`the archive did not contain ONNX Runtime ${ORT_VERSION}`);
	}
	place(found);
	// The archive is ~80 MB; keep it only while it is needed.
	rmSync(tmp, { force: true });
	rmSync(extractDir, { recursive: true, force: true });
	done('the onnxruntime release');
}

download().catch((error) => {
	skip(`no local copy found and the download failed (${error.message})`);
});
