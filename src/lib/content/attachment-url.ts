/**
 * Turns attachment targets into webview-loadable URLs.
 *
 * Kept separate from `attachment-actions.ts` on purpose: the note render path
 * (`note-actions.ts`) resolves images and media on every render, and it must not
 * drag in the SQLite catalog or the import commands. This module only needs the
 * store's base directory, which it caches after one `attachment_root` call.
 *
 * `baseDir` is the **app-data root**, not the `attachments/` folder: the object
 * path already carries the `attachments/` prefix, exactly as Rust's `store_path`
 * joins it. Keeping one base on both sides is what stops the path from becoming
 * `attachments/attachments/…`.
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '$lib/windows';
import {
	attachmentObjectPath,
	localFilePath,
	parseAttachmentReference
} from '$lib/content/attachments';

const SEPARATOR = /\\/g;

let baseDir = '';
let rootLoading: Promise<string> | null = null;
let listeners: Array<(root: string) => void> = [];

/** Whether the base directory has been resolved (references can render). */
export function attachmentRootReady(): boolean {
	return baseDir !== '';
}

/** Subscribers fire when the base directory first resolves, so a view can re-render. */
export function onAttachmentStoreReady(listener: (root: string) => void): () => void {
	if (baseDir) {
		listener(baseDir);
		return () => undefined;
	}
	listeners.push(listener);
	return () => {
		listeners = listeners.filter((item) => item !== listener);
	};
}

/** Resolves the app-data root once; subsequent calls reuse it. */
export async function attachmentStoreRoot(): Promise<string> {
	if (!isTauri) return '';
	if (baseDir) return baseDir;
	if (!rootLoading) {
		rootLoading = invokeRoot().then((root) => {
			baseDir = root.replace(SEPARATOR, '/');
			for (const listener of listeners) listener(baseDir);
			listeners = [];
			return baseDir;
		});
		rootLoading = rootLoading.catch((error) => {
			rootLoading = null;
			throw error;
		});
	}
	return rootLoading;
}

async function invokeRoot(): Promise<string> {
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke<string>('attachment_root');
}

/** Loads the base directory without throwing; the render path calls this first. */
export async function primeAttachmentStore(): Promise<void> {
	if (!isTauri || baseDir) return;
	try {
		await attachmentStoreRoot();
	} catch {
		// A store that cannot open simply means references do not resolve yet.
	}
}

/** The absolute path of a stored blob, or null when the reference is foreign. */
export function storedPath(reference: string): string | null {
	const parsed = parseAttachmentReference(reference);
	if (!parsed || !baseDir) return null;
	return `${baseDir}/${attachmentObjectPath(parsed.id, parsed.ext)}`;
}

function assetUrl(path: string): string | null {
	if (!isTauri) return null;
	try {
		return convertFileSrc(path);
	} catch {
		return null;
	}
}

/**
 * Resolves a markdown target (store reference or legacy local path) to a URL the
 * webview can load. Returns null when it is not an attachment (remote, `data:`,
 * wiki link, …), so the caller leaves the value untouched.
 */
export function resolveAttachmentUrl(target: string): string | null {
	if (parseAttachmentReference(target)) {
		const path = storedPath(target);
		return path ? assetUrl(path) : null;
	}
	const path = localFilePath(target);
	return path ? assetUrl(path) : null;
}
