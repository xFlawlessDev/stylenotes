/**
 * Vault folder persistence (docs/design/vault-mirror.md).
 *
 * Two things live here: the per-workspace binding (`vault_mode` / `vault_path` /
 * `type` on `workspaces`) and `vault_links`, the derived index of what each
 * vault file last held. `vault_links` is an index, never the truth — it can be
 * dropped and rebuilt by scanning the folder, so a missing row is a reason to
 * re-read a file, not a reason to lose one.
 *
 * Every write returns a boolean or a count of failures so callers can surface a
 * problem instead of losing it (AGENTS.md).
 */

import { getDb } from './connection';

export type VaultMode = 'off' | 'mirror' | 'vault';
export type VaultWorkspaceType = 'app' | 'folder';
export type VaultLinkState = 'ok' | 'conflict' | 'deleted' | 'unmanaged';

export type VaultBinding = {
	mode: VaultMode;
	path: string | null;
	type: VaultWorkspaceType;
};

export type VaultLink = {
	workspaceId: string;
	relPath: string;
	entityKind: 'note' | 'task' | 'dir';
	entityId: string | null;
	contentHash: string;
	fileMtime: number | null;
	syncedAt: number;
	state: VaultLinkState;
};

/** A markdown file read back from a vault folder (mirrors the Rust `VaultFile`). */
export type VaultFile = {
	relPath: string;
	content: string;
	/** SHA-256 of the file bytes, computed in Rust so both sides agree. */
	contentHash: string;
	mtime: number;
};

type VaultLinkRow = {
	workspace_id: string;
	rel_path: string;
	entity_kind: string;
	entity_id: string | null;
	content_hash: string;
	file_mtime: number | null;
	synced_at: number;
	state: string;
};

function toMode(value: unknown): VaultMode {
	return value === 'mirror' || value === 'vault' ? value : 'off';
}

function toLink(row: VaultLinkRow): VaultLink {
	return {
		workspaceId: row.workspace_id,
		relPath: row.rel_path,
		entityKind:
			row.entity_kind === 'task' || row.entity_kind === 'dir' ? row.entity_kind : 'note',
		entityId: row.entity_id,
		contentHash: row.content_hash,
		fileMtime: row.file_mtime,
		syncedAt: Number(row.synced_at) || 0,
		state:
			row.state === 'conflict' || row.state === 'deleted' || row.state === 'unmanaged'
				? row.state
				: 'ok',
	};
}

export const vaultRepo = {
	/** Reads a workspace's vault binding; defaults to `off` when unset. */
	async binding(workspaceId: string): Promise<VaultBinding> {
		try {
			const db = await getDb();
			const rows = await db.select<
				{ vault_mode: string | null; vault_path: string | null; type: string | null }[]
			>('SELECT vault_mode, vault_path, type FROM workspaces WHERE id = $1', [workspaceId]);
			if (!rows.length) return { mode: 'off', path: null, type: 'app' };
			return {
				mode: toMode(rows[0].vault_mode),
				path: rows[0].vault_path,
				type: rows[0].type === 'folder' ? 'folder' : 'app',
			};
		} catch {
			return { mode: 'off', path: null, type: 'app' };
		}
	},

	/** Stores a workspace's vault binding. Returns false on failure. */
	async setBinding(workspaceId: string, binding: VaultBinding): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute(
				'UPDATE workspaces SET vault_mode = $1, vault_path = $2, type = $3 WHERE id = $4',
				[binding.mode, binding.path, binding.type, workspaceId]
			);
			return true;
		} catch {
			return false;
		}
	},

	/** Every vault path in use, so a new binding can be checked for overlap. */
	async otherPaths(workspaceId: string): Promise<string[]> {
		try {
			const db = await getDb();
			const rows = await db.select<{ vault_path: string | null }[]>(
				'SELECT vault_path FROM workspaces WHERE id != $1 AND vault_path IS NOT NULL',
				[workspaceId]
			);
			return rows.map((row) => row.vault_path).filter((path): path is string => Boolean(path));
		} catch {
			return [];
		}
	},

	/** All links for a workspace, keyed by `rel_path`. */
	async links(workspaceId: string): Promise<Map<string, VaultLink>> {
		try {
			const db = await getDb();
			const rows = await db.select<VaultLinkRow[]>(
				'SELECT * FROM vault_links WHERE workspace_id = $1',
				[workspaceId]
			);
			return new Map(rows.map((row) => [row.rel_path, toLink(row)]));
		} catch {
			return new Map();
		}
	},

	/**
	 * Upserts one link. Returns false on failure so a caller can surface it,
	 * though a missing link only costs a re-read next time (never data).
	 */
	async put(link: VaultLink): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute(
				`INSERT INTO vault_links
				 (workspace_id, rel_path, entity_kind, entity_id, content_hash, file_mtime, synced_at, state)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				 ON CONFLICT(workspace_id, rel_path) DO UPDATE SET
					entity_kind = excluded.entity_kind,
					entity_id = excluded.entity_id,
					content_hash = excluded.content_hash,
					file_mtime = excluded.file_mtime,
					synced_at = excluded.synced_at,
					state = excluded.state`,
				[
					link.workspaceId,
					link.relPath,
					link.entityKind,
					link.entityId,
					link.contentHash,
					link.fileMtime,
					link.syncedAt,
					link.state,
				]
			);
			return true;
		} catch {
			return false;
		}
	},

	/** Writes many links, returning the number that failed to save. */
	async putMany(links: VaultLink[]): Promise<number> {
		let failures = 0;
		for (const link of links) {
			if (!(await this.put(link))) failures += 1;
		}
		return failures;
	},

	async remove(workspaceId: string, relPath: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM vault_links WHERE workspace_id = $1 AND rel_path = $2', [
				workspaceId,
				relPath,
			]);
			return true;
		} catch {
			return false;
		}
	},

	/** Drops a workspace's whole index, so the next export rebuilds it. */
	async clear(workspaceId: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM vault_links WHERE workspace_id = $1', [workspaceId]);
			return true;
		} catch {
			return false;
		}
	},
};
