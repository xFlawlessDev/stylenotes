/**
 * Custom version updater for `src-tauri/Cargo.toml`, wired up in `.versionrc.json`.
 *
 * `commit-and-tag-version` ships no TOML updater, so this module reads and
 * rewrites only the `version` field inside the crate's `[package]` section.
 * Every other line (dependencies, profiles, targets) is left byte-for-byte
 * untouched, including line endings.
 *
 * Contract expected by the release tool:
 *   readVersion(contents) -> semver string
 *   writeVersion(contents, version) -> new file contents
 */

/**
 * Matches `version = "x.y.z"`, stopping right after the closing quote and
 * never anchoring at end-of-line, so it works for LF and CRLF files alike and
 * keeps trailing comments intact.
 */
const VERSION_LINE = /^(\s*version\s*=\s*")([^"]+)(")/;

/**
 * @typedef {{ lines: string[], index: number, value: string }} VersionHit
 */

/**
 * Find the `version = "x.y.z"` line inside the `[package]` section only,
 * so version fields in `[dependencies]` inline tables are never touched.
 *
 * @param {string} contents
 * @returns {VersionHit | null}
 */
function findPackageVersion(contents) {
	const lines = contents.split('\n');
	let inPackage = false;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (/^\s*\[package\]\s*$/.test(line)) {
			inPackage = true;
			continue;
		}
		if (inPackage && /^\s*\[/.test(line)) break;
		if (!inPackage) continue;
		const match = VERSION_LINE.exec(line);
		if (match) return { lines, index, value: match[2] };
	}
	return null;
}

/**
 * @param {string} contents
 * @returns {string}
 */
function readVersion(contents) {
	const hit = findPackageVersion(contents);
	if (!hit) {
		throw new Error('Cargo.toml: no `version` field found in the [package] section');
	}
	return hit.value;
}

/**
 * @param {string} contents
 * @param {string} version
 * @returns {string}
 */
function writeVersion(contents, version) {
	const hit = findPackageVersion(contents);
	if (!hit) {
		throw new Error('Cargo.toml: no `version` field found in the [package] section');
	}
	hit.lines[hit.index] = hit.lines[hit.index].replace(VERSION_LINE, `$1${version}$3`);
	return hit.lines.join('\n');
}

module.exports = { readVersion, writeVersion };
