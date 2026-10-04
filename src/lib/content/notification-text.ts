import { t } from '$lib/i18n/index.svelte';
import { versionFromUpdateId } from '$lib/content/update-types';

/**
 * Text for a notification the *app* owns: rows it raises in response to a real
 * event (see `stores/memory-nudge.ts` and `stores/update.svelte.ts`). Those
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
		default: {
			const version = versionFromUpdateId(id);
			if (version) {
				return {
					title: t('shell.notification.update.title', { version }),
					body: t('shell.notification.update.body'),
					time: t('shell.notification.update.time'),
				};
			}
			return null;
		}
	}
}
