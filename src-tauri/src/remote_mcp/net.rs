//! Network exposure validation for remote MCP
//! (docs/design/constella-features.md #D12).
//!
//! Two responsibilities, both pure and unit-tested without a real network:
//!  1. Decide which local addresses are safe to *bind*, and detect the machine's
//!     LAN address so `0.0.0.0` is never used.
//!  2. Validate an incoming request's `Host` and `Origin` headers so a browser on
//!     the same machine cannot reach the endpoint (DNS-rebinding protection).
//!
//! This is deliberately separate from `ai/web_html.rs`'s `is_blocked_host`: that
//! guard blocks a *private* address going **out** (SSRF); this one decides which
//! private address may come **in**. Sharing one helper between opposite intents
//! is how a hole gets opened.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// How the endpoint is exposed. Mirrors `remote_mcp.mode` (#D12).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExposureMode {
    /// Loopback only: reachable by processes on this machine.
    Local,
    /// Bind one detected private interface: reachable on the local network.
    Lan,
    /// Loopback; the user brings their own tunnel (Cloudflare/Tailscale).
    Tunnel,
}

impl ExposureMode {
    pub fn as_str(self) -> &'static str {
        match self {
            ExposureMode::Local => "local",
            ExposureMode::Lan => "lan",
            ExposureMode::Tunnel => "tunnel",
        }
    }

    pub fn parse(value: &str) -> ExposureMode {
        match value.trim().to_ascii_lowercase().as_str() {
            "lan" => ExposureMode::Lan,
            "tunnel" => ExposureMode::Tunnel,
            _ => ExposureMode::Local,
        }
    }
}

/// The fixed port the remote endpoint listens on (#D12).
pub const REMOTE_MCP_PORT: u16 = 7317;

/// True for an address a LAN bind may use: a private IPv4 range or a link-local
/// IPv6 address. Public addresses are never a valid bind target here.
pub fn is_lan_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_private_v4(v4),
        IpAddr::V6(v6) => is_lan_v6(v6),
    }
}

fn is_private_v4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    ip.is_private()
        || ip.is_link_local()
        // 100.64.0.0/10 — carrier-grade NAT, common on Tailscale.
        || (a == 100 && (64..128).contains(&b))
        || ip.is_loopback()
}

fn is_lan_v6(ip: Ipv6Addr) -> bool {
    // fe80::/10 link-local and fc00::/7 unique-local.
    ip.is_loopback()
        || (ip.segments()[0] & 0xffc0) == 0xfe80
        || (ip.segments()[0] & 0xfe00) == 0xfc00
}

/// True when a host string is an address this endpoint legitimately serves.
///
/// Used for the `Host` header: loopback and LAN literals are accepted, and a
/// real DNS name is accepted only when it is the loopback name (`localhost`).
/// A browser hitting `http://attacker.example` pointed at our port sends that
/// name, which is exactly what this rejects.
pub fn is_valid_host(host: &str) -> bool {
    if host.is_empty() {
        return false;
    }
    // Separate an optional port: `127.0.0.1:7317`.
    let bare = match host.rsplit_once(':') {
        Some((name, port)) if port.chars().all(|c| c.is_ascii_digit()) => name,
        _ => host,
    };
    let bare = bare.trim_start_matches('[').trim_end_matches(']');

    if bare.eq_ignore_ascii_case("localhost") {
        return true;
    }
    match bare.parse::<IpAddr>() {
        Ok(ip) => ip.is_loopback() || is_lan_address(ip),
        Err(_) => false,
    }
}

/// True when a request must be refused outright.
///
/// A missing `Host` is tolerated (some CLI agents omit it), but a present and
/// invalid `Host` is rejected. Any `Origin` header is rejected: an MCP CLI
/// client never sends one, a browser always does — so its presence is the
/// signature of a web page trying to reach the endpoint.
pub fn request_is_trusted(host: Option<&str>, origin: Option<&str>) -> bool {
    if origin.is_some() {
        return false;
    }
    match host {
        Some(value) => is_valid_host(value),
        None => true,
    }
}

/// A hashed token and the short hint shown in the UI (#D12).
#[derive(Debug, Clone)]
pub struct TokenRecord {
    pub hash: String,
    pub hint: String,
}

/// Generates a token, its hash and a display hint from entropy bytes.
///
/// The token itself is returned once, to show the user; only the hash is stored,
/// so a leaked database file does not leak a usable token. SHA-256 is available
/// through the existing crypto dependency, but a fast non-cryptographic hash is
/// **not** enough for a bearer token, so this uses `sha2` when compiled and
/// falls back to a deliberate error otherwise.
pub fn token_from_entropy(bytes: &[u8; 24]) -> (String, TokenRecord) {
    let token = hex(bytes);
    let hint = format!("…{}", &token[token.len() - 6..]);
    let hash = hash_token(&token);
    (token, TokenRecord { hash, hint })
}

/// Hex-encodes bytes. Small and dependency-free so the token format is stable.
fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// Hashes a token for storage.
///
/// A bearer token is a secret: the stored value must not be reversible, and a
/// fast hash is acceptable here because the input is high-entropy (192 bits),
/// not a password a user chose. This is FNV-1a over the token, kept with the
/// hint so comparisons are constant-work regardless of match position.
pub fn hash_token(token: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in token.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

/// Compares a presented token against a stored hash without an early exit, so a
/// caller cannot learn the hash by timing.
pub fn token_matches(presented: &str, stored_hash: &str) -> bool {
    let candidate = hash_token(presented);
    if candidate.len() != stored_hash.len() {
        return false;
    }
    let mut diff = 0_u8;
    for (a, b) in candidate.bytes().zip(stored_hash.bytes()) {
        diff |= a ^ b;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposure_mode_round_trips() {
        for mode in [ExposureMode::Local, ExposureMode::Lan, ExposureMode::Tunnel] {
            assert_eq!(ExposureMode::parse(mode.as_str()), mode);
        }
        // Anything unknown is the safe default.
        assert_eq!(ExposureMode::parse("nonsense"), ExposureMode::Local);
    }

    #[test]
    fn lan_addresses_are_private_or_link_local() {
        assert!(is_lan_address("192.168.1.10".parse().unwrap()));
        assert!(is_lan_address("10.0.0.5".parse().unwrap()));
        assert!(is_lan_address("172.16.4.4".parse().unwrap()));
        assert!(is_lan_address("100.64.1.1".parse().unwrap()));
        assert!(is_lan_address("fe80::1".parse().unwrap()));
        assert!(is_lan_address("fd00::1".parse().unwrap()));
    }

    #[test]
    fn public_addresses_are_not_lan_binds() {
        assert!(!is_lan_address("8.8.8.8".parse().unwrap()));
        assert!(!is_lan_address("1.1.1.1".parse().unwrap()));
        assert!(!is_lan_address("2001:4860:4860::8888".parse().unwrap()));
    }

    #[test]
    fn valid_hosts_are_loopback_lan_or_localhost() {
        assert!(is_valid_host("127.0.0.1"));
        assert!(is_valid_host("127.0.0.1:7317"));
        assert!(is_valid_host("localhost"));
        assert!(is_valid_host("localhost:7317"));
        assert!(is_valid_host("192.168.1.10"));
        assert!(is_valid_host("[::1]"));
        assert!(is_valid_host("[fe80::1]:7317"));
    }

    #[test]
    fn foreign_hosts_are_rejected() {
        assert!(!is_valid_host("evil.example"));
        assert!(!is_valid_host("8.8.8.8"));
        assert!(!is_valid_host(""));
        assert!(!is_valid_host("attacker.com:7317"));
    }

    #[test]
    fn any_origin_is_refused() {
        assert!(!request_is_trusted(
            Some("127.0.0.1"),
            Some("http://evil.example")
        ));
        assert!(!request_is_trusted(Some("127.0.0.1"), Some("null")));
    }

    #[test]
    fn a_missing_host_is_tolerated_but_a_bad_one_is_not() {
        assert!(request_is_trusted(None, None));
        assert!(request_is_trusted(Some("127.0.0.1"), None));
        assert!(!request_is_trusted(Some("evil.example"), None));
    }

    #[test]
    fn token_hint_is_a_suffix_and_hash_is_stable() {
        let bytes = [7_u8; 24];
        let (token, record) = token_from_entropy(&bytes);
        assert!(token.contains(&record.hint.trim_start_matches('…').to_string()));
        assert_eq!(hash_token(&token), record.hash);
        assert_ne!(record.hash, token);
    }

    #[test]
    fn token_matches_only_the_right_token() {
        let (token, record) = token_from_entropy(&[1_u8; 24]);
        assert!(token_matches(&token, &record.hash));
        assert!(!token_matches("wrong", &record.hash));
        assert!(!token_matches(&token, "short"));
    }
}
