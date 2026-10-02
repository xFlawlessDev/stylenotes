//! The catalogue of local ONNX embedding models the app can run.
//!
//! Pure data, deliberately **not** behind the `local-embed` feature: the UI must
//! be able to list the models a build *would* offer even when the ONNX runtime
//! is not compiled in, exactly as `memory_embedders` did for a single hardcoded
//! model before. Only the session/runtime code is feature-gated, so a
//! `--no-default-features` build still has the catalogue but never reads the
//! fields that only matter to inference.
#![cfg_attr(not(feature = "local-embed"), allow(dead_code))]
//!
//! Every entry points at a **quantized** ONNX export so the download matches the
//! size the UI advertises. Each model differs in pooling and (for E5) the
//! query/passage prefixes, so a config carries its own recipe rather than the
//! embedder assuming MiniLM's mean pooling. See
//! `docs/design/archive/constella-features.md` #D3.

/// How a model turns token embeddings into one sentence vector.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pooling {
    /// Average over real (unmasked) tokens — MiniLM, BGE-micro, E5.
    Mean,
    /// Take the first token (`[CLS]`) — BGE English v1.5.
    Cls,
}

/// Whether a text is a search query or an indexed document. E5 prefixes the two
/// differently; other models ignore the distinction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmbedKind {
    Query,
    Document,
}

/// A sentence-embedding model the app knows how to run.
///
/// All fields are `'static`: the catalogue is a `const` array and a config is
/// `Copy`, so resolving one never allocates.
#[derive(Debug, Clone, Copy)]
pub struct OnnxEmbedderConfig {
    /// HF Hub id, e.g. `Xenova/all-MiniLM-L6-v2`.
    pub model_id: &'static str,
    /// The id written alongside vectors, e.g. `onnx:minilm-l6`.
    pub id: &'static str,
    /// The ONNX file within the repo, e.g. `onnx/model_quantized.onnx`.
    pub hf_file: &'static str,
    /// Human label for Settings. A proper name, so it stays untranslated.
    pub label: &'static str,
    pub dim: usize,
    pub max_length: usize,
    pub num_threads: usize,
    pub pooling: Pooling,
    /// Prefix prepended to a query and a document, when the model wants one.
    pub query_prefix: &'static str,
    pub document_prefix: &'static str,
    /// Approximate download size (model + tokenizer), for the Settings copy.
    pub download_bytes: u64,
    /// Pre-selects this model in the UI as the best default for its size.
    pub recommended: bool,
    /// Covers many languages, at the cost of a larger download.
    pub multilingual: bool,
}

const MB: u64 = 1024 * 1024;

/// Every local model, in the order the Settings dropdown shows them: the
/// lightest English models first, the multilingual ones last.
pub const LOCAL_MODELS: [OnnxEmbedderConfig; 5] = [
    OnnxEmbedderConfig {
        model_id: "Xenova/all-MiniLM-L6-v2",
        id: "onnx:minilm-l6",
        hf_file: "onnx/model_quantized.onnx",
        label: "MiniLM-L6",
        dim: 384,
        max_length: 256,
        num_threads: 2,
        pooling: Pooling::Mean,
        query_prefix: "",
        document_prefix: "",
        download_bytes: 23 * MB,
        recommended: false,
        multilingual: false,
    },
    OnnxEmbedderConfig {
        model_id: "TaylorAI/bge-micro-v2",
        id: "onnx:bge-micro-v2",
        hf_file: "onnx/model_quantized.onnx",
        label: "BGE micro v2",
        dim: 384,
        max_length: 512,
        num_threads: 2,
        pooling: Pooling::Mean,
        query_prefix: "",
        document_prefix: "",
        download_bytes: 18 * MB,
        recommended: false,
        multilingual: false,
    },
    OnnxEmbedderConfig {
        model_id: "Xenova/bge-small-en-v1.5",
        id: "onnx:bge-small-en-v1.5",
        hf_file: "onnx/model_quantized.onnx",
        label: "BGE small v1.5",
        dim: 384,
        max_length: 512,
        num_threads: 2,
        pooling: Pooling::Cls,
        query_prefix: "Represent this sentence for searching relevant passages: ",
        document_prefix: "",
        download_bytes: 35 * MB,
        recommended: true,
        multilingual: false,
    },
    OnnxEmbedderConfig {
        model_id: "Xenova/multilingual-e5-small",
        id: "onnx:multilingual-e5-small",
        hf_file: "onnx/model_quantized.onnx",
        label: "Multilingual E5 small",
        dim: 384,
        max_length: 512,
        num_threads: 2,
        pooling: Pooling::Mean,
        query_prefix: "query: ",
        document_prefix: "passage: ",
        download_bytes: 135 * MB,
        recommended: false,
        multilingual: true,
    },
    OnnxEmbedderConfig {
        model_id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
        id: "onnx:paraphrase-multilingual-minilm-l12",
        hf_file: "onnx/model_quantized.onnx",
        label: "Paraphrase multilingual MiniLM-L12",
        dim: 384,
        max_length: 256,
        num_threads: 2,
        pooling: Pooling::Mean,
        query_prefix: "",
        document_prefix: "",
        download_bytes: 136 * MB,
        recommended: false,
        multilingual: true,
    },
];

/// Every model, for `memory_embedders`.
pub fn all() -> &'static [OnnxEmbedderConfig] {
    &LOCAL_MODELS
}

/// The config for a stored `onnx:…` id, or `None` when the id is unknown.
pub fn config_for(id: &str) -> Option<OnnxEmbedderConfig> {
    LOCAL_MODELS.iter().copied().find(|model| model.id == id)
}

/// The model a status check or download defaults to when the caller names none.
pub fn default_model() -> OnnxEmbedderConfig {
    LOCAL_MODELS[0]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_prefixed() {
        let mut ids: Vec<&str> = all().iter().map(|model| model.id).collect();
        let count = ids.len();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), count, "model ids must be unique");
        assert!(all().iter().all(|model| model.id.starts_with("onnx:")));
    }

    #[test]
    fn every_model_downloads_a_quantized_file() {
        for model in all() {
            assert!(
                model.hf_file.contains("quantized"),
                "{} must point at a quantized export so the UI size is honest",
                model.id
            );
            assert!(model.dim > 0 && model.max_length > 0);
            assert!(model.download_bytes >= 10 * MB);
        }
    }

    #[test]
    fn config_for_resolves_and_defaults_to_minilm() {
        assert_eq!(
            config_for("onnx:bge-small-en-v1.5").map(|model| model.dim),
            Some(384)
        );
        assert!(config_for("onnx:nope").is_none());
        assert_eq!(default_model().id, "onnx:minilm-l6");
    }

    /// Only E5 prefixes text; a prefix applied to MiniLM would corrupt vectors.
    #[test]
    fn prefixes_are_set_only_where_required() {
        let e5 = config_for("onnx:multilingual-e5-small").expect("e5");
        assert_eq!(e5.query_prefix, "query: ");
        assert_eq!(e5.document_prefix, "passage: ");
        let minilm = config_for("onnx:minilm-l6").expect("minilm");
        assert_eq!(minilm.query_prefix, "");
        assert_eq!(minilm.document_prefix, "");
    }

    #[test]
    fn bge_small_uses_cls_pooling() {
        assert_eq!(
            config_for("onnx:bge-small-en-v1.5").map(|model| model.pooling),
            Some(Pooling::Cls)
        );
    }
}
