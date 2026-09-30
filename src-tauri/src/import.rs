//! Markdown import: reading a vault or folder from disk
//! (docs/design/constella-features.md #D14).
//!
//! Reading is kept in Rust rather than the webview so the capability surface
//! stays narrow: the frontend asks for one directory, the command walks it and
//! returns the `.md` files. Parsing and planning are pure TS
//! (`content/markdown-import.ts`); this module only does I/O.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// One markdown file read from a vault.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFile {
    /// Path relative to the import root, with `/` separators on every platform.
    pub path: String,
    pub content: String,
}

/// Guard against a runaway walk on a huge or symlinked tree.
const MAX_FILES: usize = 5_000;
/// A single note larger than this is almost certainly not a note.
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;

fn relative_key(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn read_one(root: &Path, path: &Path, out: &mut Vec<ImportedFile>) {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return,
    };
    if metadata.len() > MAX_FILE_BYTES {
        return;
    }
    // A file that is not valid UTF-8 is skipped, not guessed at.
    if let Ok(content) = std::fs::read_to_string(path) {
        out.push(ImportedFile {
            path: relative_key(root, path),
            content,
        });
    }
}

fn walk(root: &Path, dir: &Path, recursive: bool, out: &mut Vec<ImportedFile>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_FILES {
            return;
        }
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        // Symlinks are not followed: importing a vault must not escape it.
        if file_type.is_symlink() {
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
        if is_markdown {
            read_one(root, &path, out);
        }
    }
}

/// Reads one markdown file, or every markdown file under a directory.
///
/// `recursive` controls whether subfolders are walked. A single file is read
/// regardless, so "import this note" is the same call as "import this vault".
#[tauri::command]
pub fn import_read_markdown(path: String, recursive: bool) -> Result<Vec<ImportedFile>, String> {
    let path_buf = PathBuf::from(&path);
    let metadata =
        std::fs::metadata(&path_buf).map_err(|error| format!("cannot read {path}: {error}"))?;

    let mut out = Vec::new();
    if metadata.is_file() {
        let root = path_buf.parent().unwrap_or_else(|| Path::new("."));
        read_one(root, &path_buf, &mut out);
    } else if metadata.is_dir() {
        walk(&path_buf, &path_buf, recursive, &mut out);
    } else {
        return Err("the path is neither a file nor a directory".to_string());
    }

    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_single_markdown_file() {
        let dir = std::env::temp_dir().join(format!("stylenotes-import-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("note.md");
        std::fs::write(&file, "# Hello").expect("write");

        let files = import_read_markdown(file.to_string_lossy().to_string(), false).expect("read");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "note.md");
        assert_eq!(files[0].content, "# Hello");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn walks_subfolders_only_when_recursive() {
        let dir =
            std::env::temp_dir().join(format!("stylenotes-import-walk-{}", std::process::id()));
        let nested = dir.join("sub");
        let _ = std::fs::create_dir_all(&nested);
        std::fs::write(dir.join("root.md"), "root").expect("write root");
        std::fs::write(nested.join("child.md"), "child").expect("write child");
        std::fs::write(nested.join("ignore.txt"), "text").expect("write txt");

        let shallow =
            import_read_markdown(dir.to_string_lossy().to_string(), false).expect("read shallow");
        assert_eq!(shallow.len(), 1);
        assert_eq!(shallow[0].path, "root.md");

        let deep =
            import_read_markdown(dir.to_string_lossy().to_string(), true).expect("read deep");
        assert_eq!(deep.len(), 2);
        assert!(deep.iter().any(|file| file.path == "sub/child.md"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_path_is_an_error() {
        assert!(import_read_markdown("./does-not-exist-xyz".to_string(), true).is_err());
    }
}
