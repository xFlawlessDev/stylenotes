/**
 * Custom version updater for `src-tauri/tauri.conf.json`, wired up in `.versionrc.json`.
 *
 * The release tool's built-in `json` updater re-serializes the whole document,
 * which would expand inline arrays (`"scope": ["**"]`) and reformat unrelated
 * lines on every release. This module only rewrites the top-level `"version"`
 * line and leaves every other byte of the file untouched.
 *
 * Contract expected by the release tool:
 *   readVersion(contents) -> semver string
 *   writeVersion(contents, version) -> new file contents
 */

/**
 * Matches an indented `"version": "x.y.z"` line and captures its indentation.
 * Stops right after the closing quote and never anchors at end-of-line, so it
 * works for LF and CRLF files alike and keeps trailing commas/comments intact.
 */
const VERSION_LINE = /^(\s*)("version"\s*:\s*")([^"]+)(")/;

/**
 * @typedef {{ lines: string[], index: number, value: string }} VersionHit
 */

/**
 * Find the `"version"` line of the top-level object. The shallowest match
 * wins: nested keys are always indented deeper than top-level keys, so a
 * future nested `version` field (e.g. inside a plugin config) is never picked.
 *
 * @param {string} contents
 * @returns {VersionHit | null}
 */
function findVersion(contents) {
	const lines = contents.split('\n');
	/** @type {(VersionHit & { indent: number }) | null} */
	let best = null;
	for (let index = 0; index < lines.length; index++) {
		const match = VERSION_LINE.exec(lines[index]);
		if (!match) continue;
		if (!best || match[1].length < best.indent) {
			best = { lines, index, value: match[3], indent: match[1].length };
		}
	}
	return best;
}

/**
 * @param {string} contents
 * @returns {string}
 */
function readVersion(contents) {
	const hit = findVersion(contents);
	if (!hit) throw new Error('tauri.conf.json: no top-level "version" field found');
	return hit.value;
}

/**
 * @param {string} contents
 * @param {string} version
 * @returns {string}
 */
function writeVersion(contents, version) {
	const hit = findVersion(contents);
	if (!hit) throw new Error('tauri.conf.json: no top-level "version" field found');
	hit.lines[hit.index] = hit.lines[hit.index].replace(VERSION_LINE, `$1$2${version}$4`);
	return hit.lines.join('\n');
}

module.exports = { readVersion, writeVersion };
