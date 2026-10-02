//! The database schema.
//!
//! There has never been a release, so there is no installed database to step
//! forward: a single migration builds the whole schema, exactly as the previous
//! 25 incremental migrations did. New work adds a new `Migration` with the next
//! `version`; an applied migration is never edited (AGENTS.md).
//!
//! `tauri-plugin-sql` hands each migration's `sql` to sqlx as one multi-statement
//! script, so a whole table group lives in one migration safely.

use tauri_plugin_sql::{Migration, MigrationKind};

/// Version of the single baseline migration. The next schema change is `2`.
pub const SCHEMA_VERSION: i64 = 1;

/// Builds the migration list the SQL plugin runs at startup.
pub fn migrations() -> Vec<Migration> {
    vec![baseline()]
}

fn baseline() -> Migration {
    Migration {
        version: SCHEMA_VERSION,
        description: "baseline_schema",
        kind: MigrationKind::Up,
        sql: BASELINE_SQL,
    }
}

/// The whole schema, grouped by feature.
///
/// Comments cover the non-obvious columns only; the shape is the source of
/// truth. Device-local tables (MCP, AI, remote MCP) are deliberately kept out
/// of the synced `settings` row.
const BASELINE_SQL: &str = "
    -- Core: folders, workspaces, notes, tags, notifications, settings, meta.

    CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT 'primary',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        vault_mode TEXT NOT NULL DEFAULT 'off',
        vault_path TEXT,
        type TEXT NOT NULL DEFAULT 'app'
    );

    CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        icon TEXT,
        position INTEGER,
        workspace_id TEXT NOT NULL DEFAULT 'workspace-default' REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Untitled note',
        folder TEXT NOT NULL DEFAULT 'personal',
        body TEXT NOT NULL DEFAULT '',
        excerpt TEXT NOT NULL DEFAULT '',
        words INTEGER NOT NULL DEFAULT 0,
        chars INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        -- Human display string; `updated_at` is the machine-readable timestamp.
        updated TEXT NOT NULL DEFAULT 'Just now',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        overlay INTEGER NOT NULL DEFAULT 0,
        workspace_id TEXT NOT NULL DEFAULT 'workspace-default' REFERENCES workspaces(id) ON DELETE CASCADE,
        updated_at INTEGER,
        -- Civil day (YYYY-MM-DD) a journal note stands for; NULL otherwise.
        journal_day TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
        note_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (note_id, tag),
        FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'tip',
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        time TEXT NOT NULL DEFAULT '',
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO workspaces (id, name, color)
    VALUES ('workspace-default', 'Personal', 'primary');

    CREATE INDEX IF NOT EXISTS idx_notes_workspace_id ON notes (workspace_id);
    CREATE INDEX IF NOT EXISTS idx_folders_workspace_id ON folders (workspace_id);
    CREATE INDEX IF NOT EXISTS idx_notes_journal_lookup ON notes (journal_day);
    -- One journal note per workspace per day. SQLite treats every NULL as
    -- distinct, so ordinary notes never collide. Sync must treat this as an
    -- identity and merge bodies rather than pick a winner (journal design §6).
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_journal_day
        ON notes (workspace_id, journal_day) WHERE journal_day IS NOT NULL;

    -- Tasks.

    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Untitled task',
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'medium',
        folder TEXT NOT NULL DEFAULT 'personal',
        note_id TEXT,
        start_at TEXT,
        due_at TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        overlay INTEGER NOT NULL DEFAULT 0,
        workspace_id TEXT NOT NULL DEFAULT 'workspace-default' REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (task_id, depends_on_task_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        CHECK (task_id != depends_on_task_id)
    );

    CREATE TABLE IF NOT EXISTS task_notes (
        task_id TEXT NOT NULL,
        note_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (task_id, note_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks (due_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks (workspace_id);
    CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on
        ON task_dependencies (depends_on_task_id);
    CREATE INDEX IF NOT EXISTS idx_task_notes_note_id ON task_notes (note_id);

    -- UI plugins.

    CREATE TABLE IF NOT EXISTS ui_plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Untitled plugin',
        tokens TEXT NOT NULL DEFAULT '{}',
        css TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ui_plugins_position ON ui_plugins (position);

    -- MCP server. Device-local: it holds host paths and per-machine grants, so
    -- it must never travel with the synced `settings` row.

    CREATE TABLE IF NOT EXISTS mcp_settings (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        access      TEXT    NOT NULL DEFAULT 'read',
        scopes      TEXT    NOT NULL DEFAULT '[]',
        workspaces  TEXT    NOT NULL DEFAULT '[]',
        audit       INTEGER NOT NULL DEFAULT 1,
        log_limit   INTEGER NOT NULL DEFAULT 200,
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_clients (
        instance_id TEXT PRIMARY KEY,
        name        TEXT NOT NULL DEFAULT 'MCP client',
        source      TEXT NOT NULL DEFAULT 'unknown',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_audit (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        at          TEXT NOT NULL DEFAULT (datetime('now')),
        instance_id TEXT,
        tool        TEXT NOT NULL,
        scope       TEXT NOT NULL DEFAULT 'read',
        ok          INTEGER NOT NULL DEFAULT 1,
        workspace   TEXT NOT NULL DEFAULT '',
        detail      TEXT NOT NULL DEFAULT '',
        remote_addr TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_audit_at ON mcp_audit (at DESC);

    -- AI assistant (BYOK, device-local). The key is stored as an `enc:v1:`
    -- marker, never plaintext; chat history is kept out of any sync scope.

    CREATE TABLE IF NOT EXISTS ai_settings (
        id               INTEGER PRIMARY KEY CHECK (id = 1),
        enabled          INTEGER NOT NULL DEFAULT 0,
        provider         TEXT NOT NULL DEFAULT 'openai-compatible',
        base_url         TEXT NOT NULL DEFAULT '',
        model            TEXT NOT NULL DEFAULT '',
        temperature      REAL NOT NULL DEFAULT 0.7,
        max_tokens       INTEGER NOT NULL DEFAULT 1024,
        api_key          TEXT NOT NULL DEFAULT '',
        updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
        -- The assistant's own tool grant, independent of the MCP server.
        access           TEXT NOT NULL DEFAULT 'read',
        scopes           TEXT NOT NULL DEFAULT '[]',
        -- Web search provider/key (BYOK, same `enc:v1:` envelope); '' is off.
        search_provider  TEXT NOT NULL DEFAULT '',
        search_api_key   TEXT NOT NULL DEFAULT '',
        search_fallbacks TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS ai_threads (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL DEFAULT '',
        note_id    TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id    TEXT NOT NULL,
        role         TEXT NOT NULL,
        -- The answer body only; reasoning and tool traffic are stored separately
        -- so a raw chain of thought never reads as the reply.
        content      TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        reasoning    TEXT NOT NULL DEFAULT '',
        tool_calls   TEXT NOT NULL DEFAULT '[]',
        tool_results TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_ai_messages_thread ON ai_messages (thread_id, id);

    -- Local version history (auto-save safety net). Not foreign-keyed: notes and
    -- tasks share one id space, and this stays device-local.

    CREATE TABLE IF NOT EXISTS entity_versions (
        id         TEXT PRIMARY KEY,
        entity     TEXT NOT NULL,
        entity_id  TEXT NOT NULL,
        payload    TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        reason     TEXT NOT NULL DEFAULT 'auto',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_entity_versions_lookup
        ON entity_versions (entity, entity_id, updated_at DESC);

    -- Semantic memory. `embeddings` is a derivative: it may be dropped and
    -- rebuilt from `notes.body` at any time. `model`/`dim` travel with each
    -- vector so a mismatch is treated as \"not indexed\"; `content_hash` is the
    -- efficiency key.

    CREATE TABLE IF NOT EXISTS embeddings (
        entity_kind  TEXT NOT NULL,
        entity_id    TEXT NOT NULL,
        model        TEXT NOT NULL,
        dim          INTEGER NOT NULL,
        vec          BLOB NOT NULL,
        content_hash TEXT NOT NULL,
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (entity_kind, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings (model);

    -- Auto-link suggestions: a row is a pending/accepted/rejected proposal and
    -- only an accepted one becomes an edge. Rejected rows are kept so a pair is
    -- never suggested twice. `reason` is persisted, so it stays English.
    CREATE TABLE IF NOT EXISTS graph_suggestions (
        id          TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL,
        source_id   TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        edge_kind   TEXT NOT NULL,
        score       REAL NOT NULL DEFAULT 0,
        reason      TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'pending',
        created_at  INTEGER NOT NULL,
        decided_at  INTEGER
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_suggestions_pair
        ON graph_suggestions (source_kind, source_id, target_kind, target_id, edge_kind);
    CREATE INDEX IF NOT EXISTS idx_graph_suggestions_status
        ON graph_suggestions (status);

    -- Cluster assignments: `run_id` groups one pass so a new pass swaps in
    -- atomically (build under a fresh id, then delete every other id).
    CREATE TABLE IF NOT EXISTS clusters (
        run_id      TEXT NOT NULL,
        cluster_id  INTEGER NOT NULL,
        label       TEXT NOT NULL DEFAULT '',
        entity_kind TEXT NOT NULL,
        entity_id   TEXT NOT NULL,
        score       REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (run_id, entity_kind, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_clusters_run ON clusters (run_id);

    -- Remote MCP (paid tier). Device-local. The token is kept as a hash with a
    -- short hint, and `token_enc` (same cipher as the AI key) lets it survive a
    -- restart; `mode` rotates with the exposure setting.

    CREATE TABLE IF NOT EXISTS remote_mcp (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        enabled    INTEGER NOT NULL DEFAULT 0,
        mode       TEXT NOT NULL DEFAULT 'local',
        token_hash TEXT NOT NULL DEFAULT '',
        token_hint TEXT NOT NULL DEFAULT '',
        created_at INTEGER,
        rotated_at INTEGER,
        token_enc  TEXT NOT NULL DEFAULT ''
    );

    -- Attachment artifacts. Content-addressed: one row per SHA-256 blob, so the
    -- same file in two notes is one row and one blob. `rel_path` is the S3
    -- object key; `origin_path` is diagnostic only, never synced as truth.

    CREATE TABLE IF NOT EXISTS attachments (
        id           TEXT PRIMARY KEY,
        ext          TEXT NOT NULL DEFAULT '',
        name         TEXT NOT NULL DEFAULT '',
        size         INTEGER NOT NULL DEFAULT 0,
        rel_path     TEXT NOT NULL DEFAULT '',
        origin_path  TEXT NOT NULL DEFAULT '',
        created_at   INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments (created_at);

    -- Vault folder. SQLite is the source of truth; the folder is a projection.
    -- `vault_links` is a derived index recording what each file last held, so
    -- our writes can be told from outside edits (`content_hash`) and a deleted
    -- file becomes a tombstone. It can be rebuilt by scanning the folder.

    CREATE TABLE IF NOT EXISTS vault_links (
        workspace_id TEXT NOT NULL,
        rel_path     TEXT NOT NULL,
        entity_kind  TEXT NOT NULL DEFAULT 'note',
        entity_id    TEXT,
        content_hash TEXT NOT NULL DEFAULT '',
        file_mtime   INTEGER,
        synced_at    INTEGER NOT NULL,
        state        TEXT NOT NULL DEFAULT 'ok',
        PRIMARY KEY (workspace_id, rel_path)
    );

    CREATE INDEX IF NOT EXISTS idx_vault_links_entity
        ON vault_links (workspace_id, entity_id);
";
