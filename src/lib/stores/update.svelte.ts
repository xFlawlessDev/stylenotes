import { browser } from '$app/environment';
import type { Update } from '@tauri-apps/plugin-updater';
import { metaRepo } from '$lib/db/meta';
import { isTauri } from '$lib/windows';
import type { AppNotification } from '$lib/stores/notifications';
import {
	UPDATE_CHECK_INTERVAL_MS,
	UPDATE_INITIAL_DELAY_MS,
	UPDATE_META_KEYS,
	isNewerVersion,
	shouldCheckForUpdate,
	updateNotificationId,
	type ReleaseInfo
} from '$lib/content/update-types';
import {
	checkForUpdate,
	installUpdate,
	type UpdateProgress
} from '$lib/content/updater';

/**
 * The updater's reactive face: whether a check is running, the release it found,
 * download progress, and the one-place install entry point. The About panel and
 * the notification panel both read this; only the workspace window runs the
 * background sweep (`startUpdateChecks`).
 *
 * The raw plugin `Update` handle is a Rust-side resource, so it is kept out of
 * the reactive proxy (Tauri resources do not survive proxying) and referenced
 * only by `installPendingUpdate()`.
 */

export const updateStore = $state<{
	/** A check is in flight. */
	checking: boolean;
	/** The release an available check reported, or null. */
	release: ReleaseInfo | null;
	/** Why the last check failed, or null. */
	error: string | null;
	/** Download progress while installing, or null. */
	progress: UpdateProgress | null;
	/** An install is in flight. */
	installing: boolean;
	/** A version the user dismissed; hides the banner until a newer one. */
	dismissed: string | null;
	/** Timestamp (ms) of the last completed check. */
	lastChecked: number | null;
}>({
	checking: false,
	release: null,
	error: null,
	progress: null,
	installing: false,
	dismissed: null,
	lastChecked: null
});

/** The live plugin handle behind `updateStore.release`; never reactive. */
let pendingUpdate: Update | null = null;

let lastCheckHydrated = false;

/** Loads the stored last-check time once, so a restart does not re-check early. */
async function hydrateLastCheck(): Promise<void> {
	if (lastCheckHydrated) return;
	lastCheckHydrated = true;
	try {
		const raw = await metaRepo.get(UPDATE_META_KEYS.lastCheck);
		const parsed = raw ? Number.parseInt(raw, 10) : NaN;
		if (Number.isFinite(parsed)) updateStore.lastChecked = parsed;
	} catch {
		/* no database: treat as never checked */
	}
}

/**
 * Runs one check and records the outcome. Returns the raw result so callers can
 * decide whether to notify; never throws.
 */
async function runCheck() {
	updateStore.checking = true;
	updateStore.error = null;
	const result = await checkForUpdate();
	updateStore.checking = false;
	updateStore.lastChecked = Date.now();
	void metaRepo
		.set(UPDATE_META_KEYS.lastCheck, String(updateStore.lastChecked))
		.catch(() => undefined);

	if (result.status === 'available') {
		pendingUpdate = result.update;
		updateStore.release = result.release;
		updateStore.error = null;
	} else {
		pendingUpdate = null;
		updateStore.release = null;
		updateStore.error = result.status === 'unavailable' ? result.error : null;
	}
	return result;
}

/**
 * User-triggered check from Settings → About. Always hits the network, even
 * inside the daily window, and refreshes the last-check stamp.
 */
export async function checkNow(): Promise<void> {
	if (updateStore.checking || updateStore.installing) return;
	await runCheck();
}

/** Hides the banner for this release until a newer one appears. */
export function dismissUpdate(version: string): void {
	updateStore.dismissed = version;
}

/**
 * Downloads and installs the pending release, reporting progress. On success the
 * app relaunches into the new build, so this normally never resolves.
 */
export async function installPendingUpdate(): Promise<void> {
	if (!pendingUpdate || updateStore.installing) return;
	updateStore.installing = true;
	updateStore.progress = { phase: 'downloading', downloaded: 0, total: null };
	try {
		await installUpdate(pendingUpdate, (progress) => {
			updateStore.progress = progress;
		});
	} finally {
		updateStore.installing = false;
	}
}

/**
 * Raises the "new version" notification at most once per version, guarded by a
 * `meta` key rather than the list (which can be cleared) — the same arrangement
 * as the memory nudge. The stored text is English; the panel re-localizes it by
 * id through `seedNotificationText`.
 */
async function notifyOnce(release: ReleaseInfo, raise: (notification: AppNotification) => void) {
	try {
		const seen = await metaRepo.get(UPDATE_META_KEYS.notifiedVersion);
		if (seen && !isNewerVersion(release.version, seen)) return;
		await metaRepo.set(UPDATE_META_KEYS.notifiedVersion, release.version);
	} catch {
		return;
	}
	raise({
		id: updateNotificationId(release.version),
		kind: 'update',
		title: `Version ${release.version} is available`,
		body: 'A new version of StyleNotes is ready. Open Settings → About to install it.',
		time: 'Just now',
		read: false
	});
}

/**
 * The background sweep: check at most once a day, and announce an available
 * release once. Safe to call on every launch and on a timer.
 */
export async function maybeCheckForUpdate(
	raise: (notification: AppNotification) => void
): Promise<void> {
	if (!browser || !isTauri) return;
	if (updateStore.checking || updateStore.installing) return;
	await hydrateLastCheck();
	if (!shouldCheckForUpdate(updateStore.lastChecked, Date.now(), UPDATE_CHECK_INTERVAL_MS)) return;
	const result = await runCheck();
	if (result.status === 'available') await notifyOnce(result.release, raise);
}

/**
 * Schedules the launch check and the daily backstop for the workspace window.
 * Returns a cleanup that cancels both timers.
 */
export function startUpdateChecks(
	raise: (notification: AppNotification) => void
): () => void {
	if (!browser || !isTauri) return () => undefined;
	let disposed = false;
	const initial = setTimeout(() => {
		if (!disposed) void maybeCheckForUpdate(raise);
	}, UPDATE_INITIAL_DELAY_MS);
	const daily = setInterval(() => {
		if (!disposed) void maybeCheckForUpdate(raise);
	}, UPDATE_CHECK_INTERVAL_MS);
	return () => {
		disposed = true;
		clearTimeout(initial);
		clearInterval(daily);
	};
}
