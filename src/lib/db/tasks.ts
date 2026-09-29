import type { Task, TaskDependency } from '$lib/stores/tasks';
import { taskNoteIds } from '$lib/stores/tasks';
import { getDb } from './connection';

type TaskRow = {
	id: string;
	workspace_id: string;
	title: string;
	notes: string;
	status: string;
	priority: string;
	folder: string;
	note_id: string | null;
	start_at: string | null;
	due_at: string | null;
	position: number;
	completed: number;
	overlay: number;
};

type TaskNoteRow = { task_id: string; note_id: string };

type DependencyRow = { task_id: string; depends_on_task_id: string; created_at: string };

/**
 * Linked notes per task, in insertion order. `task_notes` is the source of
 * truth; `note_id` is mirrored on the task row so older builds still see the
 * first link.
 */
async function linkRowsByTask(): Promise<Map<string, string[]>> {
	const db = await getDb();
	const rows = await db.select<TaskNoteRow[]>(
		'SELECT task_id, note_id FROM task_notes ORDER BY rowid ASC'
	);
	const map = new Map<string, string[]>();
	for (const row of rows) {
		const list = map.get(row.task_id) ?? [];
		list.push(row.note_id);
		map.set(row.task_id, list);
	}
	return map;
}

async function writeTaskNotes(taskId: string, noteIds: string[]) {
	const db = await getDb();
	await db.execute('DELETE FROM task_notes WHERE task_id = $1', [taskId]);
	for (const noteId of noteIds) {
		await db.execute('INSERT OR IGNORE INTO task_notes (task_id, note_id) VALUES ($1, $2)', [
			taskId,
			noteId,
		]);
	}
}

function toTask(row: TaskRow, noteIds: string[] = []): Task {
	// `note_id` is only a mirror of the head, so prefer the ordered link rows and
	// fall back to the column for rows written before `task_notes` existed.
	const links = noteIds.length ? noteIds : row.note_id ? [row.note_id] : [];
	return {
		id: row.id,
		workspaceId: row.workspace_id ?? 'workspace-default',
		title: row.title,
		notes: row.notes,
		status: row.status as Task['status'],
		priority: row.priority as Task['priority'],
		folder: row.folder,
		noteId: links[0] ?? row.note_id ?? null,
		noteIds: links,
		startAt: row.start_at ?? null,
		dueAt: row.due_at ?? null,
		position: Number(row.position) || 0,
		completed: Boolean(row.completed),
		overlay: Boolean(row.overlay),
	};
}

export const tasksRepo = {
	async list(workspaceId?: string): Promise<Task[]> {
		const db = await getDb();
		const rows = await db.select<TaskRow[]>(
			workspaceId ? 'SELECT * FROM tasks WHERE workspace_id = $1 ORDER BY position ASC, created_at ASC' : 'SELECT * FROM tasks ORDER BY position ASC, created_at ASC',
			workspaceId ? [workspaceId] : []
		);
		const links = await linkRowsByTask();
		return rows.map((row) => toTask(row, links.get(row.id) ?? []));
	},

	async count(workspaceId?: string): Promise<number> {
		const db = await getDb();
		const rows = await db.select<{ total: number }[]>(
			workspaceId ? 'SELECT COUNT(*) AS total FROM tasks WHERE workspace_id = $1' : 'SELECT COUNT(*) AS total FROM tasks',
			workspaceId ? [workspaceId] : []
		);
		return Number(rows[0]?.total ?? 0);
	},

	async upsert(task: Task): Promise<void> {
		const db = await getDb();
		const noteIds = taskNoteIds(task);
		await db.execute(
			`INSERT INTO tasks
				(id, workspace_id, title, notes, status, priority, folder, note_id, start_at, due_at, position, completed, overlay, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, datetime('now'))
			 ON CONFLICT(id) DO UPDATE SET
				workspace_id = excluded.workspace_id,
				title = excluded.title,
				notes = excluded.notes,
				status = excluded.status,
				priority = excluded.priority,
				folder = excluded.folder,
				note_id = excluded.note_id,
				start_at = excluded.start_at,
				due_at = excluded.due_at,
				position = excluded.position,
				completed = excluded.completed,
				overlay = excluded.overlay,
				updated_at = datetime('now')`,
			[
				task.id,
				task.workspaceId ?? 'workspace-default',
				task.title,
				task.notes,
				task.status,
				task.priority,
				task.folder,
				// `task_notes` owns the full list; this column mirrors the first link.
				noteIds[0] ?? null,
				task.startAt,
				task.dueAt,
				task.position,
				task.completed ? 1 : 0,
				task.overlay ? 1 : 0,
			]
		);
		await writeTaskNotes(task.id, noteIds);
	},

	async remove(id: string): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM task_dependencies WHERE task_id = $1 OR depends_on_task_id = $1', [id]);
		await db.execute('DELETE FROM task_notes WHERE task_id = $1', [id]);
		await db.execute('DELETE FROM tasks WHERE id = $1', [id]);
	},

	async clear(): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM task_notes');
		await db.execute('DELETE FROM tasks');
	},

	async replaceAll(tasks: Task[]): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM task_notes');
		await db.execute('DELETE FROM tasks');
		for (const task of tasks) {
			const noteIds = taskNoteIds(task);
			await db.execute(
				`INSERT INTO tasks
					(id, workspace_id, title, notes, status, priority, folder, note_id, start_at, due_at, position, completed, overlay)
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
				[
					task.id,
					task.workspaceId ?? 'workspace-default',
					task.title,
					task.notes,
					task.status,
					task.priority,
					task.folder,
					noteIds[0] ?? null,
					task.startAt,
					task.dueAt,
					task.position,
					task.completed ? 1 : 0,
					task.overlay ? 1 : 0,
				]
			);
			for (const noteId of noteIds) {
				await db.execute(
					'INSERT OR IGNORE INTO task_notes (task_id, note_id) VALUES ($1, $2)',
					[task.id, noteId]
				);
			}
		}
	},
};

export const dependenciesRepo = {
	async list(workspaceId: string): Promise<TaskDependency[]> {
		const db = await getDb();
		const rows = await db.select<DependencyRow[]>(
			`SELECT d.task_id, d.depends_on_task_id, d.created_at
			 FROM task_dependencies d JOIN tasks t ON t.id = d.task_id
			 WHERE t.workspace_id = $1 ORDER BY d.created_at ASC`,
			[workspaceId]
		);
		return rows.map((row) => ({ taskId: row.task_id, dependsOnTaskId: row.depends_on_task_id, createdAt: row.created_at }));
	},

	async add(taskId: string, dependsOnTaskId: string, workspaceId: string): Promise<void> {
		const db = await getDb();
		if (taskId === dependsOnTaskId) throw new Error('A task cannot depend on itself');
		const rows = await db.select<{ total: number }[]>(
			`SELECT COUNT(*) AS total FROM tasks
			 WHERE workspace_id = $1 AND id IN ($2, $3)`,
			[workspaceId, taskId, dependsOnTaskId]
		);
		if (Number(rows[0]?.total ?? 0) !== 2) throw new Error('Dependencies must stay inside one workspace');
		await db.execute('INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)', [taskId, dependsOnTaskId]);
	},

	async remove(taskId: string, dependsOnTaskId: string): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2', [taskId, dependsOnTaskId]);
	},
};
