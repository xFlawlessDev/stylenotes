import { browser } from '$app/environment';
import { settingsRepo } from '$lib/db';

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
};

export const accents: { id: Accent; label: string; swatch: string }[] = [
	{ id: 'steel', label: 'Steel', swatch: '#a8c7e8' },
	{ id: 'sage', label: 'Sage', swatch: '#a9cbb1' },
	{ id: 'sand', label: 'Sand', swatch: '#ddc39a' },
	{ id: 'rose', label: 'Rose', swatch: '#e3b6bd' },
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
};

export function defaultSettings(): Settings {
	return { ...defaults };
}

export const settings = $state<Settings>({ ...defaults });

let hydrated = false;

export async function hydrateSettings() {
	if (hydrated || !browser) return;
	hydrated = true;
	try {
		const stored = await settingsRepo.load();
		if (stored) Object.assign(settings, defaults, stored);
	} catch {
		/* keep defaults when the database is unavailable */
	}
	applySettings();
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
	Object.assign(settings, patch);
	persistSettings();
	applySettings();
}

export function toggleMode() {
	updateSettings({ mode: settings.mode === 'dark' ? 'light' : 'dark' });
}

export function resetSettings() {
	Object.assign(settings, defaults);
	persistSettings();
	applySettings();
}

export async function resetStoredSettings() {
	try {
		await settingsRepo.clear();
	} catch {
		/* ignore */
	}
}