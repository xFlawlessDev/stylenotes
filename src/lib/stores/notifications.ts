import { browser } from '$app/environment';

export type NotificationKind = 'reminder' | 'sync' | 'tip' | 'mention';

export type AppNotification = {
	id: string;
	kind: NotificationKind;
	title: string;
	body: string;
	time: string;
	read: boolean;
};

const KEY = 'stylenotes.notifications.v1';

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

export function loadNotifications(): AppNotification[] {
	if (!browser) return seed.map((item) => ({ ...item }));
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return seed.map((item) => ({ ...item }));
		const parsed = JSON.parse(raw) as AppNotification[];
		return Array.isArray(parsed) && parsed.length ? parsed : seed.map((item) => ({ ...item }));
	} catch {
		return seed.map((item) => ({ ...item }));
	}
}

export function saveNotifications(items: AppNotification[]) {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, JSON.stringify(items));
	} catch {
		/* ignore */
	}
}

export function resetNotifications(): AppNotification[] {
	return seed.map((item) => ({ ...item }));
}