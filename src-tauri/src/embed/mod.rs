//! Semantic memory index: embeddings, vector math and the embedder abstraction.
//!
//! Design: `docs/design/constella-features.md` (#D3-#D6). The index is a
//! derivative of `notes.body` and can always be rebuilt, so nothing here is a
//! source of truth.
//!
//! Two things are deliberately dependency-free so CI never needs a model: the
//! vector codec/cosine (`vector.rs`) and the offline `HashingEmbedder`. The
//! provider embedder reuses the AI gateway's key handling; the local ONNX
//! embedder is vendored under `onnx/` behind the `local-embed` feature.

pub mod commands;
pub mod hashing;
pub mod models;
pub mod provider;
pub mod vector;

#[cfg(feature = "local-embed")]
pub mod onnx;

use serde::{Deserialize, Serialize};

/// How a vector was produced. Mirrors `EmbedderKind` in `memory-types.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmbedderKind {
    Hashing,
    Provider,
    Onnx,
}

/// A concrete embedder the app can select. Mirrors `EmbedderDescriptor`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbedderDescriptor {
    pub id: String,
    pub kind: EmbedderKind,
    pub label: String,
    pub dim: usize,
    pub offline: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_bytes: Option<u64>,
    /// Pre-selected as the best default for its size. Only meaningful for `onnx`.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub recommended: bool,
    /// Covers many languages. Only meaningful for `onnx`.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub multilingual: bool,
}

/// Errors surfaced across the IPC boundary as strings.
#[derive(Debug, thiserror::Error)]
pub enum EmbedError {
    #[error("{0}")]
    Config(String),
    #[error("{0}")]
    Provider(String),
    #[error("{0}")]
    Network(String),
}

pub type EmbedResult<T> = Result<T, EmbedError>;

/// One text batch in, one vector batch out. `Send + Sync` so an embedder can
/// live in shared app state behind a lock.
pub trait Embedder: Send + Sync {
    /// The stable id written alongside every vector (`provider:…`, `hashing:…`).
    fn id(&self) -> &str;
    fn dim(&self) -> usize;
    fn embed(&self, texts: &[String]) -> EmbedResult<Vec<Vec<f32>>>;
}

/// L2-normalises a vector in place. Every embedder returns unit vectors so
/// cosine reduces to a dot product and thresholds are comparable across models.
pub fn normalize(vec: &mut [f32]) {
    let magnitude: f32 = vec.iter().map(|value| value * value).sum::<f32>().sqrt();
    if magnitude > 0.0 {
        for value in vec.iter_mut() {
            *value /= magnitude;
        }
    }
}
