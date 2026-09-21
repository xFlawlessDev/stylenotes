import { browser } from '$app/environment';

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

const KEY = 'stylenotes.settings.v1';

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

export function loadSettings(): Settings {
	if (!browser) return { ...defaults };
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...defaults };
		return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) };
	} catch {
		return { ...defaults };
	}
}

export function saveSettings(settings: Settings) {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, JSON.stringify(settings));
	} catch {
		/* ignore */
	}
}

export const settings = $state<Settings>(loadSettings());

let hydrated = false;

export function hydrateSettings() {
	if (hydrated || !browser) return;
	hydrated = true;
	applySettings();
}

export function persistSettings() {
	saveSettings(settings);
}

export function applySettings() {
	if (!browser) return;
	const html = document.documentElement;
	html.classList.toggle('dark', settings.mode === 'dark');
	html.classList.toggle('light', settings.mode === 'light');
	html.dataset.accent = settings.accent;
	html.dataset.density = settings.density;
	html.dataset.motion = settings.reduceMotion ? 'reduced' : 'full';
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