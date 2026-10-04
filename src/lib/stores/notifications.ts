import { notificationsRepo } from '$lib/db';

export type NotificationKind = 'reminder' | 'sync' | 'tip' | 'mention' | 'update';

export type AppNotification = {
	id: string;
	kind: NotificationKind;
	title: string;
	body: string;
	time: string;
	read: boolean;
};

/**
 * Ids of the four static rows older builds wrote on first run. They are kept
 * only so a database that still holds them can be cleaned up: the panel is
 * dynamic now (see `content/notification-insights.ts`), and the rows it shows
 * are events the app raised, never a canned suggestion.
 */
const LEGACY_SEED_IDS = new Set(['n-weekly', 'n-tip', 'n-sync', 'n-archive']);

/**
 * No rows are seeded. Every notification is either raised by the app in
 * response to something real — an available update, a semantic tool that could
 * not run — or computed live from state by the panel.
 */
export function seedNotifications(): AppNotification[] {
	return [];
}

export async function loadNotifications(): Promise<AppNotification[]> {
	try {
		const items = (await notificationsRepo.list()).filter(
			(item) => !LEGACY_SEED_IDS.has(item.id)
		);
		if (items.length) return items;
		await notificationsRepo.replaceAll([]);
		return [];
	} catch {
		return [];
	}
}

export async function persistNotifications(items: AppNotification[]): Promise<void> {
	try {
		await notificationsRepo.replaceAll(items);
	} catch {
		/* ignore */
	}
}

export async function resetNotifications(): Promise<AppNotification[]> {
	const defaults = seedNotifications();
	await persistNotifications(defaults);
	return defaults;
}
