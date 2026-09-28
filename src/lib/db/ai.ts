import type Database from '@tauri-apps/plugin-sql';
import type {
	AiMessageRecord,
	AiRole,
	AiSettings,
	AiThread
} from '$lib/content/ai-types';
import type { McpAccess, McpScope } from '$lib/content/mcp-types';
import { getDb } from './index';

const DEFAULT_SETTINGS: AiSettings = {
	enabled: false,
	provider: 'openai-compatible',
	baseUrl: '',
	model: '',
	temperature: 0.7,
	maxTokens: 1024,
	hasKey: false,
	access: 'read',
	scopes: [],
	updatedAt: ''
};

type AiSettingsRow = {
	id: number;
	enabled: number;
	provider: string;
	base_url: string;
	model: string;
	temperature: number;
	max_tokens: number;
	api_key: string;
	access: string;
	scopes: string;
	updated_at: string;
};

const VALID_SCOPES: McpScope[] = ['notes', 'tasks', 'dependency'];

function parseScopes(raw: string): McpScope[] {
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((item): item is McpScope => VALID_SCOPES.includes(item as McpScope))
			: [];
	} catch {
		return [];
	}
}

type AiThreadRow = {
	id: string;
	title: string;
	note_id: string | null;
	created_at: string;
	updated_at: string;
};

type AiMessageRow = {
	id: number;
	thread_id: string;
	role: string;
	content: string;
	created_at: string;
};

function toRole(raw: string): AiRole {
	return raw === 'assistant' || raw === 'system' ? raw : 'user';
}

function toSettings(row: AiSettingsRow): AiSettings {
	return {
		enabled: Boolean(row.enabled),
		provider: row.provider === 'anthropic-native' ? 'anthropic-native' : 'openai-compatible',
		baseUrl: row.base_url,
		model: row.model,
		temperature: Number(row.temperature),
		maxTokens: Number(row.max_tokens),
		// The stored key is ciphertext; only its presence is exposed.
		hasKey: row.api_key.trim().length > 0,
		access: row.access === 'write' ? 'write' : 'read',
		scopes: parseScopes(row.scopes),
		updatedAt: row.updated_at
	};
}

function toThread(row: AiThreadRow): AiThread {
	return {
		id: row.id,
		title: row.title,
		noteId: row.note_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function toMessage(row: AiMessageRow): AiMessageRecord {
	return {
		id: Number(row.id),
		threadId: row.thread_id,
		role: toRole(row.role),
		content: row.content,
		createdAt: row.created_at
	};
}

async function ensureRow(db: Database): Promise<void> {
	await db.execute(
		`INSERT OR IGNORE INTO ai_settings (id, enabled, provider, base_url, model, temperature, max_tokens, api_key, access, scopes)
		 VALUES (1, 0, 'openai-compatible', '', '', 0.7, 1024, '', 'read', '[]')`
	);
}

/**
 * AI storage (device-local). Settings hold the encrypted key; chat history is
 * a plain thread/message pair. Every write resolves to `boolean` so callers
 * surface failures instead of losing them, matching the other repos.
 */
export const aiRepo = {
	async loadSettings(): Promise<AiSettings> {
		try {
			const db = await getDb();
			await ensureRow(db);
			const rows = await db.select<AiSettingsRow[]>('SELECT * FROM ai_settings WHERE id = 1');
			return rows.length ? toSettings(rows[0]) : { ...DEFAULT_SETTINGS };
		} catch {
			return { ...DEFAULT_SETTINGS };
		}
	},

	/**
	 * Reads the encrypted API key. Only Rust can make sense of it, so this
	 * never feeds the UI directly — it is decrypted inside `ai.svelte.ts`.
	 */
	async loadKey(): Promise<string> {
		try {
			const db = await getDb();
			await ensureRow(db);
			const rows = await db.select<{ api_key: string }[]>(
				'SELECT api_key FROM ai_settings WHERE id = 1'
			);
			return rows[0]?.api_key ?? '';
		} catch {
			return '';
		}
	},

	/**
	 * Saves settings. `key` is `{ value, hasKey }` where `value` is already
	 * ciphertext from `ai_encrypt_key`; omit it to leave the stored key alone.
	 */
	async saveSettings(
		settings: AiSettings,
		key?: { value: string; hasKey: boolean }
	): Promise<boolean> {
		try {
			const db = await getDb();
			await ensureRow(db);
			if (key) {
				await db.execute(
					`UPDATE ai_settings SET enabled = $1, provider = $2, base_url = $3, model = $4,
					 temperature = $5, max_tokens = $6, api_key = $7, access = $8, scopes = $9,
					 updated_at = datetime('now')
					 WHERE id = 1`,
					[
						settings.enabled ? 1 : 0,
						settings.provider,
						settings.baseUrl,
						settings.model,
						settings.temperature,
						settings.maxTokens,
						key.value,
						settings.access,
						JSON.stringify(settings.scopes)
					]
				);
			} else {
				await db.execute(
					`UPDATE ai_settings SET enabled = $1, provider = $2, base_url = $3, model = $4,
					 temperature = $5, max_tokens = $6, access = $7, scopes = $8,
					 updated_at = datetime('now')
					 WHERE id = 1`,
					[
						settings.enabled ? 1 : 0,
						settings.provider,
						settings.baseUrl,
						settings.model,
						settings.temperature,
						settings.maxTokens,
						settings.access,
						JSON.stringify(settings.scopes)
					]
				);
			}
			return true;
		} catch {
			return false;
		}
	},

	async listThreads(): Promise<AiThread[]> {
		try {
			const db = await getDb();
			const rows = await db.select<AiThreadRow[]>(
				'SELECT * FROM ai_threads ORDER BY updated_at DESC'
			);
			return rows.map(toThread);
		} catch {
			return [];
		}
	},

	async createThread(thread: { id: string; title: string; noteId: string | null }): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('INSERT INTO ai_threads (id, title, note_id) VALUES ($1, $2, $3)', [
				thread.id,
				thread.title,
				thread.noteId
			]);
			return true;
		} catch {
			return false;
		}
	},

	async renameThread(id: string, title: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute(
				"UPDATE ai_threads SET title = $1, updated_at = datetime('now') WHERE id = $2",
				[title, id]
			);
			return true;
		} catch {
			return false;
		}
	},

	async deleteThread(id: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM ai_messages WHERE thread_id = $1', [id]);
			await db.execute('DELETE FROM ai_threads WHERE id = $1', [id]);
			return true;
		} catch {
			return false;
		}
	},

	async listMessages(threadId: string): Promise<AiMessageRecord[]> {
		try {
			const db = await getDb();
			const rows = await db.select<AiMessageRow[]>(
				'SELECT * FROM ai_messages WHERE thread_id = $1 ORDER BY id ASC',
				[threadId]
			);
			return rows.map(toMessage);
		} catch {
			return [];
		}
	},

	/** Appends a message and returns it (with its assigned id). */
	async addMessage(
		threadId: string,
		role: AiRole,
		content: string
	): Promise<AiMessageRecord | null> {
		try {
			const db = await getDb();
			const result = await db.execute(
				'INSERT INTO ai_messages (thread_id, role, content) VALUES ($1, $2, $3)',
				[threadId, role, content]
			);
			await db.execute("UPDATE ai_threads SET updated_at = datetime('now') WHERE id = $1", [
				threadId
			]);
			// `lastInsertId` is optional in the plugin; re-read the row when the
			// driver does not report it so the UI always has a stable id.
			if (typeof result.lastInsertId === 'number') {
				return {
					id: Number(result.lastInsertId),
					threadId,
					role,
					content,
					createdAt: new Date().toISOString()
				};
			}
			const rows = await db.select<AiMessageRow[]>(
				'SELECT * FROM ai_messages WHERE thread_id = $1 ORDER BY id DESC LIMIT 1',
				[threadId]
			);
			return rows.length ? toMessage(rows[0]) : null;
		} catch {
			return null;
		}
	},

	async clearHistory(): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM ai_messages');
			await db.execute('DELETE FROM ai_threads');
			return true;
		} catch {
			return false;
		}
	}
};
