//! Tauri commands for the AI assistant (BYOK).
//!
//! Split of responsibilities, mirroring the MCP bridge: the **frontend** owns
//! settings persistence (one SQLite owner), while **Rust** owns the two things
//! it alone should: encrypting the API key at rest and talking to the provider
//! over the network. The key crosses IPC only as a decrypted string for the
//! duration of a request, and is never written back in plaintext.

use std::path::PathBuf;

use futures_util::StreamExt;
use tauri::ipc::Channel;
use tauri::Manager;

use crate::ai::crypto::CredentialCipher;
use crate::ai::prompts::with_system_prompt;
use crate::ai::provider::provider_for;
use crate::ai::types::{AiError, ChatMessage, ProviderConfig, Role, StreamEvent, Task, ToolCall};

const AI_DIR: &str = "ai";
const SECRETS_FILE: &str = "secrets.key";

/// Absolute path of the AI secrets key file, under the app data directory.
fn secrets_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, AiError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AiError::Config(format!("no app data directory: {error}")))?
        .join(AI_DIR);
    Ok(dir.join(SECRETS_FILE))
}

fn cipher<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<CredentialCipher, AiError> {
    CredentialCipher::load_or_create(&secrets_path(app)?)
}

/// Encrypts an API key for storage. The `enc:v1:` marker is added here, never
/// in the UI, so the frontend never handles the ciphertext format.
#[tauri::command]
pub fn ai_encrypt_key(app: tauri::AppHandle, key: String) -> Result<String, String> {
    cipher(&app)
        .and_then(|cipher| cipher.encrypt(&key))
        .map_err(|error| error.to_string())
}

/// Decrypts a stored API key for a single request. Plaintext rows pass through.
#[tauri::command]
pub fn ai_decrypt_key(app: tauri::AppHandle, stored: String) -> Result<String, String> {
    cipher(&app)
        .and_then(|cipher| cipher.decrypt(&stored))
        .map_err(|error| error.to_string())
}

/// Payload for `ai_stream`; field names match `AiStreamRequest` in TS.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamRequest {
    pub request_id: String,
    pub messages: Vec<ChatMessage>,
    pub task: Task,
    pub instruction: Option<String>,
    /// Carries the decrypted API key for this request only; never persisted.
    pub config: ProviderConfig,
}

/// One event flattened for the channel payload, so the frontend reads a single
/// shape (`kind` plus optional fields) instead of a tagged union.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmittedEvent {
    request_id: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    finish_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    call: Option<ToolCall>,
}

impl EmittedEvent {
    fn start(request_id: &str) -> Self {
        Self {
            request_id: request_id.to_string(),
            kind: "start",
            text: None,
            finish_reason: None,
            message: None,
            call: None,
        }
    }

    fn from_event(request_id: &str, event: StreamEvent) -> Self {
        match event {
            StreamEvent::Start => Self::start(request_id),
            StreamEvent::Delta { text } => Self {
                request_id: request_id.to_string(),
                kind: "delta",
                text: Some(text),
                finish_reason: None,
                message: None,
                call: None,
            },
            StreamEvent::ToolCall { call } => Self {
                request_id: request_id.to_string(),
                kind: "tool_call",
                text: None,
                finish_reason: None,
                message: None,
                call: Some(call),
            },
            StreamEvent::Done { finish_reason } => Self {
                request_id: request_id.to_string(),
                kind: "done",
                text: None,
                finish_reason: Some(finish_reason),
                message: None,
                call: None,
            },
        }
    }
}

/// Streams a completion, forwarding chunks over `on_event`.
///
/// Resolves as soon as the stream is running; the channel carries `delta`
/// events until `done` or `error`. The provider stream is dropped when the
/// channel closes, which stops the loop at the next chunk.
#[tauri::command]
pub async fn ai_stream(
    request: AiStreamRequest,
    on_event: Channel<EmittedEvent>,
) -> Result<(), String> {
    let request_id = request.request_id.clone();
    let messages = with_system_prompt(
        request.task,
        request.instruction.as_deref(),
        request.messages,
    );
    let config = request.config;
    let provider = provider_for(&config);

    tauri::async_runtime::spawn(async move {
        let _ = on_event.send(EmittedEvent::start(&request_id));
        let mut stream = provider.stream(&config, messages);
        while let Some(chunk) = stream.next().await {
            let event = match chunk {
                Ok(event) => EmittedEvent::from_event(&request_id, event),
                Err(error) => EmittedEvent {
                    request_id: request_id.clone(),
                    kind: "error",
                    text: None,
                    finish_reason: None,
                    message: Some(error.to_string()),
                    call: None,
                },
            };
            let terminal = event.kind == "done" || event.kind == "error";
            let closed = on_event.send(event).is_err();
            if closed || terminal {
                return;
            }
        }
        // A provider that ends without a terminal event would leave the caller
        // waiting forever, so always close the stream explicitly.
        let _ = on_event.send(EmittedEvent::from_event(
            &request_id,
            StreamEvent::Done {
                finish_reason: "stop".to_string(),
            },
        ));
    });

    Ok(())
}

/// Result of `ai_test_connection`, matching `AiTestResult` in TS.
#[derive(serde::Serialize)]
pub struct AiTestResult {
    pub ok: bool,
    pub message: String,
}

/// One short probe used by the "Test connection" button: it reports a bad key
/// or URL before the user writes anything, without returning the model output.
#[tauri::command]
pub async fn ai_test_connection(config: ProviderConfig) -> AiTestResult {
    let provider = provider_for(&config);
    let messages = vec![ChatMessage::text(
        Role::User,
        "Reply with the single word: ok",
    )];
    let mut stream = provider.stream(&config, messages);

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(StreamEvent::Delta { .. }) | Ok(StreamEvent::Done { .. }) => {
                return AiTestResult {
                    ok: true,
                    message: "Connection succeeded.".to_string(),
                };
            }
            Ok(_) => {}
            Err(error) => {
                return AiTestResult {
                    ok: false,
                    message: error.to_string(),
                };
            }
        }
    }

    AiTestResult {
        ok: false,
        message: "The provider returned no response.".to_string(),
    }
}
