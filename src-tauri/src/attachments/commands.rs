//! Filesystem I/O and IPC for the local artifact store.
//!
//! The pure layout/hash rules live in `mod.rs`; this file only touches disk and
//! bridges to the webview. Every blob is copied into the store once and read
//! back by hash, so a note never depends on the original file staying put.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use super::{
    ext_from_name, hex, object_rel_path, parse_reference, StoredAttachment, ATTACHMENTS_DIR,
    MAX_ATTACHMENT_BYTES,
};

/// A reference resolved back to a concrete file on this device.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedAttachment {
    /// `stylenotes-attachment://<hash>[.<ext>]` as stored in the markdown.
    pub reference: String,
    /// Absolute path of the blob, or `null` when it is not present locally yet.
    pub path: Option<String>,
    pub exists: bool,
}

fn attachments_root<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(ATTACHMENTS_DIR))
        .map_err(|error| error.to_string())
}

/// Writes `bytes` under their content hash, deduplicating against an existing
/// blob. Shared by file import and clipboard paste so both agree on layout.
fn store_bytes(root: &Path, name: &str, bytes: &[u8]) -> Result<StoredAttachment, String> {
    if bytes.len() as u64 > MAX_ATTACHMENT_BYTES {
        return Err(format!(
            "{name} is larger than the {MAX_ATTACHMENT_BYTES} byte limit"
        ));
    }
    let ext = ext_from_name(name);
    let hash = hex(&Sha256::digest(bytes));
    let rel = object_rel_path(&hash, &ext);
    let target = root.join(&rel);
    if !target.exists() {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        // Write to a sibling temp file then rename, so a crash mid-copy cannot
        // leave a truncated blob under a hash that claims to be complete.
        let tmp = target.with_extension("part");
        fs::write(&tmp, bytes).map_err(|error| error.to_string())?;
        fs::rename(&tmp, &target).map_err(|error| error.to_string())?;
    }
    Ok(StoredAttachment {
        id: hash,
        ext,
        name: name.to_string(),
        path: target.to_string_lossy().to_string(),
        origin_path: String::new(),
        size: bytes.len() as u64,
    })
}

/// Stores one file from disk, reading it into memory so its hash can be taken.
fn import_one(root: &Path, source: &Path) -> Result<StoredAttachment, String> {
    let metadata = fs::metadata(source)
        .map_err(|error| format!("cannot read {}: {error}", source.display()))?;
    if !metadata.is_file() {
        return Err(format!("{} is not a file", source.display()));
    }
    if metadata.len() > MAX_ATTACHMENT_BYTES {
        return Err(format!(
            "{} is larger than the {} byte limit",
            source.display(),
            MAX_ATTACHMENT_BYTES
        ));
    }
    let name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("attachment");
    let bytes =
        fs::read(source).map_err(|error| format!("cannot read {}: {error}", source.display()))?;
    let mut record = store_bytes(root, name, &bytes)?;
    record.origin_path = source.to_string_lossy().to_string();
    Ok(record)
}

/// Copies each dropped/picked file into the store and returns its record.
///
/// A file that cannot be stored is skipped rather than failing the whole drop,
/// so one unreadable item does not cost the user the rest of the batch.
#[tauri::command]
pub fn attachment_import(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<StoredAttachment>, String> {
    let root = attachments_root(&app)?;
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let mut stored = Vec::with_capacity(paths.len());
    for path in paths {
        match import_one(&root, Path::new(&path)) {
            Ok(record) => stored.push(record),
            Err(error) => eprintln!("attachment skipped: {error}"),
        }
    }
    Ok(stored)
}

/// Stores raw bytes (a pasted clipboard image, which has no path on disk).
#[tauri::command]
pub fn attachment_import_bytes(
    app: AppHandle,
    name: String,
    bytes: Vec<u8>,
) -> Result<StoredAttachment, String> {
    let root = attachments_root(&app)?;
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let label = if name.trim().is_empty() {
        "pasted-file"
    } else {
        name.trim()
    };
    store_bytes(&root, label, &bytes)
}

/// Resolves store references to absolute paths on this device.
///
/// A reference whose blob is absent (e.g. a note synced from another device)
/// resolves to `exists: false` and a `null` path, so the UI can show a clear
/// placeholder instead of a broken image.
#[tauri::command]
pub fn attachment_resolve(
    app: AppHandle,
    references: Vec<String>,
) -> Result<Vec<ResolvedAttachment>, String> {
    let root = attachments_root(&app)?;
    let resolved = references
        .into_iter()
        .map(|reference| {
            let path = parse_reference(&reference)
                .map(|(hash, ext)| root.join(object_rel_path(&hash, &ext)));
            let exists = path.as_ref().map(|path| path.exists()).unwrap_or(false);
            ResolvedAttachment {
                reference,
                path: exists.then(|| {
                    path.as_ref()
                        .map(|path| path.to_string_lossy().to_string())
                        .unwrap_or_default()
                }),
                exists,
            }
        })
        .collect();
    Ok(resolved)
}

/// Absolute path of the blob behind a reference, or `None` when it is not
/// stored locally. Used by the frontend to hand the file to the OS.
#[tauri::command]
pub fn attachment_path(app: AppHandle, reference: String) -> Result<Option<String>, String> {
    let root = attachments_root(&app)?;
    let Some((hash, ext)) = parse_reference(&reference) else {
        return Ok(None);
    };
    let path = root.join(object_rel_path(&hash, &ext));
    Ok(path.exists().then(|| path.to_string_lossy().to_string()))
}

/// Absolute path of the attachments directory.
///
/// The frontend builds blob paths from a reference and this root, so rendering
/// does not need one IPC round-trip per image. The store owns the layout; this
/// only exposes the root, never a way to read outside it.
#[tauri::command]
pub fn attachment_root(app: AppHandle) -> Result<String, String> {
    let root = attachments_root(&app)?;
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root.to_string_lossy().to_string())
}

/// Opens a stored blob (or a legacy absolute path) with the OS default app.
///
/// Routed through Rust so the frontend needs no filesystem-opener permission and
/// the store stays the only thing that knows the on-disk layout.
#[tauri::command]
pub fn attachment_open(app: AppHandle, target: String) -> Result<(), String> {
    let path = match parse_reference(&target) {
        Some((hash, ext)) => attachments_root(&app)?.join(object_rel_path(&hash, &ext)),
        None => PathBuf::from(&target),
    };
    if !path.exists() {
        return Err("this file is not available on this device yet".to_string());
    }
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<String>)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("stylenotes-attach-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch");
        dir
    }

    #[test]
    fn store_bytes_dedupes_by_content_and_keeps_labels_apart() {
        let root = scratch("dedupe");
        let first = store_bytes(&root, "a.txt", b"same bytes").expect("first");
        let second = store_bytes(&root, "b.txt", b"same bytes").expect("second");
        assert_eq!(first.id, second.id);
        assert_eq!(first.path, second.path);
        assert_eq!(first.name, "a.txt");
        assert_eq!(second.name, "b.txt"); // label differs, blob does not

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn import_one_rejects_directories() {
        let root = scratch("dir");
        let dir = root.join("sub");
        fs::create_dir_all(&dir).expect("sub");
        assert!(import_one(&root, &dir).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn import_one_records_the_origin_path() {
        let root = scratch("origin");
        let file = root.join("note.pdf");
        fs::write(&file, b"%PDF-1.4").expect("write");
        let record = import_one(&root, &file).expect("import");
        assert_eq!(record.origin_path, file.to_string_lossy());
        assert_eq!(record.name, "note.pdf");
        assert_eq!(record.ext, "pdf");
        let _ = fs::remove_dir_all(&root);
    }
}
