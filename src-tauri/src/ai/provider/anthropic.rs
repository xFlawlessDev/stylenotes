//! Anthropic Messages API streaming provider.
//!
//! Differences from OpenAI that matter here: the system prompt is a top-level
//! `system` field (not a message), `max_tokens` is required, and streaming
//! events are typed (`content_block_delta` carries `delta.text`).

use futures_util::stream::BoxStream;
use futures_util::StreamExt;
use std::collections::BTreeMap;

use crate::ai::provider::{normalize_base_url, read_error_body, ChatProvider};
use crate::ai::sse::{parse_data_line, SseLineBuffer};
use crate::ai::types::{AiError, ChatMessage, ProviderConfig, Role, StreamEvent, ToolCall};

pub struct AnthropicProvider {
    client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }
}

impl Default for AnthropicProvider {
    fn default() -> Self {
        Self::new()
    }
}

/// Splits the conversation into Anthropic's top-level `system` string and the
/// remaining turns (system turns are concatenated).
///
/// Tool traffic has to be reshaped: an assistant turn with `tool_calls` becomes
/// a `tool_use` content block, and a `tool` turn becomes a `tool_result` block
/// inside a user turn, which is how the Messages API models tool results.
fn split_system(messages: &[ChatMessage]) -> (String, Vec<serde_json::Value>) {
    let mut system = Vec::new();
    let mut turns: Vec<serde_json::Value> = Vec::new();
    for message in messages {
        match message.role {
            Role::System => system.push(message.content.as_str()),
            Role::Tool => {
                let block = serde_json::json!({
                    "type": "tool_result",
                    "tool_use_id": message.tool_call_id.clone().unwrap_or_default(),
                    "content": message.content,
                });
                // Tool results belong in a user turn; merge into the previous
                // one when it already holds tool results.
                match turns.last_mut() {
                    Some(last)
                        if last.get("role").and_then(|v| v.as_str()) == Some("user")
                            && last.get("content").and_then(|c| c.as_array()).is_some() =>
                    {
                        if let Some(array) = last.get_mut("content").and_then(|c| c.as_array_mut())
                        {
                            array.push(block);
                        }
                    }
                    _ => turns.push(serde_json::json!({
                        "role": "user",
                        "content": [block],
                    })),
                }
            }
            Role::Assistant if !message.tool_calls.is_empty() => {
                let mut blocks = Vec::new();
                if !message.content.trim().is_empty() {
                    blocks.push(serde_json::json!({ "type": "text", "text": message.content }));
                }
                for call in &message.tool_calls {
                    blocks.push(serde_json::json!({
                        "type": "tool_use",
                        "id": call.id,
                        "name": call.name,
                        "input": serde_json::from_str::<serde_json::Value>(&call.arguments)
                            .unwrap_or_else(|_| serde_json::json!({})),
                    }));
                }
                turns.push(serde_json::json!({ "role": "assistant", "content": blocks }));
            }
            _ => turns.push(serde_json::json!({
                "role": message.role.as_str(),
                "content": message.content,
            })),
        }
    }
    (system.join("\n\n"), turns)
}

/// Extracts `delta.text` from a `content_block_delta` event payload.
fn delta_text(payload: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(payload).ok()?;
    if json.get("type")?.as_str()? != "content_block_delta" {
        return None;
    }
    let text = json.get("delta")?.get("text")?.as_str()?;
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

/// Reads the top-level `error.message` Anthropic returns on failure.
fn error_message(payload: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(payload).ok()?;
    if json.get("type")?.as_str()? != "error" {
        return None;
    }
    Some(
        json.get("error")?
            .get("message")
            .and_then(|value| value.as_str())
            .unwrap_or("provider returned an error")
            .to_string(),
    )
}

/// Reads `delta.stop_reason` from a `message_delta` event.
fn finish_reason(payload: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(payload).ok()?;
    if json.get("type")?.as_str()? != "message_delta" {
        return None;
    }
    json.get("delta")?
        .get("stop_reason")?
        .as_str()
        .map(str::to_string)
}

/// Accumulates Anthropic tool-use blocks.
///
/// A block opens with `content_block_start` (`tool_use`, carrying id + name),
/// streams its JSON in `input_json_delta.partial_json`, and closes at
/// `content_block_stop`. Blocks are keyed by `index`.
#[derive(Default)]
struct ToolUseAccumulator {
    blocks: BTreeMap<u64, (String, String, String)>,
}

impl ToolUseAccumulator {
    /// Feeds one SSE payload; returns true once a block has closed.
    fn push(&mut self, payload: &str) -> bool {
        let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) else {
            return false;
        };
        match json.get("type").and_then(|v| v.as_str()) {
            Some("content_block_start") => {
                if let Some(block) = json.get("content_block") {
                    if block.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                        let index = json.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
                        let id = block.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        self.blocks.entry(index).or_default().0 = id.to_string();
                        self.blocks.entry(index).or_default().1 = name.to_string();
                    }
                }
                false
            }
            Some("content_block_delta") => {
                let delta = json.get("delta");
                if delta.and_then(|d| d.get("type")).and_then(|v| v.as_str())
                    != Some("input_json_delta")
                {
                    return false;
                }
                if let Some(fragment) = delta
                    .and_then(|d| d.get("partial_json"))
                    .and_then(|v| v.as_str())
                {
                    let index = json.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
                    self.blocks.entry(index).or_default().2.push_str(fragment);
                }
                false
            }
            Some("content_block_stop") => true,
            _ => false,
        }
    }

    /// Drains the accumulated tool calls in index order.
    fn take(&mut self) -> Vec<ToolCall> {
        std::mem::take(&mut self.blocks)
            .into_iter()
            .filter(|(_, (_, name, _))| !name.trim().is_empty())
            .map(|(_, (id, name, arguments))| ToolCall {
                // Anthropic ids are already unique; fall back to name for safety.
                id: if id.is_empty() { name.clone() } else { id },
                name,
                // An empty block means "no arguments".
                arguments: if arguments.trim().is_empty() {
                    "{}".to_string()
                } else {
                    arguments
                },
            })
            .collect()
    }
}

/// Converts OpenAI `{type:'function', function:{name,description,parameters}}`
/// tool definitions into Anthropic's `{name, description, input_schema}` shape,
/// so the same registry serves both providers.
fn anthropic_tools(tools: &[serde_json::Value]) -> Vec<serde_json::Value> {
    tools
        .iter()
        .filter_map(|tool| {
            let function = tool.get("function")?;
            let name = function.get("name")?.as_str()?;
            Some(serde_json::json!({
                "name": name,
                "description": function
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
                "input_schema": function
                    .get("parameters")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({ "type": "object", "properties": {} })),
            }))
        })
        .collect()
}

impl ChatProvider for AnthropicProvider {
    fn stream<'a>(
        &'a self,
        config: &'a ProviderConfig,
        messages: Vec<ChatMessage>,
    ) -> BoxStream<'a, Result<StreamEvent, AiError>> {
        let endpoint = format!("{}/v1/messages", normalize_base_url(&config.base_url));
        let (system, turns) = split_system(&messages);
        let mut body = serde_json::json!({
            "model": config.model,
            "system": system,
            "messages": turns,
            "max_tokens": config.max_tokens,
            "temperature": config.temperature,
            "stream": true,
        });
        if !config.tools.is_empty() {
            body["tools"] = serde_json::Value::Array(anthropic_tools(&config.tools));
        }

        let request = self
            .client
            .post(&endpoint)
            .header("x-api-key", &config.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body);

        Box::pin(async_stream::stream! {
            yield Ok(StreamEvent::Start);

            let response = match request.send().await {
                Ok(response) => response,
                Err(error) => {
                    yield Err(AiError::Network(error.to_string()));
                    return;
                }
            };

            if !response.status().is_success() {
                yield Err(AiError::Provider(read_error_body(response).await));
                return;
            }

            let mut stream = response.bytes_stream();
            let mut buffer = SseLineBuffer::default();
            let mut finish = "end_turn".to_string();
            let mut tools = ToolUseAccumulator::default();

            while let Some(chunk) = stream.next().await {
                let chunk = match chunk {
                    Ok(chunk) => chunk,
                    Err(error) => {
                        yield Err(AiError::Network(error.to_string()));
                        return;
                    }
                };

                for line in buffer.push(&chunk) {
                    if let Some(event) = handle_line(&line, &mut finish, &mut tools) {
                        match event {
                            Ok(StreamEvent::Done { finish_reason }) => {
                                for call in tools.take() {
                                    yield Ok(StreamEvent::ToolCall { call });
                                }
                                yield Ok(StreamEvent::Done { finish_reason });
                                return;
                            }
                            other => yield other,
                        }
                    }
                }
            }

            for call in tools.take() {
                yield Ok(StreamEvent::ToolCall { call });
            }
            yield Ok(StreamEvent::Done { finish_reason: finish });
        })
    }
}

/// Interprets one SSE line; `None` means "keep going".
fn handle_line(
    line: &str,
    finish: &mut String,
    tools: &mut ToolUseAccumulator,
) -> Option<Result<StreamEvent, AiError>> {
    let data = parse_data_line(line)?;
    if let Some(message) = error_message(data) {
        return Some(Err(AiError::Provider(message)));
    }
    if let Some(reason) = finish_reason(data) {
        *finish = reason;
    }
    tools.push(data);
    delta_text(data).map(|text| Ok(StreamEvent::Delta { text }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(role: Role, content: &str) -> ChatMessage {
        ChatMessage::text(role, content)
    }

    #[test]
    fn system_messages_are_lifted_out() {
        let messages = vec![message(Role::System, "be terse"), message(Role::User, "hi")];
        let (system, turns) = split_system(&messages);
        assert_eq!(system, "be terse");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0]["role"], "user");
    }

    #[test]
    fn delta_text_reads_content_block_delta() {
        let payload = r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}"#;
        assert_eq!(delta_text(payload).as_deref(), Some("Hi"));
    }

    #[test]
    fn delta_text_ignores_other_events() {
        let payload = r#"{"type":"message_start","message":{}}"#;
        assert_eq!(delta_text(payload), None);
    }

    #[test]
    fn finish_reason_reads_message_delta() {
        let payload = r#"{"type":"message_delta","delta":{"stop_reason":"max_tokens"}}"#;
        assert_eq!(finish_reason(payload).as_deref(), Some("max_tokens"));
    }

    #[test]
    fn error_payload_is_detected() {
        let payload =
            r#"{"type":"error","error":{"type":"authentication_error","message":"bad key"}}"#;
        assert_eq!(error_message(payload).as_deref(), Some("bad key"));
    }

    #[test]
    fn tool_use_blocks_are_reassembled() {
        let mut tools = ToolUseAccumulator::default();
        tools.push(r#"{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_note"}}"#);
        tools.push(r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"id\":"}}"#);
        tools.push(r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\"n1\"}"}}"#);
        assert!(tools.push(r#"{"type":"content_block_stop","index":0}"#));

        let calls = tools.take();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id, "toolu_1");
        assert_eq!(calls[0].name, "get_note");
        assert_eq!(calls[0].arguments, r#"{"id":"n1"}"#);
    }

    #[test]
    fn tool_use_without_arguments_defaults_to_empty_object() {
        let mut tools = ToolUseAccumulator::default();
        tools.push(r#"{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_2","name":"list_notes"}}"#);
        tools.push(r#"{"type":"content_block_stop","index":0}"#);
        assert_eq!(tools.take()[0].arguments, "{}");
    }

    #[test]
    fn text_deltas_are_ignored_by_the_tool_accumulator() {
        let mut tools = ToolUseAccumulator::default();
        assert!(!tools.push(
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}"#
        ));
        assert!(tools.take().is_empty());
    }

    #[test]
    fn openai_tools_convert_to_anthropic_shape() {
        let tools = vec![serde_json::json!({
            "type": "function",
            "function": {
                "name": "get_note",
                "description": "One note",
                "parameters": { "type": "object", "properties": { "id": { "type": "string" } } }
            }
        })];
        let converted = anthropic_tools(&tools);
        assert_eq!(converted[0]["name"], "get_note");
        assert_eq!(converted[0]["input_schema"]["type"], "object");
        assert!(converted[0].get("function").is_none());
    }
}
