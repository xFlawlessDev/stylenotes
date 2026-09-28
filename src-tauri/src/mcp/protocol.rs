//! Minimal MCP JSON-RPC 2.0 over stdio (docs/design/mcp-local-free.md #D1).
//!
//! One JSON message per line, no framing beyond a newline. The shim speaks the
//! subset of MCP a tools-only server needs: `initialize`, `tools/list`, and
//! `tools/call`. Anything else is answered with a JSON-RPC error instead of
//! being dropped, so a client never hangs waiting for a reply.

use serde::Deserialize;
use serde_json::{json, Value};

/// Protocol versions this shim can speak; the first is offered in `initialize`.
pub const SUPPORTED_VERSIONS: [&str; 2] = ["2025-06-18", "2024-11-05"];

/// One incoming JSON-RPC message.
#[derive(Debug, Deserialize)]
pub struct Request {
    #[serde(default)]
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
    #[serde(default)]
    #[allow(dead_code)]
    pub jsonrpc: Option<String>,
}

/// A JSON-RPC success response for `id`.
pub fn success(id: Option<Value>, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id.unwrap_or(Value::Null), "result": result })
}

/// A JSON-RPC error response for `id`.
pub fn error(
    id: Option<Value>,
    code: i64,
    message: impl Into<String>,
    data: Option<Value>,
) -> Value {
    let mut payload = json!({ "code": code, "message": message.into() });
    if let Some(data) = data {
        payload["data"] = data;
    }
    json!({ "jsonrpc": "2.0", "id": id.unwrap_or(Value::Null), "error": payload })
}

/// MCP tool result wrapping `text`, optionally with `structuredContent` (#F2).
pub fn tool_result(text: String, structured: Option<Value>) -> Value {
    let mut result = json!({
        "content": [{ "type": "text", "text": text }],
        "isError": false
    });
    if let Some(structured) = structured {
        result["structuredContent"] = structured;
    }
    result
}

/// MCP tool result flagged as an error. `code` becomes a machine-readable
/// `errorCode` the model can act on, rather than a bare sentence.
pub fn tool_error(code: &str, message: impl Into<String>) -> Value {
    json!({
        "content": [{ "type": "text", "text": format!("{code}: {}", message.into()) }],
        "isError": true,
        "structuredContent": { "ok": false, "error": code }
    })
}

/// Like {@link tool_error}, but attaches structured `data` (candidate lists).
pub fn tool_error_with_data(code: &str, message: impl Into<String>, data: Value) -> Value {
    let mut value = tool_error(code, message);
    value["structuredContent"]["data"] = data;
    value
}

/// Capabilities advertised in `initialize`.
pub fn capabilities() -> Value {
    json!({ "tools": { "listChanged": false } })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_tools_call() {
        let raw = r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_task","arguments":{"id":"t-1"}}}"#;
        let request: Request = serde_json::from_str(raw).expect("valid request");
        assert_eq!(request.method, "tools/call");
        assert_eq!(request.id, Some(json!(1)));
        assert_eq!(request.params.unwrap()["name"], "get_task");
    }

    #[test]
    fn notifications_have_no_id() {
        let raw = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
        let request: Request = serde_json::from_str(raw).expect("valid notification");
        assert!(request.id.is_none());
    }

    #[test]
    fn tool_error_is_flagged() {
        let value = tool_error("write_not_granted", "enable it in Settings");
        assert_eq!(value["isError"], true);
        assert_eq!(value["structuredContent"]["error"], "write_not_granted");
    }
}
