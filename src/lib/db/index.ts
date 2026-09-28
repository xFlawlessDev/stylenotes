import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import type { Note } from '$lib/content/content';
import type { CustomFolder } from '$lib/stores/notes';
import type { AppNotification } from '$lib/stores/notifications';
import type { Settings } from '$lib/stores/settings.svelte';
import type { Task, TaskDependency } from '$lib/stores/tasks';
import { taskNoteIds } from '$lib/stores/tasks';
import { isTauri } from '$lib/windows';

export const DB_URL = 'sqlite:stylenotes.db';

let connection: Promise<Database> | null = null;

/**
 * Pragmas applied once per connection, before any query runs.
 *
 * WAL lets readers and writers coexist (the app opens one connection per
 * window against the same file), `busy_timeout` turns a lock collision into a
 * short wait instead of an instant `SQLITE_BUSY`, and `synchronous=NORMAL` is
 * the safe companion to WAL for a desktop app. `foreign_keys=ON` activates the
 * `ON DELETE CASCADE` clauses declared in the schema (off by default in
 * SQLite); the repos still delete children explicitly, so this only enforces
 * what is already intended.
 */
const CONNECTION_PRAGMAS = [
	'PRAGMA journal_mode = WAL',
	'PRAGMA synchronous = NORMAL',
	'PRAGMA busy_timeout = 5000',
	'PRAGMA foreign_keys = ON',
];

async function configureConnection(db: Database): Promise<Database> {
	for (const pragma of CONNECTION_PRAGMAS) {
		try {
			await db.execute(pragma);
		} catch {
			// A pragma the platform refuses must not take the whole DB down.
		}
	}
	return db;
}

export function getDb(): Promise<Database> {
	if (!isTauri) {
		return Promise.reject(new Error('SQLite is only available inside the Tauri runtime'));
	}
	if (!connection) {
		connection = Database.load(DB_URL).then(configureConnection);
		// A failed load must not be cached as a permanently broken connection.
		connection = connection.catch((error) => {
			connection = null;
			throw error;
		});
	}
	return connection;
}

type NoteRow = {
	id: string;
	workspace_id: string;
	title: string;
	folder: string;
	body: string;
	excerpt: string;
	words: number;
	chars: number;
	pinned: number;
	overlay: number;
	updated: string;
	updated_at: number | null;
};

type TagRow = { note_id: string; tag: string };

function toNote(row: NoteRow, tags: string[]): Note {
	const note: Note = {
		id: row.id,
		title: row.title,
		folder: row.folder,
		tags,
		updated: row.updated,
		pinned: Boolean(row.pinned),
		overlay: Boolean(row.overlay),
		excerpt: row.excerpt,
		body: row.body,
		words: Number(row.words) || 0,
		chars: Number(row.chars) || 0,
	};
	if (row.workspace_id) note.workspaceId = row.workspace_id;
	if (row.updated_at != null) note.updatedAt = Number(row.updated_at);
	return note;
}

async function tagsByNote(): Promise<Map<string, string[]>> {
	const db = await getDb();
	const rows = await db.select<TagRow[]>('SELECT note_id, tag FROM tags ORDER BY rowid ASC');
	const map = new Map<string, string[]>();
	for (const row of rows) {
		const list = map.get(row.note_id) ?? [];
		list.push(row.tag);
		map.set(row.note_id, list);
	}
	return map;
}

async function writeTags(noteId: string, tags: string[]) {
	const db = await getDb();
	// Typing usually leaves tags untouched, so compare before rewriting: the
	// old delete + insert per tag was the bulk of every auto-save write.
	const rows = await db.select<{ tag: string }[]>(
		'SELECT tag FROM tags WHERE note_id = $1 ORDER BY rowid ASC',
		[noteId]
	);
	const current = rows.map((row) => row.tag);
	if (current.length === tags.length && current.every((tag, index) => tag === tags[index])) {
		return;
	}
	await db.execute('DELETE FROM tags WHERE note_id = $1', [noteId]);
	for (const tag of tags) {
		await db.execute('INSERT OR IGNORE INTO tags (note_id, tag) VALUES ($1, $2)', [noteId, tag]);
	}
}

export const notesRepo = {
	async list(workspaceId?: string): Promise<Note[]> {
		const db = await getDb();
		const rows = await db.select<NoteRow[]>(
			workspaceId ? 'SELECT * FROM notes WHERE workspace_id = $1 ORDER BY pinned DESC, created_at DESC' : 'SELECT * FROM notes ORDER BY pinned DESC, created_at DESC',
			workspaceId ? [workspaceId] : []
		);
		const tags = await tagsByNote();
		return rows.map((row) => toNote(row, tags.get(row.id) ?? []));
	},

	async count(workspaceId?: string): Promise<number> {
		const db = await getDb();
		const rows = await db.select<{ total: number }[]>(
			workspaceId ? 'SELECT COUNT(*) AS total FROM notes WHERE workspace_id = $1' : 'SELECT COUNT(*) AS total FROM notes',
			workspaceId ? [workspaceId] : []
		);
		return Number(rows[0]?.total ?? 0);
	},

	async upsert(note: Note): Promise<void> {
		const updatedAt = note.updatedAt ?? Date.now();
		// Notes written by older builds may have no workspace; the transaction
		// command always sets one, so those keep the direct path.
		if (note.workspaceId) {
			try {
				await invoke('note_upsert_tx', {
					id: note.id,
					workspaceId: note.workspaceId,
					title: note.title,
					folder: note.folder,
					body: note.body,
					excerpt: note.excerpt,
					words: note.words,
					chars: note.chars,
					pinned: note.pinned,
					overlay: note.overlay,
					updated: note.updated,
					updatedAt,
					tags: note.tags,
				});
				return;
			} catch {
				// Write pool unavailable (e.g. older build): fall through to the
				// multi-statement path so saving still works.
			}
		}
		const db = await getDb();
		if (!note.workspaceId) {
			await db.execute(
				`INSERT INTO notes (id, title, folder, body, excerpt, words, chars, pinned, overlay, updated, updated_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
				 ON CONFLICT(id) DO UPDATE SET title = excluded.title, folder = excluded.folder, body = excluded.body,
				 excerpt = excluded.excerpt, words = excluded.words, chars = excluded.chars, pinned = excluded.pinned,
				 overlay = excluded.overlay, updated = excluded.updated, updated_at = excluded.updated_at`,
				[note.id, note.title, note.folder, note.body, note.excerpt, note.words, note.chars, note.pinned ? 1 : 0, note.overlay ? 1 : 0, note.updated, updatedAt]
			);
			await writeTags(note.id, note.tags);
			return;
		}
		await db.execute(
			`INSERT INTO notes (id, workspace_id, title, folder, body, excerpt, words, chars, pinned, overlay, updated, updated_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			 ON CONFLICT(id) DO UPDATE SET
				workspace_id = excluded.workspace_id,
				title = excluded.title,
				folder = excluded.folder,
				body = excluded.body,
				excerpt = excluded.excerpt,
				words = excluded.words,
				chars = excluded.chars,
				pinned = excluded.pinned,
				overlay = excluded.overlay,
				updated = excluded.updated,
				updated_at = excluded.updated_at`,
			[
				note.id,
				note.workspaceId ?? 'workspace-default',
				note.title,
				note.folder,
				note.body,
				note.excerpt,
				note.words,
				note.chars,
				note.pinned ? 1 : 0,
				note.overlay ? 1 : 0,
				note.updated,
				updatedAt,
			]
		);
		await writeTags(note.id, note.tags);
	},

	async remove(id: string): Promise<void> {
		try {
			await invoke('note_remove_tx', { id });
			return;
		} catch {
			// Fall through to the direct path when the write pool is unavailable.
		}
		const db = await getDb();
		await db.execute('DELETE FROM tags WHERE note_id = $1', [id]);
		await db.execute('DELETE FROM notes WHERE id = $1', [id]);
	},

	async replaceAll(notes: Note[]): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM tags');
		await db.execute('DELETE FROM notes');
		for (const note of notes) {
			await db.execute(
				`INSERT INTO notes (id, workspace_id, title, folder, body, excerpt, words, chars, pinned, overlay, updated, updated_at)
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
				[
					note.id,
					note.workspaceId ?? 'workspace-default',
					note.title,
					note.folder,
					note.body,
					note.excerpt,
					note.words,
					note.chars,
					note.pinned ? 1 : 0,
					note.overlay ? 1 : 0,
					note.updated,
					note.updatedAt ?? Date.now(),
				]
			);
			await writeTags(note.id, note.tags);
		}
	},
};

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

type DependencyRow = { task_id: string; depends_on_task_id: string; created_at: string };

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

// `workspacesRepo` lives in `./workspaces`: it owns the workspace table plus
// the records scoped to it (see the migration that added `workspace_id`).
