/**
 * Catalog of stored attachment blobs (`attachments` table) and
 * the local half of the artifact design (docs/design/artifacts.md).
 *
 * The catalog is an **index**, not the truth: the blob on disk is identified by
 * its content hash, so a row that is missing or stale can always be rebuilt by
 * re-importing the file. Rows exist so the cloud sync layer can list the S3
 * objects a workspace references and so the UI can show name/size without
 * stat-ing every file.
 *
 * `rel_path` is the object key (`attachments/<ab>/<id>.<ext>`) — the same string
 * the store uses on disk and the future S3 client will use as its key.
 *
 * Every write resolves to a count of failures so callers can surface a problem
 * instead of losing it (AGENTS.md).
 */

import type Database from '@tauri-apps/plugin-sql';
import { getDb } from './index';
import { attachmentObjectPath } from '$lib/content/attachments';

type AttachmentRow = {
	id: string;
	ext: string;
	name: string;
	size: number;
	rel_path: string;
	origin_path: string;
	created_at: number;
	last_seen_at: number;
};

/** What an import hands the repo; `relPath` is derived from `id`/`ext`. */
export type AttachmentWrite = {
	id: string;
	ext: string;
	name: string;
	size: number;
	/** Where the file was attached from; diagnostics only, never synced as truth. */
	originPath: string;
};

export type AttachmentRecord = {
	id: string;
	ext: string;
	name: string;
	size: number;
	relPath: string;
	/** True when this blob was imported on this device (has a local origin). */
	hasLocalOrigin: boolean;
	createdAt: number;
	lastSeenAt: number;
};

function toRecord(row: AttachmentRow): AttachmentRecord {
	return {
		id: row.id,
		ext: row.ext,
		name: row.name,
		size: Number(row.size) || 0,
		relPath: row.rel_path,
		hasLocalOrigin: Boolean(row.origin_path),
		createdAt: Number(row.created_at) || 0,
		lastSeenAt: Number(row.last_seen_at) || 0,
	};
}

async function writeOne(db: Database, write: AttachmentWrite, now: number): Promise<void> {
	await db.execute(
		`INSERT INTO attachments (id, ext, name, size, rel_path, origin_path, created_at, last_seen_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			size = excluded.size,
			rel_path = excluded.rel_path,
			origin_path = excluded.origin_path,
			last_seen_at = excluded.last_seen_at`,
		[
			write.id,
			write.ext,
			write.name,
			write.size,
			attachmentObjectPath(write.id, write.ext),
			write.originPath,
			now,
			now,
		]
	);
}

export const attachmentsRepo = {
	/**
	 * Records imported blobs. Returns the number of rows that failed to save, so
	 * the caller can warn without undoing the on-disk import that already succeeded.
	 */
	async record(writes: AttachmentWrite[]): Promise<number> {
		if (writes.length === 0) return 0;
		try {
			const db = await getDb();
			const now = Date.now();
			let failures = 0;
			for (const write of writes) {
				try {
					await writeOne(db, write, now);
				} catch {
					failures += 1;
				}
			}
			return failures;
		} catch {
			return writes.length;
		}
	},

	async list(): Promise<AttachmentRecord[]> {
		try {
			const db = await getDb();
			const rows = await db.select<AttachmentRow[]>(
				'SELECT * FROM attachments ORDER BY created_at DESC'
			);
			return rows.map(toRecord);
		} catch {
			return [];
		}
	},

	async get(id: string): Promise<AttachmentRecord | null> {
		try {
			const db = await getDb();
			const rows = await db.select<AttachmentRow[]>('SELECT * FROM attachments WHERE id = $1', [
				id,
			]);
			return rows.length ? toRecord(rows[0]) : null;
		} catch {
			return null;
		}
	},

	/** Number of stored blobs, without loading the rows. */
	async count(): Promise<number> {
		try {
			const db = await getDb();
			const rows = await db.select<{ total: number }[]>('SELECT COUNT(*) AS total FROM attachments');
			return Number(rows[0]?.total) || 0;
		} catch {
			return 0;
		}
	},

	/** Removes a catalog row. Returns false on failure (the blob is untouched). */
	async remove(id: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM attachments WHERE id = $1', [id]);
			return true;
		} catch {
			return false;
		}
	},
};
