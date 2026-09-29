/**
 * The reactive locale, and the `t()` every component calls.
 *
 * The chosen language lives in `settings` (SQLite, synced across windows) with
 * a pre-paint mirror in `localStorage`, exactly like the theme: the HTML `lang`
 * attribute is set before the first paint in `app.html`, and again on change.
 * Read the current language through `currentLocale()` rather than importing
 * `settings` directly, so plain modules stay decoupled from the store.
 */
import { settings } from '$lib/stores/settings.svelte';
import {
	interpolate,
	lookup,
	translate,
	type Locale,
} from '$lib/i18n/catalog';

/** Mirror key for the pre-paint language switch in `app.html`. */
export const LOCALE_KEY = 'stylenotes.locale.v1';

export type TranslateParams = Record<string, string | number>;

/** The active language code. */
export function currentLocale(): Locale {
	return settings.language;
}

/**
 * Translates a dotted key against the live locale.
 *
 * Reading `settings.language` here is what makes every template that calls `t()`
 * re-render on a language change; callers need no extra wiring.
 */
export function t(key: string, params?: TranslateParams): string {
	return translate(settings.language, key, params);
}

/** Non-reactive lookup: for tests and one-off calls outside a component. */
export function tFor(locale: Locale, key: string, params?: TranslateParams): string {
	return translate(locale, key, params);
}

/** Re-export convenience for callers that live outside `$lib/i18n`. */
export { interpolate, lookup };

export {
	bundleFor,
	DEFAULT_LOCALE,
	isLocale,
	localeTag,
	LOCALES,
	type Locale,
	type Messages,
} from '$lib/i18n/catalog';
