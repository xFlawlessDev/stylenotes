use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(desktop)]
mod tray;

mod ai;
mod db_tx;
mod mcp_host;
mod mcp_watch;
mod quit;

const DB_URL: &str = "sqlite:stylenotes.db";
const WORKSPACE_LABEL: &str = "workspace";
const OVERLAY_LABEL: &str = "overlay";
const KANBAN_LABEL: &str = "kanban";

/// Emitted with the new lock state whenever the global shortcut toggles it.
const KANBAN_LOCK_EVENT: &str = "kanban:lock-changed";

/// Emitted with `"note"` or `"task"` when a quick-capture shortcut fires; the
/// dock webview creates the record and opens its editor window.
const QUICK_CAPTURE_EVENT: &str = "quick-capture:create";

/// App state holding the MCP job watcher.
///
/// The watcher must outlive the setup call, and the wait command needs to reach
/// it from a worker thread, so it is shared rather than owned by the command.
struct McpWatchState {
    watch: std::sync::Arc<mcp_watch::JobWatch>,
}

/// Every window is hidden instead of closed so the app keeps running in the
/// system tray; "Quit StyleNotes" in the tray menu is the way out.
fn hide_on_close(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        match window.label() {
            WORKSPACE_LABEL | OVERLAY_LABEL | KANBAN_LABEL => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        }
    }
}

/// Shortcut that locks the Kanban window to the desktop or floats it again.
#[cfg(desktop)]
fn kanban_lock_shortcut() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Backslash)
}

/// Shortcut that quick-captures a note straight into the overlay dock.
#[cfg(desktop)]
fn quick_note_shortcut() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN)
}

/// Shortcut that quick-captures a task straight into the overlay dock.
#[cfg(desktop)]
fn quick_task_shortcut() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyT)
}

/// Locks the Kanban window to the desktop (`true`) or floats it (`false`).
///
/// Must not run on the main thread: the desktop underlay plugin dispatches to
/// the main thread internally and waits for it to finish.
#[cfg(desktop)]
fn toggle_kanban_lock<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::{Emitter, Manager};
    use tauri_plugin_desktop_underlay::DesktopUnderlayExt;

    let Some(window) = app.get_webview_window(KANBAN_LABEL) else {
        return;
    };
    let locked = !window.is_desktop_underlay();
    if locked {
        let _ = window.set_always_on_top(false);
        let _ = window.set_desktop_underlay(true);
    } else {
        let _ = window.set_desktop_underlay(false);
        let _ = window.set_always_on_top(true);
    }
    let _ = window.show();
    if !locked {
        let _ = window.set_focus();
    }
    let _ = app.emit(KANBAN_LOCK_EVENT, locked);
}

/// Absolute path of the SQLite database file (#D14).
///
/// The plugin resolves the relative `sqlite:stylenotes.db` URL against the app
/// data directory, so this is the same file it opens. The shim never guesses.
#[tauri::command]
fn db_path(app: tauri::AppHandle) -> Option<String> {
    mcp_host::database_path(&app).map(|path| path.to_string_lossy().to_string())
}

/// Directories and files of the MCP bridge, plus the installed shim binary.
#[tauri::command]
fn mcp_paths(app: tauri::AppHandle) -> Option<mcp_host::McpPaths> {
    mcp_host::ensure_dirs(&app)
}

/// Current supervisor status, read by the Settings page.
///
/// Serialised camelCase to match the `McpAppInfo` type the frontend reads.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct McpAppInfo {
    protocol: u32,
    app_running: bool,
    app_pid: Option<u32>,
    app_version: String,
    db_path: Option<String>,
    enabled: bool,
    snapshot_rev: u64,
    generated_at: Option<String>,
    binary_path: Option<String>,
}

#[tauri::command]
fn mcp_app_info(app: tauri::AppHandle) -> McpAppInfo {
    let existing = mcp_host::read_app_info(&app);
    let base = existing
        .clone()
        .unwrap_or_else(|| mcp_host::initial_app_info(&app));
    McpAppInfo {
        protocol: base.protocol,
        app_running: true,
        app_pid: base.app_pid,
        app_version: base.app_version,
        db_path: base.db_path,
        enabled: existing.as_ref().map(|info| info.enabled).unwrap_or(false),
        snapshot_rev: base.snapshot_rev,
        generated_at: base.generated_at,
        binary_path: mcp_host::shim_binary(),
    }
}

/// Frontend-driven refresh of `mcp/app-info.json` (#D5).
///
/// The always-alive workspace window owns the `enabled` flag and snapshot
/// revision, so it passes them down instead of Rust reading the database.
#[tauri::command]
fn mcp_write_app_info(
    app: tauri::AppHandle,
    enabled: bool,
    snapshot_rev: u64,
    generated_at: Option<String>,
    grant: Option<mcp_host::GrantInfo>,
) -> Result<(), String> {
    let mut info = mcp_host::initial_app_info(&app);
    info.enabled = enabled;
    info.snapshot_rev = snapshot_rev;
    info.generated_at = generated_at;
    info.grant = grant;
    mcp_host::write_app_info(&app, &info)
}

/// Called after the master switch flips: refreshes `app-info.json` so a running
/// shim sees the change immediately, preserving the grant the frontend set.
#[tauri::command]
fn mcp_reconcile(app: tauri::AppHandle) -> Result<(), String> {
    let mut info = mcp_host::initial_app_info(&app);
    if let Some(existing) = mcp_host::read_app_info(&app) {
        info.enabled = existing.enabled;
        info.grant = existing.grant;
        info.snapshot_rev = existing.snapshot_rev;
        info.generated_at = existing.generated_at;
    }
    mcp_host::write_app_info(&app, &info)
}

/// Writes the snapshot document the frontend built (#D3).
#[tauri::command]
fn mcp_write_snapshot(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    mcp_host::write_snapshot(&app, &payload)
}

/// Deletes the snapshot, used when MCP is switched off (privacy, §7).
#[tauri::command]
fn mcp_clear_snapshot(app: tauri::AppHandle) {
    mcp_host::clear_snapshot(&app);
}

/// Oldest pending write job, as raw JSON, or `null` when none arrives in time.
///
/// Push, not polling: the frontend parks one call here and the filesystem
/// watcher wakes it the moment the shim drops a job file.
///
/// The answer goes out over a `Channel` because a multi-second `invoke` reply
/// would block the main thread — the same loop that paints and handles input —
/// and freeze the whole app. Instead the directory is checked inline (so a job
/// already on disk costs nothing extra) and an empty wait is parked on a worker
/// thread that reports back through the channel.
///
/// The channel is the only way an answer reaches the caller, so every failure
/// path must either report an error *or* send a message: returning `Ok(())`
/// without one would park the frontend forever.
#[tauri::command]
async fn mcp_wait_job(
    app: tauri::AppHandle,
    state: tauri::State<'_, McpWatchState>,
    channel: tauri::ipc::Channel<Option<String>>,
    wait_ms: Option<u64>,
    deadline: Option<u64>,
) -> Result<(), String> {
    let Ok(dir) = mcp_host::jobs_dir(&app).ok_or("app data directory unavailable") else {
        return Err("app data directory unavailable".into());
    };
    let watch = state.watch.clone();
    let ours = watch.watches(&dir);
    if ours {
        // Drop a hint left over from the job we just returned.
        watch.drain();
    }
    if let Some(raw) = mcp_host::oldest_job(&dir) {
        let _ = channel.send(Some(raw));
        return Ok(());
    }
    if !ours {
        // No watcher: report empty rather than parking a wait that can never be
        // woken. The frontend keeps its loop, so the next call retries.
        let _ = channel.send(None);
        return Ok(());
    }
    let budget = mcp_watch::wait_budget(wait_ms, deadline);
    let parked = mcp_watch::parked(watch, budget, move || {
        let next: Option<String> = mcp_host::oldest_job(&dir);
        let _ = channel.send(next);
    });
    parked.spawn();
    Ok(())
}

/// Writes the result of a job and drops it from the queue.
#[tauri::command]
fn mcp_write_result(app: tauri::AppHandle, id: String, payload: String) -> Result<(), String> {
    mcp_host::write_result(&app, &id, &payload)
}

/// Keeps a pre-change copy of a note body before an agent rewrites it (#13a).
#[tauri::command]
fn mcp_backup_note(
    app: tauri::AppHandle,
    note_id: String,
    body: String,
    keep: usize,
) -> Result<(), String> {
    mcp_host::backup_note_body(&app, &note_id, &body, keep)
}

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_notes_folders_tags_notifications_settings",
            sql: "
                CREATE TABLE IF NOT EXISTS folders (
                    id TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
                    updated TEXT NOT NULL DEFAULT 'Just now',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_folder_icon",
            sql: "ALTER TABLE folders ADD COLUMN icon TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_folder_position",
            sql: "ALTER TABLE folders ADD COLUMN position INTEGER;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_tasks",
            sql: "
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
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
                CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks (due_at);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_task_overlay",
            sql: "ALTER TABLE tasks ADD COLUMN overlay INTEGER NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_note_overlay",
            sql: "ALTER TABLE notes ADD COLUMN overlay INTEGER NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_ui_plugins",
            sql: "
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
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_workspaces_and_scope_records",
            sql: "
                CREATE TABLE IF NOT EXISTS workspaces (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL DEFAULT 'primary',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                INSERT OR IGNORE INTO workspaces (id, name, color)
                VALUES ('workspace-default', 'Personal', 'primary');

                ALTER TABLE notes ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace-default' REFERENCES workspaces(id) ON DELETE CASCADE;
                ALTER TABLE tasks ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace-default' REFERENCES workspaces(id) ON DELETE CASCADE;
                ALTER TABLE folders ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace-default' REFERENCES workspaces(id) ON DELETE CASCADE;
                CREATE INDEX IF NOT EXISTS idx_notes_workspace_id ON notes (workspace_id);
                CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks (workspace_id);
                CREATE INDEX IF NOT EXISTS idx_folders_workspace_id ON folders (workspace_id);

                CREATE TABLE IF NOT EXISTS task_dependencies (
                    task_id TEXT NOT NULL,
                    depends_on_task_id TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    PRIMARY KEY (task_id, depends_on_task_id),
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                    FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                    CHECK (task_id != depends_on_task_id)
                );
                CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies (depends_on_task_id);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "create_task_notes",
            sql: "
                CREATE TABLE IF NOT EXISTS task_notes (
                    task_id TEXT NOT NULL,
                    note_id TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    PRIMARY KEY (task_id, note_id),
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_task_notes_note_id ON task_notes (note_id);
            ",
            kind: MigrationKind::Up,
        },
        // Runs as its own migration: the plugin prepares migrations with the
        // bind-parameter path, which only executes the first statement of a
        // multi-statement string — this INSERT would be dropped inside v9.
        Migration {
            version: 10,
            description: "backfill_task_note_links",
            sql: "
                INSERT OR IGNORE INTO task_notes (task_id, note_id)
                SELECT id, note_id FROM tasks WHERE note_id IS NOT NULL;
            ",
            kind: MigrationKind::Up,
        },
        // Local MCP server settings (docs/design/mcp-local-free.md #D7). Device
        // local on purpose: it holds host paths and per-machine grants, so it
        // must not travel with the synced `settings` row.
        Migration {
            version: 11,
            description: "create_mcp_settings",
            sql: "
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
                    detail      TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_mcp_audit_at ON mcp_audit (at DESC);
            ",
            kind: MigrationKind::Up,
        },
        // MCP reads the note `created_at`/`updated_at` timestamps instead of the
        // human display column `updated` (#D13). The cloud-sync Phase 0 must NOT
        // add this column again; it only backfills when needed.
        Migration {
            version: 12,
            description: "add_note_updated_at",
            sql: "
                ALTER TABLE notes ADD COLUMN updated_at INTEGER;
                UPDATE notes SET updated_at = strftime('%s', created_at) * 1000 WHERE updated_at IS NULL;
            ",
            kind: MigrationKind::Up,
        },
        // AI assistant (BYOK, device-local). The settings row stores only the
        // encrypted key marker, never plaintext; chat history is local-only and
        // is intentionally kept out of any future sync scope.
        Migration {
            version: 13,
            description: "add_ai_assistant",
            sql: "
                CREATE TABLE IF NOT EXISTS ai_settings (
                    id          INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled     INTEGER NOT NULL DEFAULT 0,
                    provider    TEXT NOT NULL DEFAULT 'openai-compatible',
                    base_url    TEXT NOT NULL DEFAULT '',
                    model       TEXT NOT NULL DEFAULT '',
                    temperature REAL NOT NULL DEFAULT 0.7,
                    max_tokens  INTEGER NOT NULL DEFAULT 1024,
                    api_key     TEXT NOT NULL DEFAULT '',
                    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS ai_threads (
                    id         TEXT PRIMARY KEY,
                    title      TEXT NOT NULL DEFAULT '',
                    note_id    TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS ai_messages (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    thread_id  TEXT NOT NULL,
                    role       TEXT NOT NULL,
                    content    TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE INDEX IF NOT EXISTS idx_ai_messages_thread ON ai_messages (thread_id, id);
            ",
            kind: MigrationKind::Up,
        },
        // The AI assistant's own tool grant, independent of whether the MCP
        // server is switched on. Read tools need no grant; write tools need
        // `access = 'write'` plus the matching scope.
        Migration {
            version: 14,
            description: "add_ai_tool_grant",
            sql: "
                ALTER TABLE ai_settings ADD COLUMN access TEXT NOT NULL DEFAULT 'read';
                ALTER TABLE ai_settings ADD COLUMN scopes TEXT NOT NULL DEFAULT '[]';
            ",
            kind: MigrationKind::Up,
        },
        // Local version history for notes and tasks (auto-save safety net).
        // Deliberately not foreign-keyed to `notes`/`tasks`: notes and tasks
        // share one table, and this stays device-local when cloud sync lands.
        Migration {
            version: 15,
            description: "create_entity_versions",
            sql: "
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
            ",
            kind: MigrationKind::Up,
        },
        // The assistant's reasoning and tool traffic, so a reopened chat shows
        // how an answer was reached. `ai_messages.content` stays the answer
        // body only: reasoning is never mixed into it, because a model's raw
        // chain of thought must not read as the reply.
        // `tool_calls` is the raw `AiToolCall[]` JSON the model asked for;
        // `tool_results` maps call id to `ToolResult` JSON, so a call with no
        // entry is still awaiting a verdict when the app was closed.
        Migration {
            version: 16,
            description: "add_ai_message_trace",
            sql: "
                ALTER TABLE ai_messages ADD COLUMN reasoning TEXT NOT NULL DEFAULT '';
                ALTER TABLE ai_messages ADD COLUMN tool_calls TEXT NOT NULL DEFAULT '[]';
                ALTER TABLE ai_messages ADD COLUMN tool_results TEXT NOT NULL DEFAULT '{}';
            ",
            kind: MigrationKind::Up,
        },
        // Web search for the assistant (BYOK, like the model provider). The key
        // uses the same `enc:v1:` envelope as the model key and is never read
        // back into the UI; `provider = ''` means search is off.
        Migration {
            version: 17,
            description: "add_ai_web_search",
            sql: "
                ALTER TABLE ai_settings ADD COLUMN search_provider TEXT NOT NULL DEFAULT '';
                ALTER TABLE ai_settings ADD COLUMN search_api_key TEXT NOT NULL DEFAULT '';
                ALTER TABLE ai_settings ADD COLUMN search_fallbacks TEXT NOT NULL DEFAULT '[]';
            ",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .plugin(prevent_default())
        .on_window_event(hide_on_close)
        .invoke_handler(tauri::generate_handler![
            db_path,
            mcp_paths,
            mcp_app_info,
            mcp_write_app_info,
            mcp_reconcile,
            mcp_write_snapshot,
            mcp_clear_snapshot,
            mcp_wait_job,
            mcp_write_result,
            mcp_backup_note,
            db_tx::note_upsert_tx,
            db_tx::note_remove_tx,
            db_tx::workspace_remove_tx,
            quit::app_quit_ready,
            ai::commands::ai_encrypt_key,
            ai::commands::ai_decrypt_key,
            ai::commands::ai_stream,
            ai::commands::ai_test_connection,
            ai::web_commands::ai_web_search,
            ai::web_commands::ai_web_fetch,
            ai::web_commands::ai_search_providers
        ])
        .setup(|app| {
            // Lays down `mcp/`, clears stale jobs, and writes the first
            // `app-info.json`. Failure is not fatal: MCP just stays unavailable.
            mcp_host::prepare(app.handle());
            // Pushes new job files to the parked `mcp_wait_job` call instead of
            // letting the frontend poll `mcp/jobs/`. A missing watcher degrades
            // to the wait deadline, not to a broken bridge.
            let jobs_dir = mcp_host::jobs_dir(app.handle())
                .unwrap_or_else(|| std::path::PathBuf::from("mcp").join("jobs"));
            app.manage(McpWatchState {
                watch: mcp_watch::shared(mcp_watch::install(app.handle(), jobs_dir)),
            });
            // Tracks which detail windows still owe a pre-quit flush.
            app.manage(quit::QuitState::default());
            // The atomic note-write pool must exist before any window can call
            // `note_upsert_tx`. A failed open is not fatal: the frontend falls
            // back to the non-transactional path (see `db/index.ts`).
            match tauri::async_runtime::block_on(db_tx::open(app.handle())) {
                Ok(pool) => {
                    app.manage(db_tx::WritePool(pool));
                }
                Err(error) => {
                    eprintln!("write pool unavailable, atomic note writes disabled: {error}");
                }
            }
            #[cfg(desktop)]
            {
                use tauri::Emitter;
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
                use tauri_plugin_positioner::{Position, WindowExt};
                app.handle().plugin(tauri_plugin_positioner::init())?;
                if let Some(overlay) = app.get_webview_window(OVERLAY_LABEL) {
                    let _ = overlay.as_ref().window().move_window(Position::TopRight);
                }
                tray::init(app.handle())?;

                // Registered in Rust so the shortcut works from launch, even
                // before (or without) the Kanban webview.
                app.global_shortcut().on_shortcut(
                    kanban_lock_shortcut(),
                    move |app, _shortcut, event| {
                        if event.state != ShortcutState::Pressed {
                            return;
                        }
                        let app = app.clone();
                        // Detached on purpose: the toggle must not run on the
                        // shortcut handler's thread (see `toggle_kanban_lock`).
                        std::mem::drop(tauri::async_runtime::spawn(async move {
                            toggle_kanban_lock(&app);
                        }));
                    },
                )?;

                // Quick capture: the dock (always alive) receives the event,
                // creates the record, and opens its editor window. A failed
                // registration (shortcut taken by another app) is not fatal.
                let _ = app.global_shortcut().on_shortcut(
                    quick_note_shortcut(),
                    move |app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            let _ = app.emit(QUICK_CAPTURE_EVENT, "note");
                        }
                    },
                );
                let _ = app.global_shortcut().on_shortcut(
                    quick_task_shortcut(),
                    move |app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            let _ = app.emit(QUICK_CAPTURE_EVENT, "task");
                        }
                    },
                );
            }
            Ok(())
        });

    // Desktop-only plugins: the underlay APIs and global shortcuts do not
    // exist on mobile.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_desktop_underlay::init());

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Flip `appRunning` so a shim that outlives us reports stale reads
            // and refuses writes instead of trusting a live-looking file.
            if let tauri::RunEvent::Exit = event {
                mcp_host::mark_stopped(app);
            }
        });
}

#[cfg(debug_assertions)]
fn prevent_default() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_prevent_default::Flags;

    tauri_plugin_prevent_default::Builder::new()
        .with_flags(Flags::all().difference(Flags::DEV_TOOLS | Flags::RELOAD))
        .build()
}

#[cfg(not(debug_assertions))]
fn prevent_default() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_prevent_default::init()
}
