//! Supervisor for the local MCP server (docs/design/mcp-local-free.md).
//!
//! The Rust side owns three things and nothing else:
//!
//! 1. the absolute database path (`db_path`), so the shim and `app-info.json`
//!    never guess where `stylenotes.db` lives (#D14);
//! 2. `mcp/app-info.json`, written at startup and refreshed on demand;
//! 3. the paths the frontend host needs (`mcp/snapshot.json`, `mcp/jobs`,
//!    `mcp/results`, `mcp/backups`) plus the installed shim binary.
//!
//! The snapshot and the job queue are driven by the always-alive `workspace`
//! window (`mcp-host.svelte.ts`); the shim is spawned by the MCP client itself,
//! so no long-lived child process lives here.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

/// Protocol version; must match `MCP_PROTOCOL` in `src/lib/content/mcp-types.ts`.
pub const MCP_PROTOCOL: u32 = 1;

const DB_FILE: &str = "stylenotes.db";
const MCP_DIR: &str = "mcp";

/// Directories and files the bridge owns inside the app data directory.
#[derive(Debug, Clone, Serialize)]
pub struct McpPaths {
    pub dir: String,
    pub app_info: String,
    pub snapshot: String,
    pub jobs: String,
    pub results: String,
    pub backups: String,
    pub db_path: String,
}

/// Shape of `mcp/app-info.json`, mirrored in TS by `McpAppInfo`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub protocol: u32,
    #[serde(rename = "appRunning")]
    pub app_running: bool,
    #[serde(rename = "appPid")]
    pub app_pid: Option<u32>,
    #[serde(rename = "appVersion")]
    pub app_version: String,
    #[serde(rename = "dbPath")]
    pub db_path: Option<String>,
    pub enabled: bool,
    #[serde(rename = "snapshotRev")]
    pub snapshot_rev: u64,
    #[serde(rename = "generatedAt")]
    pub generated_at: Option<String>,
    /// Active grant, mirrored so the shim can refuse writes without a round trip.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grant: Option<GrantInfo>,
}

/// Grant published to the shim; kept deliberately small (#D7).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrantInfo {
    pub access: String,
    pub scopes: Vec<String>,
}

/// Absolute path of the SQLite database.
///
/// The plugin resolves the relative `sqlite:stylenotes.db` URL against the app
/// data directory, so the absolute file is `<app_data_dir>/stylenotes.db`.
pub fn database_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(DB_FILE))
}

fn mcp_root<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(MCP_DIR))
}

/// Creates the bridge directories and returns their absolute paths.
pub fn ensure_dirs<R: Runtime>(app: &AppHandle<R>) -> Option<McpPaths> {
    let root = mcp_root(app)?;
    let jobs = root.join("jobs");
    let results = root.join("results");
    let backups = root.join("backups").join("notes");
    for dir in [&root, &jobs, &results, &backups] {
        fs::create_dir_all(dir).ok()?;
    }
    Some(McpPaths {
        dir: path_string(&root),
        app_info: path_string(&root.join("app-info.json")),
        snapshot: path_string(&root.join("snapshot.json")),
        jobs: path_string(&jobs),
        results: path_string(&results),
        backups: path_string(&backups),
        db_path: database_path(app)
            .map(|path| path_string(&path))
            .unwrap_or_default(),
    })
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

/// Resolves and caches the installed `stylenotes-mcp` binary.
///
/// In development the binary lives beside the app binary (`target/debug`). In a
/// bundle Tauri places `externalBin` next to the main executable, so the same
/// lookup works for both.
pub fn shim_binary() -> Option<String> {
    let name = if cfg!(windows) {
        "stylenotes-mcp.exe"
    } else {
        "stylenotes-mcp"
    };
    let current = std::env::current_exe().ok()?;
    let dir = current.parent()?;
    let candidate = dir.join(name);
    if candidate.exists() {
        return Some(path_string(&candidate));
    }
    None
}

/// Writes `mcp/app-info.json` atomically, so a shim reading it never sees a
/// half-written file.
pub fn write_app_info<R: Runtime>(app: &AppHandle<R>, info: &AppInfo) -> Result<(), String> {
    let root = mcp_root(app).ok_or("app data directory unavailable")?;
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let target = root.join("app-info.json");
    let payload = serde_json::to_string_pretty(info).map_err(|error| error.to_string())?;
    write_atomic(&target, payload.as_bytes())
}

/// Reads the current `mcp/app-info.json`, when it exists and parses.
pub fn read_app_info<R: Runtime>(app: &AppHandle<R>) -> Option<AppInfo> {
    let root = mcp_root(app)?;
    let raw = fs::read_to_string(root.join("app-info.json")).ok()?;
    serde_json::from_str(&raw).ok()
}

/// temp file + rename, used for every JSON document the bridge writes.
fn write_atomic(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut tmp = target.to_path_buf();
    let tmp_name = match target.file_name().and_then(|name| name.to_str()) {
        Some(name) => format!("{name}.tmp"),
        None => return Err("invalid target path".into()),
    };
    tmp.set_file_name(tmp_name);
    fs::write(&tmp, bytes).map_err(|error| error.to_string())?;
    fs::rename(&tmp, target).map_err(|error| error.to_string())?;
    Ok(())
}

/// `app-info.json` written at startup: the shim reads this before the frontend
/// host has anything to say. `enabled` defaults to the persisted switch, which
/// the frontend keeps up to date afterwards.
pub fn initial_app_info<R: Runtime>(app: &AppHandle<R>) -> AppInfo {
    AppInfo {
        protocol: MCP_PROTOCOL,
        app_running: true,
        app_pid: std::process::id().into(),
        app_version: app.package_info().version.to_string(),
        db_path: database_path(app).map(|path| path_string(&path)),
        enabled: false,
        snapshot_rev: 0,
        generated_at: None,
        grant: None,
    }
}

/// Called at startup: lays down the directories, a first `app-info.json`, and
/// removes `jobs/`/`results/` leftovers from a previous run (#D4).
pub fn prepare<R: Runtime>(app: &AppHandle<R>) {
    let Some(paths) = ensure_dirs(app) else {
        return;
    };
    for dir in [&paths.jobs, &paths.results] {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    let _ = write_app_info(app, &initial_app_info(app));
}

/// Called on exit: flips `appRunning` so a running shim reports stale reads and
/// refuses writes instead of trusting a live-looking file.
pub fn mark_stopped<R: Runtime>(app: &AppHandle<R>) {
    let Some(root) = mcp_root(app) else {
        return;
    };
    let target = root.join("app-info.json");
    let Ok(raw) = fs::read_to_string(&target) else {
        return;
    };
    let Ok(mut info) = serde_json::from_str::<AppInfo>(&raw) else {
        return;
    };
    info.app_running = false;
    // `generatedAt` is an ISO timestamp owned by the frontend host; Rust leaves
    // it as-is rather than inventing a format the shim would misread.
    let _ = write_app_info(app, &info);
}

/// Writes `mcp/snapshot.json` atomically. The frontend builds the document.
pub fn write_snapshot<R: Runtime>(app: &AppHandle<R>, payload: &str) -> Result<(), String> {
    let root = mcp_root(app).ok_or("app data directory unavailable")?;
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    write_atomic(&root.join("snapshot.json"), payload.as_bytes())
}

/// Removes `snapshot.json` (privacy: it carries note bodies — see §7).
pub fn clear_snapshot<R: Runtime>(app: &AppHandle<R>) {
    if let Some(root) = mcp_root(app) {
        let _ = fs::remove_file(root.join("snapshot.json"));
    }
}

/// Returns the oldest pending job file as raw JSON, or `None`.
///
/// V1 keeps one job in flight: the frontend calls this, executes, and writes a
/// result before polling again.
pub fn poll_job<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let dir = mcp_root(app)?.join("jobs");
    let mut files: Vec<PathBuf> = fs::read_dir(&dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().map(|ext| ext == "json").unwrap_or(false))
        .collect();
    files.sort();
    files
        .into_iter()
        .next()
        .and_then(|path| fs::read_to_string(path).ok())
}

/// Writes `mcp/results/<id>.json` and drops the matching job file.
pub fn write_result<R: Runtime>(app: &AppHandle<R>, id: &str, payload: &str) -> Result<(), String> {
    let root = mcp_root(app).ok_or("app data directory unavailable")?;
    let results = root.join("results");
    fs::create_dir_all(&results).map_err(|error| error.to_string())?;
    write_atomic(&results.join(format!("{id}.json")), payload.as_bytes())?;
    let _ = fs::remove_file(root.join("jobs").join(format!("{id}.json")));
    Ok(())
}

/// Copies a note body into `mcp/backups/notes/`, keeping the newest `keep` (#13a).
pub fn backup_note_body<R: Runtime>(
    app: &AppHandle<R>,
    note_id: &str,
    body: &str,
    keep: usize,
) -> Result<(), String> {
    let root = mcp_root(app).ok_or("app data directory unavailable")?;
    let dir = root.join("backups").join("notes");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let safe_id: String = note_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    write_atomic(&dir.join(format!("{safe_id}-{stamp}.md")), body.as_bytes())?;
    prune_backups(&dir, &safe_id, keep.max(1));
    Ok(())
}

/// Keeps only the newest `keep` backups for `safe_id`.
fn prune_backups(dir: &Path, safe_id: &str, keep: usize) {
    let prefix = format!("{safe_id}-");
    let mut files: Vec<PathBuf> = match fs::read_dir(dir) {
        Ok(entries) => entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.starts_with(&prefix) && name.ends_with(".md"))
                    .unwrap_or(false)
            })
            .collect(),
        Err(_) => return,
    };
    if files.len() <= keep {
        return;
    }
    // Names embed the timestamp, so lexical order is chronological.
    files.sort();
    let remove_count = files.len() - keep;
    for path in files.into_iter().take(remove_count) {
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_round_trips_camel_case() {
        let raw = r#"{"protocol":1,"appRunning":true,"appPid":42,"appVersion":"0.1.0",
            "dbPath":"/tmp/db","enabled":false,"snapshotRev":7,"generatedAt":null}"#;
        let parsed: AppInfo = serde_json::from_str(raw).expect("valid app info");
        assert_eq!(parsed.protocol, 1);
        assert!(parsed.app_running);
        assert_eq!(parsed.app_pid, Some(42));
        assert_eq!(parsed.snapshot_rev, 7);
    }

    #[test]
    fn prune_backups_keeps_newest() {
        let dir = std::env::temp_dir().join(format!("stylenotes-mcp-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch dir");
        for stamp in 1..=5 {
            fs::write(dir.join(format!("note-{stamp}.md")), "x").expect("write backup");
        }
        prune_backups(&dir, "note", 2);
        let mut remaining: Vec<String> = fs::read_dir(&dir)
            .expect("read dir")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        remaining.sort();
        assert_eq!(remaining, vec!["note-4.md", "note-5.md"]);
        let _ = fs::remove_dir_all(&dir);
    }
}
