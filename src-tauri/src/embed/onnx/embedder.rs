//! Local ONNX sentence embedder with mean pooling.
//!
//! Mirrors `OnnxCrossEncoder`'s shape (tokenize -> run -> post-process), but
//! pools the token embeddings into one vector per text instead of scoring a
//! pair. The model is a sentence-transformers export on the HF Hub; the ONNX
//! Runtime dylib is discovered next to the executable.

use std::path::PathBuf;

use super::cache::ModelCache;
use super::runtime::{build_session, tensor_i64, OnnxError, OnnxResult};

/// A sentence-embedding model the app knows how to run.
#[derive(Debug, Clone)]
pub struct OnnxEmbedderConfig {
    /// HF Hub id, e.g. `sentence-transformers/all-MiniLM-L6-v2`.
    pub model_id: String,
    /// The id written alongside vectors, e.g. `onnx:minilm-l6`.
    pub id: String,
    pub dim: usize,
    pub max_length: usize,
    pub num_threads: usize,
}

impl OnnxEmbedderConfig {
    /// MiniLM-L6: small, fast, 384-dim — the design's suggested default.
    pub fn minilm_l6() -> Self {
        Self {
            model_id: "sentence-transformers/all-MiniLM-L6-v2".to_string(),
            id: "onnx:minilm-l6".to_string(),
            dim: 384,
            max_length: 256,
            num_threads: 2,
        }
    }
}

/// Mean-pooled ONNX sentence embedder. `&mut self` for inference, as the ONNX
/// session requires; callers wrap it in a `Mutex`.
pub struct OnnxEmbedder {
    config: OnnxEmbedderConfig,
    session: ort::session::Session,
    tokenizer: tokenizers::Tokenizer,
    use_token_type_ids: bool,
}

impl OnnxEmbedder {
    /// Loads or downloads the model, then opens a session.
    pub fn load(config: OnnxEmbedderConfig, cache: &ModelCache) -> OnnxResult<Self> {
        let cached = cache.get_or_download(&config.model_id, |_, _, _| {})?;

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

        let session = build_session(&config.id, &cached.model_path, config.num_threads)?;
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

    /// Embeds one batch, mean-pooling over real tokens (masked positions only,
    /// so padding never dilutes the vector).
    pub fn embed(&mut self, texts: &[String]) -> OnnxResult<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
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
                    label: self.config.id.clone(),
                    detail: error.to_string(),
                })?
        } else {
            self.session
                .run(ort::inputs![
                    "input_ids" => ids,
                    "attention_mask" => mask
                ])
                .map_err(|error| OnnxError::Inference {
                    label: self.config.id.clone(),
                    detail: error.to_string(),
                })?
        };

        let output_name = outputs
            .keys()
            .next()
            .ok_or_else(|| OnnxError::OutputMissing {
                label: self.config.id.clone(),
            })?
            .to_string();
        let tensor = &outputs[output_name.as_str()];
        let array = tensor
            .try_extract_array::<f32>()
            .map_err(|error| OnnxError::Inference {
                label: self.config.id.clone(),
                detail: error.to_string(),
            })?;

        // Shape is [batch, seq_len, dim]; pool over the token axis.
        let values: Vec<f32> = array.iter().copied().collect();
        let mut out = Vec::with_capacity(batch);
        for row in 0..batch {
            let mut pooled = vec![0.0_f32; self.config.dim];
            let mut count = 0.0_f32;
            for token in 0..seq_len {
                if attention_mask[row * seq_len + token] == 0 {
                    continue;
                }
                let offset = (row * seq_len + token) * self.config.dim;
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

    #[test]
    fn default_config_is_minilm_384() {
        let config = OnnxEmbedderConfig::minilm_l6();
        assert_eq!(config.dim, 384);
        assert_eq!(config.id, "onnx:minilm-l6");
    }

    #[test]
    fn models_dir_sits_under_app_data() {
        let dir = models_dir(std::path::Path::new("/tmp/app"));
        assert!(dir.ends_with("models"));
    }

    /// End-to-end proof that the local model actually runs: loads the real
    /// model (downloading it first) and embeds a batch.
    ///
    /// Ignored by default because it needs the ONNX Runtime dylib and a ~23 MB
    /// download, neither of which belongs in an ordinary test run. Run it with:
    /// `cargo test --features local-embed -- --ignored onnx_embeds_for_real`.
    #[test]
    #[ignore = "requires the ONNX Runtime dylib and a model download"]
    fn onnx_embeds_for_real() {
        let cache_dir = std::env::temp_dir().join("stylenotes-onnx-test-models");
        let cache = ModelCache::new(&cache_dir);
        let config = OnnxEmbedderConfig::minilm_l6();
        let mut embedder = OnnxEmbedder::load(config, &cache).expect("model loads");

        let texts = vec![
            "How does vector search retrieve documents?".to_string(),
            "Retrieval by meaning using embeddings and cosine similarity.".to_string(),
            "A recipe for banana bread with walnuts.".to_string(),
        ];
        let vectors = embedder.embed(&texts).expect("embedding runs");
        assert_eq!(vectors.len(), 3);
        assert_eq!(vectors[0].len(), 384);

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
