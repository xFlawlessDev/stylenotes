import type Database from '@tauri-apps/plugin-sql';
import type {
	AiMessageRecord,
	AiRole,
	AiSettings,
	AiThread,
	AiToolCall
} from '$lib/content/ai-types';
import type { ToolResult } from '$lib/content/ai-tools';
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
	searchProvider: '',
	hasSearchKey: false,
	searchFallbacks: [],
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
	search_provider?: string | null;
	search_api_key?: string | null;
	search_fallbacks?: string | null;
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
	reasoning?: string | null;
	tool_calls?: string | null;
	tool_results?: string | null;
	created_at: string;
};

/** Parses a JSON column, falling back to `fallback` on anything unusable. */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		const parsed: unknown = JSON.parse(raw);
		return (parsed ?? fallback) as T;
	} catch {
		return fallback;
	}
}

/** Keeps only well-formed persisted tool calls; a bad row must not break a chat. */
function parseToolCalls(raw: string | null | undefined): AiToolCall[] {
	const parsed = parseJson<unknown>(raw, []);
	if (!Array.isArray(parsed)) return [];
	return parsed.filter(
		(item): item is AiToolCall =>
			typeof item === 'object' &&
			item !== null &&
			typeof (item as AiToolCall).id === 'string' &&
			typeof (item as AiToolCall).name === 'string'
	);
}

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
		searchProvider: row.search_provider ?? '',
		// The search key is ciphertext too; only its presence is exposed.
		hasSearchKey: (row.search_api_key ?? '').trim().length > 0,
		searchFallbacks: parseStringList(row.search_fallbacks),
		updatedAt: row.updated_at
	};
}

/** Parses a JSON string array column, dropping anything not a usable name. */
function parseStringList(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
			: [];
	} catch {
		return [];
	}
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
		reasoning: row.reasoning ?? '',
		toolCalls: parseToolCalls(row.tool_calls),
		toolResults: parseJson<Record<string, ToolResult>>(row.tool_results, {}),
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
	 * Reads the encrypted search key. Like `loadKey`, only Rust can make sense
	 * of it, so it never feeds the UI directly.
	 */
	async loadSearchKey(): Promise<string> {
		try {
			const db = await getDb();
			await ensureRow(db);
			const rows = await db.select<{ search_api_key: string }[]>(
				'SELECT search_api_key FROM ai_settings WHERE id = 1'
			);
			return rows[0]?.search_api_key ?? '';
		} catch {
			return '';
		}
	},

	/**
	 * Saves settings. `key` is `{ value, hasKey }` where `value` is already
	 * ciphertext from `ai_encrypt_key`; omit it to leave the stored key alone.
	 * `searchKey` works the same way for the web search key.
	 */
	async saveSettings(
		settings: AiSettings,
		key?: { value: string; hasKey: boolean },
		searchKey?: { value: string; hasKey: boolean }
	): Promise<boolean> {
		try {
			const db = await getDb();
			await ensureRow(db);
			const base = [
				settings.enabled ? 1 : 0,
				settings.provider,
				settings.baseUrl,
				settings.model,
				settings.temperature,
				settings.maxTokens,
				settings.access,
				JSON.stringify(settings.scopes),
				settings.searchProvider,
				JSON.stringify(settings.searchFallbacks)
			];
			// Each optional key needs its own statement: a parameter cannot
			// stand in for a column that should keep its current value.
			if (key && searchKey) {
				await db.execute(
					`UPDATE ai_settings SET enabled = $1, provider = $2, base_url = $3, model = $4,
					 temperature = $5, max_tokens = $6, access = $7, scopes = $8,
					 search_provider = $9, search_fallbacks = $10, api_key = $11, search_api_key = $12,
					 updated_at = datetime('now')
					 WHERE id = 1`,
					[...base, key.value, searchKey.value]
				);
			} else if (key) {
				await db.execute(
					`UPDATE ai_settings SET enabled = $1, provider = $2, base_url = $3, model = $4,
					 temperature = $5, max_tokens = $6, access = $7, scopes = $8,
					 search_provider = $9, search_fallbacks = $10, api_key = $11,
					 updated_at = datetime('now')
					 WHERE id = 1`,
					[...base, key.value]
				);
			} else if (searchKey) {
				await db.execute(
					`UPDATE ai_settings SET enabled = $1, provider = $2, base_url = $3, model = $4,
					 temperature = $5, max_tokens = $6, access = $7, scopes = $8,
					 search_provider = $9, search_fallbacks = $10, search_api_key = $11,
					 updated_at = datetime('now')
					 WHERE id = 1`,
					[...base, searchKey.value]
				);
			} else {
				await db.execute(
					`UPDATE ai_settings SET enabled = $1, provider = $2, base_url = $3, model = $4,
					 temperature = $5, max_tokens = $6, access = $7, scopes = $8,
					 search_provider = $9, search_fallbacks = $10,
					 updated_at = datetime('now')
					 WHERE id = 1`,
					base
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

	/**
	 * Appends a message and returns it (with its assigned id).
	 *
	 * `trace` carries the reasoning and tool traffic captured alongside the
	 * answer. It is optional for user turns, which only ever have content.
	 */
	async addMessage(
		threadId: string,
		role: AiRole,
		content: string,
		trace?: { reasoning?: string; toolCalls?: AiToolCall[]; toolResults?: Record<string, ToolResult> }
	): Promise<AiMessageRecord | null> {
		const reasoning = trace?.reasoning ?? '';
		const toolCalls = trace?.toolCalls ?? [];
		const toolResults = trace?.toolResults ?? {};
		try {
			const db = await getDb();
			const result = await db.execute(
				`INSERT INTO ai_messages (thread_id, role, content, reasoning, tool_calls, tool_results)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					threadId,
					role,
					content,
					reasoning,
					JSON.stringify(toolCalls),
					JSON.stringify(toolResults)
				]
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
					reasoning,
					toolCalls,
					toolResults,
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
