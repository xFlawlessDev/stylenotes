/**
 * Web access hooks for the assistant's `web_search` / `web_fetch` tools.
 *
 * Split out of `ai.svelte.ts` so that file stays reviewable, and so the search
 * settings live next to the plumbing that uses them. Rust owns the network; this
 * module owns the key handling, exactly as the model provider does.
 */

import { invoke } from '@tauri-apps/api/core';
import type { AiSearchProvider } from '$lib/content/ai-types';
import type { WebHooks } from '$lib/content/ai-tools';
import { aiRepo } from '$lib/db/ai';
import { isTauri } from '$lib/windows';
import { aiStore } from '$lib/stores/ai.svelte';

/**
 * Builds the hooks `ai-tools.ts` calls.
 *
 * The search key is decrypted just-in-time and crosses IPC only for the
 * duration of the request; a failure becomes an `ok: false` result rather than
 * a throw, so the model can report the problem instead of the turn dying.
 */
export async function loadWebHooks(): Promise<WebHooks> {
	const search: WebHooks['search'] = async (query, limit) => {
		if (!isTauri) return { ok: false, error: 'Web access needs the desktop app.' };
		try {
			const stored = await aiRepo.loadSearchKey();
			const apiKey = stored ? await invoke<string>('ai_decrypt_key', { stored }) : '';
			const data = await invoke<unknown>('ai_web_search', {
				request: {
					query,
					limit,
					config: {
						provider: aiStore.settings.searchProvider,
						apiKey,
						fallbacks: aiStore.settings.searchFallbacks
					}
				}
			});
			return { ok: true, data };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	};

	const fetch: WebHooks['fetch'] = async (url, maxChars) => {
		if (!isTauri) return { ok: false, error: 'Web access needs the desktop app.' };
		try {
			const data = await invoke<unknown>('ai_web_fetch', { request: { url, maxChars } });
			return { ok: true, data };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	};

	return { search, fetch };
}

/** Providers Rust supports, for the Settings list. Loaded once, then cached. */
export const searchProviderList = $state<{ items: AiSearchProvider[] }>({ items: [] });

export async function loadSearchProviders(): Promise<void> {
	if (!isTauri || searchProviderList.items.length) return;
	try {
		searchProviderList.items = await invoke<AiSearchProvider[]>('ai_search_providers');
	} catch {
		/* The list is informational; Settings degrades to an empty select. */
	}
}
