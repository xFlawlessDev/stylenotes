//! OpenAI-compatible streaming chat provider.

use futures_util::stream::BoxStream;
use futures_util::StreamExt;
use std::collections::BTreeMap;

use crate::ai::provider::{normalize_base_url, read_error_body, ChatProvider};
use crate::ai::sse::{parse_data_line, SseLineBuffer};
use crate::ai::types::{AiError, ChatMessage, ProviderConfig, Role, StreamEvent, ToolCall};

pub struct OpenAiProvider {
    client: reqwest::Client,
}

impl OpenAiProvider {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }
}

impl Default for OpenAiProvider {
    fn default() -> Self {
        Self::new()
    }
}

/// Builds the `messages` array in OpenAI's shape.
///
/// Assistant turns that requested tools carry `tool_calls`; the matching
/// `tool` turns carry `tool_call_id`. Both must round-trip or the provider
/// rejects the follow-up request.
fn openai_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    messages
        .iter()
        .map(|message| {
            let mut entry = serde_json::json!({
                "role": message.role.as_str(),
                "content": message.content,
            });
            if message.role == Role::Tool {
                // OpenAI rejects a `tool` turn without an id, so fall back to a
                // stable placeholder rather than sending an invalid request.
                let id = message.tool_call_id.as_deref().unwrap_or("call_unknown");
                entry["tool_call_id"] = serde_json::json!(id);
            }
            if !message.tool_calls.is_empty() {
                entry["tool_calls"] = serde_json::json!(message
                    .tool_calls
                    .iter()
                    .map(|call| serde_json::json!({
                        "id": call.id,
                        "type": "function",
                        "function": { "name": call.name, "arguments": call.arguments },
                    }))
                    .collect::<Vec<_>>());
            }
            entry
        })
        .collect()
}

/// Extracts the `delta.content` string from one SSE JSON payload.
fn delta_text(payload: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(payload).ok()?;
    let text = json
        .get("choices")?
        .as_array()?
        .first()?
        .get("delta")?
        .get("content")?
        .as_str()?;
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

/// Reads the `finish_reason` from a choice, when present.
fn finish_reason(payload: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(payload).ok()?;
    json.get("choices")?
        .as_array()?
        .first()?
        .get("finish_reason")?
        .as_str()
        .map(str::to_string)
}

/// Surfaces an `{ "error": { "message": ... } }` payload if present.
fn error_message(payload: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(payload).ok()?;
    let error = json.get("error")?;
    let message = error
        .get("message")
        .and_then(|value| value.as_str())
        .unwrap_or_else(|| error.as_str().unwrap_or("provider returned an error"));
    Some(message.to_string())
}

/// Accumulates streamed `tool_calls` fragments, keyed by their index.
///
/// OpenAI streams a tool call in pieces: the first fragment carries `id` and
/// `function.name`, later fragments append to `function.arguments`. Indices are
/// not guaranteed contiguous, so a map keeps reassembly order-independent.
#[derive(Default)]
struct ToolCallAccumulator {
    calls: BTreeMap<u64, (String, String, String)>,
}

impl ToolCallAccumulator {
    /// Returns a completed call when `finish_reason` closed the message.
    fn push(&mut self, payload: &str) {
        let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) else {
            return;
        };
        let Some(calls) = json
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|c| c.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("tool_calls"))
            .and_then(|t| t.as_array())
        else {
            return;
        };

        for call in calls {
            let index = call.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
            let entry = self.calls.entry(index).or_default();
            if let Some(id) = call.get("id").and_then(|v| v.as_str()) {
                entry.0 = id.to_string();
            }
            if let Some(name) = call
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(|v| v.as_str())
            {
                entry.1.push_str(name);
            }
            if let Some(args) = call
                .get("function")
                .and_then(|f| f.get("arguments"))
                .and_then(|v| v.as_str())
            {
                entry.2.push_str(args);
            }
        }
    }

    /// Drains the accumulated calls in index order, dropping empty ones.
    fn take(&mut self) -> Vec<ToolCall> {
        std::mem::take(&mut self.calls)
            .into_iter()
            .filter(|(_, (_, name, _))| !name.trim().is_empty())
            .map(|(_, (id, name, arguments))| ToolCall {
                id,
                name,
                arguments,
            })
            .collect()
    }
}

impl ChatProvider for OpenAiProvider {
    fn stream<'a>(
        &'a self,
        config: &'a ProviderConfig,
        messages: Vec<ChatMessage>,
    ) -> BoxStream<'a, Result<StreamEvent, AiError>> {
        let endpoint = format!("{}/chat/completions", normalize_base_url(&config.base_url));
        let mut body = serde_json::json!({
            "model": config.model,
            "messages": openai_messages(&messages),
            "stream": true,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
        });
        if !config.tools.is_empty() {
            body["tools"] = serde_json::Value::Array(config.tools.clone());
            body["tool_choice"] = serde_json::json!("auto");
        }

        let request = self
            .client
            .post(&endpoint)
            .bearer_auth(&config.api_key)
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
            let mut finish = "stop".to_string();
            let mut tool_calls = ToolCallAccumulator::default();

            while let Some(chunk) = stream.next().await {
                let chunk = match chunk {
                    Ok(chunk) => chunk,
                    Err(error) => {
                        yield Err(AiError::Network(error.to_string()));
                        return;
                    }
                };

                for line in buffer.push(&chunk) {
                    if let Some(event) = handle_line(&line, &mut finish, &mut tool_calls) {
                        match event {
                            Ok(StreamEvent::Done { finish_reason }) => {
                                for call in tool_calls.take() {
                                    yield Ok(StreamEvent::ToolCall { call });
                                }
                                yield Ok(StreamEvent::Done { finish_reason });
                                return;
                            }
                            Ok(other) => yield Ok(other),
                            Err(error) => {
                                yield Err(error);
                                return;
                            }
                        }
                    }
                }
            }

            // Flush any trailing line that arrived without a newline.
            if let Some(line) = buffer.finish() {
                if let Ok(StreamEvent::Delta { text }) =
                    handle_line(&line, &mut finish, &mut tool_calls).unwrap_or(Ok(StreamEvent::Start))
                {
                    yield Ok(StreamEvent::Delta { text });
                }
            }
            for call in tool_calls.take() {
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
    tool_calls: &mut ToolCallAccumulator,
) -> Option<Result<StreamEvent, AiError>> {
    let data = parse_data_line(line)?;
    if data == "[DONE]" {
        return Some(Ok(StreamEvent::Done {
            finish_reason: finish.clone(),
        }));
    }
    if let Some(message) = error_message(data) {
        return Some(Err(AiError::Provider(message)));
    }
    if let Some(reason) = finish_reason(data) {
        *finish = reason;
    }
    // Tool-call fragments are collected here and emitted at the end of the
    // message, so the caller receives only fully assembled calls.
    tool_calls.push(data);
    delta_text(data).map(|text| Ok(StreamEvent::Delta { text }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delta_text_reads_content() {
        let payload = r#"{"choices":[{"delta":{"content":"Hi"}}]}"#;
        assert_eq!(delta_text(payload).as_deref(), Some("Hi"));
    }

    #[test]
    fn delta_text_ignores_empty_content() {
        let payload = r#"{"choices":[{"delta":{"content":""}}]}"#;
        assert_eq!(delta_text(payload), None);
    }

    #[test]
    fn finish_reason_is_captured() {
        let payload = r#"{"choices":[{"delta":{},"finish_reason":"length"}]}"#;
        assert_eq!(finish_reason(payload).as_deref(), Some("length"));
    }

    #[test]
    fn error_payload_is_detected() {
        let payload = r#"{"error":{"message":"bad key"}}"#;
        assert_eq!(error_message(payload).as_deref(), Some("bad key"));
        assert_eq!(error_message(r#"{"choices":[]}"#), None);
    }

    #[test]
    fn done_marker_ends_the_stream() {
        let mut finish = "stop".to_string();
        let mut calls = ToolCallAccumulator::default();
        let event = handle_line("data: [DONE]", &mut finish, &mut calls)
            .unwrap()
            .unwrap();
        assert!(matches!(event, StreamEvent::Done { .. }));
    }

    #[test]
    fn tool_call_fragments_are_reassembled() {
        let mut calls = ToolCallAccumulator::default();
        // The id/name arrive first, then arguments in pieces.
        calls.push(r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_note","arguments":"{\"id\""}}]}}]}"#);
        calls.push(r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\"n1\"}"}}]}}]}"#);

        let assembled = calls.take();
        assert_eq!(assembled.len(), 1);
        assert_eq!(assembled[0].id, "call_1");
        assert_eq!(assembled[0].name, "get_note");
        assert_eq!(assembled[0].arguments, r#"{"id":"n1"}"#);
    }

    #[test]
    fn tool_call_accumulator_orders_by_index() {
        let mut calls = ToolCallAccumulator::default();
        calls.push(r#"{"choices":[{"delta":{"tool_calls":[{"index":1,"id":"b","function":{"name":"second","arguments":"{}"}}]}}]}"#);
        calls.push(r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"first","arguments":"{}"}}]}}]}"#);
        let assembled = calls.take();
        assert_eq!(assembled[0].name, "first");
        assert_eq!(assembled[1].name, "second");
    }

    #[test]
    fn tool_call_without_name_is_dropped() {
        let mut calls = ToolCallAccumulator::default();
        calls.push(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]}}]}"#,
        );
        assert!(calls.take().is_empty());
    }

    #[test]
    fn messages_keep_role_and_content() {
        let messages = vec![ChatMessage::text(Role::User, "hello")];
        let json = openai_messages(&messages);
        assert_eq!(json[0]["role"], "user");
        assert_eq!(json[0]["content"], "hello");
    }

    #[test]
    fn assistant_tool_calls_and_tool_results_serialize() {
        let mut assistant = ChatMessage::text(Role::Assistant, "");
        assistant.tool_calls = vec![ToolCall {
            id: "call_1".to_string(),
            name: "get_note".to_string(),
            arguments: r#"{"id":"n1"}"#.to_string(),
        }];
        let mut result = ChatMessage::text(Role::Tool, r#"{"title":"N"}"#);
        result.tool_call_id = Some("call_1".to_string());

        let json = openai_messages(&[assistant, result]);
        assert_eq!(json[0]["tool_calls"][0]["function"]["name"], "get_note");
        assert_eq!(json[1]["role"], "tool");
        assert_eq!(json[1]["tool_call_id"], "call_1");
    }
}
