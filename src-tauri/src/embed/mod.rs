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
    #[serde(skip_serializing_if = "is_false")]
    pub recommended: bool,
    /// Covers many languages. Only meaningful for `onnx`.
    #[serde(skip_serializing_if = "is_false")]
    pub multilingual: bool,
}

/// Omit a `false` flag from the wire, so the baseline descriptor keeps the same
/// shape it had before the flags existed.
fn is_false(value: &bool) -> bool {
    !*value
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

#[cfg(test)]
mod tests {
    use super::*;

    fn baseline() -> EmbedderDescriptor {
        EmbedderDescriptor {
            id: "hashing:trigram-v1".to_string(),
            kind: EmbedderKind::Hashing,
            label: "Offline baseline".to_string(),
            dim: 384,
            offline: true,
            download_bytes: None,
            recommended: false,
            multilingual: false,
        }
    }

    /// The frontend reads `kind` as a lowercase tag; a rename here would fail
    /// silently at runtime, so it is pinned.
    #[test]
    fn kind_serialises_lowercase() {
        let json = serde_json::to_string(&baseline()).expect("serialise");
        assert!(json.contains("\"kind\":\"hashing\""));
    }

    /// A `false` flag is omitted, and a `None` size too, so the baseline
    /// descriptor keeps the pre-flags shape rather than gaining dead keys.
    #[test]
    fn false_flags_and_absent_size_are_omitted() {
        let json = serde_json::to_string(&baseline()).expect("serialise");
        assert!(!json.contains("recommended"), "false flag must be omitted");
        assert!(!json.contains("multilingual"), "false flag must be omitted");
        assert!(!json.contains("downloadBytes"), "null size must be omitted");
        assert!(json.contains("\"dim\":384"));
    }

    /// An ONNX descriptor carries the size and the recommendation the UI depends
    /// on to render the option line and mark a default.
    #[test]
    fn a_recommended_model_carries_its_flags() {
        let descriptor = EmbedderDescriptor {
            id: "onnx:bge-small-en-v1.5".to_string(),
            kind: EmbedderKind::Onnx,
            label: "BGE small v1.5".to_string(),
            dim: 384,
            offline: true,
            download_bytes: Some(35 * 1024 * 1024),
            recommended: true,
            multilingual: false,
        };
        let json = serde_json::to_string(&descriptor).expect("serialise");
        assert!(json.contains("\"recommended\":true"));
        assert!(json.contains("\"downloadBytes\":36700160"));
    }
}
