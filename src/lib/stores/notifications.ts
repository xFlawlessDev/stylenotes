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

const seed: AppNotification[] = [
	{
		id: 'n-weekly',
		kind: 'reminder',
		title: 'Weekly review is due',
		body: 'Friday evening is a good moment to close the loop on this week.',
		time: '12m ago',
		read: false,
	},
	{
		id: 'n-tip',
		kind: 'tip',
		title: 'Try the command palette',
		body: 'Press Ctrl K to search notes, jump between folders, and run actions.',
		time: '1h ago',
		read: false,
	},
	{
		id: 'n-sync',
		kind: 'sync',
		title: 'All notes saved locally',
		body: 'Your last edit was written to this device. Everything is up to date.',
		time: '3h ago',
		read: true,
	},
	{
		id: 'n-archive',
		kind: 'reminder',
		title: '3 notes are ready to archive',
		body: 'Notes untouched for a while can move to Archive to keep the list calm.',
		time: 'Yesterday',
		read: true,
	},
];

export function seedNotifications(): AppNotification[] {
	return seed.map((item) => ({ ...item }));
}

export async function loadNotifications(): Promise<AppNotification[]> {
	try {
		const items = await notificationsRepo.list();
		if (items.length) return items;
		const defaults = seedNotifications();
		await notificationsRepo.replaceAll(defaults);
		return defaults;
	} catch {
		return seedNotifications();
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