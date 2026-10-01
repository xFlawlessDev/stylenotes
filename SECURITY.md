# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Instead, use the
repository's **private vulnerability reporting** (Security → Report a
vulnerability) on the hosting provider, or email the maintainers.

Include, as best you can:

- what the issue is and where (file, window, or endpoint),
- how to reproduce it,
- the impact you believe it has,
- any suggested fix.

You can expect an acknowledgement within a few days. We will keep you updated on
the fix and credit you in the release notes unless you prefer otherwise.

## Scope

This repository is the **desktop app**. It is local-first: your notes live in a
local SQLite database, and — with the exception of the AI/remote-MCP features you
opt into — it makes no network requests.

Security-sensitive areas worth a look:

- **Local MCP** (`src-tauri/src/mcp/`, `mcp_host.rs`): the stdio shim never opens
  SQLite; writes go through the app's stores. The trust boundary is "can run a
  local process".
- **Remote MCP** (`src-tauri/src/remote_mcp/`): the HTTP listener, its exposure
  modes, and the SSRF guard in `ai/web_html.rs` (`is_blocked_host`).
- **AI/credential handling** (`src-tauri/src/ai/`): the API key is encrypted at
  rest (`enc:v1:`); the cipher key lives in `app_data_dir()/ai/secrets.key`.
- **Attachments** (`src-tauri/src/attachments/`): path handling and extension
  normalisation.

The **cloud service** is a separate, private repository; report issues in it to
the maintainers as well.

## Please do not

- Run automated scanners against hosted services.
- Access data that is not yours.
