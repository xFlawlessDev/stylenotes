import { browser } from '$app/environment';
import { emit } from '@tauri-apps/api/event';
import { settingsRepo } from '$lib/db';
import type { OverlaySort, TaskPriorityFilter, TaskStatus } from '$lib/stores/tasks';
import { isTauri } from '$lib/windows';

export type ThemeMode = 'dark' | 'light';
export type Accent = 'steel' | 'sage' | 'sand' | 'rose';
export type Density = 'comfortable' | 'compact';
export type EditorView = 'split' | 'write' | 'preview';

export type Settings = {
	mode: ThemeMode;
	accent: Accent;
	density: Density;
	reduceMotion: boolean;
	editorView: EditorView;
	focusMode: boolean;
	spellcheck: boolean;
	showWordCount: boolean;
	confirmDelete: boolean;
	overlayStatus: TaskStatus | 'all';
	overlayPriority: TaskPriorityFilter;
	overlaySort: OverlaySort;
};

export const accents: { id: Accent; label: string; swatchClass: string }[] = [
	{ id: 'steel', label: 'Steel', swatchClass: 'bg-accent-steel' },
	{ id: 'sage', label: 'Sage', swatchClass: 'bg-accent-sage' },
	{ id: 'sand', label: 'Sand', swatchClass: 'bg-accent-sand' },
	{ id: 'rose', label: 'Rose', swatchClass: 'bg-accent-rose' },
];

const defaults: Settings = {
	mode: 'dark',
	accent: 'steel',
	density: 'comfortable',
	reduceMotion: false,
	editorView: 'preview',
	focusMode: false,
	spellcheck: true,
	showWordCount: true,
	confirmDelete: true,
	overlayStatus: 'all',
	overlayPriority: 'all',
	overlaySort: 'smart',
};

export function defaultSettings(): Settings {
	return { ...defaults };
}

export const settings = $state<Settings>({ ...defaults });

export const SETTINGS_CHANGED = 'settings:changed';

let hydrated = false;

// Bumped on every local or remote change so in-flight database reads cannot
// overwrite newer state with a stale snapshot.
let revision = 0;

function notifySettingsChanged() {
	if (!browser || !isTauri) return;
	// Send the snapshot with the event: the database write is debounced, so
	// listeners that re-read it would apply the previous state.
	void emit(SETTINGS_CHANGED, { ...settings }).catch(() => undefined);
}

export function applySettingsSnapshot(snapshot: Partial<Settings> | null | undefined) {
	if (!browser || !snapshot || typeof snapshot !== 'object') return;
	revision++;
	Object.assign(settings, defaults, snapshot);
	applySettings();
}

export async function hydrateSettings() {
	if (hydrated || !browser) return;
	hydrated = true;
	await refreshSettings();
}

export async function refreshSettings(): Promise<Settings> {
	if (!browser) return settings;
	const startedAt = revision;
	try {
		const stored = await settingsRepo.load();
		if (stored && startedAt === revision) Object.assign(settings, defaults, stored);
	} catch {
		/* keep the current settings when the database is unavailable */
	}
	hydrated = true;
	if (startedAt === revision) applySettings();
	return settings;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function persistSettings() {
	if (!browser) return;
	if (persistTimer) clearTimeout(persistTimer);
	persistTimer = setTimeout(() => {
		void settingsRepo.save({ ...settings }).catch(() => {
			/* ignore persistence failures */
		});
	}, 150);
}

const PREPAINT_KEY = 'stylenotes.theme.v1';

export function applySettings() {
	if (!browser) return;
	const html = document.documentElement;
	html.classList.toggle('dark', settings.mode === 'dark');
	html.classList.toggle('light', settings.mode === 'light');
	html.dataset.accent = settings.accent;
	html.dataset.density = settings.density;
	html.dataset.motion = settings.reduceMotion ? 'reduced' : 'full';
	try {
		localStorage.setItem(
			PREPAINT_KEY,
			JSON.stringify({
				mode: settings.mode,
				accent: settings.accent,
				density: settings.density,
				reduceMotion: settings.reduceMotion,
			})
		);
	} catch {
		/* ignore */
	}
}

export function updateSettings(patch: Partial<Settings>) {
	revision++;
	Object.assign(settings, patch);
	persistSettings();
	applySettings();
	notifySettingsChanged();
}

export function toggleMode() {
	updateSettings({ mode: settings.mode === 'dark' ? 'light' : 'dark' });
}

export function resetSettings() {
	revision++;
	Object.assign(settings, defaults);
	persistSettings();
	applySettings();
	notifySettingsChanged();
}

export async function resetStoredSettings() {
	try {
		await settingsRepo.clear();
	} catch {
		/* ignore */
	}
}