//! Credential encryption at rest for the BYOK API key.
//!
//! The key is encrypted with AES-256-GCM before it reaches SQLite; stored
//! values carry an `enc:v1:` marker so legacy plaintext rows stay detectable.
//! The 32-byte key lives in `<app_data_dir>/ai/secrets.key`, created on first
//! use with 0600-style permissions where the platform honours them.
//!
//! This mirrors the alnair-router gateway's `crypto.rs`, adapted for a desktop
//! app that owns its own key file instead of an operator-supplied secret.

use std::fs;
use std::path::Path;

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::Engine;
use rand::RngCore;

use crate::ai::types::{AiError, AiResult};

const MARKER: &str = "enc:v1:";
const KEY_BYTES: usize = 32;
const NONCE_BYTES: usize = 12;

/// Encrypts and decrypts the stored API key.
#[derive(Clone)]
pub struct CredentialCipher {
    key: Key<Aes256Gcm>,
}

impl CredentialCipher {
    /// Loads the key file, creating a fresh random key when it is missing.
    pub fn load_or_create(path: &Path) -> AiResult<Self> {
        let key = match fs::read_to_string(path) {
            Ok(raw) => parse_key(raw.trim())
                .map_err(|error| AiError::Decrypt(format!("invalid secrets.key: {error}")))?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let mut bytes = [0u8; KEY_BYTES];
                rand::thread_rng().fill_bytes(&mut bytes);
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent).map_err(|error| {
                        AiError::Config(format!("could not create the AI secrets folder: {error}"))
                    })?;
                }
                let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
                fs::write(path, &encoded).map_err(|error| {
                    AiError::Config(format!("could not write secrets.key: {error}"))
                })?;
                restrict_permissions(path);
                bytes
            }
            Err(error) => {
                return Err(AiError::Config(format!(
                    "could not read secrets.key: {error}"
                )))
            }
        };

        Ok(Self { key: key.into() })
    }

    /// True when `value` was produced by [`Self::encrypt`].
    pub fn is_encrypted(value: &str) -> bool {
        value.starts_with(MARKER)
    }

    /// Encrypts a plaintext key.
    pub fn encrypt(&self, plaintext: &str) -> AiResult<String> {
        let cipher = Aes256Gcm::new(&self.key);
        let nonce = Aes256Gcm::generate_nonce(OsRng);
        let sealed = cipher
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|_| AiError::Decrypt("failed to encrypt the API key".to_string()))?;

        let mut payload = nonce.to_vec();
        payload.extend(sealed);
        Ok(format!(
            "{MARKER}{}",
            base64::engine::general_purpose::STANDARD.encode(payload)
        ))
    }

    /// Decrypts a stored key. Unmarked values pass through as legacy plaintext.
    pub fn decrypt(&self, stored: &str) -> AiResult<String> {
        if !Self::is_encrypted(stored) {
            return Ok(stored.to_string());
        }

        let payload = base64::engine::general_purpose::STANDARD
            .decode(stored.trim_start_matches(MARKER))
            .map_err(|error| AiError::Decrypt(format!("API key is not valid base64: {error}")))?;
        if payload.len() <= NONCE_BYTES {
            return Err(AiError::Decrypt("API key payload is truncated".to_string()));
        }

        let (nonce, ciphertext) = payload.split_at(NONCE_BYTES);
        let cipher = Aes256Gcm::new(&self.key);
        let plaintext = cipher
            .decrypt(Nonce::from_slice(nonce), ciphertext)
            .map_err(|_| {
                AiError::Decrypt(
                    "failed to decrypt the API key: the secrets.key file may have changed"
                        .to_string(),
                )
            })?;

        String::from_utf8(plaintext)
            .map_err(|error| AiError::Decrypt(format!("API key is not valid UTF-8: {error}")))
    }
}

/// Best-effort tightening of the key file's permissions on Unix.
fn restrict_permissions(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
}

/// Parses a 32-byte key from 64 hex characters or standard base64.
pub fn parse_key(raw: &str) -> Result<[u8; KEY_BYTES], String> {
    let trimmed = raw.trim();

    if trimmed.len() == KEY_BYTES * 2 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        let mut bytes = [0u8; KEY_BYTES];
        for (index, pair) in trimmed.as_bytes().chunks(2).enumerate() {
            let pair = std::str::from_utf8(pair).map_err(|error| error.to_string())?;
            bytes[index] = u8::from_str_radix(pair, 16).map_err(|error| error.to_string())?;
        }
        return Ok(bytes);
    }

    let decoded = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .map_err(|_| "key must be 64 hex characters or base64-encoded 32 bytes".to_string())?;

    decoded
        .try_into()
        .map_err(|_| "key must decode to exactly 32 bytes".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cipher() -> CredentialCipher {
        parse_key(&"ab".repeat(32))
            .map(|key| CredentialCipher { key: key.into() })
            .expect("valid key")
    }

    #[test]
    fn round_trip_recovers_the_plaintext() {
        let encrypted = cipher().encrypt("sk-secret").expect("encrypt");
        assert!(CredentialCipher::is_encrypted(&encrypted));
        assert_ne!(encrypted, "sk-secret");
        assert_eq!(cipher().decrypt(&encrypted).expect("decrypt"), "sk-secret");
    }

    #[test]
    fn a_different_key_fails_to_decrypt() {
        let encrypted = cipher().encrypt("sk-secret").expect("encrypt");
        let other = parse_key(&"cd".repeat(32)).expect("key");
        let other = CredentialCipher { key: other.into() };
        assert!(other.decrypt(&encrypted).is_err());
    }

    #[test]
    fn unmarked_values_pass_through_as_legacy_plaintext() {
        assert_eq!(cipher().decrypt("sk-plain").expect("decrypt"), "sk-plain");
    }

    #[test]
    fn base64_keys_are_accepted() {
        let raw = base64::engine::general_purpose::STANDARD.encode([7u8; KEY_BYTES]);
        assert_eq!(parse_key(&raw).expect("parse"), [7u8; KEY_BYTES]);
    }

    #[test]
    fn wrong_length_keys_are_rejected() {
        assert!(parse_key("abcd").is_err());
        assert!(parse_key(&"ab".repeat(16)).is_err());
    }
}
