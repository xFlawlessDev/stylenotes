import { t } from '$lib/i18n/index.svelte';

/**
 * Seed notifications are written to SQLite on first run, so their `title`,
 * `body` and `time` are frozen in whatever language was active at seed time.
 * Instead of translating the stored rows (which would corrupt user data), the
 * panel asks this helper whether a row is still an untouched seed and, if so,
 * renders the keys from the catalog. Any user or later notification keeps its
 * stored text.
 *
 * Returns `null` for a non-seed id, so callers fall back to the stored fields.
 */
export function seedNotificationText(id: string): { title: string; body: string; time: string } | null {
	switch (id) {
		case 'n-weekly':
			return {
				title: t('shell.notification.seed.weeklyTitle'),
				body: t('shell.notification.seed.weeklyBody'),
				time: t('shell.notification.seed.time.minutes', { count: 12 }),
			};
		case 'n-tip':
			return {
				title: t('shell.notification.seed.tipTitle'),
				body: t('shell.notification.seed.tipBody'),
				time: t('shell.notification.seed.time.hours', { count: 1 }),
			};
		case 'n-sync':
			return {
				title: t('shell.notification.seed.syncTitle'),
				body: t('shell.notification.seed.syncBody'),
				time: t('shell.notification.seed.time.hours', { count: 3 }),
			};
		case 'n-archive':
			return {
				title: t('shell.notification.seed.archiveTitle'),
				body: t('shell.notification.seed.archiveBody'),
				time: t('shell.notification.seed.time.yesterday'),
			};
		default:
			return null;
	}
}
