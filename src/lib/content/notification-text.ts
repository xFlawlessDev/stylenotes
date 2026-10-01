import { t } from '$lib/i18n/index.svelte';

/**
 * Text for a notification the *app* owns: the four seed rows written on first
 * run, plus anything it raises later (see `stores/memory-nudge.ts`). Those
 * rows are written to SQLite in whatever language was active at the time, and
 * re-translating the stored value would corrupt user data on every save — so
 * instead the panel asks whether the id is one the app owns and, if so,
 * renders the key from the catalog. Any other row keeps its stored text.
 *
 * Returns `null` for an id the app does not own, so callers fall back to the stored fields.
 */
export function seedNotificationText(id: string): { title: string; body: string; time: string } | null {
	switch (id) {
		case 'n-memory':
			return {
				title: t('shell.notification.memory.title'),
				body: t('shell.notification.memory.body'),
				time: t('shell.notification.memory.time'),
			};
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
