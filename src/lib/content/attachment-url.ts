/**
 * Turns attachment targets into webview-loadable URLs.
 *
 * Kept separate from `attachment-actions.ts` on purpose: the note render path
 * (`note-actions.ts`) resolves images and media on every render, and it must not
 * drag in the SQLite catalog or the import commands. This module only needs the
 * store's root directory, which it caches after one `attachment_root` call.
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '$lib/windows';
import {
	attachmentObjectPath,
	localFilePath,
	parseAttachmentReference
} from '$lib/content/attachments';

const SEPARATOR = /\\/g;

let storeRoot = '';
let rootLoading: Promise<string> | null = null;
let listeners: Array<(root: string) => void> = [];

/** Whether the store root has been resolved (and references can be rendered). */
export function attachmentRootReady(): boolean {
	return storeRoot !== '';
}

/** Subscribers fire when the store root first resolves, so a view can re-render. */
export function onAttachmentStoreReady(listener: (root: string) => void): () => void {
	if (storeRoot) {
		listener(storeRoot);
		return () => undefined;
	}
	listeners.push(listener);
	return () => {
		listeners = listeners.filter((item) => item !== listener);
	};
}

/** Resolves the store root once; subsequent calls reuse it. */
export async function attachmentStoreRoot(): Promise<string> {
	if (!isTauri) return '';
	if (storeRoot) return storeRoot;
	if (!rootLoading) {
		rootLoading = invokeRoot().then((root) => {
			storeRoot = root.replace(SEPARATOR, '/');
			for (const listener of listeners) listener(storeRoot);
			listeners = [];
			return storeRoot;
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

/** Loads the store root without throwing; the render path calls this first. */
export async function primeAttachmentStore(): Promise<void> {
	if (!isTauri || storeRoot) return;
	try {
		await attachmentStoreRoot();
	} catch {
		// A store that cannot open simply means references do not resolve yet.
	}
}

/** The absolute path of a stored blob, or null when the reference is foreign. */
export function storedPath(reference: string): string | null {
	const parsed = parseAttachmentReference(reference);
	if (!parsed || !storeRoot) return null;
	return `${storeRoot}/${attachmentObjectPath(parsed.id, parsed.ext)}`;
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
