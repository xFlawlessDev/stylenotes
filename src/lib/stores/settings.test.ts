import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({
	load: vi.fn(),
	save: vi.fn(),
	clear: vi.fn(),
}));

vi.mock('$lib/db', () => ({ settingsRepo: repo }));

import { settingsRepo } from '$lib/db';
import {
	settings,
	defaultSettings,
	hydrateSettings,
	updateSettings,
	toggleMode,
	resetSettings,
	applySettings,
	applySettingsSnapshot,
	persistSettings,
	resetStoredSettings,
	accents,
} from '$lib/stores/settings.svelte';

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(settingsRepo.load).mockReset();
	vi.mocked(settingsRepo.save).mockReset().mockResolvedValue(undefined);
	vi.mocked(settingsRepo.clear).mockReset().mockResolvedValue(undefined);
	localStorage.clear();
	Object.assign(settings, defaultSettings());
});

afterEach(() => {
	vi.useRealTimers();
});

describe('defaults', () => {
	it('exposes the expected shape', () => {
		expect(defaultSettings()).toMatchObject({
			mode: 'dark',
			accent: 'steel',
			editorView: 'preview',
			overlayStatus: 'all',
			overlayPriority: 'all',
			overlaySort: 'smart',
			overlayPosition: 'right',
			kanbanPinned: false,
		});
		expect(accents.map((a) => a.id)).toContain('sage');
	});
});

describe('applySettings', () => {
	it('reflects settings onto the html element', () => {
		Object.assign(settings, { mode: 'light', accent: 'rose', density: 'compact', reduceMotion: true });
		applySettings();
		const root = document.documentElement;
		expect(root.classList.contains('light')).toBe(true);
		expect(root.classList.contains('dark')).toBe(false);
		expect(root.dataset.accent).toBe('rose');
		expect(root.dataset.density).toBe('compact');
		expect(root.dataset.motion).toBe('reduced');
	});

	it('mirrors a prepaint snapshot for the next launch', () => {
		applySettings();
		const raw = localStorage.getItem('stylenotes.theme.v1');
		expect(raw).toContain('"mode"');
	});
});

describe('updateSettings / toggleMode', () => {
	it('applies and persists (debounced) changes', () => {
		updateSettings({ mode: 'light' });
		expect(settings.mode).toBe('light');
		expect(settingsRepo.save).not.toHaveBeenCalled();

		vi.advanceTimersByTime(200);
		expect(settingsRepo.save).toHaveBeenCalledTimes(1);
		expect(vi.mocked(settingsRepo.save).mock.calls[0][0].mode).toBe('light');
	});

	it('coalesces rapid updates into one write', () => {
		updateSettings({ mode: 'light' });
		updateSettings({ accent: 'sage' });
		vi.advanceTimersByTime(200);
		expect(settingsRepo.save).toHaveBeenCalledTimes(1);
	});

	it('toggles the theme', () => {
		toggleMode();
		expect(settings.mode).toBe('light');
		toggleMode();
		expect(settings.mode).toBe('dark');
	});
});

describe('applySettingsSnapshot', () => {
	it('applies an incoming snapshot without persisting it', () => {
		applySettingsSnapshot({ mode: 'light', accent: 'rose' });
		expect(settings.mode).toBe('light');
		expect(settings.accent).toBe('rose');
		expect(settings.overlayStatus).toBe('all');
		expect(document.documentElement.classList.contains('light')).toBe(true);
		expect(settingsRepo.save).not.toHaveBeenCalled();
	});

	it('ignores invalid payloads', () => {
		applySettingsSnapshot(null);
		applySettingsSnapshot(undefined);
		expect(settings).toEqual(defaultSettings());
	});

	it('discards an in-flight database read that started before it', async () => {
		vi.resetModules();
		let resolveLoad!: (value: unknown) => void;
		const pending = new Promise<unknown>((resolve) => (resolveLoad = resolve));
		vi.mocked(settingsRepo.load).mockReturnValue(pending as never);
		const mod = await import('$lib/stores/settings.svelte');

		const read = mod.refreshSettings();
		mod.applySettingsSnapshot({ mode: 'light' });
		resolveLoad({ mode: 'dark' });
		await read;

		expect(mod.settings.mode).toBe('light');
	});
});

describe('hydrateSettings', () => {
	it('merges stored values over defaults', async () => {
		vi.resetModules();
		vi.mocked(settingsRepo.load).mockResolvedValue({ mode: 'light', accent: 'sand' });
		const mod = await import('$lib/stores/settings.svelte');
		await mod.hydrateSettings();
		expect(mod.settings.mode).toBe('light');
		expect(mod.settings.accent).toBe('sand');
		expect(mod.settings.spellcheck).toBe(true);
	});

	it('ignores repository errors and keeps defaults', async () => {
		vi.resetModules();
		vi.mocked(settingsRepo.load).mockRejectedValue(new Error('nope'));
		const mod = await import('$lib/stores/settings.svelte');
		await expect(mod.hydrateSettings()).resolves.toBeUndefined();
		expect(mod.settings).toEqual(mod.defaultSettings());
	});

	it('re-reads stored settings on demand', async () => {
		vi.resetModules();
		vi.mocked(settingsRepo.load).mockResolvedValue({ overlayStatus: 'doing', overlayPriority: 'high' });
		const mod = await import('$lib/stores/settings.svelte');
		await mod.refreshSettings();
		expect(mod.settings.overlayStatus).toBe('doing');
		expect(mod.settings.overlayPriority).toBe('high');
		expect(mod.settings.mode).toBe('dark');
	});
});

describe('resetSettings', () => {
	it('restores defaults and persists them', () => {
		updateSettings({ mode: 'light', accent: 'rose' });
		vi.advanceTimersByTime(200);
		resetSettings();
		expect(settings).toEqual(defaultSettings());
		vi.advanceTimersByTime(200);
		const last = vi.mocked(settingsRepo.save).mock.calls.at(-1)![0];
		expect(last).toEqual(defaultSettings());
	});
});

describe('persistSettings', () => {
	it('writes the current state after the debounce window', () => {
		persistSettings();
		vi.advanceTimersByTime(200);
		expect(settingsRepo.save).toHaveBeenCalledTimes(1);
	});
});

describe('resetStoredSettings', () => {
	it('clears the stored row', async () => {
		await resetStoredSettings();
		expect(settingsRepo.clear).toHaveBeenCalled();
	});
});