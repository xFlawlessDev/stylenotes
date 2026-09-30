//! Vector similarity for the semantic memory index
//! (docs/design/constella-features.md #D5).
//!
//! The *codec* lives in TS (`content/embeddings.ts`, decision #4: the frontend
//! composes text and owns the byte layout), so this module holds only the
//! cosine Rust needs for `memory_cosine` and the ONNX pooling helper.

/// Cosine similarity of two equal-length vectors, or `None` on a length
/// mismatch. Zero-magnitude input yields `None` rather than a division by zero.
pub fn cosine(a: &[f32], b: &[f32]) -> Option<f32> {
    if a.len() != b.len() || a.is_empty() {
        return None;
    }
    let mut dot = 0.0_f32;
    let mut mag_a = 0.0_f32;
    let mut mag_b = 0.0_f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        mag_a += a[i] * a[i];
        mag_b += b[i] * b[i];
    }
    let denom = mag_a.sqrt() * mag_b.sqrt();
    if denom == 0.0 {
        None
    } else {
        Some(dot / denom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cosine_is_one_for_identical_vectors() {
        let value = cosine(&[1.0, 2.0, 3.0], &[1.0, 2.0, 3.0]).expect("cosine");
        assert!((value - 1.0).abs() < 1e-6);
    }

    #[test]
    fn cosine_is_zero_for_orthogonal_vectors() {
        let value = cosine(&[1.0, 0.0], &[0.0, 1.0]).expect("cosine");
        assert!(value.abs() < 1e-6);
    }

    #[test]
    fn cosine_rejects_mismatched_lengths_and_zero_vectors() {
        assert!(cosine(&[1.0], &[1.0, 2.0]).is_none());
        assert!(cosine(&[0.0, 0.0], &[1.0, 1.0]).is_none());
    }
}
