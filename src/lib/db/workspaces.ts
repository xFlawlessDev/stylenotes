import type { Workspace } from '$lib/workspace';
import { getDb } from './index';

/**
 * Workspaces plus the records scoped to them. Writes return `false` on
 * failure so the caller (the store) can roll back and surface the error.
 */
export const workspacesRepo = {
	async list(): Promise<Workspace[]> {
		const db = await getDb();
		const rows = await db.select<{ id: string; name: string; color: string; created_at: string }[]>(
			'SELECT id, name, color, created_at FROM workspaces ORDER BY created_at ASC'
		);
		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			color: row.color,
			createdAt: row.created_at,
		}));
	},

	async create(workspace: Workspace): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute(
				'INSERT INTO workspaces (id, name, color, created_at) VALUES ($1, $2, $3, $4)',
				[workspace.id, workspace.name, workspace.color, workspace.createdAt]
			);
			return true;
		} catch {
			return false;
		}
	},

	async rename(id: string, name: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('UPDATE workspaces SET name = $1 WHERE id = $2', [name, id]);
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Deletes a workspace and everything scoped to it. The children go first
	 * and in dependency order so nothing dangles when SQLite runs without
	 * foreign-key enforcement.
	 */
	async remove(id: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute(
				'DELETE FROM tags WHERE note_id IN (SELECT id FROM notes WHERE workspace_id = $1)',
				[id]
			);
			await db.execute('DELETE FROM notes WHERE workspace_id = $1', [id]);
			await db.execute(
				`DELETE FROM task_dependencies
				 WHERE task_id IN (SELECT id FROM tasks WHERE workspace_id = $1)
				    OR depends_on_task_id IN (SELECT id FROM tasks WHERE workspace_id = $1)`,
				[id]
			);
			await db.execute('DELETE FROM tasks WHERE workspace_id = $1', [id]);
			await db.execute('DELETE FROM folders WHERE workspace_id = $1', [id]);
			await db.execute('DELETE FROM workspaces WHERE id = $1', [id]);
			return true;
		} catch {
			return false;
		}
	},
};
