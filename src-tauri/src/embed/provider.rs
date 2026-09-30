//! Provider embedder: an OpenAI-compatible `/embeddings` call
//! (docs/design/constella-features.md #D3).
//!
//! Deliberately **not** the SSE chat provider: embeddings are one JSON request
//! and one JSON response, so folding them into the streaming stack would add a
//! branch to code whose whole shape is "stream". It reuses only the base-URL
//! normaliser and the error reader.
//!
//! Anthropic has no embeddings endpoint, so provider embedding is
//! OpenAI-compatible only; the UI offers provider embedding under that provider.

use crate::ai::provider::{normalize_base_url, read_error_body};
use crate::embed::{normalize, EmbedError, EmbedResult, Embedder};

/// The prefix on an id, so a stored model string can be turned back into a model.
pub const PROVIDER_PREFIX: &str = "provider:";

/// An embedder backed by a user's OpenAI-compatible endpoint.
pub struct ProviderEmbedder {
    model: String,
    base_url: String,
    api_key: String,
    dim: usize,
    client: reqwest::Client,
}

impl ProviderEmbedder {
    pub fn new(model: String, base_url: String, api_key: String, dim: usize) -> Self {
        Self {
            model,
            base_url: normalize_base_url(&base_url),
            api_key,
            dim,
            client: reqwest::Client::new(),
        }
    }

    fn endpoint(&self) -> String {
        let base = self.base_url.trim_end_matches('/');
        format!("{base}/embeddings")
    }
}

impl Embedder for ProviderEmbedder {
    fn id(&self) -> &str {
        &self.model
    }

    fn dim(&self) -> usize {
        self.dim
    }

    fn embed(&self, texts: &[String]) -> EmbedResult<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        if self.api_key.trim().is_empty() {
            return Err(EmbedError::Config(
                "an API key is required for provider embeddings".into(),
            ));
        }

        let body = serde_json::json!({
            "model": self.model,
            "input": texts,
        });

        // reqwest is async: block on the small runtime the command layer owns.
        let response = tauri::async_runtime::block_on(async {
            self.client
                .post(self.endpoint())
                .bearer_auth(&self.api_key)
                .json(&body)
                .send()
                .await
        })
        .map_err(|error| EmbedError::Network(error.to_string()))?;

        if !response.status().is_success() {
            let message = tauri::async_runtime::block_on(read_error_body(response));
            return Err(EmbedError::Provider(message));
        }

        let payload: serde_json::Value = tauri::async_runtime::block_on(response.json())
            .map_err(|error| EmbedError::Provider(format!("could not read response: {error}")))?;

        parse_embeddings(&payload, texts.len(), self.dim)
    }
}

/// Parses `{ data: [{ embedding: [...] }, ...] }`, ordered by `index`.
///
/// Exposed for tests: a provider that reorders or omits entries must not
/// silently mis-assign vectors to entities.
pub fn parse_embeddings(
    payload: &serde_json::Value,
    expected: usize,
    dim: usize,
) -> EmbedResult<Vec<Vec<f32>>> {
    let data = payload
        .get("data")
        .and_then(|value| value.as_array())
        .ok_or_else(|| EmbedError::Provider("response has no `data` array".into()))?;

    let mut ordered: Vec<(usize, Vec<f32>)> = Vec::with_capacity(data.len());
    for (position, entry) in data.iter().enumerate() {
        let index = entry
            .get("index")
            .and_then(|value| value.as_u64())
            .map(|value| value as usize)
            .unwrap_or(position);
        let embedding = entry
            .get("embedding")
            .and_then(|value| value.as_array())
            .ok_or_else(|| EmbedError::Provider(format!("entry {index} has no `embedding`")))?;
        let vec: Vec<f32> = embedding
            .iter()
            .map(|value| value.as_f64().unwrap_or(0.0) as f32)
            .collect();
        ordered.push((index, vec));
    }

    ordered.sort_by_key(|(index, _)| *index);
    let mut out: Vec<Vec<f32>> = ordered.into_iter().map(|(_, vec)| vec).collect();

    if out.len() != expected {
        return Err(EmbedError::Provider(format!(
            "expected {expected} embeddings, got {}",
            out.len()
        )));
    }

    for vec in out.iter_mut() {
        if vec.len() != dim {
            return Err(EmbedError::Provider(format!(
                "expected {dim}-dimensional vectors, got {}",
                vec.len()
            )));
        }
        normalize(vec);
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_orders_by_index() {
        let payload = serde_json::json!({
            "data": [
                { "index": 1, "embedding": [0.0, 1.0] },
                { "index": 0, "embedding": [1.0, 0.0] },
            ]
        });
        let out = parse_embeddings(&payload, 2, 2).expect("parse");
        assert_eq!(out[0][0], 1.0);
        assert_eq!(out[1][1], 1.0);
    }

    #[test]
    fn mismatched_count_is_an_error() {
        let payload = serde_json::json!({ "data": [{ "index": 0, "embedding": [1.0] }] });
        assert!(parse_embeddings(&payload, 2, 1).is_err());
    }

    #[test]
    fn mismatched_dimension_is_an_error() {
        let payload = serde_json::json!({ "data": [{ "index": 0, "embedding": [1.0, 2.0] }] });
        assert!(parse_embeddings(&payload, 1, 3).is_err());
    }

    #[test]
    fn missing_data_is_an_error() {
        let payload = serde_json::json!({ "error": "nope" });
        assert!(parse_embeddings(&payload, 0, 2).is_err());
    }

    #[test]
    fn vectors_are_normalised() {
        let payload = serde_json::json!({ "data": [{ "index": 0, "embedding": [3.0, 4.0] }] });
        let out = parse_embeddings(&payload, 1, 2).expect("parse");
        let magnitude: f32 = out[0].iter().map(|value| value * value).sum::<f32>().sqrt();
        assert!((magnitude - 1.0).abs() < 1e-6);
    }
}
