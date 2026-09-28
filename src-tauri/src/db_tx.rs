//! Atomic note writes that need more than one statement.
//!
//! `tauri-plugin-sql` runs every `db.execute()` through an sqlx pool, so it may
//! acquire a different connection per statement — `BEGIN`/`COMMIT` from the
//! frontend cannot be trusted. Writes that must be all-or-nothing (a note row
//! plus its tag rows) live here instead, on a pool this module owns.
//!
//! The pool points at the same `<app_data_dir>/stylenotes.db` the plugin uses.
//! WAL (see `src/lib/db/index.ts`) lets both pools coexist: readers and writers
//! no longer block each other, and `busy_timeout` absorbs the brief overlap.

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::str::FromStr;
use std::time::Duration;
use tauri::{AppHandle, Runtime, State};

use crate::mcp_host::database_path;

/// The shared write pool, created once during `setup` and stored as app state.
pub struct WritePool(pub SqlitePool);

/// Opens the write pool against the app's database file.
///
/// One connection is enough: writes are serialised by SQLite anyway, and a
/// single connection avoids an internal lock queue of its own.
pub async fn open<R: Runtime>(app: &AppHandle<R>) -> Result<SqlitePool, String> {
    let path = database_path(app).ok_or("app data directory unavailable")?;
    let url = format!("sqlite:{}", path.to_string_lossy());
    let options = SqliteConnectOptions::from_str(&url)
        .map_err(|error| error.to_string())?
        // Matches the frontend connection so both pools share one locking mode.
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_millis(5000))
        .foreign_keys(true)
        .create_if_missing(false);
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| error.to_string())
}

/// Upserts a note and rewrites its tags in one transaction, so no reader ever
/// sees a note without its tags. Mirrors `notesRepo.upsert` in the frontend.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn note_upsert_tx(
    pool: State<'_, WritePool>,
    id: String,
    workspace_id: String,
    title: String,
    folder: String,
    body: String,
    excerpt: String,
    words: i64,
    chars: i64,
    pinned: bool,
    overlay: bool,
    updated: String,
    updated_at: i64,
    tags: Vec<String>,
) -> Result<(), String> {
    let mut tx = pool.0.begin().await.map_err(|error| error.to_string())?;

    sqlx::query(
        "INSERT INTO notes (id, workspace_id, title, folder, body, excerpt, words, chars, pinned, overlay, updated, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT(id) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            title = excluded.title,
            folder = excluded.folder,
            body = excluded.body,
            excerpt = excluded.excerpt,
            words = excluded.words,
            chars = excluded.chars,
            pinned = excluded.pinned,
            overlay = excluded.overlay,
            updated = excluded.updated,
            updated_at = excluded.updated_at",
    )
    .bind(&id)
    .bind(&workspace_id)
    .bind(&title)
    .bind(&folder)
    .bind(&body)
    .bind(&excerpt)
    .bind(words)
    .bind(chars)
    .bind(i64::from(pinned))
    .bind(i64::from(overlay))
    .bind(&updated)
    .bind(updated_at)
    .execute(&mut *tx)
    .await
    .map_err(|error| error.to_string())?;

    // Only touch the tag rows when they actually differ: typing rarely changes
    // tags, and the delete + reinsert was the bulk of every auto-save.
    let existing: Vec<String> =
        sqlx::query_scalar("SELECT tag FROM tags WHERE note_id = $1 ORDER BY rowid ASC")
            .bind(&id)
            .fetch_all(&mut *tx)
            .await
            .map_err(|error| error.to_string())?;
    if existing != tags {
        sqlx::query("DELETE FROM tags WHERE note_id = $1")
            .bind(&id)
            .execute(&mut *tx)
            .await
            .map_err(|error| error.to_string())?;
        for tag in &tags {
            sqlx::query("INSERT OR IGNORE INTO tags (note_id, tag) VALUES ($1, $2)")
                .bind(&id)
                .bind(tag)
                .execute(&mut *tx)
                .await
                .map_err(|error| error.to_string())?;
        }
    }

    tx.commit().await.map_err(|error| error.to_string())
}

/// Deletes a note and its tags in one transaction, mirroring `notesRepo.remove`.
#[tauri::command]
pub async fn note_remove_tx(pool: State<'_, WritePool>, id: String) -> Result<(), String> {
    let mut tx = pool.0.begin().await.map_err(|error| error.to_string())?;
    sqlx::query("DELETE FROM tags WHERE note_id = $1")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("DELETE FROM notes WHERE id = $1")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|error| error.to_string())?;
    tx.commit().await.map_err(|error| error.to_string())
}
