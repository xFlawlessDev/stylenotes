//! StyleNotes entry point: plugin registration, the command surface, and the
//! window/run wiring. Feature logic lives in its own module (`schema`,
//! `mcp_server`, `setup`, `shortcuts`, `tray`, `ai`, …); this file only binds
//! them together.

use tauri_plugin_sql::Builder as SqlBuilder;

#[cfg(desktop)]
mod tray;

mod ai;
mod attachments;
mod cloud;
mod db_tx;
mod embed;
mod import;
mod mcp_host;
mod mcp_server;
mod mcp_watch;
mod quit;
mod remote_mcp;
mod schema;
mod setup;
#[cfg(desktop)]
mod shortcuts;
mod vault;

// The MCP read side, compiled into the app so the remote HTTP listener can
// answer reads from the snapshot exactly like an in-process MCP
// server (#D2, #D3). These resolve `crate::bridge`/`crate::read`/`crate::protocol`,
// so they must sit at the crate root.
#[allow(dead_code)]
#[path = "mcp/bridge.rs"]
mod bridge;
#[allow(dead_code)]
#[path = "mcp/protocol.rs"]
mod protocol;
#[allow(dead_code)]
#[path = "mcp/rank.rs"]
mod rank;
#[allow(dead_code)]
#[path = "mcp/read.rs"]
mod read;
#[allow(dead_code)]
#[path = "mcp/read_deps.rs"]
mod read_deps;
#[allow(dead_code)]
#[path = "mcp/read_graph.rs"]
mod read_graph;
#[allow(dead_code)]
#[path = "mcp/read_tasks.rs"]
mod read_tasks;
#[allow(dead_code)]
#[path = "mcp/read_workspaces.rs"]
mod read_workspaces;
#[path = "mcp/registry.rs"]
mod registry;
#[allow(dead_code)]
#[path = "mcp/search.rs"]
mod search;
#[allow(dead_code)]
#[path = "mcp/semantic.rs"]
mod semantic;

pub const DB_URL: &str = "sqlite:stylenotes.db";
pub const WORKSPACE_LABEL: &str = "workspace";
pub const OVERLAY_LABEL: &str = "overlay";
pub const KANBAN_LABEL: &str = "kanban";

/// Emitted with the new lock state whenever the global shortcut toggles it.
pub const KANBAN_LOCK_EVENT: &str = "kanban:lock-changed";

/// Emitted with `"note"` or `"task"` when a quick-capture shortcut fires; the
/// dock webview creates the record and opens its editor window.
pub const QUICK_CAPTURE_EVENT: &str = "quick-capture:create";

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations(DB_URL, schema::migrations())
                .build(),
        )
        .plugin(prevent_default())
        .on_window_event(hide_on_close)
        .invoke_handler(tauri::generate_handler![
            mcp_server::db_path,
            mcp_server::mcp_paths,
            mcp_server::mcp_app_info,
            mcp_server::mcp_write_app_info,
            mcp_server::mcp_reconcile,
            mcp_server::mcp_write_snapshot,
            mcp_server::mcp_clear_snapshot,
            mcp_server::mcp_wait_job,
            mcp_server::mcp_write_result,
            mcp_server::mcp_backup_note,
            db_tx::note_upsert_tx,
            db_tx::note_remove_tx,
            db_tx::workspace_remove_tx,
            quit::app_quit_ready,
            cloud::cloud_session_set,
            cloud::cloud_session_get,
            cloud::cloud_session_clear,
            ai::commands::ai_encrypt_key,
            ai::commands::ai_decrypt_key,
            ai::commands::ai_stream,
            ai::commands::ai_test_connection,
            ai::web_commands::ai_web_search,
            ai::web_commands::ai_web_fetch,
            ai::web_commands::ai_search_providers,
            embed::commands::memory_embedders,
            embed::commands::ai_embed,
            embed::commands::memory_cosine,
            embed::commands::memory_model_status,
            embed::commands::memory_download_model,
            import::import_read_markdown,
            attachments::commands::attachment_import,
            attachments::commands::attachment_import_bytes,
            attachments::commands::attachment_resolve,
            attachments::commands::attachment_path,
            attachments::commands::attachment_root,
            attachments::commands::attachment_open,
            attachments::commands::attachment_delete,
            attachments::commands::attachment_restore,
            attachments::commands::attachment_trash_list,
            attachments::commands::attachment_purge,
            attachments::commands::attachment_trash_purge_expired,
            remote_mcp::commands::remote_mcp_start,
            remote_mcp::commands::remote_mcp_stop,
            remote_mcp::commands::remote_mcp_status,
            remote_mcp::commands::remote_mcp_rotate,
            vault::commands::vault_export_files,
            vault::commands::vault_copy_file,
            vault::commands::vault_read_files,
            vault::commands::vault_scan,
            vault::commands::vault_validate_root,
            vault::commands::vault_import_attachment,
            vault::commands::vault_watch_start,
            vault::commands::vault_wait_change
        ])
        .setup(|app| setup::run(app));

    // Desktop-only plugins: the underlay APIs and global shortcuts do not
    // exist on mobile.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_desktop_underlay::init());

    // MCP Bridge for AI-driven development (debug builds only — never in a
    // release). Bound to localhost so the automation socket is not reachable
    // from the LAN. Requires `withGlobalTauri` in `tauri.conf.json`.
    #[cfg(debug_assertions)]
    let builder = builder.plugin(
        tauri_plugin_mcp_bridge::Builder::new()
            .bind_address("127.0.0.1")
            .build(),
    );

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
        .with_flags(Flags::all().difference(Flags::DEV_TOOLS | Flags::RELOAD | Flags::FIND))
        .build()
}

#[cfg(not(debug_assertions))]
fn prevent_default() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_prevent_default::Flags;

    // FIND is left out so the app's own find-in-note (Ctrl/Cmd+F) can run; the
    // webview still intercepts the event, so no native browser find opens.
    tauri_plugin_prevent_default::Builder::new()
        .with_flags(Flags::all().difference(Flags::FIND))
        .build()
}
