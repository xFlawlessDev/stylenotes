/**
 * The updater's shared contract: the release a check reports, the parsed
 * changelog shape, the `meta` keys that keep checks and notifications to one,
 * and the semver comparison the rest of the app keys off.
 *
 * Pure and framework-free so it can be unit-tested without a running app; the
 * network side lives in `content/updater.ts` and the reactive side in
 * `stores/update.svelte.ts`.
 */

/** A release the updater announced, flattened for the UI. */
export type ReleaseInfo = {
	/** The version the server offers, e.g. `0.2.0`. */
	version: string;
	/** The version currently running. */
	currentVersion: string;
	/** RFC 3339 publish date, when the manifest carried one. */
	date?: string;
	/** Release notes from the manifest; may be empty. */
	notes: string;
};

/** A `### Features` (or similar) group inside a changelog entry. */
export type ChangelogSection = {
	title: string;
	items: string[];
};

/** One released version in `CHANGELOG.md`. */
export type ChangelogEntry = {
	version: string;
	/** Release date as written, e.g. `2026-10-02`; empty when unknown. */
	date: string;
	sections: ChangelogSection[];
	/** True for the repository's `[Unreleased]` block. */
	unreleased?: boolean;
};

/** Prefix of the notification the app raises for a new version. */
export const UPDATE_NOTIFICATION_PREFIX = 'n-update:';

/**
 * Device-local `meta` keys. `lastCheck` throttles the background sweep to once
 * a day; `notifiedVersion` keeps a version from being announced twice even if
 * the notification was cleared.
 */
export const UPDATE_META_KEYS = {
	lastCheck: 'meta:update/last-check',
	notifiedVersion: 'meta:update/notified-version',
} as const;

/** How long between automatic checks. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Delay after launch before the first check, so it never competes with boot. */
export const UPDATE_INITIAL_DELAY_MS = 8 * 1000;

/** The notification id for a version, so its copy can be re-localized. */
export function updateNotificationId(version: string): string {
	return `${UPDATE_NOTIFICATION_PREFIX}${version}`;
}

/**
 * The version encoded in an update notification id, or `null` when the id is
 * not one the updater owns.
 */
export function versionFromUpdateId(id: string): string | null {
	if (!id.startsWith(UPDATE_NOTIFICATION_PREFIX)) return null;
	const version = id.slice(UPDATE_NOTIFICATION_PREFIX.length);
	return version || null;
}

/**
 * Numeric parts of a semver string, ignoring a leading `v`. A prerelease
 * (`1.2.3-beta.1`) compares on its numeric core only, which is enough here.
 */
function parts(version: string): number[] {
	const core = version.replace(/^v/i, '').split(/[-+]/)[0];
	return core
		.split('.')
		.map((value) => Number.parseInt(value, 10))
		.map((value) => (Number.isFinite(value) ? value : 0));
}

/** Standard semver ordering: negative when `a < b`, positive when `a > b`. */
export function compareVersions(a: string, b: string): number {
	const left = parts(a);
	const right = parts(b);
	for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
		const diff = (left[i] ?? 0) - (right[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

/** Whether `candidate` is strictly newer than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
	return compareVersions(candidate, current) > 0;
}

/**
 * Whether the daily sweep is due. A missing timestamp (first run) is due; so is
 * a clock that has moved backwards far enough to make the stored value look
 * like the future.
 */
export function shouldCheckForUpdate(
	lastCheckMs: number | null,
	now: number,
	interval: number = UPDATE_CHECK_INTERVAL_MS
): boolean {
	if (lastCheckMs === null || !Number.isFinite(lastCheckMs)) return true;
	return now - lastCheckMs >= interval;
}
