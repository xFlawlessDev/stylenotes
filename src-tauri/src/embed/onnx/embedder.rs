//! Local ONNX sentence embedder with mean or CLS pooling.
//!
//! Mirrors `OnnxCrossEncoder`'s shape (tokenize -> run -> post-process), but
//! pools the token embeddings into one vector per text instead of scoring a
//! pair. The model is a sentence-transformers export on the HF Hub; the ONNX
//! Runtime dylib is discovered next to the executable.
//!
//! The model's recipe — the quantized file, its pooling mode, and any query or
//! passage prefix — lives in `embed::models`; this type only applies it.

use std::path::PathBuf;

use super::cache::ModelCache;
use super::runtime::{build_session, tensor_i64, OnnxError, OnnxResult};
use crate::embed::models::{EmbedKind, OnnxEmbedderConfig, Pooling};

/// Mean- or CLS-pooled ONNX sentence embedder. `&mut self` for inference, as the
/// ONNX session requires; callers wrap it in a `Mutex`.
pub struct OnnxEmbedder {
    config: OnnxEmbedderConfig,
    session: ort::session::Session,
    tokenizer: tokenizers::Tokenizer,
    use_token_type_ids: bool,
}

impl OnnxEmbedder {
    /// Loads or downloads the model, then opens a session.
    pub fn load(config: OnnxEmbedderConfig, cache: &ModelCache) -> OnnxResult<Self> {
        let cached = cache.get_or_download(config.model_id, config.hf_file, |_, _, _| {})?;

        let mut tokenizer = tokenizers::Tokenizer::from_file(&cached.tokenizer_path)
            .map_err(|error| OnnxError::Tokenizer(error.to_string()))?;
        tokenizer.with_padding(Some(tokenizers::PaddingParams {
            strategy: tokenizers::PaddingStrategy::BatchLongest,
            ..Default::default()
        }));
        tokenizer
            .with_truncation(Some(tokenizers::TruncationParams {
                max_length: config.max_length,
                ..Default::default()
            }))
            .map_err(|error| OnnxError::Tokenizer(error.to_string()))?;

        let session = build_session(config.id, &cached.model_path, config.num_threads)?;
        let use_token_type_ids = session
            .inputs()
            .iter()
            .any(|input| input.name() == "token_type_ids");

        Ok(Self {
            config,
            session,
            tokenizer,
            use_token_type_ids,
        })
    }

    /// Embeds texts as a query or a document, applying the model's prefixes.
    ///
    /// The distinction is caller-visible because it changes the vector for E5:
    /// a query embedded as a document is a different point in the space, so the
    /// asymmetric `query:`/`passage:` recipe has to be preserved on both sides
    /// of a comparison. Documents are the index; queries are lookup keys.
    pub fn embed_as(&mut self, texts: &[String], kind: EmbedKind) -> OnnxResult<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        let prefix = match kind {
            EmbedKind::Query => self.config.query_prefix,
            EmbedKind::Document => self.config.document_prefix,
        };
        let prefixed: Vec<String> = texts.iter().map(|text| format!("{prefix}{text}")).collect();
        self.embed_prefixed(&prefixed)
    }

    /// Tokenizes, runs the session and pools. No prefixing happens here.
    fn embed_prefixed(&mut self, texts: &[String]) -> OnnxResult<Vec<Vec<f32>>> {
        let encodings = self
            .tokenizer
            .encode_batch(texts.to_vec(), true)
            .map_err(|error| OnnxError::Tokenizer(error.to_string()))?;

        let batch = encodings.len();
        let seq_len = encodings
            .iter()
            .map(|encoding| encoding.get_ids().len())
            .max()
            .unwrap_or(0);
        if seq_len == 0 {
            return Ok(vec![vec![0.0; self.config.dim]; batch]);
        }

        let mut input_ids = Vec::with_capacity(batch * seq_len);
        let mut attention_mask = Vec::with_capacity(batch * seq_len);
        let mut token_type_ids = Vec::with_capacity(batch * seq_len);
        for encoding in &encodings {
            let ids = encoding.get_ids();
            let mask = encoding.get_attention_mask();
            let types = encoding.get_type_ids();
            for i in 0..seq_len {
                input_ids.push(ids.get(i).copied().unwrap_or(0) as i64);
                attention_mask.push(mask.get(i).copied().unwrap_or(0) as i64);
                token_type_ids.push(types.get(i).copied().unwrap_or(0) as i64);
            }
        }

        let shape = [batch, seq_len];
        let ids = tensor_i64("input_ids", shape, input_ids)?;
        // Keep the mask for pooling: the tensor constructor takes ownership, and
        // pooling must skip padded positions, so the values are needed twice.
        let mask = tensor_i64("attention_mask", shape, attention_mask.clone())?;

        let outputs = if self.use_token_type_ids {
            let types = tensor_i64("token_type_ids", shape, token_type_ids)?;
            self.session
                .run(ort::inputs![
                    "input_ids" => ids,
                    "attention_mask" => mask,
                    "token_type_ids" => types
                ])
                .map_err(|error| OnnxError::Inference {
                    label: self.config.id.to_string(),
                    detail: error.to_string(),
                })?
        } else {
            self.session
                .run(ort::inputs![
                    "input_ids" => ids,
                    "attention_mask" => mask
                ])
                .map_err(|error| OnnxError::Inference {
                    label: self.config.id.to_string(),
                    detail: error.to_string(),
                })?
        };

        let output_name = outputs
            .keys()
            .next()
            .ok_or_else(|| OnnxError::OutputMissing {
                label: self.config.id.to_string(),
            })?
            .to_string();
        let tensor = &outputs[output_name.as_str()];
        let array = tensor
            .try_extract_array::<f32>()
            .map_err(|error| OnnxError::Inference {
                label: self.config.id.to_string(),
                detail: error.to_string(),
            })?;

        // Shape is [batch, seq_len, dim]; pool over the token axis.
        let values: Vec<f32> = array.iter().copied().collect();
        let dim = self.config.dim;
        let pooling = self.config.pooling;
        let mut out = Vec::with_capacity(batch);
        for row in 0..batch {
            let mut pooled = vec![0.0_f32; dim];
            match pooling {
                Pooling::Cls => {
                    let offset = row * seq_len * dim;
                    for (slot, value) in pooled.iter_mut().enumerate() {
                        *value = values.get(offset + slot).copied().unwrap_or(0.0);
                    }
                }
                Pooling::Mean => {
                    let mut count = 0.0_f32;
                    for token in 0..seq_len {
                        if attention_mask[row * seq_len + token] == 0 {
                            continue;
                        }
                        let offset = (row * seq_len + token) * dim;
                        for (slot, value) in pooled.iter_mut().enumerate() {
                            *value += values.get(offset + slot).copied().unwrap_or(0.0);
                        }
                        count += 1.0;
                    }
                    if count > 0.0 {
                        for value in pooled.iter_mut() {
                            *value /= count;
                        }
                    }
                }
            }
            crate::embed::normalize(&mut pooled);
            out.push(pooled);
        }
        Ok(out)
    }
}

/// The app data directory a downloaded model lives under.
pub fn models_dir(app_data_dir: &std::path::Path) -> PathBuf {
    app_data_dir.join("models")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::embed::models;

    #[test]
    fn default_config_is_minilm_384() {
        let config = models::default_model();
        assert_eq!(config.dim, 384);
        assert_eq!(config.id, "onnx:minilm-l6");
    }

    #[test]
    fn models_dir_sits_under_app_data() {
        let dir = models_dir(std::path::Path::new("/tmp/app"));
        assert!(dir.ends_with("models"));
    }

    /// End-to-end proof that the local models actually run: loads a real model
    /// (downloading it first) and embeds a batch. Runs against the recommended
    /// model, so a broken recommendation is caught here rather than in the UI.
    ///
    /// Ignored by default because it needs the ONNX Runtime dylib and a model
    /// download, neither of which belongs in an ordinary test run. Run it with:
    /// `cargo test --features local-embed -- --ignored onnx_embeds_for_real`.
    #[test]
    #[ignore = "requires the ONNX Runtime dylib and a model download"]
    fn onnx_embeds_for_real() {
        let cache_dir = std::env::temp_dir().join("stylenotes-onnx-test-models");
        let cache = ModelCache::new(&cache_dir);
        let config = models::all()
            .iter()
            .copied()
            .find(|model| model.recommended)
            .expect("a recommended model");
        let mut embedder = OnnxEmbedder::load(config, &cache).expect("model loads");

        let texts = vec![
            "How does vector search retrieve documents?".to_string(),
            "Retrieval by meaning using embeddings and cosine similarity.".to_string(),
            "A recipe for banana bread with walnuts.".to_string(),
        ];
        let vectors = embedder
            .embed_as(&texts, EmbedKind::Document)
            .expect("embedding runs");
        assert_eq!(vectors.len(), 3);
        assert_eq!(vectors[0].len(), config.dim);

        // The two related sentences must be closer than the unrelated one. This
        // is the property the whole feature rests on; if it fails, the model is
        // wrong and nothing downstream can be trusted.
        let near = crate::embed::vector::cosine(&vectors[0], &vectors[1]).expect("cosine");
        let far = crate::embed::vector::cosine(&vectors[0], &vectors[2]).expect("cosine");
        assert!(
            near > far + 0.1,
            "related pair ({near:.3}) should clearly beat unrelated ({far:.3})"
        );

        let _ = std::fs::remove_dir_all(&cache_dir);
    }
}
