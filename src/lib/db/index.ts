import Database from '@tauri-apps/plugin-sql';
import type { Note } from '$lib/content/content';
import type { CustomFolder } from '$lib/stores/notes';
import type { AppNotification } from '$lib/stores/notifications';
import type { Settings } from '$lib/stores/settings.svelte';
import { isTauri } from '$lib/windows';

export const DB_URL = 'sqlite:stylenotes.db';

let connection: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
	if (!isTauri) {
		return Promise.reject(new Error('SQLite is only available inside the Tauri runtime'));
	}
	if (!connection) {
		connection = Database.load(DB_URL);
	}
	return connection;
}

type NoteRow = {
	id: string;
	title: string;
	folder: string;
	body: string;
	excerpt: string;
	words: number;
	chars: number;
	pinned: number;
	updated: string;
};

type TagRow = { note_id: string; tag: string };

function toNote(row: NoteRow, tags: string[]): Note {
	return {
		id: row.id,
		title: row.title,
		folder: row.folder,
		tags,
		updated: row.updated,
		pinned: Boolean(row.pinned),
		excerpt: row.excerpt,
		body: row.body,
		words: Number(row.words) || 0,
		chars: Number(row.chars) || 0,
	};
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
	await db.execute('DELETE FROM tags WHERE note_id = $1', [noteId]);
	for (const tag of tags) {
		await db.execute('INSERT OR IGNORE INTO tags (note_id, tag) VALUES ($1, $2)', [noteId, tag]);
	}
}

export const notesRepo = {
	async list(): Promise<Note[]> {
		const db = await getDb();
		const rows = await db.select<NoteRow[]>(
			'SELECT * FROM notes ORDER BY pinned DESC, created_at DESC'
		);
		const tags = await tagsByNote();
		return rows.map((row) => toNote(row, tags.get(row.id) ?? []));
	},

	async count(): Promise<number> {
		const db = await getDb();
		const rows = await db.select<{ total: number }[]>('SELECT COUNT(*) AS total FROM notes');
		return Number(rows[0]?.total ?? 0);
	},

	async upsert(note: Note): Promise<void> {
		const db = await getDb();
		await db.execute(
			`INSERT INTO notes (id, title, folder, body, excerpt, words, chars, pinned, updated)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 ON CONFLICT(id) DO UPDATE SET
				title = excluded.title,
				folder = excluded.folder,
				body = excluded.body,
				excerpt = excluded.excerpt,
				words = excluded.words,
				chars = excluded.chars,
				pinned = excluded.pinned,
				updated = excluded.updated`,
			[
				note.id,
				note.title,
				note.folder,
				note.body,
				note.excerpt,
				note.words,
				note.chars,
				note.pinned ? 1 : 0,
				note.updated,
			]
		);
		await writeTags(note.id, note.tags);
	},

	async remove(id: string): Promise<void> {
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
				`INSERT INTO notes (id, title, folder, body, excerpt, words, chars, pinned, updated)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				[
					note.id,
					note.title,
					note.folder,
					note.body,
					note.excerpt,
					note.words,
					note.chars,
					note.pinned ? 1 : 0,
					note.updated,
				]
			);
			await writeTags(note.id, note.tags);
		}
	},
};

export const foldersRepo = {
	async list(): Promise<CustomFolder[]> {
		const db = await getDb();
		const rows = await db.select<
			{ id: string; label: string; icon: string | null; position: number | null }[]
		>('SELECT id, label, icon, position FROM folders ORDER BY position ASC, created_at ASC');
		return rows.map((row) => ({
			id: row.id,
			label: row.label,
			icon: row.icon ?? undefined,
			position: row.position ?? undefined,
		}));
	},

	async upsert(folder: CustomFolder, position?: number): Promise<void> {
		const db = await getDb();
		const pos = position ?? folder.position ?? null;
		await db.execute(
			`INSERT INTO folders (id, label, icon, position) VALUES ($1, $2, $3, $4)
			 ON CONFLICT(id) DO UPDATE SET label = excluded.label, icon = excluded.icon, position = excluded.position`,
			[folder.id, folder.label, folder.icon ?? null, pos]
		);
	},

	async remove(id: string): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM folders WHERE id = $1', [id]);
	},

	async replaceAll(folders: CustomFolder[]): Promise<void> {
		const db = await getDb();
		await db.execute('DELETE FROM folders');
		for (const [index, folder] of folders.entries()) {
			await db.execute('INSERT INTO folders (id, label, icon, position) VALUES ($1, $2, $3, $4)', [
				folder.id,
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