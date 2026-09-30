//! Tauri commands for remote MCP (docs/design/constella-features.md #D12).
//!
//! Owns the listener lifecycle and the token. The token is generated in Rust,
//! returned to the UI **once**, and stored only as a hash, so a leaked database
//! file does not leak a usable credential. Switching exposure mode rotates the
//! token: a token that may have been visible on the old interface must not
//! travel to the new one.
//!
//! The listener is held in app state so a command can stop it. Only one runs at
//! a time.

use std::sync::Mutex;

use rand::RngCore;

use crate::remote_mcp::http::{self, ListenerHandle};
use crate::remote_mcp::net::{token_from_entropy, ExposureMode};

/// Live listener, if any. `None` means remote MCP is off.
#[derive(Default)]
pub struct RemoteState {
    listener: Mutex<Option<ListenerHandle>>,
}

/// What the Settings page shows. Never includes the token itself.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    pub enabled: bool,
    pub mode: String,
    pub token_hint: String,
    /// The addresses an agent should use, once the listener is bound.
    pub addresses: Vec<String>,
}

fn addresses_for(mode: ExposureMode) -> Vec<String> {
    match mode {
        ExposureMode::Lan => match http::detect_lan_ip() {
            Some(ip) => vec![format!(
                "http://{ip}:{}",
                crate::remote_mcp::REMOTE_MCP_PORT
            )],
            None => Vec::new(),
        },
        _ => vec![format!(
            "http://127.0.0.1:{}",
            crate::remote_mcp::REMOTE_MCP_PORT
        )],
    }
}

/// Resolves the effective exposure mode from a raw setting.
fn mode_of(raw: &str) -> ExposureMode {
    ExposureMode::parse(raw)
}

/// Starts the listener and returns the new token. `mode` selects the bind.
///
/// The token is generated here and returned exactly once; the caller persists
/// the hash that comes back in `RemoteStartResult`.
#[tauri::command]
pub async fn remote_mcp_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, RemoteState>,
    mode: String,
) -> Result<RemoteStartResult, String> {
    let mode = mode_of(&mode);
    // Rotate on every start: a stopped listener's token has no reason to live.
    let mut entropy = [0_u8; 24];
    rand::thread_rng().fill_bytes(&mut entropy);
    let (token, record) = token_from_entropy(&entropy);

    stop_listener(&state);
    let handle = http::start(app, mode, record.hash.clone()).await?;
    // Report the address the listener actually bound, not the one we intended:
    // if the OS picked a different interface, the user must see the truth.
    let addresses = vec![format!("http://{}", handle.addr)];

    if let Ok(mut guard) = state.listener.lock() {
        *guard = Some(handle);
    }

    Ok(RemoteStartResult {
        token,
        hash: record.hash,
        hint: record.hint,
        mode: mode.as_str().to_string(),
        addresses,
    })
}

/// Stops the listener if it is running.
#[tauri::command]
pub fn remote_mcp_stop(state: tauri::State<'_, RemoteState>) -> Result<(), String> {
    stop_listener(&state);
    Ok(())
}

/// Status for the Settings page: running state and the addresses to use.
#[tauri::command]
pub fn remote_mcp_status(
    state: tauri::State<'_, RemoteState>,
    enabled: bool,
    mode: String,
    token_hint: String,
) -> RemoteStatus {
    let running = state
        .listener
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false);
    let parsed = mode_of(&mode);
    RemoteStatus {
        enabled: enabled && running,
        mode: parsed.as_str().to_string(),
        token_hint,
        addresses: if running {
            addresses_for(parsed)
        } else {
            Vec::new()
        },
    }
}

/// Fresh token for a mode change or a manual rotation.
///
/// Returns the token once and the hash to persist; it does not start a listener,
/// so the caller decides whether the endpoint should be live.
#[tauri::command]
pub fn remote_mcp_rotate() -> RemoteRotateResult {
    let mut entropy = [0_u8; 24];
    rand::thread_rng().fill_bytes(&mut entropy);
    let (token, record) = token_from_entropy(&entropy);
    RemoteRotateResult {
        token,
        hash: record.hash,
        hint: record.hint,
    }
}

fn stop_listener(state: &tauri::State<'_, RemoteState>) {
    if let Ok(mut guard) = state.listener.lock() {
        if let Some(handle) = guard.take() {
            handle.stop();
        }
    }
}

/// Result of starting the listener: the token (shown once) and what to persist.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStartResult {
    /// Shown once, never stored.
    pub token: String,
    /// Persisted in `remote_mcp.token_hash`.
    pub hash: String,
    pub hint: String,
    pub mode: String,
    pub addresses: Vec<String>,
}

/// Result of a rotation, with the same one-time token contract.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRotateResult {
    pub token: String,
    pub hash: String,
    pub hint: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_mode_offers_the_loopback_address() {
        let addresses = addresses_for(ExposureMode::Local);
        assert_eq!(addresses.len(), 1);
        assert!(addresses[0].starts_with("http://127.0.0.1:"));
    }

    #[test]
    fn tunnel_mode_stays_on_loopback() {
        assert!(addresses_for(ExposureMode::Tunnel)[0].starts_with("http://127.0.0.1:"));
    }

    #[test]
    fn mode_parsing_defaults_to_local() {
        assert_eq!(mode_of("lan"), ExposureMode::Lan);
        assert_eq!(mode_of("nonsense"), ExposureMode::Local);
    }
}
