//! Tauri commands for the semantic memory index (docs/design/constella-features.md).
//!
//! Rust owns the model work — the ONNX session, the provider HTTP call, and the
//! cosine — because that is where the vector bytes and the crypto already live.
//! The frontend owns persistence and orchestration (#D15, #D16): it composes the
//! text, computes `content_hash`, and writes rows through the repo.
//!
//! The local model is cached in app state: loading a session is expensive and
//! must not happen once per batch. Which model is loaded is keyed by its id, so
//! switching models in Settings swaps the session rather than returning the
//! wrong model's vectors.

use serde::{Deserialize, Serialize};

use crate::embed::hashing::{HashingEmbedder, HASHING_DIM, HASHING_EMBEDDER_ID};
use crate::embed::models;
use crate::embed::provider::{ProviderEmbedder, PROVIDER_PREFIX};
use crate::embed::vector;
use crate::embed::{Embedder, EmbedderDescriptor, EmbedderKind};

#[cfg(feature = "local-embed")]
use crate::embed::models::EmbedKind;
#[cfg(feature = "local-embed")]
use crate::embed::onnx::{ModelCache, OnnxEmbedder};
#[cfg(feature = "local-embed")]
use std::path::PathBuf;
#[cfg(feature = "local-embed")]
use tauri::Manager;

/// A loaded ONNX session, kept warm between calls, tagged with the model id.
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
    /// Embed as a search query rather than a document. Only E5 distinguishes the
    /// two; for the other models this is inert. The index is always documents.
    #[cfg_attr(not(feature = "local-embed"), allow(dead_code))]
    #[serde(default)]
    pub as_query: bool,
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
/// The local models are listed even when the `local-embed` feature is absent or
/// the ONNX Runtime dylib is missing: the dropdown must be stable, and
/// `memory_model_status` reports what is actually runnable. The label states
/// when the local path is not in this build.
#[tauri::command]
pub fn memory_embedders() -> Vec<EmbedderDescriptor> {
    let mut embedders = local_descriptors();
    embedders.push(EmbedderDescriptor {
        id: HASHING_EMBEDDER_ID.to_string(),
        kind: EmbedderKind::Hashing,
        label: "Offline baseline".to_string(),
        dim: HASHING_DIM,
        offline: true,
        download_bytes: None,
        recommended: false,
        multilingual: false,
    });
    embedders
}

/// One descriptor per local model, so the UI can present the whole catalogue.
fn local_descriptors() -> Vec<EmbedderDescriptor> {
    models::all()
        .iter()
        .map(|config| EmbedderDescriptor {
            id: config.id.to_string(),
            kind: EmbedderKind::Onnx,
            label: onnx_label(config),
            dim: config.dim,
            offline: true,
            download_bytes: Some(config.download_bytes),
            recommended: config.recommended,
            multilingual: config.multilingual,
        })
        .collect()
}

/// The model's label, marked when the local path is not in this build.
fn onnx_label(config: &models::OnnxEmbedderConfig) -> String {
    #[cfg(feature = "local-embed")]
    {
        config.label.to_string()
    }
    #[cfg(not(feature = "local-embed"))]
    {
        format!("{} (not in this build)", config.label)
    }
}

/// Resolves a requested `onnx:…` id, falling back to the default model when the
/// caller names none (or names a model this build no longer knows).
fn resolve_config(embedder: Option<&str>) -> models::OnnxEmbedderConfig {
    embedder
        .and_then(models::config_for)
        .unwrap_or_else(models::default_model)
}

/// Readiness of the selected local model, so Settings can show the right action.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    /// The `local-embed` feature is compiled into this build.
    pub available: bool,
    /// The ONNX Runtime dylib was found next to the executable.
    pub runtime_found: bool,
    /// This model's files are already on disk.
    pub model_downloaded: bool,
    /// Approximate download size in bytes.
    pub download_bytes: u64,
    /// A human reason when `available` is false, for the UI.
    pub detail: String,
}

/// Reports whether one local embedder can run, and what is missing.
///
/// Defaults to the catalogue's first model when the caller names none, so a
/// Settings page that has not picked a model yet still gets a useful answer.
#[tauri::command]
pub fn memory_model_status(app: tauri::AppHandle, embedder: Option<String>) -> ModelStatus {
    let config = resolve_config(embedder.as_deref());
    #[cfg(feature = "local-embed")]
    {
        use crate::embed::onnx::RuntimeProbe;
        let runtime_found = RuntimeProbe::runtime_found();
        // Pass the resolved cache root (`…/models`), which is what
        // `model_is_cached` expects; it does not append `models` itself.
        let model_downloaded = crate::embed::onnx::model_is_cached(&models_dir(&app), &config);
        ModelStatus {
            available: true,
            runtime_found,
            model_downloaded,
            download_bytes: config.download_bytes,
            detail: if !runtime_found {
                "The ONNX Runtime library was not found next to the app.".to_string()
            } else if !model_downloaded {
                format!("{} has not been downloaded yet.", config.label)
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
            download_bytes: config.download_bytes,
            detail: "This build was compiled without the local model.".to_string(),
        }
    }
}

/// Downloads one local model, if it is not already cached.
///
/// Long-running and network-bound, so it is `async` and callable from the UI
/// with a spinner. Emits `memory:download-progress` while it streams so the UI
/// can show a real progress bar. Returns the model's on-disk directory.
#[tauri::command]
pub async fn memory_download_model(
    app: tauri::AppHandle,
    embedder: Option<String>,
) -> Result<String, String> {
    let config = resolve_config(embedder.as_deref());
    #[cfg(feature = "local-embed")]
    {
        use tauri::Emitter;

        let dir = models_dir(&app);
        // The download itself is blocking; keep it off the async runtime's
        // worker so the app stays responsive.
        let emit_app = app.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            let cache = ModelCache::new(&dir);
            cache
                .get_or_download(config.model_id, config.hf_file, |label, written, total| {
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
        let _ = (&app, &config);
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
        if let Some(config) = models::config_for(&id) {
            let cache = ModelCache::new(models_dir(&app));
            let vectors = embed_local(&state, &cache, config, request.texts, request.as_query)?;
            return Ok(EmbedResponse {
                id,
                dim: config.dim,
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
///
/// The warm session is keyed by id, so a model change reloads rather than
/// reusing the previous model's session against the new model's dim.
#[cfg(feature = "local-embed")]
fn embed_local(
    state: &tauri::State<'_, LocalModelState>,
    cache: &ModelCache,
    config: models::OnnxEmbedderConfig,
    texts: Vec<String>,
    as_query: bool,
) -> Result<Vec<Vec<f32>>, String> {
    let mut guard = state
        .loaded
        .lock()
        .map_err(|_| "the local model lock is poisoned".to_string())?;
    if guard.as_ref().map(|(loaded, _)| loaded.as_str()) != Some(config.id) {
        let embedder = OnnxEmbedder::load(config, cache).map_err(|error| error.to_string())?;
        *guard = Some((config.id.to_string(), embedder));
    }
    let (_, embedder) = guard.as_mut().expect("model was just loaded");
    let kind = if as_query {
        EmbedKind::Query
    } else {
        EmbedKind::Document
    };
    embedder
        .embed_as(&texts, kind)
        .map_err(|error| error.to_string())
}

/// Cosine similarity between two encoded vectors. The frontend has its own copy
/// for the pure ranking pass; this is exposed for callers that keep vectors in
/// Rust.
#[tauri::command]
pub fn memory_cosine(a: Vec<f32>, b: Vec<f32>) -> f32 {
    vector::cosine(&a, &b).unwrap_or(0.0)
}
