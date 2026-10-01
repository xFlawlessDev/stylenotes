//! The cloud session token, held in the **OS credential store** — Windows
//! Credential Manager, macOS Keychain, or Secret Service on Linux.
//!
//! Why not SQLite or `localStorage` (`cloud-sync-ai-mcp.md` #4):
//! the session token is an opaque bearer credential, so a leak is full access
//! until revocation. It is small, device-local and secret — exactly what a
//! keychain is for. Everything else cloud-related (server URL, account, plan)
//! is non-secret and lives in `meta`.
//!
//! The commands are deliberately thin: the frontend decides *when* to store or
//! clear the token, this module only guarantees *where* it goes.

use keyring::Entry;

/// Service name under which the token is filed. Versioned so a future,
/// incompatible scheme can coexist during a migration.
const SERVICE: &str = "com.arifpebryan.stylenotes.cloud";
const ACCOUNT: &str = "session";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|error| format!("keychain_unavailable: {error}"))
}

/// Stores (or replaces) the session token in the OS keychain.
#[tauri::command]
pub fn cloud_session_set(token: String) -> Result<(), String> {
    entry()?
        .set_password(&token)
        .map_err(|error| format!("keychain_write_failed: {error}"))
}

/// Reads the session token. `Ok(None)` means "no session stored", which is a
/// normal signed-out state, not an error.
#[tauri::command]
pub fn cloud_session_get() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("keychain_read_failed: {error}")),
    }
}

/// Removes the session token. Missing entry is success (idempotent logout).
#[tauri::command]
pub fn cloud_session_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("keychain_clear_failed: {error}")),
    }
}
