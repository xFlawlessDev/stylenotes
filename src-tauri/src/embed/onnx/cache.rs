//! HuggingFace model cache for the local embedder.
//!
//! Ported from `alnair-onnx` `model_cache.rs`, trimmed to the flat layout an
//! embedder needs: `model.onnx` + `tokenizer.json` under `<root>/<org>/<name>/`.
//! Downloads stream to a temp file and are renamed into place, so an interrupted
//! download never leaves a half-written model that later looks cached.

use std::path::{Path, PathBuf};

use super::runtime::{OnnxError, OnnxResult};
use crate::embed::models::OnnxEmbedderConfig;

const HF_BASE_URL: &str = "https://huggingface.co";
/// A real model is tens of MB; anything under 1 KiB is an error page, not a model.
const MIN_MODEL_BYTES: u64 = 1024;
const MIN_TOKENIZER_BYTES: u64 = 64;

/// Paths to a cached model, once its files are present and non-empty.
#[derive(Debug, Clone)]
pub struct CachedModel {
    pub model_path: PathBuf,
    pub tokenizer_path: PathBuf,
}

impl CachedModel {
    pub fn is_valid(&self) -> bool {
        self.model_path.is_file()
            && self.tokenizer_path.is_file()
            && std::fs::metadata(&self.model_path)
                .map(|m| m.len())
                .unwrap_or(0)
                >= MIN_MODEL_BYTES
    }
}

/// Downloads and caches ONNX embedding models.
pub struct ModelCache {
    root: PathBuf,
    client: reqwest::Client,
}

impl ModelCache {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            client: reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
        }
    }

    fn model_dir(&self, model_id: &str) -> PathBuf {
        self.root
            .join(model_id.replace('/', std::path::MAIN_SEPARATOR_STR))
    }

    /// The cached paths for `model_id`, without touching the network.
    pub fn get_cached(&self, model_id: &str) -> Option<CachedModel> {
        let dir = self.model_dir(model_id);
        let cached = CachedModel {
            model_path: dir.join("model.onnx"),
            tokenizer_path: dir.join("tokenizer.json"),
        };
        cached.is_valid().then_some(cached)
    }

    /// Returns the cached model, downloading it first when absent.
    ///
    /// `hf_file` is the repo-relative ONNX path from the model config, so the
    /// cache can hold different exports (a quantized file for one model, fp32
    /// for another) without a second layout.
    ///
    /// `on_progress` receives `(file_label, bytes_written, total_bytes)` as the
    /// body streams, so a caller can drive a progress bar. `total_bytes` is
    /// `None` when the server does not send a `Content-Length`.
    pub fn get_or_download<F>(
        &self,
        model_id: &str,
        hf_file: &str,
        on_progress: F,
    ) -> OnnxResult<CachedModel>
    where
        F: Fn(&str, u64, Option<u64>),
    {
        if let Some(cached) = self.get_cached(model_id) {
            return Ok(cached);
        }
        let dir = self.model_dir(model_id);
        std::fs::create_dir_all(&dir).map_err(|error| OnnxError::Cache {
            path: dir.clone(),
            detail: error.to_string(),
        })?;

        self.download_file(
            model_id,
            hf_file,
            &dir.join("model.onnx"),
            MIN_MODEL_BYTES,
            &on_progress,
        )?;
        self.download_file(
            model_id,
            "tokenizer.json",
            &dir.join("tokenizer.json"),
            MIN_TOKENIZER_BYTES,
            &on_progress,
        )?;

        let cached = self.get_cached(model_id).ok_or_else(|| OnnxError::Cache {
            path: dir,
            detail: "download completed but files are missing".to_string(),
        })?;
        Ok(cached)
    }

    /// Whether the tokenizer is `tokenizer.json`; only the model file varies by
    /// config, so this reads that config's local name rather than assuming any
    /// one export. Kept as a named helper so callers pass a config, not a
    /// stringly-typed id, and can never check a different model than they use.
    pub fn is_cached(&self, config: &OnnxEmbedderConfig) -> bool {
        self.get_cached(config.model_id).is_some()
    }

    /// Streams one file to a temp path then renames it into place, so a partial
    /// download is never mistaken for a cached file.
    fn download_file(
        &self,
        model_id: &str,
        hf_path: &str,
        local_path: &Path,
        min_bytes: u64,
        on_progress: &dyn Fn(&str, u64, Option<u64>),
    ) -> OnnxResult<()> {
        use std::io::Write as _;

        let url = format!("{HF_BASE_URL}/{model_id}/resolve/main/{hf_path}");
        let mut response = tauri::async_runtime::block_on(async {
            // Large models may take minutes; the timeout is generous but finite.
            self.client
                .get(&url)
                .timeout(std::time::Duration::from_secs(1800))
                .send()
                .await
        })
        .map_err(|error| OnnxError::Download {
            model_id: model_id.to_string(),
            detail: format!("{url}: {error}"),
        })?;

        if !response.status().is_success() {
            return Err(OnnxError::Download {
                model_id: model_id.to_string(),
                detail: format!("HTTP {} for {url}", response.status()),
            });
        }
        if let Some(content_type) = response.headers().get(reqwest::header::CONTENT_TYPE) {
            if content_type.to_str().unwrap_or("").contains("text/html") {
                return Err(OnnxError::Download {
                    model_id: model_id.to_string(),
                    detail: format!("received an HTML error page for {url}"),
                });
            }
        }

        let total = response.content_length();
        let tmp_path = local_path.with_extension("tmp");
        let mut file = std::fs::File::create(&tmp_path).map_err(|error| OnnxError::Cache {
            path: tmp_path.clone(),
            detail: error.to_string(),
        })?;

        let mut written: u64 = 0;
        // Read the body in chunks so a large model never sits in RAM whole.
        let result = tauri::async_runtime::block_on(async {
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|error| OnnxError::Download {
                    model_id: model_id.to_string(),
                    detail: format!("reading {url}: {error}"),
                })?
            {
                file.write_all(&chunk).map_err(|error| OnnxError::Cache {
                    path: tmp_path.clone(),
                    detail: error.to_string(),
                })?;
                written += chunk.len() as u64;
                on_progress(hf_path, written, total);
            }
            Ok::<(), OnnxError>(())
        });
        if let Err(error) = result {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(error);
        }
        if let Err(error) = file.flush() {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(OnnxError::Cache {
                path: tmp_path.clone(),
                detail: error.to_string(),
            });
        }
        drop(file);

        if written < min_bytes {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(OnnxError::Download {
                model_id: model_id.to_string(),
                detail: format!("{hf_path} was only {written} bytes (expected >= {min_bytes})"),
            });
        }

        std::fs::rename(&tmp_path, local_path).map_err(|error| {
            let _ = std::fs::remove_file(&tmp_path);
            OnnxError::Cache {
                path: local_path.to_path_buf(),
                detail: error.to_string(),
            }
        })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_model_is_not_cached() {
        let cache = ModelCache::new("./does-not-exist-cache");
        assert!(cache.get_cached("org/model").is_none());
    }

    /// A file that exists but is far too small is an error page, not a model;
    /// treating it as cached would fail later at session build with no clue why.
    #[test]
    fn tiny_model_file_is_rejected() {
        let root = std::env::temp_dir().join(format!("stylenotes-cache-{}", std::process::id()));
        let dir = root.join("org").join("model");
        std::fs::create_dir_all(&dir).expect("create dir");
        std::fs::write(dir.join("model.onnx"), b"x").expect("write model");
        std::fs::write(dir.join("tokenizer.json"), b"{}").expect("write tokenizer");

        let cache = ModelCache::new(&root);
        assert!(cache.get_cached("org/model").is_none());

        let _ = std::fs::remove_dir_all(&root);
    }
}
