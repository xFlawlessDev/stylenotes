/**
 * Custom version updater for `src-tauri/Cargo.lock`, wired up in `.versionrc.json`.
 *
 * This app ships binaries, so every release tag must contain a `Cargo.lock`
 * whose `stylenotes` entry matches the released version — otherwise builds
 * from the tag are not reproducible. Listing the lock file as a bump file is
 * also what makes the release tool `git add` and commit it automatically.
 *
 * The lock format always places `version` directly after `name` inside a
 * `[[package]]` block; only the block of the `stylenotes` crate is rewritten,
 * every other package entry stays byte-for-byte identical.
 *
 * Contract expected by the release tool:
 *   readVersion(contents) -> semver string
 *   writeVersion(contents, version) -> new file contents
 */

/** The `name = "stylenotes"` line of our own `[[package]]` block. */
const NAME_LINE = /^\s*name\s*=\s*"stylenotes"\s*$/;
/** Matches `version = "x.y.z"`, stopping right after the closing quote (LF and CRLF safe). */
const VERSION_LINE = /^(\s*version\s*=\s*")([^"]+)(")/;

/**
 * @typedef {{ lines: string[], index: number, value: string }} VersionHit
 */

/**
 * Find the `version` line of the `stylenotes` package block.
 *
 * @param {string} contents
 * @returns {VersionHit | null}
 */
function findLockVersion(contents) {
	const lines = contents.split('\n');
	for (let index = 0; index < lines.length; index++) {
		if (!NAME_LINE.test(lines[index])) continue;
		for (let next = index + 1; next < lines.length; next++) {
			if (/^\s*\[\[package\]\]/.test(lines[next])) break;
			const match = VERSION_LINE.exec(lines[next]);
			if (match) return { lines, index: next, value: match[2] };
		}
		return null;
	}
	return null;
}

/**
 * @param {string} contents
 * @returns {string}
 */
function readVersion(contents) {
	const hit = findLockVersion(contents);
	if (!hit) throw new Error('Cargo.lock: no `version` found for the "stylenotes" package block');
	return hit.value;
}

/**
 * @param {string} contents
 * @param {string} version
 * @returns {string}
 */
function writeVersion(contents, version) {
	const hit = findLockVersion(contents);
	if (!hit) throw new Error('Cargo.lock: no `version` found for the "stylenotes" package block');
	hit.lines[hit.index] = hit.lines[hit.index].replace(VERSION_LINE, `$1${version}$3`);
	return hit.lines.join('\n');
}

module.exports = { readVersion, writeVersion };
