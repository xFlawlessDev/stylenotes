/**
 * AI settings persistence: the model provider, its encrypted key, the tool
 * grant, and the web search provider.
 *
 * Split from `ai.svelte.ts`, which owns the conversation and streaming. Both
 * halves operate on the single `aiStore`, so the UI reads one source of truth.
 *
 * Every write updates the store optimistically and rolls back on failure, and
 * `ai:changed` is broadcast so the other windows re-hydrate.
 */

import { browser } from '$app/environment';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import type { AiSettings } from '$lib/content/ai-types';
import type { McpScope } from '$lib/content/mcp-types';
import type { AiToolDefinition } from '$lib/content/ai-types';
import { aiRepo } from '$lib/db/ai';
import { isTauri } from '$lib/windows';
import { activeProvider, aiStore } from '$lib/stores/ai.svelte';

/** Event telling the other windows the AI settings changed. */
export const AI_CHANGED = 'ai:changed';

export function notifyChanged(): void {
	if (!browser || !isTauri) return;
	void emit(AI_CHANGED, { enabled: aiStore.settings.enabled }).catch(() => undefined);
}

/** True when a request can be made: enabled, a model, and a stored key. */
export function aiReady(): boolean {
	const { enabled, model, hasKey } = aiStore.settings;
	return enabled && model.trim().length > 0 && hasKey;
}

/** True when a web search call can be made: a provider and a stored key. */
export function webSearchReady(): boolean {
	const { searchProvider, hasSearchKey } = aiStore.settings;
	return searchProvider.trim().length > 0 && hasSearchKey;
}

/**
 * Persists settings. A new `apiKey` (plaintext, from the field the user typed
 * into) is encrypted by Rust before it is stored; passing `undefined` leaves
 * the stored key untouched. `searchKey` behaves the same way.
 */
export async function updateAiSettings(
	patch: Partial<Omit<AiSettings, 'hasKey' | 'hasSearchKey'>>,
	apiKey?: string,
	searchKey?: string
): Promise<boolean> {
	const next: AiSettings = { ...aiStore.settings, ...patch };
	const previous = aiStore.settings;
	aiStore.settings = next;

	if (!browser) return true;

	let keyUpdate: { value: string; hasKey: boolean } | undefined;
	let searchUpdate: { value: string; hasKey: boolean } | undefined;
	try {
		if (apiKey !== undefined) {
			const encrypted = await invoke<string>('ai_encrypt_key', { key: apiKey });
			keyUpdate = { value: encrypted, hasKey: apiKey.trim().length > 0 };
		}
		if (searchKey !== undefined) {
			const encrypted = await invoke<string>('ai_encrypt_key', { key: searchKey });
			searchUpdate = { value: encrypted, hasKey: searchKey.trim().length > 0 };
		}
	} catch (error) {
		aiStore.settings = previous;
		aiStore.error = error instanceof Error ? error.message : String(error);
		return false;
	}

	const ok = await aiRepo.saveSettings(next, keyUpdate, searchUpdate);
	if (!ok) {
		aiStore.settings = previous;
		aiStore.error = 'Could not save the AI settings';
		return false;
	}
	if (keyUpdate) aiStore.settings.hasKey = keyUpdate.hasKey;
	if (searchUpdate) aiStore.settings.hasSearchKey = searchUpdate.hasKey;
	aiStore.error = null;
	notifyChanged();
	return true;
}

/** Clears the stored API key without touching the other settings. */
export async function clearAiKey(): Promise<boolean> {
	const ok = await updateAiSettings({}, '');
	if (ok) aiStore.settings.hasKey = false;
	return ok;
}

/** Stores the web search provider. The stored key is left untouched. */
export async function updateSearchSettings(patch: {
	searchProvider?: string;
	searchFallbacks?: string[];
}): Promise<boolean> {
	return updateAiSettings(patch);
}

/** Saves the encrypted search key. Pass `''` to forget it. */
export async function updateSearchKey(apiKey: string): Promise<boolean> {
	return updateAiSettings({}, undefined, apiKey);
}

/**
 * Updates the AI tool grant. Opening write access starts with no scopes, so the
 * user opts in explicitly; dropping back to read clears them.
 */
export async function updateAiGrant(patch: {
	access?: 'read' | 'write';
	scopes?: McpScope[];
}): Promise<boolean> {
	const nextAccess = patch.access ?? aiStore.settings.access;
	const nextScopes = patch.scopes ?? aiStore.settings.scopes;
	return updateAiSettings({
		access: nextAccess,
		scopes: nextAccess === 'read' ? [] : nextScopes
	});
}

/** Toggles one write scope on the AI grant. */
export function toggleAiScope(scope: McpScope, enabled: boolean): Promise<boolean> {
	const scopes = enabled
		? [...new Set([...aiStore.settings.scopes, scope])]
		: aiStore.settings.scopes.filter((item) => item !== scope);
	return updateAiGrant({ scopes });
}

/**
 * Decrypts the stored model key for a single request. Returns an empty string
 * when nothing is stored, and throws when decryption fails.
 */
export async function resolveKey(): Promise<string> {
	if (!isTauri) throw new Error('AI requests need the desktop app');
	const stored = await aiRepo.loadKey();
	if (!stored) return '';
	return invoke<string>('ai_decrypt_key', { stored });
}

/** Builds the provider config Rust needs, with the key resolved just-in-time. */
export async function providerConfig() {
	const key = await resolveKey();
	const settings = aiStore.settings;
	return {
		provider: settings.provider,
		baseUrl: settings.baseUrl.trim() || activeProvider().defaultBaseUrl,
		model: settings.model.trim() || activeProvider().defaultModel,
		apiKey: key,
		temperature: settings.temperature,
		maxTokens: settings.maxTokens,
		tools: [] as AiToolDefinition[]
	};
}
