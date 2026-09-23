use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(desktop)]
mod tray;

const DB_URL: &str = "sqlite:stylenotes.db";
const WORKSPACE_LABEL: &str = "workspace";
const OVERLAY_LABEL: &str = "overlay";
const KANBAN_LABEL: &str = "kanban";

/// Emitted with the new lock state whenever the global shortcut toggles it.
const KANBAN_LOCK_EVENT: &str = "kanban:lock-changed";

/// Emitted with `"note"` or `"task"` when a quick-capture shortcut fires; the
/// dock webview creates the record and opens its editor window.
const QUICK_CAPTURE_EVENT: &str = "quick-capture:create";

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
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::Emitter;
                use tauri::Manager;
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
