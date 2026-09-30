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
 * Failure is not fatal: the app still starts and reports the model as
 * unavailable. It only means the local embedder cannot run until the library is
 * present, which is exactly the degradation the design asks for.
 */

const { execFileSync } = require('node:child_process');
const { copyFileSync, existsSync, readdirSync, statSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { platform, arch } = require('node:process');

const repoRoot = resolve(__dirname, '..');
const target = join(repoRoot, 'src-tauri');

/** The filename `runtime.rs` looks for, per platform. */
function libraryName() {
	if (platform === 'win32') return 'onnxruntime.dll';
	if (platform === 'darwin') return 'libonnxruntime.dylib';
	return 'libonnxruntime.so';
}

/** The release asset matching this platform/arch, for the download fallback. */
function releaseAsset() {
	const os = platform === 'win32' ? 'win' : platform === 'darwin' ? 'osx' : 'linux';
	const cpu = arch === 'arm64' ? 'arm64' : 'x64';
	return `onnxruntime-${os}-${cpu}-1.20.1.zip`;
}

const LIB = libraryName();
const DEST = join(target, LIB);

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

// 1. Explicit override.
if (process.env.ORT_DYLIB_PATH && existsSync(process.env.ORT_DYLIB_PATH)) {
	copyFileSync(process.env.ORT_DYLIB_PATH, DEST);
	done('ORT_DYLIB_PATH');
}

// 2. Already placed (a no-op re-run, or a CI-provided copy).
if (existsSync(DEST) && statSync(DEST).size > 1_000_000) {
	done('an existing copy');
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
	if (existsSync(candidate)) {
		copyFileSync(candidate, DEST);
		done(candidate);
	}
}

// 4. Known sibling builds (the reference `alnair-onnx` project bundles one).
function searchDir(dir, depth) {
	if (depth > 4 || !existsSync(dir)) return null;
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return null;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isFile() && entry.name === LIB) return full;
		if (entry.isDirectory()) {
			const found = searchDir(full, depth + 1);
			if (found) return found;
		}
	}
	return null;
}

const siblingRoots = [
	resolve(repoRoot, '..', 'Alnair_Project', 'alnair-ai', 'dist', 'release'),
];
for (const root of siblingRoots) {
	const found = searchDir(root, 0);
	if (found) {
		copyFileSync(found, DEST);
		done(found);
	}
}

// 5. Download from the onnxruntime release when the network is reachable.
async function download() {
	const version = '1.20.1';
	const asset = releaseAsset();
	const url = `https://github.com/microsoft/onnxruntime/releases/download/v${version}/${asset}`;
	log(`downloading ${asset} …`);
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
	const archive = Buffer.from(await response.arrayBuffer());
	const tmp = join(target, `${asset}.tmp`);
	writeFileSync(tmp, archive);
	log(`downloaded ${(archive.length / 1_048_576).toFixed(1)} MB; extracting …`);
	// Extraction uses the platform's own unzip: adding a zip dependency to a
	// build script is not worth it.
	const extractDir = join(target, 'ort-extract');
	if (platform === 'win32') {
		execFileSync('powershell', [
			'-NoProfile',
			'-Command',
			`Expand-Archive -LiteralPath '${tmp}' -DestinationPath '${extractDir}' -Force`,
		]);
	} else {
		execFileSync('unzip', ['-o', tmp, '-d', extractDir]);
	}
	const found = searchDir(extractDir, 0);
	if (!found) throw new Error('the archive did not contain the library');
	copyFileSync(found, DEST);
	done('the onnxruntime release');
}

download().catch((error) => {
	skip(`no local copy found and the download failed (${error.message})`);
});
