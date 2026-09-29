/**
 * Locale registry and translation helpers.
 *
 * Pure and framework-free: the rune store (`$lib/i18n/index.svelte`) owns the
 * reactive locale, and this module owns the catalog and the message lookup so
 * both stay unit-testable. Adding a language means adding one entry here and a
 * directory under `./locales`, never touching a component.
 */
import { en, type Messages } from './locales/en';
import { id } from './locales/id';

export type { Messages } from './locales/en';

export type Locale = 'en' | 'id';

/** Every shipped locale, in the order the settings picker shows them. */
export const LOCALES: { id: Locale; label: string }[] = [
	{ id: 'en', label: 'English' },
	{ id: 'id', label: 'Bahasa Indonesia' },
];

export const DEFAULT_LOCALE: Locale = 'en';

const CATALOG: Record<Locale, Messages> = { en, id };

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && value in CATALOG;
}

/**
 * Resolves a dotted key (`settings.editor.spellcheck`) against a bundle.
 * Returns the leaf string, or `<key>` when the path does not resolve so a typo
 * is visible in the UI instead of silently rendering nothing.
 */
export function lookup(bundle: Messages, key: string): string {
	let node: unknown = bundle;
	for (const part of key.split('.')) {
		if (!node || typeof node !== 'object') return `<${key}>`;
		node = (node as Record<string, unknown>)[part];
	}
	return typeof node === 'string' ? node : `<${key}>`;
}

/**
 * Replaces `{name}` placeholders. A missing value leaves the placeholder in
 * place, so a forgotten argument is visible rather than rendering "undefined".
 */
export function interpolate(
	template: string,
	params?: Record<string, string | number>
): string {
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) => {
		const value = params[name];
		return value === undefined || value === null ? match : String(value);
	});
}

/**
 * Translates `key` for `locale`. `params` values are stringified and swapped
 * into every `{name}` placeholder:
 *
 *     translate('en', 'settings.data.notesStored', { count: 4 })
 */
export function translate(
	locale: Locale,
	key: string,
	params?: Record<string, string | number>
): string {
	const bundle = CATALOG[locale] ?? CATALOG[DEFAULT_LOCALE];
	return interpolate(lookup(bundle, key), params);
}

/** Plain name→string bundle for the current locale, with placeholders intact. */
export function bundleFor(locale: Locale): Messages {
	return CATALOG[locale] ?? CATALOG[DEFAULT_LOCALE];
}

/**
 * BCP-47 tag for the current locale, for `Intl` formatting. Indonesian uses the
 * `id-ID` region so date formatting matches the holiday calendar.
 */
export function localeTag(locale: Locale): string {
	return locale === 'id' ? 'id-ID' : 'en-US';
}
