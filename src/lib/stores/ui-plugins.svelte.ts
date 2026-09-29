import { browser } from '$app/environment';
import { emit } from '@tauri-apps/api/event';
import {
	buildPluginCss,
	normalizePlugin,
	sanitizeCss,
	sanitizeTokens,
	MAX_PLUGIN_NAME,
	type UiPlugin,
	type UiPluginPatch,
} from '$lib/content/ui-plugin-css';
import { uiPluginsRepo } from '$lib/db/ui-plugins';
import { isTauri } from '$lib/windows';
import { t } from '$lib/i18n/index.svelte';

export type { UiPlugin, UiPluginPatch, UiPluginTokens } from '$lib/content/ui-plugin-css';

export const UI_PLUGINS_CHANGED = 'ui-plugins:changed';
export const UI_PLUGIN_STYLE_ID = 'stylenotes-ui-plugins';
export const UI_PLUGIN_MIRROR_KEY = 'stylenotes.plugins.v1';

const SAVE_DEBOUNCE_MS = 300;
const MAX_MIRROR = 60_000;

/** Reactive list, sorted by `position`; enabled plugins are stacked in order. */
export const uiPlugins = $state<UiPlugin[]>([]);

let pluginError = $state<string | null>(null);

/** Last persistence failure, surfaced in the settings panel. */
export function uiPluginError(): string | null {
	return pluginError;
}

let hydrated = false;
let revision = 0;
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function plain(): UiPlugin[] {
	return uiPlugins.map((plugin) => ({ ...plugin, tokens: { ...plugin.tokens } }));
}

function replaceLocal(rows: UiPlugin[]) {
	revision++;
	uiPlugins.splice(0, uiPlugins.length, ...rows.slice().sort((a, b) => a.position - b.position));
	applyUiPlugins();
}

async function afterWrite(ok: boolean, message: string) {
	if (ok) {
		pluginError = null;
		notify();
		return;
	}
	pluginError = message;
	// Re-read the table so the UI reflects what is actually stored.
	await refreshUiPlugins();
}

function notify() {
	if (!browser || !isTauri) return;
	void emit(UI_PLUGINS_CHANGED, plain()).catch(() => undefined);
}

function queueSave() {
	if (!browser) return;
	dirty = true;
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => void flushUiPluginsSave(), SAVE_DEBOUNCE_MS);
}

function newId(): string {
	const webCrypto: Crypto | undefined = globalThis.crypto;
	if (webCrypto && typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();
	return `plugin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Injects the stacked plugin stylesheet and mirrors it for the next launch. */
export function applyUiPlugins() {
	if (!browser) return;
	const css = buildPluginCss(uiPlugins);
	let style = document.getElementById(UI_PLUGIN_STYLE_ID) as HTMLStyleElement | null;
	if (!style) {
		style = document.createElement('style');
		style.id = UI_PLUGIN_STYLE_ID;
		document.head.appendChild(style);
	}
	if (style.textContent !== css) style.textContent = css;
	try {
		if (css && css.length <= MAX_MIRROR) localStorage.setItem(UI_PLUGIN_MIRROR_KEY, css);
		else localStorage.removeItem(UI_PLUGIN_MIRROR_KEY);
	} catch {
		/* ignore quota errors: the live style tag already carries the CSS */
	}
}

export async function hydrateUiPlugins() {
	if (hydrated || !browser) return;
	hydrated = true;
	await refreshUiPlugins();
}

export async function refreshUiPlugins(): Promise<readonly UiPlugin[]> {
	if (!browser) return uiPlugins;
	const startedAt = revision;
	try {
		const rows = await uiPluginsRepo.list();
		if (startedAt === revision) replaceLocal(rows.map(normalizePlugin).filter(hasPlugin));
	} catch {
		/* database unavailable: keep the plugins we already have */
	}
	hydrated = true;
	return uiPlugins;
}

function hasPlugin(plugin: UiPlugin | null): plugin is UiPlugin {
	return plugin !== null;
}

/** Applies a list broadcast by another window without writing it back. */
export function applyUiPluginsSnapshot(payload: unknown) {
	if (!browser || !Array.isArray(payload)) return;
	replaceLocal(payload.map(normalizePlugin).filter(hasPlugin));
}

/** Local, non-persisted edit used by the plugin editor for live preview. */
export function previewUiPlugin(id: string, patch: UiPluginPatch) {
	const plugin = uiPlugins.find((item) => item.id === id);
	if (!plugin) return;
	if (patch.name !== undefined) plugin.name = patch.name.slice(0, MAX_PLUGIN_NAME + 20);
	if (patch.tokens !== undefined) plugin.tokens = sanitizeTokens(patch.tokens);
	if (patch.css !== undefined) plugin.css = sanitizeCss(patch.css);
	plugin.updatedAt = new Date().toISOString();
	applyUiPlugins();
	queueSave();
}

/** Persists pending live edits; a no-op when nothing changed. */
export async function flushUiPluginsSave(): Promise<boolean> {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
	if (!dirty) return true;
	dirty = false;
	for (const plugin of uiPlugins) {
		const name = plugin.name.trim().slice(0, MAX_PLUGIN_NAME);
		plugin.name = name || 'Untitled plugin';
	}
	const ok = isTauri ? await uiPluginsRepo.replaceAll(plain()) : true;
	await afterWrite(ok, t('settings.plugins.error.saveChanges'));
	return ok;
}

export async function createUiPlugin(): Promise<UiPlugin | null> {
	const now = new Date().toISOString();
	const position = uiPlugins.length
		? Math.max(...uiPlugins.map((plugin) => plugin.position)) + 1
		: 0;
	const plugin: UiPlugin = {
		id: newId(),
		name: `Plugin ${uiPlugins.length + 1}`,
		tokens: {},
		css: '',
		enabled: true,
		position,
		createdAt: now,
		updatedAt: now,
	};
	uiPlugins.push(plugin);
	applyUiPlugins();
	const ok = isTauri ? await uiPluginsRepo.save(plugin) : true;
	await afterWrite(ok, t('settings.plugins.error.saveNew'));
	return ok ? plugin : null;
}

export async function toggleUiPlugin(id: string, enabled: boolean): Promise<boolean> {
	const plugin = uiPlugins.find((item) => item.id === id);
	if (!plugin) return false;
	const wasEnabled = plugin.enabled;
	plugin.enabled = enabled;
	plugin.updatedAt = new Date().toISOString();
	applyUiPlugins();
	const ok = isTauri ? await uiPluginsRepo.save(plugin) : true;
	if (!ok) plugin.enabled = wasEnabled;
	await afterWrite(ok, t('settings.plugins.error.update'));
	return ok;
}

export async function removeUiPlugin(id: string): Promise<boolean> {
	const index = uiPlugins.findIndex((item) => item.id === id);
	if (index < 0) return false;
	const [removed] = uiPlugins.splice(index, 1);
	applyUiPlugins();
	const ok = isTauri ? await uiPluginsRepo.remove(id) : true;
	if (!ok && removed) uiPlugins.splice(index, 0, removed);
	await afterWrite(ok, t('settings.plugins.error.delete'));
	return ok;
}

export async function moveUiPlugin(id: string, direction: -1 | 1): Promise<boolean> {
	const index = uiPlugins.findIndex((item) => item.id === id);
	const target = index + direction;
	if (index < 0 || target < 0 || target >= uiPlugins.length) return false;
	[uiPlugins[index], uiPlugins[target]] = [uiPlugins[target], uiPlugins[index]];
	uiPlugins.forEach((plugin, position) => (plugin.position = position));
	applyUiPlugins();
	const ok = isTauri ? await uiPluginsRepo.replaceAll(plain()) : true;
	await afterWrite(ok, t('settings.plugins.error.reorder'));
	return ok;
}

export async function clearUiPlugins(): Promise<boolean> {
	dirty = false;
	uiPlugins.splice(0, uiPlugins.length);
	applyUiPlugins();
	const ok = isTauri ? await uiPluginsRepo.clear() : true;
	await afterWrite(ok, t('settings.plugins.error.clear'));
	return ok;
}

export function dismissUiPluginError() {
	pluginError = null;
}
