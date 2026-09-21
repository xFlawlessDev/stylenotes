use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(desktop)]
mod tray;

const DB_URL: &str = "sqlite:stylenotes.db";
const WORKSPACE_LABEL: &str = "workspace";
const OVERLAY_LABEL: &str = "overlay";
const KANBAN_LABEL: &str = "kanban";

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
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .plugin(prevent_default())
        .on_window_event(hide_on_close)
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::Manager;
                use tauri_plugin_positioner::{Position, WindowExt};
                app.handle().plugin(tauri_plugin_positioner::init())?;
                if let Some(overlay) = app.get_webview_window(OVERLAY_LABEL) {
                    let _ = overlay.as_ref().window().move_window(Position::TopRight);
                }
                tray::init(app.handle())?;
            }
            Ok(())
        });

    // The desktop underlay APIs only exist on desktop platforms.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_desktop_underlay::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
