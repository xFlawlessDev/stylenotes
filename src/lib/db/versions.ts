import type { VersionEntity, VersionPayload, EntityVersion } from '$lib/content/version-types';
import { getDb } from './index';

type VersionRow = {
	id: string;
	entity: string;
	entity_id: string;
	payload: string;
	updated_at: number;
	reason: string;
	created_at: string;
};

function toVersion(row: VersionRow): EntityVersion {
	return {
		id: row.id,
		entity: row.entity === 'task' ? 'task' : 'note',
		entityId: row.entity_id,
		payload: parsePayload(row.payload),
		updatedAt: Number(row.updated_at),
		reason: (row.reason as EntityVersion['reason']) ?? 'auto',
		createdAt: row.created_at,
	};
}

/** A corrupt payload must not break the history list; show it as empty. */
function parsePayload(raw: string): VersionPayload {
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? (parsed as VersionPayload) : ({} as VersionPayload);
	} catch {
		return {} as VersionPayload;
	}
}

/**
 * Local version history, one table shared by notes and tasks. Not synced.
 * All helpers return `boolean` (or throw) so callers can surface failures.
 */
export const versionsRepo = {
	/** Newest first. */
	async list(entity: VersionEntity, entityId: string, limit = 200): Promise<EntityVersion[]> {
		const db = await getDb();
		const rows = await db.select<VersionRow[]>(
			`SELECT * FROM entity_versions WHERE entity = $1 AND entity_id = $2
			 ORDER BY updated_at DESC LIMIT $3`,
			[entity, entityId, limit]
		);
		return rows.map(toVersion);
	},

	/** The single newest version, used to decide whether to snapshot. */
	async latest(entity: VersionEntity, entityId: string): Promise<EntityVersion | null> {
		const db = await getDb();
		const rows = await db.select<VersionRow[]>(
			`SELECT * FROM entity_versions WHERE entity = $1 AND entity_id = $2
			 ORDER BY updated_at DESC LIMIT 1`,
			[entity, entityId]
		);
		return rows.length ? toVersion(rows[0]) : null;
	},

	async count(entity: VersionEntity, entityId: string): Promise<number> {
		const db = await getDb();
		const rows = await db.select<{ total: number }[]>(
			'SELECT COUNT(*) AS total FROM entity_versions WHERE entity = $1 AND entity_id = $2',
			[entity, entityId]
		);
		return Number(rows[0]?.total ?? 0);
	},

	async insert(version: EntityVersion): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute(
				`INSERT INTO entity_versions (id, entity, entity_id, payload, updated_at, reason)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					version.id,
					version.entity,
					version.entityId,
					JSON.stringify(version.payload),
					version.updatedAt,
					version.reason,
				]
			);
			return true;
		} catch {
			return false;
		}
	},

	/** Removes named versions; used by pruning. Returns the deleted count. */
	async removeMany(ids: string[]): Promise<number> {
		if (ids.length === 0) return 0;
		const db = await getDb();
		const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
		const result = await db.execute(
			`DELETE FROM entity_versions WHERE id IN (${placeholders})`,
			ids
		);
		return result.rowsAffected;
	},

	/** Drops every version of one record; called when the record is deleted. */
	async removeAll(entity: VersionEntity, entityId: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM entity_versions WHERE entity = $1 AND entity_id = $2', [
				entity,
				entityId,
			]);
			return true;
		} catch {
			return false;
		}
	},
};
