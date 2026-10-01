//! The local artifact store: one content-addressed home for every file a note
//! attaches (docs/design/artifacts.md).
//!
//! Design in one sentence: **a blob's identity is its bytes, not its path.** A
//! dragged-in file is copied once to `<app_data_dir>/attachments/<ab>/<sha256>.<ext>`,
//! and the note references it as `stylenotes-attachment://<sha256>.<ext>`. That
//! single choice buys three things the old absolute-path model could not:
//!
//! 1. **Portability** — the reference is the content, so the same note renders on
//!    every device once the blob is synced; the original path never leaks into
//!    synced content.
//! 2. **Deduplication** — two notes pasting the same file share one blob.
//! 3. **A clean S3 mapping** — the object key is the relative path
//!    (`attachments/<ab>/<sha256>.<ext>`), so cloud sync uploads exactly the
//!    files a note references and nothing else.
//!
//! This module holds the pure, unit-testable parts (hashing, layout, reference
//! parsing). Filesystem I/O and the `#[tauri::command]`s live in `commands.rs`.

use serde::{Deserialize, Serialize};

pub mod commands;

/// Subdirectory under `app_data_dir()` that owns every blob.
pub const ATTACHMENTS_DIR: &str = "attachments";

/// Scheme used inside note markdown. Deliberately not `http`/`asset`: it is a
/// store-owned, portable identifier that must survive cloud sync unchanged.
pub const SCHEME: &str = "stylenotes-attachment://";

/// A single file pasted into a note is almost never this big; the cap exists so
/// a drag-drop accident cannot silently fill the disk or block the event loop.
pub const MAX_ATTACHMENT_BYTES: u64 = 512 * 1024 * 1024;

/// One blob as the store knows it. `id` is the lowercase SHA-256 hex digest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAttachment {
    /// Content hash; the blob's stable identity.
    pub id: String,
    /// Lowercased extension without the dot, or `""` when the file has none.
    pub ext: String,
    /// The original file name, kept only as a display label.
    pub name: String,
    /// Absolute path of the stored blob on this device.
    pub path: String,
    /// Where the file was attached from, for diagnostics only (never synced).
    pub origin_path: String,
    /// Size in bytes.
    pub size: u64,
}

/// Lowercase hex encoding. Small and dependency-free so digests are stable.
pub fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

/// Normalises an extension: lowercase, no leading dot, ASCII alphanumeric only.
///
/// Anything else (empty, `.tar.gz` tail, unicode, path separators) collapses to
/// `""`, so the extension can never smuggle a path or an odd byte into a name.
pub fn normalize_ext(ext: &str) -> String {
    let trimmed = ext.trim().trim_start_matches('.').to_lowercase();
    if trimmed.is_empty() || trimmed.len() > 16 {
        return String::new();
    }
    if !trimmed.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return String::new();
    }
    trimmed
}

/// Extension from a file name, normalised.
pub fn ext_from_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
    match base.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => normalize_ext(ext),
        _ => String::new(),
    }
}

/// Store-relative path for a blob: `attachments/<ab>/<hash>[.<ext>]`.
///
/// This is both the on-disk layout and the future S3 object key, so the cloud
/// layer needs no translation table.
pub fn object_rel_path(hash: &str, ext: &str) -> String {
    let ext = normalize_ext(ext);
    let shard = hash.get(0..2).unwrap_or("00");
    if ext.is_empty() {
        format!("{ATTACHMENTS_DIR}/{shard}/{hash}")
    } else {
        format!("{ATTACHMENTS_DIR}/{shard}/{hash}.{ext}")
    }
}

/// Parses a store reference back into `(hash, ext)`. `None` for anything else.
pub fn parse_reference(reference: &str) -> Option<(String, String)> {
    let rest = reference
        .strip_prefix(SCHEME)
        .or_else(|| reference.strip_prefix(&SCHEME.to_uppercase()))?;
    let rest = rest.split(['#', '?']).next().unwrap_or(rest);
    if rest.is_empty() {
        return None;
    }
    let (hash, ext) = match rest.rsplit_once('.') {
        Some((hash, ext)) if !hash.is_empty() => (hash, normalize_ext(ext)),
        _ => (rest, String::new()),
    };
    if hash.is_empty() || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    Some((hash.to_lowercase(), ext))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_is_lowercase_and_padded() {
        assert_eq!(hex(&[0x00, 0x0f, 0xff]), "000fff");
    }

    #[test]
    fn normalize_ext_rejects_path_and_junk() {
        assert_eq!(normalize_ext("PNG"), "png");
        assert_eq!(normalize_ext(".jpeg"), "jpeg");
        assert_eq!(normalize_ext(""), "");
        assert_eq!(normalize_ext("tar.gz"), ""); // an embedded dot is not an extension
        assert_eq!(normalize_ext("../etc"), "");
        assert_eq!(normalize_ext("a b"), "");
        assert_eq!(normalize_ext("with/slash"), "");
    }

    #[test]
    fn ext_from_name_uses_the_last_segment() {
        assert_eq!(ext_from_name("C:/pics/Cat.PNG"), "png");
        assert_eq!(ext_from_name("archive.tar.gz"), "gz");
        assert_eq!(ext_from_name("no-extension"), "");
        assert_eq!(ext_from_name(".gitignore"), "");
    }

    #[test]
    fn object_layout_shards_by_hash_prefix() {
        let hash = "ab12cd34ef";
        assert_eq!(
            object_rel_path(hash, "png"),
            "attachments/ab/ab12cd34ef.png"
        );
        assert_eq!(object_rel_path(hash, ""), "attachments/ab/ab12cd34ef");
    }

    #[test]
    fn parse_reference_reads_extension_and_drops_it_when_absent() {
        assert_eq!(
            parse_reference("stylenotes-attachment://ab12cd34ef.pdf"),
            Some(("ab12cd34ef".into(), "pdf".into()))
        );
        assert_eq!(
            parse_reference("stylenotes-attachment://deadbeef"),
            Some(("deadbeef".into(), String::new()))
        );
    }

    #[test]
    fn parse_reference_rejects_foreign_and_malformed_urls() {
        assert_eq!(parse_reference("https://x.test/a.png"), None);
        assert_eq!(parse_reference("asset://localhost/a.png"), None);
        assert_eq!(parse_reference("stylenotes-attachment://"), None);
        assert_eq!(parse_reference("stylenotes-attachment://nothex!.png"), None);
        assert_eq!(parse_reference(""), None);
    }

    #[test]
    fn max_size_is_enforced_by_callers_against_a_named_constant() {
        // Documents the single source of truth for the cap; the check itself
        // lives in commands.rs so this stays pure.
        assert_eq!(MAX_ATTACHMENT_BYTES, 512 * 1024 * 1024);
    }
}
