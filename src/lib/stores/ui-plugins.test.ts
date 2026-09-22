import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({
	list: vi.fn(),
	save: vi.fn(),
	remove: vi.fn(),
	replaceAll: vi.fn(),
	clear: vi.fn(),
}));

vi.mock('$lib/db/ui-plugins', () => ({ uiPluginsRepo: repo }));
vi.mock('$lib/windows', () => ({ isTauri: true }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn().mockResolvedValue(undefined) }));

import {
	uiPlugins,
	uiPluginError,
	applyUiPlugins,
	applyUiPluginsSnapshot,
	clearUiPlugins,
	createUiPlugin,
	dismissUiPluginError,
	flushUiPluginsSave,
	moveUiPlugin,
	previewUiPlugin,
	refreshUiPlugins,
	removeUiPlugin,
	toggleUiPlugin,
	UI_PLUGIN_MIRROR_KEY,
	UI_PLUGIN_STYLE_ID,
} from '$lib/stores/ui-plugins.svelte';
import type { UiPlugin } from '$lib/content/ui-plugin-css';

function row(id: string, position = 0, patch: Partial<UiPlugin> = {}): UiPlugin {
	return {
		id,
		name: `Plugin ${id}`,
		tokens: {},
		css: '',
		enabled: true,
		position,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...patch,
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	repo.list.mockResolvedValue([]);
	repo.save.mockResolvedValue(true);
	repo.remove.mockResolvedValue(true);
	repo.replaceAll.mockResolvedValue(true);
	repo.clear.mockResolvedValue(true);
	uiPlugins.splice(0, uiPlugins.length);
	dismissUiPluginError();
	document.getElementById(UI_PLUGIN_STYLE_ID)?.remove();
	localStorage.clear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('refreshUiPlugins', () => {
	it('loads plugins ordered by position', async () => {
		repo.list.mockResolvedValue([row('b', 1), row('a', 0)]);
		await refreshUiPlugins();
		expect(uiPlugins.map((plugin) => plugin.id)).toEqual(['a', 'b']);
	});

	it('keeps the current list when the database is unavailable', async () => {
		uiPlugins.push(row('kept'));
		repo.list.mockRejectedValue(new Error('nope'));
		await expect(refreshUiPlugins()).resolves.toHaveLength(1);
		expect(uiPlugins[0].id).toBe('kept');
	});
});

describe('createUiPlugin', () => {
	it('adds and persists a fresh plugin', async () => {
		const created = await createUiPlugin();
		expect(created?.enabled).toBe(true);
		expect(created?.tokens).toEqual({});
		expect(uiPlugins).toHaveLength(1);
		expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: created?.id }));
		expect(uiPluginError()).toBeNull();
	});

	it('reports and rolls back when the write fails', async () => {
		repo.save.mockResolvedValue(false);
		const created = await createUiPlugin();
		expect(created).toBeNull();
		expect(uiPluginError()).toBe('Could not save the new plugin');
		expect(uiPlugins).toHaveLength(0);
	});
});

describe('toggleUiPlugin', () => {
	it('flips the flag, applies it, and persists it', async () => {
		uiPlugins.push(row('a', 0, { enabled: false, tokens: { primary: '#123456' } }));
		await expect(toggleUiPlugin('a', true)).resolves.toBe(true);
		expect(uiPlugins[0].enabled).toBe(true);
		expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
		expect(document.getElementById(UI_PLUGIN_STYLE_ID)?.textContent).toContain('/*');
	});

	it('restores the previous value when the write fails', async () => {
		uiPlugins.push(row('a', 0, { enabled: true }));
		repo.save.mockResolvedValue(false);
		repo.list.mockRejectedValue(new Error('down'));
		await expect(toggleUiPlugin('a', false)).resolves.toBe(false);
		expect(uiPlugins[0].enabled).toBe(true);
		expect(uiPluginError()).not.toBeNull();
	});

	it('ignores unknown ids', async () => {
		await expect(toggleUiPlugin('missing', true)).resolves.toBe(false);
		expect(repo.save).not.toHaveBeenCalled();
	});
});

describe('removeUiPlugin', () => {
	it('removes the plugin on success', async () => {
		uiPlugins.push(row('a'), row('b', 1));
		await expect(removeUiPlugin('a')).resolves.toBe(true);
		expect(uiPlugins.map((plugin) => plugin.id)).toEqual(['b']);
		expect(repo.remove).toHaveBeenCalledWith('a');
	});

	it('puts the plugin back when the write fails', async () => {
		uiPlugins.push(row('a'), row('b', 1));
		repo.remove.mockResolvedValue(false);
		repo.list.mockRejectedValue(new Error('down'));
		await expect(removeUiPlugin('a')).resolves.toBe(false);
		expect(uiPlugins.map((plugin) => plugin.id)).toEqual(['a', 'b']);
		expect(uiPluginError()).toBe('Could not delete the plugin');
	});
});

describe('moveUiPlugin', () => {
	it('reorders and rewrites every position', async () => {
		uiPlugins.push(row('a', 0), row('b', 1));
		await expect(moveUiPlugin('a', 1)).resolves.toBe(true);
		expect(uiPlugins.map((plugin) => plugin.id)).toEqual(['b', 'a']);
		expect(uiPlugins.map((plugin) => plugin.position)).toEqual([0, 1]);
		expect(repo.replaceAll).toHaveBeenCalledTimes(1);
	});

	it('refuses to move past either end', async () => {
		uiPlugins.push(row('a', 0));
		await expect(moveUiPlugin('a', -1)).resolves.toBe(false);
		expect(repo.replaceAll).not.toHaveBeenCalled();
	});
});

describe('previewUiPlugin / flushUiPluginsSave', () => {
	it('applies edits live and persists them once, debounced', async () => {
		const created = await createUiPlugin();
		repo.replaceAll.mockClear();

		previewUiPlugin(created!.id, { name: 'Cozy night', css: '.card { opacity: 0.9; }' });
		previewUiPlugin(created!.id, { tokens: { primary: '#123456' } });
		expect(uiPlugins[0].name).toBe('Cozy night');
		expect(repo.replaceAll).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(400);
		expect(repo.replaceAll).toHaveBeenCalledTimes(1);
		expect(repo.replaceAll.mock.calls[0][0][0].name).toBe('Cozy night');

		await expect(flushUiPluginsSave()).resolves.toBe(true);
		expect(repo.replaceAll).toHaveBeenCalledTimes(1);
	});

	it('surfaces a failure and resyncs from the table', async () => {
		const created = await createUiPlugin();
		previewUiPlugin(created!.id, { name: 'Renamed' });
		repo.replaceAll.mockResolvedValue(false);
		repo.list.mockResolvedValue([row(created!.id, 0)]);

		await vi.advanceTimersByTimeAsync(400);
		expect(uiPluginError()).toBe('Could not save your plugin changes');
		expect(uiPlugins[0].name).not.toBe('Renamed');
	});

	it('never persists a blank name', async () => {
		const created = await createUiPlugin();
		previewUiPlugin(created!.id, { name: '   ' });
		await vi.advanceTimersByTimeAsync(400);
		expect(uiPlugins[0].name).toBe('Untitled plugin');
	});

	it('ignores edits for unknown plugins', () => {
		previewUiPlugin('missing', { name: 'Nope' });
		expect(uiPlugins).toHaveLength(0);
	});
});

describe('clearUiPlugins', () => {
	it('empties the list and the table', async () => {
		uiPlugins.push(row('a'), row('b', 1));
		await expect(clearUiPlugins()).resolves.toBe(true);
		expect(uiPlugins).toHaveLength(0);
		expect(repo.clear).toHaveBeenCalled();
	});
});

describe('applyUiPlugins', () => {
	it('injects the stacked stylesheet and mirrors it for the next launch', async () => {
		repo.list.mockResolvedValue([
			row('a', 0, { tokens: { primary: '#123456' }, css: '.x { color: red; }' }),
		]);
		await refreshUiPlugins();

		const style = document.getElementById(UI_PLUGIN_STYLE_ID);
		expect(style?.textContent).toContain('--primary: #123456 !important;');
		expect(style?.textContent).toContain('.x { color: red; }');
		expect(localStorage.getItem(UI_PLUGIN_MIRROR_KEY)).toContain('color: red');
	});

	it('empties the style tag when nothing is active', () => {
		applyUiPlugins();
		expect(document.getElementById(UI_PLUGIN_STYLE_ID)?.textContent).toBe('');
		expect(localStorage.getItem(UI_PLUGIN_MIRROR_KEY)).toBeNull();
	});
});

describe('applyUiPluginsSnapshot', () => {
	it('adopts a broadcast list without writing it back', async () => {
		await applyUiPluginsSnapshot([row('remote', 0, { name: 'From other window' })]);
		expect(uiPlugins.map((plugin) => plugin.name)).toEqual(['From other window']);
		expect(repo.replaceAll).not.toHaveBeenCalled();
		expect(repo.save).not.toHaveBeenCalled();
	});

	it('ignores garbage payloads', () => {
		applyUiPluginsSnapshot(null);
		applyUiPluginsSnapshot('nope');
		applyUiPluginsSnapshot([{ name: 'no id' }, 42]);
		expect(uiPlugins).toHaveLength(0);
	});
});

describe('hydrateUiPlugins', () => {
	it('reads the table exactly once', async () => {
		vi.resetModules();
		repo.list.mockResolvedValue([row('stored')]);
		const mod = await import('$lib/stores/ui-plugins.svelte');

		await mod.hydrateUiPlugins();
		expect(mod.uiPlugins.map((plugin) => plugin.id)).toEqual(['stored']);

		repo.list.mockClear();
		await mod.hydrateUiPlugins();
		expect(repo.list).not.toHaveBeenCalled();
	});
});
