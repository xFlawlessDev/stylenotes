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
use tauri::Manager;

use crate::db_tx::WritePool;
use crate::remote_mcp::http::{self, ListenerHandle};
use crate::remote_mcp::net::{hash_token, token_from_entropy, ExposureMode};

/// Live listener, if any. `None` means remote MCP is off.
pub struct RemoteState {
    live: Mutex<Option<LiveListener>>,
    /// Serialises binding so the Rust boot resume and a frontend
    /// `remote_mcp_start` cannot both call `http::start` on the fixed port.
    bind: tokio::sync::Mutex<()>,
}

impl Default for RemoteState {
    fn default() -> Self {
        Self {
            live: Mutex::new(None),
            bind: tokio::sync::Mutex::new(()),
        }
    }
}

/// A running listener plus the identity it was bound with.
///
/// The identity lets a second start with the same token and mode be a no-op
/// instead of a stop-and-rebind: the Rust boot resume and the frontend's
/// `resumeRemoteMcp` both target the same listener, and a rebind would drop the
/// port for a moment — the exact window this module is trying to close.
struct LiveListener {
    handle: ListenerHandle,
    token_hash: String,
    mode: ExposureMode,
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

/// Starts the listener. With no `token`, mints a fresh one; with a stored
/// `token`, reuses it so a restart does not invalidate the client config (#D12
/// revised). `mode` selects the bind.
///
/// The token is returned so the caller can persist it encrypted; only the hash
/// is needed at request time.
#[tauri::command]
pub async fn remote_mcp_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, RemoteState>,
    mode: String,
    token: Option<String>,
) -> Result<RemoteStartResult, String> {
    let mode = mode_of(&mode);
    // Reuse a persisted token when given one; otherwise mint a new one. A mode
    // change still passes no token, so the old credential cannot travel to a
    // wider interface.
    let token = match token.filter(|value| !value.trim().is_empty()) {
        Some(existing) => existing,
        None => {
            let mut entropy = [0_u8; 24];
            rand::thread_rng().fill_bytes(&mut entropy);
            token_from_entropy(&entropy).0
        }
    };
    let hint = format!("…{}", &token[token.len().saturating_sub(6)..]);
    let hash = hash_token(&token);

    // Report the address the listener actually bound, not the one we intended:
    // if the OS picked a different interface, the user must see the truth.
    let addr = ensure_listener(app, &state, mode, hash.clone()).await?;
    let addresses = vec![format!("http://{addr}")];

    Ok(RemoteStartResult {
        token,
        hash,
        hint,
        mode: mode.as_str().to_string(),
        addresses,
    })
}

/// Stops the listener if it is running.
#[tauri::command]
pub fn remote_mcp_stop(state: tauri::State<'_, RemoteState>) -> Result<(), String> {
    if let Ok(mut guard) = state.live.lock() {
        if let Some(live) = guard.take() {
            // The port is released when the accept loop returns. A plain
            // fire-and-forget stop would let a follow-up start race the old
            // socket and fail to bind (os error 10048), so wait it out here on
            // the blocking pool rather than in the command's async context.
            tauri::async_runtime::spawn(async move { live.handle.stop_and_wait().await });
        }
    }
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
        .live
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

/// Binds the listener for `mode`/`hash`, or reuses an identical live one.
///
/// Serialised by `RemoteState::bind`: the Rust boot resume and the frontend's
/// `remote_mcp_start` race on the same fixed port, and binding twice would fail
/// with `os error 10048` (address already in use) or drop the endpoint for the
/// client that is connecting. A live listener with the same token and mode is
/// returned as-is; anything else is stopped (waiting for the port to release)
/// and rebound.
async fn ensure_listener<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: &tauri::State<'_, RemoteState>,
    mode: ExposureMode,
    hash: String,
) -> Result<std::net::SocketAddr, String> {
    let _guard = state.bind.lock().await;

    let existing = state.live.lock().ok().and_then(|guard| {
        guard.as_ref().and_then(|live| {
            (live.token_hash == hash && live.mode == mode).then_some(live.handle.addr)
        })
    });
    if let Some(addr) = existing {
        return Ok(addr);
    }

    if let Some(live) = state.live.lock().ok().and_then(|mut guard| guard.take()) {
        live.handle.stop_and_wait().await;
    }
    let handle = http::start(app, mode, hash.clone()).await?;
    let addr = handle.addr;
    if let Ok(mut guard) = state.live.lock() {
        *guard = Some(LiveListener {
            handle,
            token_hash: hash,
            mode,
        });
    }
    Ok(addr)
}

/// Restores the listener at app start from the persisted `remote_mcp` row.
///
/// The endpoint only exists while the app runs, so binding it here — in
/// `setup`, before any webview finishes hydrating — closes the gap where an MCP
/// client probes the still-closed port and reports the server as failed. A
/// missing row, a disabled row, or a token that cannot be opened is a no-op:
/// remote MCP just stays off, exactly as the UI would show it.
pub async fn resume_from_store<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    let Some(pool) = app.try_state::<WritePool>() else {
        return;
    };
    // `token_enc` is sealed by the UI through `ai_encrypt_key`; opening it here
    // is what lets the listener survive a restart with the same credential the
    // client config already carries (#D12).
    let row: Result<(i64, String, String), sqlx::Error> =
        sqlx::query_as("SELECT enabled, mode, token_enc FROM remote_mcp WHERE id = 1")
            .fetch_one(&pool.0)
            .await;
    let Ok((enabled, mode, token_enc)) = row else {
        return;
    };
    if enabled == 0 || token_enc.is_empty() {
        return;
    }
    let Ok(token) = crate::ai::commands::decrypt_stored(&app, &token_enc) else {
        return;
    };

    let mode = mode_of(&mode);
    let hash = hash_token(&token);
    let state = app.state::<RemoteState>();
    let _ = ensure_listener(app.clone(), &state, mode, hash).await;
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
