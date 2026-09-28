//! Streaming chat providers for the AI assistant.
//!
//! Two implementations share one contract: `openai-compatible` (OpenAI,
//! OpenRouter, Ollama, LM Studio, gateways) and `anthropic-native` (Messages
//! API). Both emit a uniform [`StreamEvent`] stream so the command layer and
//! the UI never branch on the provider.

mod anthropic;
mod openai;

use futures_util::stream::BoxStream;

use crate::ai::types::{AiError, ChatMessage, ProviderConfig, StreamEvent};

/// A streaming chat backend.
pub trait ChatProvider: Send + Sync {
    fn stream<'a>(
        &'a self,
        config: &'a ProviderConfig,
        messages: Vec<ChatMessage>,
    ) -> BoxStream<'a, Result<StreamEvent, AiError>>;
}

/// Selects the implementation for a config's provider.
pub fn provider_for(config: &ProviderConfig) -> Box<dyn ChatProvider> {
    match config.provider {
        crate::ai::types::ProviderId::OpenaiCompatible => Box::new(openai::OpenAiProvider::new()),
        crate::ai::types::ProviderId::AnthropicNative => {
            Box::new(anthropic::AnthropicProvider::new())
        }
    }
}

/// Strips trailing slashes so `{base}/chat/completions` never double-slashes.
pub(crate) fn normalize_base_url(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        "https://api.openai.com/v1".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Reads an error body, trimmed, for a provider HTTP failure.
pub(crate) async fn read_error_body(response: reqwest::Response) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let body = body.trim();
    let preview: String = body.chars().take(500).collect();
    if preview.is_empty() {
        format!("provider error {status}")
    } else {
        format!("provider error {status}: {preview}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_trims_trailing_slashes() {
        assert_eq!(normalize_base_url("https://x/v1/"), "https://x/v1");
        assert_eq!(normalize_base_url("https://x/v1"), "https://x/v1");
    }

    #[test]
    fn normalize_falls_back_when_blank() {
        assert_eq!(normalize_base_url("  "), "https://api.openai.com/v1");
    }
}
