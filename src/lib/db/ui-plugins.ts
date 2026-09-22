import type Database from '@tauri-apps/plugin-sql';
import { sanitizeTokens, type UiPlugin } from '$lib/content/ui-plugin-css';
import { getDb } from './index';

type UiPluginRow = {
	id: string;
	name: string;
	tokens: string;
	css: string;
	enabled: number;
	position: number;
	created_at: string;
	updated_at: string;
};

const UPSERT_SQL = `
	INSERT INTO ui_plugins (id, name, tokens, css, enabled, position, created_at, updated_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		tokens = excluded.tokens,
		css = excluded.css,
		enabled = excluded.enabled,
		position = excluded.position,
		updated_at = excluded.updated_at`;

function parseTokens(raw: string | null): Record<string, unknown> {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function toPlugin(row: UiPluginRow): UiPlugin {
	return {
		id: row.id,
		name: row.name,
		tokens: sanitizeTokens(parseTokens(row.tokens)),
		css: row.css ?? '',
		enabled: Boolean(row.enabled),
		position: Number(row.position) || 0,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function bind(plugin: UiPlugin): (string | number)[] {
	return [
		plugin.id,
		plugin.name,
		JSON.stringify(plugin.tokens ?? {}),
		plugin.css ?? '',
		plugin.enabled ? 1 : 0,
		plugin.position,
		plugin.createdAt,
		plugin.updatedAt,
	];
}

async function write(db: Database, plugin: UiPlugin): Promise<void> {
	await db.execute(UPSERT_SQL, bind(plugin));
}

/**
 * UI plugin storage. Every write resolves to `boolean` so callers can surface
 * failures instead of losing the change silently.
 */
export const uiPluginsRepo = {
	async list(): Promise<UiPlugin[]> {
		const db = await getDb();
		const rows = await db.select<UiPluginRow[]>(
			'SELECT * FROM ui_plugins ORDER BY position ASC, created_at ASC'
		);
		return rows.map(toPlugin);
	},

	async save(plugin: UiPlugin): Promise<boolean> {
		try {
			const db = await getDb();
			await write(db, plugin);
			return true;
		} catch {
			return false;
		}
	},

	async remove(id: string): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM ui_plugins WHERE id = $1', [id]);
			return true;
		} catch {
			return false;
		}
	},

	async replaceAll(plugins: UiPlugin[]): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM ui_plugins');
			for (const plugin of plugins) {
				await write(db, plugin);
			}
			return true;
		} catch {
			return false;
		}
	},

	async clear(): Promise<boolean> {
		try {
			const db = await getDb();
			await db.execute('DELETE FROM ui_plugins');
			return true;
		} catch {
			return false;
		}
	},
};
