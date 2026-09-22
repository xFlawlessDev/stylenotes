import conf from '../../src-tauri/tauri.conf.json';

export type AppInfo = {
	name: string;
	version: string;
	description: string;
};

/**
 * App identity for the About panel, read straight from src-tauri/tauri.conf.json —
 * the same file Tauri uses for the bundle, window titles, and getVersion().
 * Edit the version or description there; this stays in sync for free.
 */
export const appInfo: AppInfo = {
	name: conf.productName,
	version: conf.version,
	description: conf.bundle.longDescription,
};
