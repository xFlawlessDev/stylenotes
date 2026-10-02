//! Vendored ONNX Runtime plumbing (docs/design/constella-features.md #D3).
//!
//! Ported from `alnair-onnx` (`dll.rs`, `session.rs`, `tensor.rs`,
//! `model_cache.rs`) rather than depended upon, so StyleNotes stays a
//! self-contained repo — the same choice made for the MCP shim and the AI
//! provider stack. Only what an embedder needs is kept.
//!
//! Everything here is behind the `local-embed` feature.

mod cache;
mod embedder;
mod runtime;

pub use cache::ModelCache;
pub use embedder::{models_dir, OnnxEmbedder};
pub use runtime::RuntimeProbe;

/// The model catalogue lives outside the feature gate so `memory_embedders` can
/// list models even in a build without the ONNX runtime; re-exported here so
/// callers keep importing everything ONNX-related from one module.
pub use crate::embed::models::OnnxEmbedderConfig;

/// Whether one model's files are present under a cache root.
///
/// `cache_root` is the `models` directory itself — the same value passed to
/// `ModelCache::new` — not the app data directory. Taking it pre-resolved makes
/// it impossible for a caller to accidentally append `models` twice.
///
/// Used by `memory_model_status` so Settings can offer "Download" versus
/// "Build index" without attempting a session load just to find out.
pub fn model_is_cached(cache_root: &std::path::Path, config: &OnnxEmbedderConfig) -> bool {
    let cache = ModelCache::new(cache_root);
    cache.is_cached(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::embed::models;

    /// The on-disk directory a model's files live under, matching `ModelCache`.
    fn model_dir(root: &std::path::Path, config: &OnnxEmbedderConfig) -> std::path::PathBuf {
        root.join(config.model_id.replace('/', std::path::MAIN_SEPARATOR_STR))
    }

    /// Proves `model_is_cached` reads the same layout the downloader writes, and
    /// that it treats its argument as the cache root itself.
    ///
    /// Regression: an earlier version appended `models` internally while the
    /// caller already passed `…/models`, so the status always read
    /// `modelDownloaded: false` even with the files present.
    #[test]
    fn detects_a_complete_model_layout() {
        let root =
            std::env::temp_dir().join(format!("stylenotes-model-status-{}", std::process::id()));
        let config = models::default_model();
        let dir = model_dir(&root, &config);
        std::fs::create_dir_all(&dir).expect("create dir");
        std::fs::write(dir.join("model.onnx"), vec![0_u8; 4096]).expect("model");
        std::fs::write(dir.join("tokenizer.json"), b"{}").expect("tokenizer");

        assert!(
            model_is_cached(&root, &config),
            "a complete layout must read as cached"
        );

        std::fs::remove_file(dir.join("tokenizer.json")).expect("remove tokenizer");
        assert!(
            !model_is_cached(&root, &config),
            "a missing tokenizer must not read as cached"
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    /// The status must not append `models` a second time: a layout under
    /// `<root>/models/...` belongs to the app data dir, not the cache root.
    #[test]
    fn does_not_append_models_twice() {
        let app_data =
            std::env::temp_dir().join(format!("stylenotes-appdata-{}", std::process::id()));
        let config = models::default_model();
        let dir = model_dir(&app_data.join("models"), &config);
        std::fs::create_dir_all(&dir).expect("create dir");
        std::fs::write(dir.join("model.onnx"), vec![0_u8; 4096]).expect("model");
        std::fs::write(dir.join("tokenizer.json"), b"{}").expect("tokenizer");

        // Called with the resolved cache root, it finds the model.
        assert!(model_is_cached(&app_data.join("models"), &config));
        // Called with the app data dir, it must NOT silently double `models`.
        assert!(!model_is_cached(&app_data, &config));

        let _ = std::fs::remove_dir_all(&app_data);
    }

    /// Each model is cached under its own directory, so installing one does not
    /// report a different model as ready.
    #[test]
    fn models_do_not_share_a_cache_dir() {
        let root = std::env::temp_dir().join(format!("stylenotes-shared-{}", std::process::id()));
        let first = models::default_model();
        let second = models::config_for("onnx:bge-small-en-v1.5").expect("bge");
        let dir = model_dir(&root, &first);
        std::fs::create_dir_all(&dir).expect("create dir");
        std::fs::write(dir.join("model.onnx"), vec![0_u8; 4096]).expect("model");
        std::fs::write(dir.join("tokenizer.json"), b"{}").expect("tokenizer");

        assert!(model_is_cached(&root, &first));
        assert!(!model_is_cached(&root, &second));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn an_empty_app_data_dir_has_no_model() {
        let root = std::env::temp_dir().join(format!("stylenotes-empty-{}", std::process::id()));
        assert!(!model_is_cached(&root, &models::default_model()));
    }
}
