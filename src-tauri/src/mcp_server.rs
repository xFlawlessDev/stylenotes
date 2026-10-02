//! The Tauri commands the always-alive `workspace` window uses to drive the MCP
//! file bridge (docs/design/mcp-local-free.md). The bridge itself lives in
//! `mcp_host`; this module is only the IPC surface over it.

use tauri::Manager;

use crate::mcp_host;
use crate::mcp_watch::{self, JobWatch};

/// App state holding the MCP job watcher.
///
/// The watcher must outlive the setup call, and the wait command needs to reach
/// it from a worker thread, so it is shared rather than owned by the command.
pub struct McpWatchState {
    pub watch: std::sync::Arc<JobWatch>,
}

/// Absolute path of the SQLite database file (#D14).
///
/// The plugin resolves the relative `sqlite:stylenotes.db` URL against the app
/// data directory, so this is the same file it opens. The shim never guesses.
#[tauri::command]
pub fn db_path(app: tauri::AppHandle) -> Option<String> {
    mcp_host::database_path(&app).map(|path| path.to_string_lossy().to_string())
}

/// Directories and files of the MCP bridge.
#[tauri::command]
pub fn mcp_paths(app: tauri::AppHandle) -> Option<mcp_host::McpPaths> {
    mcp_host::ensure_dirs(&app)
}

/// Current bridge status, read by the Settings page.
///
/// Serialised camelCase to match the `McpAppInfo` type the frontend reads.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpAppInfo {
    protocol: u32,
    app_running: bool,
    app_pid: Option<u32>,
    app_version: String,
    db_path: Option<String>,
    enabled: bool,
    snapshot_rev: u64,
    generated_at: Option<String>,
}

#[tauri::command]
pub fn mcp_app_info(app: tauri::AppHandle) -> McpAppInfo {
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
    }
}

/// Frontend-driven refresh of `mcp/app-info.json` (#D5).
///
/// The always-alive workspace window owns the `enabled` flag and snapshot
/// revision, so it passes them down instead of Rust reading the database.
#[tauri::command]
pub fn mcp_write_app_info(
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
pub fn mcp_reconcile(app: tauri::AppHandle) -> Result<(), String> {
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
pub fn mcp_write_snapshot(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    mcp_host::write_snapshot(&app, &payload)
}

/// Deletes the snapshot, used when MCP is switched off (privacy, §7).
#[tauri::command]
pub fn mcp_clear_snapshot(app: tauri::AppHandle) {
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
pub async fn mcp_wait_job(
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
pub fn mcp_write_result(app: tauri::AppHandle, id: String, payload: String) -> Result<(), String> {
    mcp_host::write_result(&app, &id, &payload)
}

/// Keeps a pre-change copy of a note body before an agent rewrites it (#13a).
#[tauri::command]
pub fn mcp_backup_note(
    app: tauri::AppHandle,
    note_id: String,
    body: String,
    keep: usize,
) -> Result<(), String> {
    mcp_host::backup_note_body(&app, &note_id, &body, keep)
}

/// Places the watcher for `mcp/jobs/` and stores it as app state.
///
/// A missing watcher degrades to the wait deadline, not to a broken bridge.
pub fn init<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    // Lays down `mcp/`, clears stale jobs, and writes the first `app-info.json`.
    // Failure is not fatal: MCP just stays unavailable.
    mcp_host::prepare(app);
    let jobs_dir =
        mcp_host::jobs_dir(app).unwrap_or_else(|| std::path::PathBuf::from("mcp").join("jobs"));
    app.manage(McpWatchState {
        watch: mcp_watch::shared(mcp_watch::install(app, jobs_dir)),
    });
}
