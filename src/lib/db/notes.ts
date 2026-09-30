import { invoke } from '@tauri-apps/api/core';
import type { Note } from '$lib/content/content';
import { getDb } from './connection';

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
	created_at: string | null;
	journal_day: string | null;
};

type TagRow = { note_id: string; tag: string };

/** SQLite `created_at` is `datetime('now')` — UTC, no zone designator. */
function parseSqliteDate(raw: string | null): number | undefined {
	if (!raw) return undefined;
	const parsed = Date.parse(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
	return Number.isFinite(parsed) ? parsed : undefined;
}

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
	const createdAt = parseSqliteDate(row.created_at);
	if (createdAt != null) note.createdAt = createdAt;
	if (row.journal_day) note.journalDay = row.journal_day;
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
					// Only the first save sets the birthday; the SQL `ON CONFLICT`
					// keeps the stored value on every later save (#D17).
					createdAt: note.createdAt ?? updatedAt,
					// Journal day is a plain field: it may be set later (a note can
					// become a journal entry) and must follow the row on update.
					journalDay: note.journalDay ?? null,
					tags: note.tags,
				});
				return;
			} catch {
				// Write pool unavailable (e.g. older build): fall through to the
				// multi-statement path so saving still works.
			}
		}
		const db = await getDb();
		const createdAt = new Date(note.createdAt ?? updatedAt).toISOString();
		if (!note.workspaceId) {
			await db.execute(
				`INSERT INTO notes (id, title, folder, body, excerpt, words, chars, pinned, overlay, updated, updated_at, created_at, journal_day)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
				 ON CONFLICT(id) DO UPDATE SET title = excluded.title, folder = excluded.folder, body = excluded.body,
				 excerpt = excluded.excerpt, words = excluded.words, chars = excluded.chars, pinned = excluded.pinned,
				 overlay = excluded.overlay, updated = excluded.updated, updated_at = excluded.updated_at,
				 journal_day = excluded.journal_day`,
				[note.id, note.title, note.folder, note.body, note.excerpt, note.words, note.chars, note.pinned ? 1 : 0, note.overlay ? 1 : 0, note.updated, updatedAt, createdAt, note.journalDay ?? null]
			);
			await writeTags(note.id, note.tags);
			return;
		}
		await db.execute(
			`INSERT INTO notes (id, workspace_id, title, folder, body, excerpt, words, chars, pinned, overlay, updated, updated_at, created_at, journal_day)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
				updated_at = excluded.updated_at,
				journal_day = excluded.journal_day`,
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
				createdAt,
				note.journalDay ?? null,
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
				`INSERT INTO notes (id, workspace_id, title, folder, body, excerpt, words, chars, pinned, overlay, updated, updated_at, journal_day)
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
					note.journalDay ?? null,
				]
			);
			await writeTags(note.id, note.tags);
		}
	},
};
