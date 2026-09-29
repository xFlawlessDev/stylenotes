import type { CustomFolder } from '$lib/stores/notes';
import { getDb } from './connection';

export const foldersRepo = {
	async list(workspaceId?: string): Promise<CustomFolder[]> {
		const db = await getDb();
		const rows = await db.select<
			{ id: string; label: string; icon: string | null; position: number | null }[]
		>(
			workspaceId
				? 'SELECT id, label, icon, position FROM folders WHERE workspace_id = $1 ORDER BY position ASC, created_at ASC'
				: 'SELECT id, label, icon, position FROM folders ORDER BY position ASC, created_at ASC',
			workspaceId ? [workspaceId] : []
		);
		return rows.map((row) => ({
			id: row.id,
			label: row.label,
			icon: row.icon ?? undefined,
			position: row.position ?? undefined,
		}));
	},

	async upsert(folder: CustomFolder, position?: number, workspaceId?: string): Promise<void> {
		const db = await getDb();
		const pos = position ?? folder.position ?? null;
		if (!workspaceId) {
			await db.execute(
				`INSERT INTO folders (id, label, icon, position) VALUES ($1, $2, $3, $4)
				 ON CONFLICT(id) DO UPDATE SET label = excluded.label, icon = excluded.icon, position = excluded.position`,
				[folder.id, folder.label, folder.icon ?? null, pos]
			);
			return;
		}
		await db.execute(
			`INSERT INTO folders (id, workspace_id, label, icon, position) VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id, label = excluded.label, icon = excluded.icon, position = excluded.position`,
			[folder.id, workspaceId, folder.label, folder.icon ?? null, pos]
		);
	},

	async remove(id: string): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM folders WHERE id = $1', [id]);
	},

	async replaceAll(folders: CustomFolder[], workspaceId?: string): Promise<void> {
		const db = await getDb();
		await db.execute(workspaceId ? 'DELETE FROM folders WHERE workspace_id = $1' : 'DELETE FROM folders', workspaceId ? [workspaceId] : []);
		for (const [index, folder] of folders.entries()) {
			if (!workspaceId) {
				await db.execute('INSERT INTO folders (id, label, icon, position) VALUES ($1, $2, $3, $4)', [folder.id, folder.label, folder.icon ?? null, folder.position ?? index]);
				continue;
			}
			await db.execute('INSERT INTO folders (id, workspace_id, label, icon, position) VALUES ($1, $2, $3, $4, $5)', [
				folder.id,
				workspaceId,
				folder.label,
				folder.icon ?? null,
				folder.position ?? index,
			]);
		}
	},
};
