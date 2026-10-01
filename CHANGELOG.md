# Changelog

All notable changes to StyleNotes are documented in this file. Versions follow Semantic Versioning and are derived from [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added

- **Open core, two-repo foundation.** The desktop app is now explicitly OSS
  (AGPL-3.0) with a separate proprietary cloud. One desktop build ships; it is
  cloud-ready and offline by default. See `docs/design/repo-split.md`.
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
- **Private cloud docs moved out**: `business-model.md`, `cloud-sync-ai-mcp.md`,
  and `collaboration.md` now live in the private `stylenotes-cloud` repo. Public
  docs and code comments refer to them by bare filename (a marker, not a link) —
  see `docs/design/repo-split.md` §6.

### Changed

- `package.json` and `src-tauri/Cargo.toml` now declare `AGPL-3.0-only`.
- Root `package.json` is a bun workspace (`packages/*`); `bun run check:all`
  typechecks `packages/shared` and Vitest covers `packages/**`.

### Documentation

- Moved implemented design docs to `docs/design/archive/` with an index, and
  added `docs/design/repo-split.md` documenting the repo boundary.
