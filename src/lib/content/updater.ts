import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { isTauri } from '$lib/windows';
import type { ReleaseInfo } from '$lib/content/update-types';

/**
 * Thin, testable wrapper over `@tauri-apps/plugin-updater`.
 *
 * The plugin talks to the endpoint configured in `tauri.conf.json`, verifies the
 * minisign signature against the baked-in public key, and refuses an unsigned or
 * tampered manifest. Everything here returns a discriminated result instead of
 * throwing, so the store never has to try/catch a network failure and the UI can
 * show *why* a check did not work.
 */

/** Download/install progress the About panel renders as a bar. */
export type UpdateProgress = {
	phase: 'downloading' | 'installing';
	downloaded: number;
	/** Total bytes when the server sent `Content-Length`, else `null`. */
	total: number | null;
};

export type UpdateCheckResult =
	| { status: 'current' }
	| { status: 'available'; release: ReleaseInfo; update: Update }
	| { status: 'unavailable'; error: string };

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Flattens a plugin `Update` into the plain shape the store/UI keep. */
export function toReleaseInfo(update: Update): ReleaseInfo {
	return {
		version: update.version,
		currentVersion: update.currentVersion,
		date: update.date,
		notes: (update.body ?? '').trim(),
	};
}

/**
 * Asks the configured endpoint for an update. `unavailable` covers both "no
 * network / bad endpoint" and "running outside Tauri", so a browser dev session
 * reports the same story the About panel can show.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
	if (!isTauri) {
		return { status: 'unavailable', error: 'Updates are only available in the desktop app.' };
	}
	try {
		const update = await check();
		if (!update) return { status: 'current' };
		return { status: 'available', release: toReleaseInfo(update), update };
	} catch (error) {
		return { status: 'unavailable', error: message(error) };
	}
}

/**
 * Downloads and installs `update`, reporting progress, then relaunches so the
 * new build runs. On Windows the installer exits the app itself; on macOS and
 * Linux the explicit `relaunch` is what brings the new version back.
 */
export async function installUpdate(
	update: Update,
	onProgress: (progress: UpdateProgress) => void
): Promise<void> {
	let downloaded = 0;
	let total: number | null = null;
	await update.downloadAndInstall((event: DownloadEvent) => {
		if (event.event === 'Started') {
			total = event.data.contentLength ?? null;
			onProgress({ phase: 'downloading', downloaded, total });
		} else if (event.event === 'Progress') {
			downloaded += event.data.chunkLength;
			onProgress({ phase: 'downloading', downloaded, total });
		} else {
			onProgress({ phase: 'installing', downloaded, total });
		}
	});
	const { relaunch } = await import('@tauri-apps/plugin-process');
	await relaunch();
}
