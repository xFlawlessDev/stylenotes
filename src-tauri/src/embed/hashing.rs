//! Offline baseline embedder (docs/design/constella-features.md #D2 option C).
//!
//! A signed, L2-normalised bag of character trigrams. It is **lexical, not
//! semantic** - the design explicitly warns against presenting this as meaning
//! retrieval. It exists so the whole pipeline is exercisable with zero setup
//! and in CI. `ProviderEmbedder` and `OnnxEmbedder` are the real recall paths.
//!
//! This must stay bit-compatible with `hashingEmbed` in `content/embeddings.ts`
//! (same FNV-1a, same sign rule, same sublinear weighting), so a vector produced
//! on either side lands in the same place.

use crate::embed::{EmbedError, EmbedResult, Embedder};

pub const HASHING_EMBEDDER_ID: &str = "hashing:trigram-v1";
pub const HASHING_DIM: usize = 384;
const HASH_GRAM: usize = 3;

/// FNV-1a 32-bit, matching the TS `bucket` helper.
fn bucket(s: &str, modulus: usize) -> usize {
    let mut hash: u32 = 0x811c_9dc5;
    for byte in s.chars() {
        let mut buf = [0_u8; 4];
        for unit in byte.encode_utf8(&mut buf).bytes() {
            hash ^= u32::from(unit);
            hash = hash.wrapping_mul(0x0100_0193);
        }
    }
    (hash as usize) % modulus
}

/// The offline baseline. Deterministic across runs and platforms.
pub struct HashingEmbedder {
    dim: usize,
}

impl Default for HashingEmbedder {
    fn default() -> Self {
        Self { dim: HASHING_DIM }
    }
}

impl HashingEmbedder {
    pub fn new(dim: usize) -> Self {
        Self { dim }
    }

    fn embed_one(&self, text: &str) -> Vec<f32> {
        let mut vec = vec![0.0_f32; self.dim];
        let normalized = format!(
            " {} ",
            text.to_lowercase()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        );
        if normalized.trim().is_empty() {
            return vec;
        }
        let chars: Vec<char> = normalized.chars().collect();
        if chars.len() >= HASH_GRAM {
            for window in chars.windows(HASH_GRAM) {
                let gram: String = window.iter().collect();
                let slot = bucket(&gram, self.dim);
                let sign = if bucket(&format!("#{gram}"), 2) == 0 {
                    1.0
                } else {
                    -1.0
                };
                vec[slot] += sign;
            }
        }
        for value in vec.iter_mut() {
            *value = value.signum() * value.abs().sqrt();
        }
        crate::embed::normalize(&mut vec);
        vec
    }
}

impl Embedder for HashingEmbedder {
    fn id(&self) -> &str {
        HASHING_EMBEDDER_ID
    }

    fn dim(&self) -> usize {
        self.dim
    }

    fn embed(&self, texts: &[String]) -> EmbedResult<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        if self.dim == 0 {
            return Err(EmbedError::Config("hashing dim must be positive".into()));
        }
        Ok(texts.iter().map(|text| self.embed_one(text)).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_text_yields_identical_vectors() {
        let embedder = HashingEmbedder::default();
        let a = embedder.embed(&["hello world".to_string()]).expect("embed");
        let b = embedder.embed(&["hello world".to_string()]).expect("embed");
        assert_eq!(a, b);
    }

    #[test]
    fn vectors_are_unit_length() {
        let embedder = HashingEmbedder::default();
        let vec = &embedder
            .embed(&["a fairly ordinary sentence".to_string()])
            .expect("embed")[0];
        let magnitude: f32 = vec.iter().map(|value| value * value).sum::<f32>().sqrt();
        assert!((magnitude - 1.0).abs() < 1e-5);
    }

    /// Lexical overlap should win: a shared topic scores higher than an
    /// unrelated sentence. This is the behaviour the baseline actually offers,
    /// so it is asserted rather than assumed.
    #[test]
    fn overlapping_text_scores_higher_than_unrelated() {
        let embedder = HashingEmbedder::default();
        let base = embedder
            .embed(&["vector database retrieval notes".to_string()])
            .expect("embed");
        let near = embedder
            .embed(&["retrieval from a vector database".to_string()])
            .expect("embed");
        let far = embedder
            .embed(&["banana bread recipe with walnuts".to_string()])
            .expect("embed");
        let near_score = crate::embed::vector::cosine(&base[0], &near[0]).expect("cosine");
        let far_score = crate::embed::vector::cosine(&base[0], &far[0]).expect("cosine");
        assert!(
            near_score > far_score,
            "near {near_score} should beat far {far_score}"
        );
    }

    #[test]
    fn blank_text_is_the_zero_vector() {
        let embedder = HashingEmbedder::default();
        let vec = &embedder.embed(&["   ".to_string()]).expect("embed")[0];
        assert!(vec.iter().all(|value| *value == 0.0));
    }
}
