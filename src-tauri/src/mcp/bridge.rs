//! File bridge between the shim and the running app (#D2, #D5).
//!
//! The shim is stateless: it reads `app-info.json` to learn whether the app is
//! running, reads `snapshot.json` for data, and forwards writes as job files it
//! then polls results for. It never touches SQLite and never keeps fallback
//! state on disk — refusing clearly beats writing without validation.

use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::protocol;

/// How often the shim re-checks for its result while the app works.
///
/// This side stays a file poll on purpose: the shim is a short-lived, stateless
/// process per client, so it has nothing to be notified by. It is bounded by the
/// job deadline, and the host answers from memory, so the wait is short.
const RESULT_POLL_INTERVAL: Duration = Duration::from_millis(25);

/// `mcp/app-info.json`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AppInfo {
    #[serde(default)]
    pub protocol: u32,
    #[serde(default, rename = "appRunning")]
    pub app_running: bool,
    #[serde(default, rename = "appPid")]
    pub app_pid: Option<u32>,
    #[serde(default, rename = "appVersion")]
    pub app_version: String,
    #[serde(default, rename = "dbPath")]
    pub db_path: Option<String>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, rename = "snapshotRev")]
    pub snapshot_rev: u64,
    #[serde(default, rename = "generatedAt")]
    pub generated_at: Option<String>,
    /// Active write grant, so the shim can refuse before writing a job (#D6).
    #[serde(default)]
    pub grant: Option<Grant>,
}

/// Grant chosen by the user, attached to every job (#D8).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Grant {
    #[serde(default = "default_access")]
    pub access: String,
    #[serde(default)]
    pub scopes: Vec<String>,
}

fn default_access() -> String {
    "read".into()
}

impl Grant {
    pub fn allow_write(&self, scope: &str) -> bool {
        self.access == "write" && self.scopes.iter().any(|item| item == scope)
    }
}

/// Job file the shim writes and the host executes.
#[derive(Debug, Serialize)]
pub struct Job<'a> {
    pub id: &'a str,
    pub tool: &'a str,
    pub args: &'a Value,
    pub grant: &'a Grant,
    pub instance: &'a str,
    pub workspace: &'a str,
    pub deadline: u64,
}

/// Result file the host writes back.
#[derive(Debug, Deserialize)]
pub struct ResultPayload {
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub data: Option<Value>,
}

/// Everything needed to submit one job, so the signature stays readable.
pub struct Submission<'a> {
    pub id: &'a str,
    pub tool: &'a str,
    pub args: &'a Value,
    pub grant: &'a Grant,
    pub instance: &'a str,
    pub workspace: &'a str,
    pub timeout_ms: u64,
}

/// Absolute paths of the bridge, discovered relative to the running shim.
#[derive(Debug, Clone)]
pub struct Bridge {
    pub root: PathBuf,
}

impl Bridge {
    /// Locates the bridge directory.
    ///
    /// The app writes its bridge under the app data directory
    /// (`%APPDATA%/<identifier>/mcp`, `~/Library/Application Support/<id>/mcp`,
    /// or `$XDG_DATA_HOME/<id>/mcp`) — the same place `tauri-plugin-sql` keeps
    /// the database — **not** beside the shim binary. The shim ships next to the
    /// app executable, so "beside me" is a different folder; we resolve the app
    /// data directory first and only fall back to the sibling `mcp/` folder for
    /// layouts that place the two together.
    pub fn discover() -> Option<Bridge> {
        if let Some(root) = app_data_mcp_dir() {
            return Some(Bridge { root });
        }
        let exe = std::env::current_exe().ok()?;
        let dir = exe.parent()?;
        Some(Bridge {
            root: dir.join("mcp"),
        })
    }

    pub fn app_info_path(&self) -> PathBuf {
        self.root.join("app-info.json")
    }

    /// Points the bridge at a known root (the app's `mcp/` directory).
    ///
    /// The remote HTTP listener runs inside the app and already knows that
    /// directory from its `AppHandle`, so it does not guess like the shim does.
    #[allow(dead_code)] // used by the app, not the shim binary sharing this file
    pub fn at(root: PathBuf) -> Bridge {
        Bridge { root }
    }
    pub fn snapshot_path(&self) -> PathBuf {
        self.root.join("snapshot.json")
    }

    pub fn jobs_dir(&self) -> PathBuf {
        self.root.join("jobs")
    }

    pub fn results_dir(&self) -> PathBuf {
        self.root.join("results")
    }

    /// Reads `app-info.json`; `None` when it is missing or unreadable.
    pub fn read_app_info(&self) -> Option<AppInfo> {
        let raw = fs::read_to_string(self.app_info_path()).ok()?;
        serde_json::from_str(&raw).ok()
    }

    /// Reads `snapshot.json`; `None` when missing, unreadable, or corrupt.
    pub fn read_snapshot(&self) -> Option<Value> {
        let raw = fs::read_to_string(self.snapshot_path()).ok()?;
        serde_json::from_str(&raw).ok()
    }

    /// Writes a job atomically (temp + rename) and returns its result.
    ///
    /// The caller has already checked the grant; the host re-checks it before
    /// acting, so a grant that changed mid-flight still wins.
    pub fn submit(&self, submission: Submission<'_>) -> Result<Value, (String, String)> {
        let Submission {
            id,
            tool,
            args,
            grant,
            instance,
            workspace,
            timeout_ms,
        } = submission;
        fs::create_dir_all(self.jobs_dir()).map_err(bridge_error)?;
        fs::create_dir_all(self.results_dir()).map_err(bridge_error)?;
        let deadline = now_millis() + timeout_ms;
        let job = Job {
            id,
            tool,
            args,
            grant,
            instance,
            workspace,
            deadline,
        };
        let bytes = serde_json::to_vec(&job).map_err(|error| bridge_error(error.to_string()))?;
        let target = self.jobs_dir().join(format!("{id}.json"));
        let tmp = self.jobs_dir().join(format!("{id}.json.tmp"));
        fs::write(&tmp, bytes).map_err(bridge_error)?;
        fs::rename(&tmp, &target).map_err(bridge_error)?;

        let result_path = self.results_dir().join(format!("{id}.json"));
        let started = Instant::now();
        loop {
            if started.elapsed() > Duration::from_millis(timeout_ms) {
                let _ = fs::remove_file(&target);
                return Err(("timeout".into(), "the app did not answer in time".into()));
            }
            if let Ok(raw) = fs::read_to_string(&result_path) {
                let payload: ResultPayload = serde_json::from_str(&raw)
                    .map_err(|error| ("write_failed".into(), error.to_string()))?;
                let _ = fs::remove_file(&result_path);
                let _ = fs::remove_file(&target);
                if payload.ok {
                    return Ok(payload.data.unwrap_or(Value::Null));
                }
                return Err((
                    payload.error.unwrap_or_else(|| "write_failed".into()),
                    payload.message.unwrap_or_default(),
                ));
            }
            std::thread::sleep(RESULT_POLL_INTERVAL);
        }
    }
}

fn bridge_error(message: impl std::fmt::Display) -> (String, String) {
    ("write_failed".into(), message.to_string())
}

/// Tauri identifier from `tauri.conf.json`, the app data folder name.
pub const APP_IDENTIFIER: &str = "com.arifpebryan.stylenotes";

/// The bridge directory under the platform's app data root.
///
/// Mirrors Tauri's `app_data_dir()` resolution: `%APPDATA%/<id>` on Windows,
/// `~/Library/Application Support/<id>` on macOS, and `$XDG_DATA_HOME/<id>`
/// (or `~/.local/share/<id>`) on Linux.
pub fn app_data_mcp_dir() -> Option<PathBuf> {
    Some(app_data_root()?.join(APP_IDENTIFIER).join("mcp"))
}

fn app_data_root() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA").map(PathBuf::from)
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
        })
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME")
                    .map(|home| PathBuf::from(home).join(".local").join("share"))
            })
    }
}

fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

/// Builds the standard "app is not running" tool error (#D5).
pub fn app_not_running() -> Value {
    protocol::tool_error(
        "app_not_running",
        "StyleNotes is not running. Open it, then try again.",
    )
}

/// Builds the standard "MCP disabled" tool error (#D6).
pub fn disabled() -> Value {
    protocol::tool_error(
        "mcp_disabled",
        "The local MCP server is off. Turn it on in Settings → MCP.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn grant_requires_write_and_scope() {
        let read = Grant {
            access: "read".into(),
            scopes: vec!["notes".into()],
        };
        assert!(!read.allow_write("notes"));
        let write = Grant {
            access: "write".into(),
            scopes: vec!["notes".into()],
        };
        assert!(write.allow_write("notes"));
        assert!(!write.allow_write("tasks"));
    }

    #[test]
    fn job_serialises_camel_case_fields() {
        let grant = Grant {
            access: "write".into(),
            scopes: vec!["tasks".into()],
        };
        let args = json!({ "id": "t-1" });
        let job = Job {
            id: "abc",
            tool: "complete_task",
            args: &args,
            grant: &grant,
            instance: "claude-1",
            workspace: "workspace-default",
            deadline: 42,
        };
        let value = serde_json::to_value(&job).expect("serialisable");
        assert_eq!(value["tool"], "complete_task");
        assert_eq!(value["workspace"], "workspace-default");
        assert_eq!(value["grant"]["access"], "write");
    }

    #[test]
    fn app_info_defaults_are_read_only_and_disabled() {
        let info: AppInfo = serde_json::from_str("{}").expect("defaults apply");
        assert!(!info.enabled);
        assert!(!info.app_running);
    }

    #[test]
    fn app_data_dir_ends_with_identifier_and_mcp() {
        let dir = app_data_mcp_dir().expect("a home directory exists in tests");
        assert!(dir.ends_with(PathBuf::from(APP_IDENTIFIER).join("mcp")));
    }
}
