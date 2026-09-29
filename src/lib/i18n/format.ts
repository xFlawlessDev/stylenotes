/**
 * Locale-aware relative time, for the i18n layer rather than a content module.
 *
 * `formatRelative` in `$lib/content/version-format` stays a locale-agnostic
 * primitive (milliseconds → a compact English string) so its unit tests hold;
 * this wrapper turns the same numbers into the active language. It lives here
 * because it needs the reactive locale and must not make a pure module depend
 * on the settings store.
 */
import { t } from '$lib/i18n/index.svelte';

/** Compact relative time in the active language ("just now", "12m ago", "3d ago"). */
export function relativeTime(epochMs: number, now = Date.now()): string {
	const diff = Math.max(0, now - epochMs);
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return t('dialogs.history.relative.justNow');
	if (minutes < 60) return t('dialogs.history.relative.minutes', { count: minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return t('dialogs.history.relative.hours', { count: hours });
	const days = Math.floor(hours / 24);
	if (days < 7) return t('dialogs.history.relative.days', { count: days });
	return new Date(epochMs).toLocaleDateString();
}
