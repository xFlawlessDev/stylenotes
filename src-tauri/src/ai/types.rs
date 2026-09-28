//! Types shared by the AI gateway commands and the streaming providers.
//!
//! Mirrors `src/lib/content/ai-types.ts`; the field names are the IPC contract.

use serde::{Deserialize, Serialize};

/// Provider families the gateway can drive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderId {
    OpenaiCompatible,
    AnthropicNative,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
    /// A tool result, answering a prior assistant `tool_calls` entry.
    Tool,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::System => "system",
            Role::User => "user",
            Role::Assistant => "assistant",
            Role::Tool => "tool",
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
    /// Assistant turns that requested tools, echoed back on the next request.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ToolCall>,
    /// Set on `tool` turns: the call this message answers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    /// A plain text turn with no tool traffic.
    pub fn text(role: Role, content: impl Into<String>) -> Self {
        Self {
            role,
            content: content.into(),
            tool_calls: Vec::new(),
            tool_call_id: None,
        }
    }
}

/// What the assistant is being asked to do; selects the system prompt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Task {
    Chat,
    Summarize,
    Rewrite,
    Continue,
    Custom,
    /// Names a chat thread from its opening exchange.
    Title,
}

/// Full configuration the provider needs for one call. The API key is
/// decrypted just-in-time and never persisted in this struct.
///
/// `camelCase` on the wire: Tauri only auto-converts command *argument* names,
/// not nested struct fields, and the TS contract (`ProviderConfig` equivalent
/// in `ai-types.ts`) is camelCase.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub provider: ProviderId,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub temperature: f64,
    pub max_tokens: i64,
    /// Tool definitions in OpenAI function-call shape, forwarded verbatim.
    #[serde(default)]
    pub tools: Vec<serde_json::Value>,
}

/// One tool call the model asked for, reassembled from streamed deltas.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    /// Raw JSON string of the arguments; the caller parses it.
    pub arguments: String,
}

/// A single streamed event. Serialised to the frontend as
/// `{ kind, requestId, ... }`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum StreamEvent {
    Start,
    Delta {
        text: String,
    },
    /// The model wants to call a tool. Emitted once per call, fully assembled.
    ToolCall {
        call: ToolCall,
    },
    Done {
        finish_reason: String,
    },
}

/// Errors surfaced across the IPC boundary as strings.
#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("{0}")]
    Config(String),
    #[error("{0}")]
    Provider(String),
    #[error("{0}")]
    Decrypt(String),
    #[error("{0}")]
    Network(String),
}

pub type AiResult<T> = Result<T, AiError>;

#[cfg(test)]
mod tests {
    use super::*;

    /// The frontend sends camelCase; Tauri does not rewrite nested fields, so
    /// this guards the one contract that caused a "missing field base_url"
    /// error before `rename_all` was added.
    #[test]
    fn provider_config_deserializes_the_frontend_shape() {
        let json = serde_json::json!({
            "provider": "openai-compatible",
            "baseUrl": "https://api.openai.com/v1",
            "model": "gpt-4o-mini",
            "apiKey": "sk-test",
            "temperature": 0.7,
            "maxTokens": 1024
        });

        let config: ProviderConfig = serde_json::from_value(json).expect("camelCase config");
        assert_eq!(config.base_url, "https://api.openai.com/v1");
        assert_eq!(config.api_key, "sk-test");
        assert_eq!(config.max_tokens, 1024);
        assert_eq!(config.provider, ProviderId::OpenaiCompatible);
    }

    #[test]
    fn provider_id_uses_kebab_case() {
        let openai: ProviderId = serde_json::from_str("\"openai-compatible\"").expect("openai");
        let anthropic: ProviderId =
            serde_json::from_str("\"anthropic-native\"").expect("anthropic");
        assert_eq!(openai, ProviderId::OpenaiCompatible);
        assert_eq!(anthropic, ProviderId::AnthropicNative);
    }

    /// The frontend sends `toolCalls`/`toolCallId` in camelCase. Missing the
    /// rename made a `tool` turn lose its id and the provider rejected the
    /// follow-up with "tool message requires tool_call_id".
    #[test]
    fn chat_message_round_trips_the_frontend_tool_shape() {
        let json = serde_json::json!({
            "role": "tool",
            "content": "{\"ok\":true}",
            "toolCallId": "call_1"
        });
        let message: ChatMessage = serde_json::from_value(json).expect("tool message");
        assert_eq!(message.tool_call_id.as_deref(), Some("call_1"));

        let assistant = serde_json::json!({
            "role": "assistant",
            "content": "",
            "toolCalls": [{ "id": "call_1", "name": "list_notes", "arguments": "{}" }]
        });
        let message: ChatMessage = serde_json::from_value(assistant).expect("assistant message");
        assert_eq!(message.tool_calls.len(), 1);
        assert_eq!(message.tool_calls[0].name, "list_notes");
    }
}
