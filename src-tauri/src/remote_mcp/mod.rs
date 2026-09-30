//! Remote MCP over HTTP (docs/design/constella-features.md #D12).
//!
//! An optional listener for agents on another machine, gated behind Bearer auth
//! and a paid tier. It does **not** add a second write path: an incoming call
//! becomes a job file in the same bridge the stdio shim uses, and the workspace
//! window executes it (#D2). The listener only authenticates, validates the
//! request, forwards, and waits for the result.
//!
//! Exposure is chosen by the user and defaults to loopback. LAN binds one
//! detected private interface — never `0.0.0.0` — and requires an explicit
//! confirmation, because it widens who can reach the endpoint.

pub mod commands;
pub mod http;
pub mod net;

pub use net::REMOTE_MCP_PORT;
