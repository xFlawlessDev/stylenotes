//! AI assistant gateway (BYOK, device-local).
//!
//! Design: cloud sync design §8 describes a future server
//! gateway. The free tier ships the same idea *client-side*: the user brings
//! their own OpenAI-compatible or Anthropic key, which is encrypted at rest and
//! used directly from the app. Moving this behind the server later changes only
//! the transport — the provider contract and the UI stay the same.
//!
//! This crate is the reference implementation of the alnair-router gateway's
//! provider stack, reduced to the two providers a note app needs.

pub mod commands;
pub mod crypto;
pub mod prompts;
pub mod provider;
pub mod sse;
pub mod types;
pub mod web;
pub mod web_commands;
pub mod web_html;
