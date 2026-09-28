import type { VersionReason } from '$lib/content/version-types';

/** A version as the pruning logic sees it: only the fields that decide fate. */
export type RetentionCandidate = {
	id: string;
	/** Epoch ms the version was captured; the sort key. */
	updatedAt: number;
};

/** Defaults, kept here so the UI and the tests share one source of truth. */
export const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
export const AUTO_SNAPSHOT_RATIO = 0.4;
export const VERSION_HARD_CAP = 50;
export const VERSION_MAX_BYTES = 1024 * 1024;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type SnapshotInput = {
	/** When the latest stored version was captured, or null if none exists. */
	lastVersionAt: number | null;
	/** Length of the last versioned body/title, used for the change ratio. */
	lastLength: number;
	/** Length of the current, about-to-be-overwritten value. */
	currentLength: number;
	now: number;
	reason?: VersionReason;
};

/**
 * Decides whether the pre-edit value is worth keeping as a version — the
 * "Local History" time-gap rule: keep a cheap first version, then only when
 * enough time passed or the text changed substantially.
 */
export function shouldSnapshot(input: SnapshotInput): boolean {
	// An explicit reason always captures: close, manual, pre-mcp.
	if (input.reason && input.reason !== 'auto') return true;
	// Nothing stored yet: capture the first baseline.
	if (input.lastVersionAt === null) return true;
	if (input.now - input.lastVersionAt >= AUTO_SNAPSHOT_INTERVAL_MS) return true;
	const longest = Math.max(input.lastLength, input.currentLength, 1);
	return Math.abs(input.currentLength - input.lastLength) / longest >= AUTO_SNAPSHOT_RATIO;
}

/**
 * Picks which versions to keep, newest-first buckets then a hard cap:
 * every version from the last 24h, one per hour for the last week, one per day
 * beyond that, capped at `cap` newest overall.
 */
export function selectVersionsToKeep(
	versions: RetentionCandidate[],
	now: number,
	cap = VERSION_HARD_CAP
): Set<string> {
	const newestFirst = [...versions].sort((a, b) => b.updatedAt - a.updatedAt);
	const keep = new Set<string>();
	const seenHours = new Set<number>();
	const seenDays = new Set<number>();

	for (const version of newestFirst) {
		if (keep.size >= cap) break;
		const age = now - version.updatedAt;
		if (age < DAY_MS) {
			keep.add(version.id);
			continue;
		}
		if (age < 7 * DAY_MS) {
			const hour = Math.floor(version.updatedAt / HOUR_MS);
			if (seenHours.has(hour)) continue;
			seenHours.add(hour);
			keep.add(version.id);
			continue;
		}
		const day = Math.floor(version.updatedAt / DAY_MS);
		if (seenDays.has(day)) continue;
		seenDays.add(day);
		keep.add(version.id);
	}
	return keep;
}
