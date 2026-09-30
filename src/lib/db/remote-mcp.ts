/**
 * Storage for remote MCP (docs/design/constella-features.md #D12).
 *
 * Device-local and secret-bearing: the token is kept encrypted at rest
 * (`enc:v1:`, via the AI cipher), with a short hint for display. The hash is
 * still stored so the listener can compare without decrypting. This row must
 * never enter the synced `settings` row.
 *
 * Every write resolves to `boolean` so callers can surface a failure.
 */

import type Database from '@tauri-apps/plugin-sql';
import { getDb } from './index';

type RemoteMcpRow = {
	id: number;
	enabled: number;
	mode: string;
	token_hash: string;
	token_hint: string;
	token_enc: string;
	created_at: number | null;
	rotated_at: number | null;
};

/** Exposure tiers the user picks (#D12). */
export type RemoteMcpMode = 'local' | 'lan' | 'tunnel';

export type RemoteMcpRecord = {
	enabled: boolean;
	mode: RemoteMcpMode;
	/** Never the token itself; only the hash is stored. */
	tokenHash: string;
	tokenHint: string;
	/** The token encrypted at rest (`enc:v1:`), so it survives a restart. */
	tokenEnc: string;
	createdAt: number | null;
	rotatedAt: number | null;
};

const DEFAULT: RemoteMcpRecord = {
	enabled: false,
	mode: 'local',
	tokenHash: '',
	tokenHint: '',
	tokenEnc: '',
	createdAt: null,
	rotatedAt: null
};

function modeOf(raw: string): RemoteMcpMode {
	return raw === 'lan' || raw === 'tunnel' ? raw : 'local';
}

function toRecord(row: RemoteMcpRow): RemoteMcpRecord {
	return {
		enabled: Boolean(row.enabled),
		mode: modeOf(row.mode),
		tokenHash: row.token_hash ?? '',
		tokenHint: row.token_hint ?? '',
		tokenEnc: row.token_enc ?? '',
		createdAt: row.created_at ?? null,
		rotatedAt: row.rotated_at ?? null
	};
}

async function ensureRow(db: Database): Promise<void> {
	await db.execute(
		`INSERT OR IGNORE INTO remote_mcp (id, enabled, mode, token_hash, token_hint)
		 VALUES (1, 0, 'local', '', '')`
	);
}

export const remoteMcpRepo = {
	async load(): Promise<RemoteMcpRecord> {
		try {
			const db = await getDb();
			await ensureRow(db);
			const rows = await db.select<RemoteMcpRow[]>('SELECT * FROM remote_mcp WHERE id = 1');
			return rows.length ? toRecord(rows[0]) : { ...DEFAULT };
		} catch {
			return { ...DEFAULT };
		}
	},

	/** Persists enablement and/or mode, leaving the token columns untouched. */
	async saveState(state: { enabled: boolean; mode: RemoteMcpMode }): Promise<boolean> {
		try {
			const db = await getDb();
			await ensureRow(db);
			await db.execute('UPDATE remote_mcp SET enabled = $1, mode = $2 WHERE id = 1', [
				state.enabled ? 1 : 0,
				state.mode
			]);
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Stores a token hash, hint and encrypted copy. The hash is what the
	 * listener compares; `enc` is what lets the token survive a restart (#D12).
	 */
	async saveToken(hash: string, hint: string, enc: string): Promise<boolean> {
		try {
			const db = await getDb();
			await ensureRow(db);
			const now = Date.now();
			await db.execute(
				`UPDATE remote_mcp SET token_hash = $1, token_hint = $2, token_enc = $3,
				 created_at = COALESCE(created_at, $4), rotated_at = $4 WHERE id = 1`,
				[hash, hint, enc, now]
			);
			return true;
		} catch {
			return false;
		}
	},

	/** Forgets the token, e.g. on disable, so a stale secret never lingers. */
	async clearToken(): Promise<boolean> {
		try {
			const db = await getDb();
			await ensureRow(db);
			await db.execute(
				'UPDATE remote_mcp SET token_hash = ?, token_hint = ?, token_enc = ? WHERE id = 1',
				['', '', '']
			);
			return true;
		} catch {
			return false;
		}
	}
};
