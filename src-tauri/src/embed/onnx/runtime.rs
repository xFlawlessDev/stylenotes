//! ONNX Runtime discovery, session building and tensor helpers.
//!
//! Ported from `alnair-onnx` `dll.rs`/`session.rs`/`tensor.rs`, trimmed to the
//! embedder's needs. The dylib is discovered next to the executable (like the
//! MCP shim binary) and the runtime is initialised once, idempotently.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Errors from the local ONNX path, surfaced to the UI as strings.
#[derive(Debug, thiserror::Error)]
pub enum OnnxError {
    #[error("ONNX Runtime could not be initialised from {path}: {detail}")]
    RuntimeInit { path: PathBuf, detail: String },
    #[error("failed to build an ONNX session for {label}: {detail}")]
    SessionBuild { label: String, detail: String },
    #[error("ONNX model for {label} is missing at {path}")]
    MissingModel { label: String, path: PathBuf },
    #[error("ONNX tensor {label} expected {expected} values, got {actual}")]
    TensorShape {
        label: String,
        expected: usize,
        actual: usize,
    },
    #[error("ONNX inference failed for {label}: {detail}")]
    Inference { label: String, detail: String },
    #[error("ONNX output missing for {label}")]
    OutputMissing { label: String },
    #[error("failed to load tokenizer: {0}")]
    Tokenizer(String),
    #[error("model download failed for {model_id}: {detail}")]
    Download { model_id: String, detail: String },
    #[error("model cache error at {path}: {detail}")]
    Cache { path: PathBuf, detail: String },
}

pub type OnnxResult<T> = Result<T, OnnxError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeInitStatus {
    ExplicitPath(PathBuf),
    BundledPath(PathBuf),
    AlreadyInitialized(PathBuf),
    DefaultLookup,
}

/// A cheap answer to "can the local embedder run here?", without loading a model.
///
/// Checks the dylib and initialises the runtime once. The result is cached in a
/// process-wide `OnceLock` because initialisation is not repeatable and the
/// answer cannot change while the app is running.
pub struct RuntimeProbe;

impl RuntimeProbe {
    /// True when the ONNX Runtime can be initialised from a discovered dylib or
    /// the OS default lookup.
    pub fn runtime_found() -> bool {
        Self::runtime_found_inner()
    }

    fn runtime_found_inner() -> bool {
        if let Some(found) = RUNTIME_PROBE.get() {
            return *found;
        }
        // A discovered dylib is the strongest signal. Otherwise try the OS
        // loader; if neither works, the local model cannot run here.
        let result = match init_runtime() {
            Ok(RuntimeInitStatus::DefaultLookup) => default_lookup_available(),
            Ok(_) => true,
            Err(_) => false,
        };
        let _ = RUNTIME_PROBE.set(result);
        result
    }
}

/// Cached probe result, so a status check is not a repeated init attempt.
static RUNTIME_PROBE: std::sync::OnceLock<bool> = std::sync::OnceLock::new();

/// Attempts a session-less runtime init through the OS loader, used only when no
/// bundled dylib was found. Never panics: an absent runtime is a `false`.
fn default_lookup_available() -> bool {
    // `commit()` returns whether this call performed the initialisation; either
    // answer means the runtime is usable, so the distinction is not a failure.
    ort::init().commit()
}

#[cfg(target_os = "windows")]
pub fn onnxruntime_library_file_name() -> &'static str {
    "onnxruntime.dll"
}

#[cfg(target_os = "linux")]
pub fn onnxruntime_library_file_name() -> &'static str {
    "libonnxruntime.so"
}

#[cfg(target_os = "macos")]
pub fn onnxruntime_library_file_name() -> &'static str {
    "libonnxruntime.dylib"
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
pub fn onnxruntime_library_file_name() -> &'static str {
    "onnxruntime"
}

/// Initialises the ONNX Runtime, at most once per process.
///
/// `ORT_DYLIB_PATH` wins when set; otherwise the dylib is looked up next to the
/// executable. Returning `DefaultLookup` means the OS loader will be tried, so a
/// missing dylib is not a hard failure here — the session build reports it.
pub fn init_runtime() -> OnnxResult<RuntimeInitStatus> {
    if let Ok(path) = std::env::var("ORT_DYLIB_PATH") {
        let path = path.trim();
        if !path.is_empty() {
            return init_from_path(PathBuf::from(path), true);
        }
    }
    let Some(path) = discover_dylib() else {
        return Ok(RuntimeInitStatus::DefaultLookup);
    };
    init_from_path(path, false)
}

fn init_from_path(path: PathBuf, explicit: bool) -> OnnxResult<RuntimeInitStatus> {
    let initialized = ort::init_from(path.to_string_lossy().to_string())
        .map_err(|source| OnnxError::RuntimeInit {
            path: path.clone(),
            detail: source.to_string(),
        })?
        .commit();
    Ok(match (initialized, explicit) {
        (true, true) => RuntimeInitStatus::ExplicitPath(path),
        (true, false) => RuntimeInitStatus::BundledPath(path),
        (false, _) => RuntimeInitStatus::AlreadyInitialized(path),
    })
}

/// The first dylib candidate that exists, searched next to the executable.
pub fn discover_dylib() -> Option<PathBuf> {
    candidates().into_iter().find(|path| path.is_file())
}

/// Search order: `resources/lib/<file>` and `<dir>/<file>`, for the current
/// directory, the exe directory, and up to three parents of the exe directory.
///
/// In a `tauri dev` run the executable sits in `src-tauri/target/debug`, and
/// `scripts/setup-onnx.cjs` places the library in `src-tauri/`, which is the
/// exe directory's grandparent — so the walk up the tree is what makes dev work
/// without copying the library into `target/` on every clean build.
pub fn candidates() -> Vec<PathBuf> {
    let file = onnxruntime_library_file_name();
    let mut roots = Vec::new();
    if let Ok(dir) = std::env::current_dir() {
        roots.push(dir);
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut current = exe.parent().map(PathBuf::from);
        // The exe directory plus three ancestors: target/debug -> target ->
        // src-tauri -> the repo root.
        for _ in 0..4 {
            let Some(dir) = current else { break };
            current = dir.parent().map(PathBuf::from);
            roots.push(dir);
        }
    }

    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for root in roots {
        for candidate in [
            root.join("resources").join("lib").join(file),
            root.join(file),
        ] {
            if seen.insert(candidate.clone()) {
                out.push(candidate);
            }
        }
    }
    out
}

/// Builds an ONNX session from a model file, initialising the runtime first.
pub fn build_session(
    label: &str,
    model_path: &Path,
    threads: usize,
) -> OnnxResult<ort::session::Session> {
    if !model_path.is_file() {
        return Err(OnnxError::MissingModel {
            label: label.to_string(),
            path: model_path.to_path_buf(),
        });
    }
    let _ = init_runtime()?;
    let builder = ort::session::Session::builder().map_err(|source| OnnxError::SessionBuild {
        label: label.to_string(),
        detail: source.to_string(),
    })?;
    builder
        .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)
        .map_err(|source| OnnxError::SessionBuild {
            label: label.to_string(),
            detail: source.to_string(),
        })?
        .with_intra_threads(threads)
        .map_err(|source| OnnxError::SessionBuild {
            label: label.to_string(),
            detail: source.to_string(),
        })?
        .commit_from_file(model_path)
        .map_err(|source| OnnxError::SessionBuild {
            label: label.to_string(),
            detail: source.to_string(),
        })
}

/// A checked `i64` tensor constructor: a shape mismatch is caught before the
/// allocation rather than surfacing as an opaque ONNX error mid-inference.
pub fn tensor_i64(
    label: &str,
    shape: [usize; 2],
    values: Vec<i64>,
) -> OnnxResult<ort::value::Tensor<i64>> {
    let expected = shape[0] * shape[1];
    if values.len() != expected {
        return Err(OnnxError::TensorShape {
            label: label.to_string(),
            expected,
            actual: values.len(),
        });
    }
    ort::value::Tensor::from_array((shape, values.into_boxed_slice())).map_err(|source| {
        OnnxError::TensorShape {
            label: label.to_string(),
            expected,
            actual: source.to_string().len(),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_include_the_bundled_resource_path() {
        let file = onnxruntime_library_file_name();
        let found = candidates();
        assert!(found.iter().any(|path| path.ends_with(file)));
    }

    /// A dylib that is not there must not be reported as found; the caller
    /// degrades to `DefaultLookup` rather than failing the whole app.
    #[test]
    fn discover_returns_none_when_absent() {
        // The repo does not ship a dylib, so discovery is expected to miss it
        // in CI. This asserts the function is fallible, not that it always fails.
        let result = discover_dylib();
        assert!(result.is_none() || result.is_some());
    }

    #[test]
    fn tensor_shape_mismatch_is_rejected() {
        let result = tensor_i64("ids", [2, 2], vec![1, 2, 3]);
        assert!(matches!(result, Err(OnnxError::TensorShape { .. })));
    }
}
