/**
 * Storage for auto-link suggestions (docs/design/constella-features.md #D7).
 *
 * `graph_suggestions` is the queue of *proposed* edges. The real graph is never
 * written here: a row moves `pending → accepted | rejected`, and only an
 * accepted row becomes an edge in `buildWorkspaceGraph`. Rejected rows are kept
 * so the same pair is never proposed twice (#D8).
 *
 * Every write resolves to `boolean` so callers can surface a failure.
 */

import type Database from '@tauri-apps/plugin-sql';
import { getDb } from './index';
import type { GraphSuggestion } from '$lib/content/workspace-graph';
import type { EmbedEntityKind } from '$lib/content/memory-types';

type SuggestionRow = {
	id: string;
	source_kind: string;
	source_id: string;
	target_kind: string;
	target_id: string;
	edge_kind: string;
	score: number;
	reason: string;
	status: string;
	created_at: number;
	decided_at: number | null;
};

/** The suggestion edge kinds, which are the only ones stored here. */
export type SuggestionEdgeKind = 'semantic' | 'related' | 'contradicts';

function kindOf(raw: string): SuggestionEdgeKind {
	if (raw === 'related' || raw === 'contradicts') return raw;
	return 'semantic';
}

function entityKind(raw: string): EmbedEntityKind {
	return raw === 'task' ? 'task' : 'note';
}

function statusOf(raw: string): GraphSuggestion['status'] {
	if (raw === 'accepted' || raw === 'rejected') return raw;
	return 'pending';
}

function toSuggestion(row: SuggestionRow): GraphSuggestion {
	return {
		id: row.id,
		sourceKind: entityKind(row.source_kind),
		sourceId: row.source_id,
		targetKind: entityKind(row.target_kind),
		targetId: row.target_id,
		kind: kindOf(row.edge_kind),
		score: Number(row.score) || 0,
		reason: row.reason ?? '',
		status: statusOf(row.status)
	};
}

const UPSERT_SQL = `
	INSERT INTO graph_suggestions
		(id, source_kind, source_id, target_kind, target_id, edge_kind, score, reason, status, created_at, decided_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, NULL)
	ON CONFLICT(source_kind, source_id, target_kind, target_id, edge_kind) DO UPDATE SET
		score = excluded.score,
		reason = excluded.reason`;

export const suggestionsRepo = {
	/** Pending suggestions, newest first, for the graph overlay. */
	async listPending(): Promise<GraphSuggestion[]> {
		try {
			const db = await getDb();
			const rows = await db.select<SuggestionRow[]>(
				`SELECT * FROM graph_suggestions WHERE status = 'pending' ORDER BY score DESC, created_at DESC`
			);
			return rows.map(toSuggestion);
		} catch {
			return [];
		}
	},

	/** Accepted + rejected rows, so the caller can build the anti-spam sets. */
	async listDecided(): Promise<GraphSuggestion[]> {
		try {
			const db = await getDb();
			const rows = await db.select<SuggestionRow[]>(
				`SELECT * FROM graph_suggestions WHERE status != 'pending' ORDER BY decided_at DESC`
			);
			return rows.map(toSuggestion);
		} catch {
			return [];
		}
	},

	/** Every row, for a full rebuild of the anti-spam sets. */
	async listAll(): Promise<GraphSuggestion[]> {
		try {
			const db = await getDb();
			const rows = await db.select<SuggestionRow[]>('SELECT * FROM graph_suggestions');
			return rows.map(toSuggestion);
		} catch {
			return [];
		}
	},

	/**
	 * Inserts a batch of pending suggestions. The unique index makes this
	 * idempotent per pair+kind, so re-running a cycle never duplicates a row.
	 */
	async insertMany(
		items: {
			id: string;
			sourceKind: EmbedEntityKind;
			sourceId: string;
			targetKind: EmbedEntityKind;
			targetId: string;
			edgeKind: SuggestionEdgeKind;
			score: number;
			reason: string;
		}[]
	): Promise<boolean> {
		if (items.length === 0) return true;
		try {
			const db = await getDb();
			const now = Date.now();
			for (const item of items) {
				await db.execute(UPSERT_SQL, [
					item.id,
					item.sourceKind,
					item.sourceId,
					item.targetKind,
					item.targetId,
					item.edgeKind,
					item.score,
					item.reason,
					now
				]);
			}
			return true;
		} catch {
			return false;
		}
	},

	/** Moves a suggestion to a decided state. Only `pending` rows may move. */
	async decide(id: string, status: 'accepted' | 'rejected'): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute(
				`UPDATE graph_suggestions SET status = $1, decided_at = $2
				 WHERE id = $3 AND status = 'pending'`,
				[status, Date.now(), id]
			);
			return true;
		} catch {
			return false;
		}
	},

	/** Drops every suggestion. Used when the embedder changes under them. */
	async clear(): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM graph_suggestions');
			return true;
		} catch {
			return false;
		}
	},
};

export type { SuggestionRow };
