//! Filesystem I/O and IPC for the vault folder (docs/design/vault-mirror.md).
//!
//! The pure path/atomicity rules live in `mod.rs`; this file only touches disk
//! and bridges to the webview. Every command takes the vault root as an argument
//! because a folder belongs to a workspace, and the frontend is the only side
//! that knows which workspace is active.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::ipc::Channel;
use tauri::{Manager, State};

use super::watch;
use super::{
    hash_bytes, is_skipped_rel, modified_millis, rel_key, safe_rel_path, write_atomic, VaultFile,
    VaultWrite, VaultWriteResult, MAX_VAULT_FILES, MAX_VAULT_FILE_BYTES,
};

/// Joins a validated relative path onto the vault root.
fn resolve(root: &str, rel: &str) -> Result<PathBuf, String> {
    Ok(Path::new(root).join(safe_rel_path(rel)?))
}

/// Writes rendered notes into the vault, skipping files already identical.
///
/// Skipping by hash means a re-export is cheap and, more importantly, does not
/// touch `mtime` — a file sync watching the folder sees no change, so our own
/// write cannot bounce back as a remote edit (#V7).
#[tauri::command]
pub fn vault_export_files(
    root: String,
    files: Vec<VaultWrite>,
) -> Result<Vec<VaultWriteResult>, String> {
    let mut results = Vec::with_capacity(files.len());
    for file in files {
        let target = resolve(&root, &file.rel_path)?;
        let bytes = file.content.as_bytes();
        let hash = hash_bytes(bytes);

        let already = fs::read(&target)
            .ok()
            .filter(|existing| hash_bytes(existing) == hash);
        let written = if already.is_some() {
            false
        } else {
            write_atomic(&target, bytes)
                .map_err(|error| format!("cannot write {}: {error}", target.display()))?;
            true
        };

        results.push(VaultWriteResult {
            rel_path: file.rel_path,
            content_hash: hash,
            bytes: bytes.len() as u64,
            written,
        });
    }
    Ok(results)
}

/// Copies an absolute source file (an attachment blob) into the vault.
///
/// The blob is content-addressed, so a second copy is skipped when a file with
/// the same bytes already sits at the destination.
#[tauri::command]
pub fn vault_copy_file(
    root: String,
    rel_path: String,
    source: String,
) -> Result<VaultWriteResult, String> {
    let bytes = fs::read(&source).map_err(|error| format!("cannot read {source}: {error}"))?;
    let hash = hash_bytes(&bytes);
    let target = resolve(&root, &rel_path)?;

    let already = fs::read(&target)
        .ok()
        .filter(|existing| hash_bytes(existing) == hash);
    let written = if already.is_some() {
        false
    } else {
        write_atomic(&target, &bytes)
            .map_err(|error| format!("cannot write {}: {error}", target.display()))?;
        true
    };

    Ok(VaultWriteResult {
        rel_path,
        content_hash: hash,
        bytes: bytes.len() as u64,
        written,
    })
}

/// Reads specific vault-relative files back, for import and reconciliation.
#[tauri::command]
pub fn vault_read_files(root: String, rel_paths: Vec<String>) -> Result<Vec<VaultFile>, String> {
    let mut out = Vec::new();
    for rel in rel_paths {
        let path = resolve(&root, &rel)?;
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        if !metadata.is_file() || metadata.len() > MAX_VAULT_FILE_BYTES {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        out.push(VaultFile {
            content_hash: hash_bytes(content.as_bytes()),
            rel_path: rel,
            content,
            mtime: modified_millis(&metadata),
        });
    }
    Ok(out)
}

/// Copies a blob from the vault's `attachments/` back into the app store.
///
/// The folder is user-owned, so the reference a note holds is only a hint: this
/// reads the actual bytes under the vault and hands them to the same
/// content-addressed store the app uses, deduplicating by hash. Only the
/// `attachments/` subtree is read, and the path is validated, so a crafted
/// `rel_path` cannot pull an arbitrary file into the store.
#[tauri::command]
pub fn vault_import_attachment(
    app: tauri::AppHandle,
    root: String,
    rel_path: String,
) -> Result<String, String> {
    let validated = safe_rel_path(&rel_path)?;
    let key = validated.to_string_lossy().replace('\\', "/");
    if !(key == "attachments" || key.starts_with("attachments/")) {
        return Err("only files under attachments/ can be imported".to_string());
    }
    let path = Path::new(&root).join(&validated);
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("attachment");
    let bytes =
        fs::read(&path).map_err(|error| format!("cannot read {}: {error}", path.display()))?;
    let stored = crate::attachments::commands::import_bytes(&app, name, bytes)?;
    Ok(stored.id)
}

/// Walks the vault and returns every markdown file.
///
/// This is the sweep that catches files created while the app was closed
/// (#V18): a watcher is only a hint, so the reconcile path reads the real state.
#[tauri::command]
pub fn vault_scan(root: String, recursive: bool) -> Result<Vec<VaultFile>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("vault folder is not readable: {root}"));
    }
    let mut out = Vec::new();
    walk(&root_path, &root_path, recursive, &mut out);
    out.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(out)
}

fn walk(root: &Path, dir: &Path, recursive: bool, out: &mut Vec<VaultFile>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_VAULT_FILES {
            return;
        }
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        // Symlinks are not followed: a vault must not escape itself.
        if file_type.is_symlink() {
            continue;
        }
        let rel = rel_key(root, &path);
        if is_skipped_rel(&rel) {
            continue;
        }
        if file_type.is_dir() {
            if recursive {
                walk(root, &path, recursive, out);
            }
            continue;
        }
        let is_markdown = path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("md"))
            .unwrap_or(false);
        if !is_markdown {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.len() > MAX_VAULT_FILE_BYTES {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        out.push(VaultFile {
            content_hash: hash_bytes(content.as_bytes()),
            rel_path: rel,
            content,
            mtime: modified_millis(&metadata),
        });
    }
}

/// Validates a chosen folder and returns its canonical path.
///
/// Rejects a missing folder, a filesystem root, and the app-data directory. The
/// caller passes the other workspaces' vault roots so overlapping folders are
/// refused here, where paths can be canonicalised consistently (#V20).
#[tauri::command]
pub fn vault_validate_root(
    app: tauri::AppHandle,
    path: String,
    others: Vec<String>,
) -> Result<String, String> {
    let canonical =
        fs::canonicalize(&path).map_err(|error| format!("cannot open {path}: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!("{path} is not a folder"));
    }
    if canonical.parent().is_none() {
        return Err("a drive root cannot be a vault".to_string());
    }
    if let Ok(app_data) = app.path().app_data_dir() {
        if let Ok(app_data) = fs::canonicalize(&app_data) {
            if canonical.starts_with(&app_data) {
                return Err("the app's own data folder cannot be a vault".to_string());
            }
        }
    }
    for other in others {
        if let Ok(other) = fs::canonicalize(&other) {
            if canonical.starts_with(&other) || other.starts_with(&canonical) {
                return Err("this folder overlaps another workspace's vault".to_string());
            }
        }
    }
    Ok(canonical.to_string_lossy().to_string())
}

/// App state holding the vault folder watcher.
///
/// One watcher serves the active workspace; switching folders reinstalls it. It
/// lives outside the command so a parked wait on a worker thread can reach it.
pub struct VaultWatchState(pub Mutex<Option<std::sync::Arc<watch::VaultWatch>>>);

impl Default for VaultWatchState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

/// Installs (or reuses) a recursive watcher on a vault folder.
#[tauri::command]
pub fn vault_watch_start(state: State<'_, VaultWatchState>, root: String) -> Result<bool, String> {
    let path = PathBuf::from(&root);
    if !path.is_dir() {
        return Err(format!("vault folder is not readable: {root}"));
    }
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    if let Some(existing) = guard.as_ref() {
        if existing.watches(&path) {
            return Ok(true);
        }
    }
    *guard = Some(watch::shared(watch::install(path)));
    Ok(true)
}

/// Parks a wait for the next change under the watched folder.
///
/// The answer goes out over a `Channel` because a multi-second `invoke` reply
/// would block the main thread. The wait is always bounded, so a watcher that
/// never fires costs latency, not a hang.
#[tauri::command]
pub async fn vault_wait_change(
    state: State<'_, VaultWatchState>,
    channel: Channel<bool>,
    wait_ms: Option<u64>,
) -> Result<(), String> {
    let watch = {
        let guard = state.0.lock().map_err(|error| error.to_string())?;
        guard.as_ref().cloned()
    };
    let Some(watch) = watch else {
        // No watcher installed: answer immediately so the frontend loop retries.
        let _ = channel.send(false);
        return Ok(());
    };
    let budget = watch::wait_budget(wait_ms);
    let parked = watch::parked(watch, budget, move || {
        let _ = channel.send(true);
    });
    parked.spawn();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_then_read_round_trips_and_skips_unchanged() {
        let dir = std::env::temp_dir().join(format!("stylenotes-vault-cmd-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("mkdir");

        let root = dir.to_string_lossy().to_string();
        let files = vec![
            VaultWrite {
                rel_path: "Ideas/Graph RAG.md".into(),
                content: "---\nid: a\n---\nbody".into(),
            },
            VaultWrite {
                rel_path: "Root.md".into(),
                content: "root".into(),
            },
        ];
        let first = vault_export_files(root.clone(), files.clone()).expect("export");
        assert!(first.iter().all(|result| result.written));

        // A second identical export writes nothing.
        let second = vault_export_files(root.clone(), files).expect("re-export");
        assert!(second.iter().all(|result| !result.written));

        let read = vault_read_files(root.clone(), vec!["Ideas/Graph RAG.md".into()]).expect("read");
        assert_eq!(read.len(), 1);
        assert!(read[0].content.contains("body"));

        let scanned = vault_scan(root, true).expect("scan");
        assert_eq!(scanned.len(), 2);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn export_refuses_to_escape_the_root() {
        let root = std::env::temp_dir().join("stylenotes-vault-escape");
        let result = vault_export_files(
            root.to_string_lossy().to_string(),
            vec![VaultWrite {
                rel_path: "../evil.md".into(),
                content: "no".into(),
            }],
        );
        assert!(result.is_err());
    }

    #[test]
    fn scan_skips_tooling_directories() {
        let dir =
            std::env::temp_dir().join(format!("stylenotes-vault-skip-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join(".obsidian")).expect("mkdir");
        fs::write(dir.join("Note.md"), "note").expect("write");
        fs::write(dir.join(".obsidian").join("config.md"), "hidden").expect("write");

        let scanned = vault_scan(dir.to_string_lossy().to_string(), true).expect("scan");
        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].rel_path, "Note.md");

        let _ = fs::remove_dir_all(&dir);
    }
}
