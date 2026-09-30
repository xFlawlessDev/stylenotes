/**
 * Storage for cluster assignments (docs/design/constella-features.md #D9).
 *
 * A clustering pass writes a fresh `run_id` and the previous runs are dropped,
 * so a swap is atomic and a half-written pass is never shown. Like the
 * embedding index, this is a derivative: it can be rebuilt at any time.
 */

import type Database from '@tauri-apps/plugin-sql';
import { getDb } from './index';
import type { EmbedEntityKind } from '$lib/content/memory-types';

type ClusterRow = {
	run_id: string;
	cluster_id: number;
	label: string;
	entity_kind: string;
	entity_id: string;
	score: number;
};

/** One cluster with its label and member ids, as the UI and `list_themes` read it. */
export type ClusterRecord = {
	clusterId: number;
	label: string;
	members: { entityKind: EmbedEntityKind; entityId: string; score: number }[];
};

function entityKind(raw: string): EmbedEntityKind {
	return raw === 'task' ? 'task' : 'note';
}

export const clustersRepo = {
	/**
	 * Replaces every cluster with one pass. The delete and inserts share a run
	 * id, so readers always see either the old pass or the new one.
	 */
	async replaceRun(
		runId: string,
		clusters: { clusterId: number; label: string; members: { entityKind: EmbedEntityKind; entityId: string; score: number }[] }[]
	): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM clusters');
			for (const cluster of clusters) {
				for (const member of cluster.members) {
					await db.execute(
						`INSERT INTO clusters (run_id, cluster_id, label, entity_kind, entity_id, score)
						 VALUES ($1, $2, $3, $4, $5, $6)`,
						[runId, cluster.clusterId, cluster.label, member.entityKind, member.entityId, member.score]
					);
				}
			}
			return true;
		} catch {
			return false;
		}
	},

	/** The current clusters, grouped and ordered by cluster id. */
	async list(): Promise<ClusterRecord[]> {
		try {
			const db = await getDb();
			const rows = await db.select<ClusterRow[]>(
				'SELECT * FROM clusters ORDER BY cluster_id ASC, score DESC'
			);
			const byId = new Map<number, ClusterRecord>();
			for (const row of rows) {
				const cluster = byId.get(row.cluster_id) ?? {
					clusterId: row.cluster_id,
					label: row.label,
					members: []
				};
				cluster.members.push({
					entityKind: entityKind(row.entity_kind),
					entityId: row.entity_id,
					score: Number(row.score) || 0
				});
				byId.set(row.cluster_id, cluster);
			}
			return [...byId.values()];
		} catch {
			return [];
		}
	},

	/** Entity id → cluster label, for colouring graph nodes. */
	async labelByEntity(): Promise<Map<string, string>> {
		const clusters = await this.list();
		const map = new Map<string, string>();
		for (const cluster of clusters) {
			for (const member of cluster.members) {
				map.set(`${member.entityKind}:${member.entityId}`, cluster.label);
			}
		}
		return map;
	},

	async clear(): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM clusters');
			return true;
		} catch {
			return false;
		}
	},
};

export type { Database };
