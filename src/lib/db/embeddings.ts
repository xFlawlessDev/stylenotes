/**
 * Storage for the semantic memory index (docs/design/constella-features.md #D5).
 *
 * The `embeddings` table is a derivative: it can be dropped and rebuilt from
 * `notes.body` at any time, so this repo never migrates note data and never
 * treats a missing row as data loss. Every write resolves to `boolean` so the
 * store can surface a failure instead of losing it (AGENTS.md).
 *
 * Vectors cross this boundary as raw bytes; encoding/decoding lives in
 * `content/embeddings.ts` (decision #4), so the layout has one definition.
 */

import type Database from '@tauri-apps/plugin-sql';
import { getDb } from './index';
import type { EmbedEntityKind } from '$lib/content/memory-types';
import { decodeVectorBase64 } from '$lib/content/embeddings';

type EmbeddingRow = {
	entity_kind: string;
	entity_id: string;
	model: string;
	dim: number;
	vec: string;
	content_hash: string;
	updated_at: number;
};

/** One vector as the store sends it: already encoded by the TS codec. */
export type EmbeddingWrite = {
	entityKind: EmbedEntityKind;
	entityId: string;
	model: string;
	dim: number;
	/** Base64 of the little-endian `f32` bytes; the SQL plugin has no BLOB bind. */
	vecBase64: string;
	contentHash: string;
	updatedAt: number;
};

/** One vector as the store reads it: the Base64 payload, decoded by the store. */
export type EmbeddingRecord = {
	entityKind: EmbedEntityKind;
	entityId: string;
	model: string;
	dim: number;
	/** Base64 of the little-endian `f32` bytes. */
	vecBase64: string;
	contentHash: string;
	updatedAt: number;
};

function toRecord(row: EmbeddingRow): EmbeddingRecord | null {
	const dim = Number(row.dim) || 0;
	const vecBase64 = typeof row.vec === 'string' ? row.vec : '';
	// A row whose payload does not decode to exactly `dim` floats is treated as
	// not indexed, so the next build rewrites it instead of using noise.
	if (!vecBase64 || !decodeVectorBase64(vecBase64, dim)) return null;
	return {
		entityKind: row.entity_kind === 'task' ? 'task' : 'note',
		entityId: row.entity_id,
		model: row.model,
		dim,
		vecBase64,
		contentHash: row.content_hash,
		updatedAt: Number(row.updated_at) || 0,
	};
}

async function writeOne(db: Database, write: EmbeddingWrite): Promise<void> {
	await db.execute(
		`INSERT INTO embeddings (entity_kind, entity_id, model, dim, vec, content_hash, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT(entity_kind, entity_id) DO UPDATE SET
			model = excluded.model,
			dim = excluded.dim,
			vec = excluded.vec,
			content_hash = excluded.content_hash,
			updated_at = excluded.updated_at`,
		[
			write.entityKind,
			write.entityId,
			write.model,
			write.dim,
			// Base64 text, not a BLOB: `tauri-plugin-sql` binds a `Uint8Array` as
			// text anyway (it has no BLOB binding), so being explicit keeps the
			// row small and the read path unambiguous.
			write.vecBase64,
			write.contentHash,
			write.updatedAt,
		]
	);
}

export const embeddingsRepo = {
	/** Every stored vector, so the store can rank and diff in memory. */
	async list(): Promise<EmbeddingRecord[]> {
		try {
			const db = await getDb();
			const rows = await db.select<EmbeddingRow[]>('SELECT * FROM embeddings');
			return rows.map(toRecord).filter((row): row is EmbeddingRecord => row !== null);
		} catch {
			return [];
		}
	},

	/** Vectors for one model, the set a rebuild compares against. */
	async listByModel(model: string): Promise<EmbeddingRecord[]> {
		try {
			const db = await getDb();
			const rows = await db.select<EmbeddingRow[]>(
				'SELECT * FROM embeddings WHERE model = $1',
				[model]
			);
			return rows.map(toRecord).filter((row): row is EmbeddingRecord => row !== null);
		} catch {
			return [];
		}
	},

	async get(entityKind: EmbedEntityKind, entityId: string): Promise<EmbeddingRecord | null> {
		try {
			const db = await getDb();
			const rows = await db.select<EmbeddingRow[]>(
				'SELECT * FROM embeddings WHERE entity_kind = $1 AND entity_id = $2',
				[entityKind, entityId]
			);
			return rows.length ? toRecord(rows[0]) : null;
		} catch {
			return null;
		}
	},

	/** Writes one vector. Returns false on failure rather than throwing. */
	async put(write: EmbeddingWrite): Promise<boolean> {
		try {
			const db = await getDb();
			await writeOne(db, write);
			return true;
		} catch {
			return false;
		}
	},

	/** Writes a batch in one pass. A single bad row fails the batch loudly. */
	async putMany(writes: EmbeddingWrite[]): Promise<boolean> {
		if (writes.length === 0) return true;
		try {
			const db = await getDb();
			for (const write of writes) {
				await writeOne(db, write);
			}
			return true;
		} catch {
			return false;
		}
	},

	async remove(entityKind: EmbedEntityKind, entityId: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM embeddings WHERE entity_kind = $1 AND entity_id = $2', [
				entityKind,
				entityId,
			]);
			return true;
		} catch {
			return false;
		}
	},

	/** Drops every vector. The next backfill rebuilds the index from notes. */
	async clear(): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM embeddings');
			return true;
		} catch {
			return false;
		}
	},

	async count(): Promise<number> {
		try {
			const db = await getDb();
			const rows = await db.select<{ total: number }[]>(
				'SELECT COUNT(*) AS total FROM embeddings'
			);
			return Number(rows[0]?.total ?? 0);
		} catch {
			return 0;
		}
	},
};

