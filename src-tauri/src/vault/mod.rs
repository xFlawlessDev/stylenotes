//! Vault folder: projecting the app's notes to a user-owned folder of markdown
//! (docs/design/vault-mirror.md).
//!
//! Design in one sentence: **SQLite stays the source of truth; the folder is a
//! mirror.** This module holds the pure, unit-testable parts (path safety, safe
//! file names, atomic-write rules). Filesystem I/O and the `#[tauri::command]`s
//! live in `commands.rs`.
//!
//! Two hard rules shape the code here:
//!
//! 1. **A vault path may never escape its root.** Every write goes through
//!    [`safe_rel_path`], which rejects absolute paths, `..`, and drive prefixes,
//!    so a malformed `rel_path` cannot smuggle a write outside the folder.
//! 2. **A write must survive a crash.** [`write_atomic`] writes a sibling
//!    `*.part`, flushes it, then renames over the target. On Windows a rename
//!    cannot replace an existing file, so the target is removed first — a small,
//!    understood window the `content_hash` bookkeeping compensates for (#V22).

use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

pub mod commands;

/// Folders that belong to tooling, never to the user's notes.
pub const SKIP_DIRS: [&str; 4] = [".git", ".obsidian", "node_modules", ".trash"];

/// The largest file the reader will treat as a note, matching `import.rs`.
pub const MAX_VAULT_FILE_BYTES: u64 = 5 * 1024 * 1024;

/// Upper bound on a walk, so a runaway tree cannot exhaust memory.
pub const MAX_VAULT_FILES: usize = 5_000;

/// A file to write into the vault, rendered by the frontend.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultWrite {
    /// Path relative to the vault root, with `/` separators.
    pub rel_path: String,
    /// The exact bytes to write (frontmatter + body).
    pub content: String,
}

/// What one write did, so the index can record the new hash.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultWriteResult {
    pub rel_path: String,
    /// SHA-256 of the bytes we wrote (or of the existing bytes when unchanged).
    pub content_hash: String,
    pub bytes: u64,
    /// False when the file already held exactly this content.
    pub written: bool,
}

/// One markdown file read back from a vault.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
    pub rel_path: String,
    pub content: String,
    /// SHA-256 of the file bytes, so the frontend compares without re-hashing.
    pub content_hash: String,
    /// Last-modified time in epoch milliseconds, or 0 when unavailable.
    pub mtime: u64,
}

/// True when any path component is a tooling directory we must not walk.
pub fn is_skipped_rel(rel: &str) -> bool {
    rel.split('/').any(|part| SKIP_DIRS.contains(&part))
}

/// Validates a vault-relative path and returns it as a `PathBuf`.
///
/// Rejects anything that is not a run of ordinary components: absolute paths,
/// `..`, `.`, root/prefix components, and empty paths. This is the single gate
/// standing between a note title and the user's filesystem.
pub fn safe_rel_path(rel: &str) -> Result<PathBuf, String> {
    let trimmed = rel.trim();
    if trimmed.is_empty() {
        return Err("empty vault path".to_string());
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(format!("vault path must be relative: {rel}"));
    }
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => out.push(part),
            _ => return Err(format!("unsafe vault path component in {rel}")),
        }
    }
    if out.as_os_str().is_empty() {
        return Err(format!("empty vault path: {rel}"));
    }
    Ok(out)
}

/// Serialises a vault path with `/` separators on every platform.
pub fn rel_key(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Lowercase hex encoding. Duplicated from `attachments` so this module does not
/// reach into another feature's internals.
pub fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

/// SHA-256 of a byte slice, as lowercase hex.
pub fn hash_bytes(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex(&Sha256::digest(bytes))
}

/// Writes `bytes` to `target` so a crash cannot leave a half-written file.
///
/// Writes a sibling `*.part`, flushes it to disk, then renames it over the
/// target. On Windows a rename cannot replace an existing file, so the target is
/// removed first — the acknowledged small non-atomic window (#V22).
pub fn write_atomic(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut part_name = target
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_default();
    part_name.push(".part");
    let part = target.with_file_name(part_name);

    {
        let mut file = fs::File::create(&part)?;
        file.write_all(bytes)?;
        // Without the flush a sync client reading right after the rename could
        // see an empty file.
        file.sync_all()?;
    }

    #[cfg(windows)]
    if target.exists() {
        let _ = fs::remove_file(target);
    }

    match fs::rename(&part, target) {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = fs::remove_file(&part);
            Err(error)
        }
    }
}

/// Filesystem metadata helpers kept testable by taking plain paths.
pub fn modified_millis(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_rel_path_rejects_traversal_and_absolute() {
        assert!(safe_rel_path("../secret.md").is_err());
        assert!(safe_rel_path("a/../../b.md").is_err());
        assert!(safe_rel_path("/etc/passwd").is_err());
        assert!(safe_rel_path("").is_err());
        assert!(safe_rel_path("./a.md").is_err());
    }

    #[test]
    fn safe_rel_path_accepts_a_nested_relative_path() {
        let path = safe_rel_path("Ideas/Graph RAG.md").expect("valid");
        assert_eq!(path, PathBuf::from("Ideas").join("Graph RAG.md"));
    }

    #[test]
    fn skipped_detects_tooling_directories() {
        assert!(is_skipped_rel(".git/config"));
        assert!(is_skipped_rel("Projects/node_modules/x/a.md"));
        assert!(!is_skipped_rel("Projects/Roadmap.md"));
    }

    #[test]
    fn rel_key_uses_forward_slashes() {
        let root = Path::new("/tmp/vault");
        let path = root.join("Ideas").join("A.md");
        assert_eq!(rel_key(root, &path), "Ideas/A.md");
    }

    #[test]
    fn hash_bytes_is_stable_hex() {
        // SHA-256 of "hi".
        assert_eq!(
            hash_bytes(b"hi"),
            "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4"
        );
    }

    #[test]
    fn write_atomic_creates_and_replaces() {
        let dir = std::env::temp_dir().join(format!("stylenotes-vault-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let target = dir.join("Nested").join("Note.md");

        write_atomic(&target, b"first").expect("first write");
        assert_eq!(fs::read_to_string(&target).expect("read"), "first");

        // Replacing an existing file is the case Windows' rename refuses.
        write_atomic(&target, b"second").expect("replace");
        assert_eq!(fs::read_to_string(&target).expect("read"), "second");
        // No stray part file survives a successful write.
        assert!(!dir.join("Nested").join("Note.md.part").exists());

        let _ = fs::remove_dir_all(&dir);
    }
}
