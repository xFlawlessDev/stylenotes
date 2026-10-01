import { browser } from '$app/environment';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { settingsRepo } from '$lib/db';
import type { DockEdge } from '$lib/dock';
import { localDay } from '$lib/content/mcp-snapshot';
import type { OverlaySort, TaskPriorityFilter, TaskStatus } from '$lib/stores/tasks';
import { isTauri } from '$lib/windows';

export type ThemeMode = 'dark' | 'light';
/** UI language. Values must match `LOCALES` in `$lib/i18n/catalog`. */
export type Language = 'en' | 'id';
export type Accent = 'steel' | 'sage' | 'sand' | 'rose';
export type Density = 'comfortable' | 'compact';
export type EditorView = 'split' | 'write' | 'preview';
/** Details/editor view for a task's markdown body. */
export type TaskView = EditorView;

export type Settings = {
	mode: ThemeMode;
	/** UI language; drives `$lib/i18n`. */
	language: Language;
	accent: Accent;
	density: Density;
	reduceMotion: boolean;
	editorView: EditorView;
	/** Task window layout: focus on the details editor, or a meta/details split. */
	taskView: TaskView;
	focusMode: boolean;
	spellcheck: boolean;
	showWordCount: boolean;
	confirmDelete: boolean;
	/** Click a rendered block in Preview to edit its source lines in place. */
	previewInlineEdit: boolean;
	overlayStatus: TaskStatus | 'all';
	overlayPriority: TaskPriorityFilter;
	overlaySort: OverlaySort;
	overlayPosition: DockEdge;
	kanbanLocked: boolean;
	/** Pins the Kanban window to one workspace instead of following the app. */
	kanbanPinned: boolean;
	/** Kanban board layout: one workspace id per board, left to right. */
	kanbanBoards: string[];
	detailAlwaysOnTop: boolean;
	/** Keeps a local version history of note and task edits (Phase B). */
	versioningEnabled: boolean;
	/**
	 * IANA timezone used for the assistant's "current time"
	 * (`Asia/Jakarta`), or an empty string to follow the OS zone.
	 */
	timezone: string;
	/**
	 * Journal (docs/design/journal.md). Opt-in: it writes notes, so it needs an
	 * explicit yes. These four keys are **device-local for now** and must move to
	 * `settings_cloud` when cloud sync Phase 0 lands (#J8, §5.2).
	 */
	journalEnabled: boolean;
	journalFolder: string;
	journalFormat: string;
	journalTemplate: string;
};

export const accents: { id: Accent; label: string; swatchClass: string }[] = [
	{ id: 'steel', label: 'Steel', swatchClass: 'bg-accent-steel' },
	{ id: 'sage', label: 'Sage', swatchClass: 'bg-accent-sage' },
	{ id: 'sand', label: 'Sand', swatchClass: 'bg-accent-sand' },
	{ id: 'rose', label: 'Rose', swatchClass: 'bg-accent-rose' },
];

const defaults: Settings = {
	mode: 'dark',
	language: 'en',
	accent: 'steel',
	density: 'comfortable',
	reduceMotion: false,
	editorView: 'preview',
	taskView: 'write',
	focusMode: false,
	spellcheck: true,
	showWordCount: true,
	confirmDelete: true,
	previewInlineEdit: true,
	overlayStatus: 'all',
	overlayPriority: 'all',
	overlaySort: 'smart',
	overlayPosition: 'right',
	kanbanLocked: false,
	kanbanPinned: false,
	kanbanBoards: [],
	detailAlwaysOnTop: true,
	versioningEnabled: true,
	timezone: '',
	journalEnabled: false,
	journalFolder: 'journal',
	journalFormat: 'YYYY-MM-DD',
	journalTemplate: '',
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
	// Capture before any await so a concurrent local change is still detected.
	const startedAt = revision;
	// A pending debounced write is newer than the row, so reading now would
	// resurrect the older value (and the timer would re-save it). Flush it so the
	// database matches our state; if a change lands during the flush, skip the
	// read entirely and keep the newer local state.
	if (persistTimer) await flushSettings();
	if (startedAt === revision) {
		try {
			const stored = await settingsRepo.load();
			if (stored && startedAt === revision) Object.assign(settings, defaults, stored);
		} catch {
			/* keep the current settings when the database is unavailable */
		}
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
		persistTimer = null;
		void settingsRepo.save({ ...settings }).catch(() => {
			/* ignore persistence failures */
		});
	}, 150);
}

/**
 * Writes the current settings immediately, cancelling any pending debounce.
 *
 * Settings changes are debounced, so a change made just before the app quits
 * (or a window hides) could still be sitting in the timer. Quit and lifecycle
 * handlers call this so the last toggle is never lost.
 */
export async function flushSettings(): Promise<void> {
	if (persistTimer) {
		clearTimeout(persistTimer);
		persistTimer = null;
	}
	if (!browser) return;
	try {
		await settingsRepo.save({ ...settings });
	} catch {
		/* ignore persistence failures */
	}
}

/**
 * Flushes pending settings when the window is hidden. The workspace-family
 * windows are hidden (not closed) on close, and the app may be killed from the
 * tray at any time, so hiding is the last reliable moment to persist.
 */
export function flushSettingsOnHide(): () => void {
	if (!browser || !isTauri) return () => undefined;
	const win = getCurrentWindow();
	let disposed = false;
	let cleanup: () => void = () => undefined;
	void win
		.onFocusChanged(({ payload: focused }) => {
			if (!focused) void flushSettings();
		})
		.then((unlisten) => {
			if (disposed) unlisten();
			else cleanup = unlisten;
		});
	return () => {
		disposed = true;
		cleanup();
	};
}

const PREPAINT_KEY = 'stylenotes.theme.v1';
/** Mirror of the chosen language, read before paint in `app.html`. */
const PREPAINT_LOCALE_KEY = 'stylenotes.locale.v1';
/** Mirror of the chosen timezone, so the AI prompt can use it before hydration. */
const PREPAINT_TIMEZONE_KEY = 'stylenotes.timezone.v1';

/**
 * Timezone preference for the assistant's current time: an IANA zone, or an
 * empty string for the OS zone. Mirrored in `localStorage` so a request made
 * before settings hydrate still uses the user's choice.
 */
export function timezonePreference(): string {
	const chosen = settings.timezone;
	if (chosen) return chosen;
	if (!browser) return '';
	try {
		return localStorage.getItem(PREPAINT_TIMEZONE_KEY) ?? '';
	} catch {
		return '';
	}
}

/**
 * The user's civil day (`YYYY-MM-DD`) in their chosen timezone.
 *
 * The single source for "today" anywhere outside the browser's own formatting.
 * The MCP snapshot carries it so the shim can compare task due dates without
 * owning a timezone library, and the assistant's prompt uses the same value.
 * Falls back to the UTC day when no zone is set or the value is not a zone the
 * runtime knows — a bad setting must never break a read.
 */
export function localToday(at: Date = new Date()): string {
	return localDay(at, timezonePreference());
}

export function applySettings() {
	if (!browser) return;
	const html = document.documentElement;
	html.classList.toggle('dark', settings.mode === 'dark');
	html.classList.toggle('light', settings.mode === 'light');
	html.dataset.accent = settings.accent;
	html.dataset.density = settings.density;
	html.dataset.motion = settings.reduceMotion ? 'reduced' : 'full';
	html.lang = settings.language;
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
		localStorage.setItem(PREPAINT_LOCALE_KEY, settings.language);
		localStorage.setItem(PREPAINT_TIMEZONE_KEY, settings.timezone);
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