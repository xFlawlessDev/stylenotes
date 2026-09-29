import { getDb } from './connection';

export const metaRepo = {
	async get(key: string): Promise<string | null> {
		const db = await getDb();
		const rows = await db.select<{ value: string }[]>(
			'SELECT value FROM meta WHERE key = $1',
			[key]
		);
		return rows[0]?.value ?? null;
	},

	async set(key: string, value: string): Promise<void> {
		const db = await getDb();
		await db.execute(
			`INSERT INTO meta (key, value) VALUES ($1, $2)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[key, value]
		);
	},
};
