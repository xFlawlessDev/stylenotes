//! Tauri commands for the semantic memory index (docs/design/constella-features.md).
//!
//! Rust owns the model work — the ONNX session, the provider HTTP call, and the
//! cosine — because that is where the vector bytes and the crypto already live.
//! The frontend owns persistence and orchestration (#D15, #D16): it composes the
//! text, computes `content_hash`, and writes rows through the repo.
//!
//! The local model is cached in app state: loading a session is expensive and
//! must not happen once per batch.

use serde::{Deserialize, Serialize};

use crate::embed::hashing::{HashingEmbedder, HASHING_DIM, HASHING_EMBEDDER_ID};
use crate::embed::provider::{ProviderEmbedder, PROVIDER_PREFIX};
use crate::embed::vector;
use crate::embed::{Embedder, EmbedderDescriptor, EmbedderKind};

#[cfg(feature = "local-embed")]
use crate::embed::onnx::{ModelCache, OnnxEmbedder, OnnxEmbedderConfig};
#[cfg(feature = "local-embed")]
use std::path::PathBuf;
#[cfg(feature = "local-embed")]
use tauri::Manager;

/// The local ONNX model the app offers, when `local-embed` is compiled in.
pub const ONNX_EMBEDDER_ID: &str = "onnx:minilm-l6";
pub const ONNX_EMBEDDER_DIM: usize = 384;

/// A loaded ONNX session, kept warm between calls.
///
/// Empty without the `local-embed` feature: managed state must exist either
/// way so the command signature is identical in both builds.
#[derive(Default)]
pub struct LocalModelState {
    #[cfg(feature = "local-embed")]
    loaded: std::sync::Mutex<Option<(String, OnnxEmbedder)>>,
}

/// Payload for `ai_embed`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbedRequest {
    /// Embedder id: `hashing:…`, `provider:<model>`, or `onnx:…`.
    pub embedder: String,
    pub texts: Vec<String>,
    /// Optional endpoint for a provider embedder.
    #[serde(default)]
    pub base_url: Option<String>,
    /// Optional decrypted key for a provider embedder; never persisted here.
    #[serde(default)]
    pub api_key: Option<String>,
    /// Provider vector length; required for provider embeddings.
    #[serde(default)]
    pub dim: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbedResponse {
    pub id: String,
    pub dim: usize,
    pub vectors: Vec<Vec<f32>>,
}

/// Every embedder the app can offer right now, so Settings reflects the build.
///
/// `onnx:…` is always listed so the UI is stable, but its label states whether
/// it can actually run: the feature must be compiled in, the ONNX Runtime dylib
/// must be found, and the model must be downloaded. `memory_model_status` reports
/// the last two so Settings can offer the right action.
#[tauri::command]
pub fn memory_embedders() -> Vec<EmbedderDescriptor> {
    vec![
        EmbedderDescriptor {
            id: ONNX_EMBEDDER_ID.to_string(),
            kind: EmbedderKind::Onnx,
            label: onnx_label(),
            dim: ONNX_EMBEDDER_DIM,
            offline: true,
            download_bytes: Some(onnx_model_bytes()),
        },
        EmbedderDescriptor {
            id: HASHING_EMBEDDER_ID.to_string(),
            kind: EmbedderKind::Hashing,
            label: "Offline baseline".to_string(),
            dim: HASHING_DIM,
            offline: true,
            download_bytes: None,
        },
    ]
}

/// A label that says whether the local model can run in *this* build.
fn onnx_label() -> String {
    #[cfg(feature = "local-embed")]
    {
        "Local model (MiniLM-L6)".to_string()
    }
    #[cfg(not(feature = "local-embed"))]
    {
        "Local model (not in this build)".to_string()
    }
}

/// Approximate size of the model download, for the Settings copy.
fn onnx_model_bytes() -> u64 {
    // MiniLM-L6 quantized is ~23 MB; the number is a UI hint, not a guarantee.
    23 * 1024 * 1024
}

/// Readiness of the local model, so Settings can show the right action.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    /// The `local-embed` feature is compiled into this build.
    pub available: bool,
    /// The ONNX Runtime dylib was found next to the executable.
    pub runtime_found: bool,
    /// The model files are already on disk.
    pub model_downloaded: bool,
    /// Approximate download size in bytes.
    pub download_bytes: u64,
    /// A human reason when `available` is false, for the UI.
    pub detail: String,
}

/// Reports whether the local embedder can run, and what is missing.
#[tauri::command]
pub fn memory_model_status(app: tauri::AppHandle) -> ModelStatus {
    #[cfg(feature = "local-embed")]
    {
        use crate::embed::onnx::RuntimeProbe;
        let runtime_found = RuntimeProbe::runtime_found();
        // Pass the resolved cache root (`…/models`), which is what
        // `model_is_cached` expects; it does not append `models` itself.
        let model_downloaded = crate::embed::onnx::model_is_cached(&models_dir(&app));
        ModelStatus {
            available: true,
            runtime_found,
            model_downloaded,
            download_bytes: onnx_model_bytes(),
            detail: if !runtime_found {
                "The ONNX Runtime library was not found next to the app.".to_string()
            } else if !model_downloaded {
                "The embedding model has not been downloaded yet.".to_string()
            } else {
                "Ready.".to_string()
            },
        }
    }
    #[cfg(not(feature = "local-embed"))]
    {
        let _ = app;
        ModelStatus {
            available: false,
            runtime_found: false,
            model_downloaded: false,
            download_bytes: onnx_model_bytes(),
            detail: "This build was compiled without the local model.".to_string(),
        }
    }
}

/// Downloads the local model, if it is not already cached.
///
/// Long-running and network-bound, so it is `async` and callable from the UI
/// with a spinner. Emits `memory:download-progress` while it streams so the UI
/// can show a real progress bar. Returns the model's on-disk directory.
#[tauri::command]
pub async fn memory_download_model(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(feature = "local-embed")]
    {
        use tauri::Emitter;

        let dir = models_dir(&app);
        let config = OnnxEmbedderConfig::minilm_l6();
        // The download itself is blocking; keep it off the async runtime's
        // worker so the app stays responsive.
        let emit_app = app.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            let cache = ModelCache::new(&dir);
            cache
                .get_or_download(&config.model_id, |label, written, total| {
                    // One event per chunk would flood the IPC channel on a fast
                    // connection; the UI only needs a smooth bar.
                    let percent = total
                        .filter(|total| *total > 0)
                        .map(|total| (written.saturating_mul(100) / total).min(100) as u32);
                    let _ = emit_app.emit(
                        "memory:download-progress",
                        serde_json::json!({
                            "label": label,
                            "written": written,
                            "total": total,
                            "percent": percent,
                        }),
                    );
                })
                .map(|cached| {
                    cached
                        .model_path
                        .parent()
                        .map(|path| path.to_string_lossy().to_string())
                        .unwrap_or_default()
                })
        })
        .await
        .map_err(|error| error.to_string())?;
        result.map_err(|error| error.to_string())
    }
    #[cfg(not(feature = "local-embed"))]
    {
        let _ = app;
        Err("This build was compiled without the local model.".to_string())
    }
}

/// Embeds a batch of texts with the selected embedder.
///
/// The frontend resolves the provider key and passes it in for the duration of
/// the call, exactly as it does for the chat provider.
#[tauri::command]
pub async fn ai_embed(
    state: tauri::State<'_, LocalModelState>,
    app: tauri::AppHandle,
    request: EmbedRequest,
) -> Result<EmbedResponse, String> {
    let id = request.embedder.trim().to_string();
    if id.is_empty() {
        return Err("an embedder id is required".to_string());
    }
    if request.texts.is_empty() {
        return Ok(EmbedResponse {
            id,
            dim: 0,
            vectors: Vec::new(),
        });
    }

    // Provider embeddings do their own network call, so they are built fresh.
    if let Some(model) = id.strip_prefix(PROVIDER_PREFIX) {
        let dim = request
            .dim
            .ok_or_else(|| "provider embeddings require a dimension".to_string())?;
        return run(
            ProviderEmbedder::new(
                model.to_string(),
                request.base_url.unwrap_or_default(),
                request.api_key.unwrap_or_default(),
                dim,
            ),
            request.texts,
        );
    }

    if id == HASHING_EMBEDDER_ID {
        return run(HashingEmbedder::new(HASHING_DIM), request.texts);
    }

    #[cfg(feature = "local-embed")]
    {
        if id == ONNX_EMBEDDER_ID {
            let cache = ModelCache::new(models_dir(&app));
            let vectors = embed_local(&state, &cache, &id, request.texts)?;
            return Ok(EmbedResponse {
                id,
                dim: ONNX_EMBEDDER_DIM,
                vectors,
            });
        }
    }
    #[cfg(not(feature = "local-embed"))]
    {
        let _ = (&state, &app);
    }

    Err(format!("unknown or unavailable embedder `{id}`"))
}

/// Runs any embedder and reports its own id/dim, so the trait is the single
/// source of the vector identity rather than a hardcoded constant at each site.
fn run(embedder: impl Embedder, texts: Vec<String>) -> Result<EmbedResponse, String> {
    let id = embedder.id().to_string();
    let dim = embedder.dim();
    let vectors = embedder.embed(&texts).map_err(|error| error.to_string())?;
    Ok(EmbedResponse { id, dim, vectors })
}

/// The directory downloaded models live under.
#[cfg(feature = "local-embed")]
fn models_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    app.path()
        .app_data_dir()
        .map(|dir| crate::embed::onnx::models_dir(&dir))
        .unwrap_or_else(|_| PathBuf::from("models"))
}

/// Runs the local model, loading it once and keeping it warm.
#[cfg(feature = "local-embed")]
fn embed_local(
    state: &tauri::State<'_, LocalModelState>,
    cache: &ModelCache,
    id: &str,
    texts: Vec<String>,
) -> Result<Vec<Vec<f32>>, String> {
    let mut guard = state
        .loaded
        .lock()
        .map_err(|_| "the local model lock is poisoned".to_string())?;
    if guard.as_ref().map(|(loaded, _)| loaded.as_str()) != Some(id) {
        let embedder = OnnxEmbedder::load(OnnxEmbedderConfig::minilm_l6(), cache)
            .map_err(|error| error.to_string())?;
        *guard = Some((id.to_string(), embedder));
    }
    let (_, embedder) = guard.as_mut().expect("model was just loaded");
    embedder.embed(&texts).map_err(|error| error.to_string())
}

/// Cosine similarity between two encoded vectors. The frontend has its own copy
/// for the pure ranking pass; this is exposed for callers that keep vectors in
/// Rust.
#[tauri::command]
pub fn memory_cosine(a: Vec<f32>, b: Vec<f32>) -> f32 {
    vector::cosine(&a, &b).unwrap_or(0.0)
}
