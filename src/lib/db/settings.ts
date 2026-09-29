import type { Settings } from '$lib/stores/settings.svelte';
import { getDb } from './connection';

export const settingsRepo = {
	async load(): Promise<Partial<Settings> | null> {
		const db = await getDb();
		const rows = await db.select<{ data: string }[]>(
			'SELECT data FROM settings WHERE id = 1'
		);
		if (!rows.length) return null;
		try {
			return JSON.parse(rows[0].data) as Partial<Settings>;
		} catch {
			return null;
		}
	},

	async save(settings: Settings): Promise<void> {
		const db = await getDb();
		await db.execute(
			`INSERT INTO settings (id, data) VALUES (1, $1)
			 ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
			[JSON.stringify(settings)]
		);
	},

	async clear(): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM settings');
	},
};
