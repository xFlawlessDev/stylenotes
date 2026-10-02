//! Application startup.
//!
//! Everything the app must do once, in one place: install the shared state each
//! subsystem expects to find via `State<T>`, install the desktop plugins, and
//! bring the remote MCP listener back. Keeping it out of `lib.rs` keeps the
//! wiring readable and the entry point small.

use tauri::Manager;

/// Runs once, after the builder has registered plugins and before the first
/// window loads.
pub fn run<R: tauri::Runtime>(app: &mut tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    // The MCP bridge: lays down `mcp/`, writes `app-info.json`, parks the job
    // watcher. Failure is not fatal — MCP just stays unavailable.
    crate::mcp_server::init(app.handle());
    // Tracks which detail windows still owe a pre-quit flush.
    app.manage(crate::quit::QuitState::default());
    // Keeps a loaded local embedder warm between `ai_embed` batches.
    app.manage(crate::embed::commands::LocalModelState::default());
    // Tell ONNX discovery where a bundle keeps its resources. On macOS and Linux
    // the dylib is not next to the executable, so without this a packaged build
    // would report the model unavailable.
    #[cfg(feature = "local-embed")]
    crate::embed::onnx::set_resource_dir(app.path().resource_dir().ok());
    // Owns the optional remote MCP listener; off until started (#D12).
    app.manage(crate::remote_mcp::commands::RemoteState::default());
    // Owns the vault folder watcher; installed on demand per workspace.
    app.manage(crate::vault::commands::VaultWatchState::default());

    // The atomic note-write pool must exist before any window can call
    // `note_upsert_tx`. A failed open is not fatal: the frontend falls back to
    // the non-transactional path (see `db/index.ts`).
    match tauri::async_runtime::block_on(crate::db_tx::open(app.handle())) {
        Ok(pool) => {
            app.manage(crate::db_tx::WritePool(pool));
        }
        Err(error) => {
            eprintln!("write pool unavailable, atomic note writes disabled: {error}");
        }
    }

    // Bring the remote MCP listener back before any webview hydrates, so an MCP
    // client probing on launch finds port 7317 already open. The frontend's
    // `resumeRemoteMcp` remains the fallback for the case where the write pool
    // was unavailable here (#D12).
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        crate::remote_mcp::commands::resume_from_store(handle).await;
    });

    #[cfg(desktop)]
    desktop(app)?;

    Ok(())
}

#[cfg(desktop)]
fn desktop<R: tauri::Runtime>(app: &mut tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(tauri_plugin_positioner::init())?;
    crate::shortcuts::place_overlay(app.handle());
    crate::tray::init(app.handle())?;
    crate::shortcuts::register(app.handle())?;
    Ok(())
}
