# Changelog

All notable changes to StyleNotes are documented in this file. Versions follow Semantic Versioning and are derived from [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added

- **Open core foundation.** The desktop app is explicitly OSS (AGPL-3.0) with a
  separate, proprietary cloud. One desktop build ships; it is cloud-ready and
  offline by default.
- **`@stylenotes/shared`** (`packages/shared`, MIT): the contract shared with the
  cloud — Hybrid Logical Clock, sync envelope, wire DTOs, and entitlements. The
  cloud service consumes the same package so the shapes cannot drift.
- **Cloud client seam** in the app: `content/cloud-types.ts`,
  `content/cloud-client.ts` (the only HTTP caller), `db/cloud.ts`,
  `stores/cloud.svelte.ts`, and a **Cloud** section in Settings. Cloud stays
  disabled until a server URL is configured; entitlements default to the most
  restricted set.
- **OS-keychain session seam**: `src-tauri/src/cloud.rs`
  (`cloud_session_set/get/clear`) + `content/cloud-session.ts`. The session token
  goes to the OS credential store, never `localStorage` or SQLite.
- **OSS infrastructure**: `LICENSE` (AGPL-3.0), `packages/shared/LICENSE` (MIT),
  `CONTRIBUTING.md` (with CLA), `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub
  issue/PR templates, and a CI workflow.

### Changed

- `package.json` and `src-tauri/Cargo.toml` now declare `AGPL-3.0-only`.
- Root `package.json` is a bun workspace (`packages/*`); `bun run check:all`
  typechecks `packages/shared` and Vitest covers `packages/**`.

### Documentation

- Moved implemented (client) design docs to `docs/design/archive/` with an index.
  Cloud-service design docs are kept with the cloud service, not here.

### Added (vault folder, F0)

- **Vault folder mirror** (docs/design/vault-mirror.md). A workspace can point at a
  folder and export its notes as plain markdown plus an `attachments/` copy, so the
  folder can be backed up, read in any editor, or tracked with Git. SQLite stays
  the source of truth; nothing in the folder is ever read back yet.
  - Migration 25: `vault_links` (derived index) and `workspaces.vault_mode` /
    `vault_path` / `type`.
  - Rust `src-tauri/src/vault/`: safe path resolution (no traversal), atomic
    writes (`*.part` → `sync_all` → rename, replacing on Windows), and commands
    `vault_export_files` / `vault_copy_file` / `vault_read_files` / `vault_scan` /
    `vault_validate_root`.
  - Pure TS `vault-format.ts` / `vault-plan.ts` with 20 tests: stable frontmatter,
    `id` for rename-safe identity, platform-safe file names (reserved names,
    trailing dot/space, Unicode NFC).
  - **Settings → Vault**: choose a folder, pick `App only` / `Mirror to folder`,
    export on demand.
  - Cross-platform rules are implemented, not just documented (#V22).
- **Vault folder import (F1).** **Settings → Vault → Read from folder** brings files
  added or edited in the folder back into the app: new files become notes, a known
  file with a new hash updates its note, and the overwritten note is kept in Record
  History (`reason: 'vault'`). Import is additive — a missing file is reported as an
  orphan link, never an automatic delete. Conflict markers, Dropbox "conflicted
  copies", and truncated/empty known files are skipped, and attachments under
  `attachments/` are pulled into the store. Pure `content/vault-reconcile.ts`
  (`planSync`, 13 tests) plus `vault_import_attachment` in Rust.
