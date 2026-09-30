import type Database from '@tauri-apps/plugin-sql';
import {
	MCP_DEFAULT_TOOL_TIMEOUT_MS,
	type McpAccess,
	type McpAuditRecord,
	type McpClientRecord,
	type McpScope,
	type McpSettings,
	type McpToolKind,
} from '$lib/content/mcp-types';
import { getDb } from './index';
import { MCP_SCOPE_IDS } from '$lib/content/mcp-types';

const DEFAULT_SETTINGS: McpSettings = {
	access: 'read',
	scopes: [],
	workspaces: [],
	audit: true,
	logLimit: 200,
	updatedAt: '',
};

type McpSettingsRow = {
	id: number;
	access: string;
	scopes: string;
	workspaces: string;
	audit: number;
	log_limit: number;
	updated_at: string;
};

type McpClientRow = {
	instance_id: string;
	name: string;
	source: string;
	created_at: string;
	last_seen: string;
};

type McpAuditRow = {
	id: number;
	at: string;
	instance_id: string | null;
	tool: string;
	scope: string;
	ok: number;
	workspace: string;
	detail: string;
	remote_addr: string | null;
};

/**
 * Scopes accepted from the database. Derived from the tool registry so adding a
 * scope (… → workspace) never needs a second edit; a hardcoded triple here
 * silently dropped `workspace` on load, so its toggle appeared to never save.
 */
const VALID_SCOPES: readonly string[] = MCP_SCOPE_IDS;

function parseList(raw: string): string[] {
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

function parseScopes(raw: string): McpScope[] {
	return parseList(raw).filter((scope): scope is McpScope => VALID_SCOPES.includes(scope));
}

function toSettings(row: McpSettingsRow): McpSettings {
	return {
		access: row.access === 'write' ? 'write' : 'read',
		scopes: parseScopes(row.scopes),
		workspaces: parseList(row.workspaces),
		audit: Boolean(row.audit),
		logLimit: Number(row.log_limit) || DEFAULT_SETTINGS.logLimit,
		updatedAt: row.updated_at,
	};
}

function toClient(row: McpClientRow): McpClientRecord {
	return {
		instanceId: row.instance_id,
		name: row.name,
		source: row.source,
		createdAt: row.created_at,
		lastSeen: row.last_seen,
	};
}

function toAudit(row: McpAuditRow): McpAuditRecord {
	return {
		id: Number(row.id),
		at: row.at,
		instanceId: row.instance_id,
		tool: row.tool,
		scope: row.scope === 'write' ? 'write' : 'read',
		ok: Boolean(row.ok),
		workspace: row.workspace,
		detail: row.detail,
		remoteAddr: row.remote_addr ?? '',
	};
}

async function ensureRow(db: Database): Promise<void> {
	await db.execute(
		`INSERT OR IGNORE INTO mcp_settings (id, access, scopes, workspaces, audit, log_limit)
		 VALUES (1, 'read', '[]', '[]', 1, $1)`,
		[DEFAULT_SETTINGS.logLimit]
	);
}

/**
 * Local MCP storage (#D7): the settings singleton, the client registry and the
 * audit trail. Reads return normalised records; every write resolves to
 * `boolean` so callers surface failures instead of losing them silently.
 */
export const mcpRepo = {
	async loadSettings(): Promise<McpSettings> {
		try {
			const db = await getDb();
			await ensureRow(db);
			const rows = await db.select<McpSettingsRow[]>('SELECT * FROM mcp_settings WHERE id = 1');
			return rows.length ? toSettings(rows[0]) : { ...DEFAULT_SETTINGS };
		} catch {
			return { ...DEFAULT_SETTINGS };
		}
	},

	async saveSettings(settings: McpSettings): Promise<boolean> {
		try {
			const db = await getDb();
			await ensureRow(db);
			await db.execute(
				`UPDATE mcp_settings SET access = $1, scopes = $2, workspaces = $3, audit = $4,
				 log_limit = $5, updated_at = datetime('now') WHERE id = 1`,
				[
					settings.access,
					JSON.stringify(settings.scopes),
					JSON.stringify(settings.workspaces),
					settings.audit ? 1 : 0,
					settings.logLimit,
				]
			);
			return true;
		} catch {
			return false;
		}
	},

	async listClients(): Promise<McpClientRecord[]> {
		try {
			const db = await getDb();
			const rows = await db.select<McpClientRow[]>(
				'SELECT * FROM mcp_clients ORDER BY last_seen DESC'
			);
			return rows.map(toClient);
		} catch {
			return [];
		}
	},

	/** Upserts a client seen by the shim, refreshing its `last_seen`. */
	async touchClient(record: {
		instanceId: string;
		name: string;
		source: string;
	}): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute(
				`INSERT INTO mcp_clients (instance_id, name, source) VALUES ($1, $2, $3)
				 ON CONFLICT(instance_id) DO UPDATE SET
					name = excluded.name, source = excluded.source, last_seen = datetime('now')`,
				[record.instanceId, record.name, record.source]
			);
			return true;
		} catch {
			return false;
		}
	},

	async removeClient(instanceId: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM mcp_clients WHERE instance_id = $1', [instanceId]);
			return true;
		} catch {
			return false;
		}
	},

	async listAudit(limit = 200): Promise<McpAuditRecord[]> {
		try {
			const db = await getDb();
			const rows = await db.select<McpAuditRow[]>(
				'SELECT * FROM mcp_audit ORDER BY id DESC LIMIT $1',
				[Math.max(1, Math.floor(limit))]
			);
			return rows.map(toAudit);
		} catch {
			return [];
		}
	},

	async addAudit(record: {
		instanceId: string | null;
		tool: string;
		scope: McpToolKind;
		ok: boolean;
		workspace?: string;
		detail?: string;
		remoteAddr?: string;
	}): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute(
				`INSERT INTO mcp_audit (instance_id, tool, scope, ok, workspace, detail)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					record.instanceId,
					record.tool,
					record.scope,
					record.ok ? 1 : 0,
					record.workspace ?? '',
					record.detail ?? '',
					record.remoteAddr ?? '',
				]
			);
			return true;
		} catch {
			return false;
		}
	},

	async clearAudit(): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM mcp_audit');
			return true;
		} catch {
			return false;
		}
	},
};

/** Tool-call timeout used by the Settings copy; kept next to the repo for context. */
export const MCP_TOOL_TIMEOUT_MS = MCP_DEFAULT_TOOL_TIMEOUT_MS;

export type { McpAccess, McpScope, McpSettings };
