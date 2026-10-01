import { persistNotifications, resetNotifications, type AppNotification } from '$lib/stores/notifications';

/** The reactive slice the notification operations read and write. */
export type NotificationOpsPort = {
	notifications: AppNotification[];
};

/**
 * Every mutation of the notification list.
 *
 * Extracted from the workspace controller (which owns the state) so the list
 * is always persisted in the same breath it changes: a notification written
 * to memory alone would be silently dropped by the next write from any other
 * path, and one written only to SQLite would not appear until a reload.
 *
 * `add` is what the app itself raises — see `stores/memory-nudge.ts` for the
 * one that decides *when*.
 */
export function createNotificationOps(port: NotificationOpsPort) {
	/** Puts a new notification at the top, unless that id is already shown. */
	function addNotification(notification: AppNotification): void {
		if (port.notifications.some((item) => item.id === notification.id)) return;
		port.notifications = [notification, ...port.notifications];
		void persistNotifications(port.notifications);
	}

	function markRead(id: string): void {
		port.notifications = port.notifications.map((item) =>
			item.id === id ? { ...item, read: true } : item
		);
		void persistNotifications(port.notifications);
	}

	function markAllRead(): void {
		port.notifications = port.notifications.map((item) => ({ ...item, read: true }));
		void persistNotifications(port.notifications);
	}

	function clearNotifications(): void {
		port.notifications = [];
		void persistNotifications([]);
	}

	/** Restores the seed rows and replaces the list with them. */
	async function resetNotificationsList(): Promise<void> {
		port.notifications = await resetNotifications();
	}

	return { addNotification, markRead, markAllRead, clearNotifications, resetNotificationsList };
}

export type NotificationOps = ReturnType<typeof createNotificationOps>;
