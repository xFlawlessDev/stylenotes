import Database from '@tauri-apps/plugin-sql';
import { isTauri } from '$lib/windows';

export const DB_URL = 'sqlite:stylenotes.db';

let connection: Promise<Database> | null = null;

/**
 * Pragmas applied once per connection, before any query runs.
 *
 * WAL lets readers and writers coexist (the app opens one connection per
 * window against the same file), `busy_timeout` turns a lock collision into a
 * short wait instead of an instant `SQLITE_BUSY`, and `synchronous=NORMAL` is
 * the safe companion to WAL for a desktop app. `foreign_keys=ON` activates the
 * `ON DELETE CASCADE` clauses declared in the schema (off by default in
 * SQLite); the repos still delete children explicitly, so this only enforces
 * what is already intended.
 */
const CONNECTION_PRAGMAS = [
	'PRAGMA journal_mode = WAL',
	'PRAGMA synchronous = NORMAL',
	'PRAGMA busy_timeout = 5000',
	'PRAGMA foreign_keys = ON',
];

async function configureConnection(db: Database): Promise<Database> {
	for (const pragma of CONNECTION_PRAGMAS) {
		try {
			await db.execute(pragma);
		} catch {
			// A pragma the platform refuses must not take the whole DB down.
		}
	}
	return db;
}

export function getDb(): Promise<Database> {
	if (!isTauri) {
		return Promise.reject(new Error('SQLite is only available inside the Tauri runtime'));
	}
	if (!connection) {
		connection = Database.load(DB_URL).then(configureConnection);
		// A failed load must not be cached as a permanently broken connection.
		connection = connection.catch((error) => {
			connection = null;
			throw error;
		});
	}
	return connection;
}
