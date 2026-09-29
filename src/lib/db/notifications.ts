import type { AppNotification } from '$lib/stores/notifications';
import { getDb } from './connection';

type NotificationRow = {
	id: string;
	kind: string;
	title: string;
	body: string;
	time: string;
	read: number;
};

export const notificationsRepo = {
	async list(): Promise<AppNotification[]> {
		const db = await getDb();
		const rows = await db.select<NotificationRow[]>(
			'SELECT id, kind, title, body, time, read FROM notifications ORDER BY created_at DESC'
		);
		return rows.map((row) => ({
			id: row.id,
			kind: row.kind as AppNotification['kind'],
			title: row.title,
			body: row.body,
			time: row.time,
			read: Boolean(row.read),
		}));
	},

	async upsert(item: AppNotification): Promise<void> {
		const db = await getDb();
		await db.execute(
			`INSERT INTO notifications (id, kind, title, body, time, read)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT(id) DO UPDATE SET
				kind = excluded.kind,
				title = excluded.title,
				body = excluded.body,
				time = excluded.time,
				read = excluded.read`,
			[item.id, item.kind, item.title, item.body, item.time, item.read ? 1 : 0]
		);
	},

	async remove(id: string): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM notifications WHERE id = $1', [id]);
	},

	async clear(): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM notifications');
	},

	async replaceAll(items: AppNotification[]): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM notifications');
		for (const item of items) {
			await db.execute(
				`INSERT INTO notifications (id, kind, title, body, time, read)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[item.id, item.kind, item.title, item.body, item.time, item.read ? 1 : 0]
			);
		}
	},
};
