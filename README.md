# StyleNotes

A desktop markdown note-taking app built with Tauri v2, SvelteKit (Svelte 5), and TypeScript. Notes live in a local SQLite database and the UI ships as a static SPA.

StyleNotes is **open core**: this repository is the full, free desktop app. Cloud sync, AI, and remote MCP are optional features served by a separate (proprietary) cloud — the app works completely offline without it.

## Open source & licensing

| Part | License |
| --- | --- |
| The app (`src/`, `src-tauri/`) | [AGPL-3.0-only](LICENSE) |
| The shared protocol (`packages/shared/`) | [MIT](packages/shared/LICENSE) |

`packages/shared` is the sync contract (types, Hybrid Logical Clock, entitlements) shared with the cloud service. It is deliberately framework-free so third parties can build their own client or server against the same protocol.

Contributions are welcome under the CLA described in [CONTRIBUTING.md](CONTRIBUTING.md).


## Features

- Windows driven by one route:
  - **workspace** — full note editor with feed, vault rail, command palette, settings, and notifications.
  - **overlay** — always-on-top dock rail for quick access. Hover the rail items for a preview, double-click a note or task to open its detail window, and hover the **+** button to quick-capture a note or task.
  - **kanban** — task board that can lock itself to the desktop as an underlay (`Ctrl+Shift+\` toggles lock / always-on-top).
  - **note-&lt;id&gt;** / **task-&lt;id&gt;** — always-on-top detail windows created on demand. Each note window is a small sticky-note editor with live save and write/split/preview views.
- Quick capture from anywhere: `Ctrl+Shift+N` opens a new docked note, `Ctrl+Shift+T` a new docked task.
- Markdown editing with live preview (rendered via `marked` + `dompurify`).
- Folders, tags, pinning, search, and a command palette.
- Customizable theme: light/dark, accent, density, reduced motion, editor view, focus mode.
- Local persistence through `tauri-plugin-sql` (SQLite).

## Requirements

- [bun](https://bun.sh/) (package manager)
- [Rust](https://www.rust-lang.org/tools/install) toolchain
- Tauri v2 system dependencies: https://v2.tauri.app/start/prerequisites/

## Getting started

```bash
bun install
bun run tauri dev   # full desktop app (DB, windows, plugins)
```

`bun run dev` starts only the Vite dev server. In a plain browser the SQLite layer is unavailable and stores fall back to bundled seed notes — use `bun run tauri dev` for real data.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Vite dev server only (frontend in browser) |
| `bun run tauri dev` | Full desktop app |
| `bun run build` | Frontend build to `build/` |
| `bun run tauri build` | Production bundle |
| `bun run check` | `svelte-check` typecheck |
| `bun run fmt` / `bun run fmt:check` | `cargo fmt` on `src-tauri` |
| `bun run clippy` | `cargo clippy` with `-D warnings` |
| `bun run check:shared` | Typecheck `packages/shared` (`tsc`) |
| `bun run check:all` | `check` + `check:shared` + `fmt:check` + `clippy` |
| `bun run release` | Cut a release: bump versions, update `CHANGELOG.md`, commit, tag `vX.Y.Z` |
| `bun run release:dry` | Preview the version bump and changelog without changing anything |

## Versioning & releases

Versions follow [Semantic Versioning](https://semver.org/) and are derived automatically from [Conventional Commits](https://www.conventionalcommits.org/) (`feat:` → minor, `fix:` → patch, `!` / `BREAKING CHANGE` → major) via [`commit-and-tag-version`](https://github.com/absolute-version/commit-and-tag-version) — the maintained successor of the deprecated `standard-version`.

One command keeps **every** version file in lockstep:

| File | Why it matters |
| --- | --- |
| `package.json` | source of truth for the current version |
| `src-tauri/tauri.conf.json` | bundle version + About panel (`appInfo.version`) |
| `src-tauri/Cargo.toml` | Rust crate version |
| `src-tauri/Cargo.lock` | keeps binary builds from a release tag reproducible |

```bash
bun run check:all          # sanity-check before cutting a release
bun run release:dry        # preview bump + changelog, changes nothing
bun run release            # bump all files, update CHANGELOG.md, commit, tag vX.Y.Z
git push --follow-tags      # publish the commit and tag when ready
```

Pushing the tag starts the **Release** workflow (`.github/workflows/release.yml`). It builds the installers on Windows, macOS (arm64 + Intel), and Linux with [`tauri-action`](https://github.com/tauri-apps/tauri-action) and publishes the GitHub Release for the tag:

```bash
git push origin main        # the release commit
git push origin v0.1.0      # the tag — this is what triggers the build
```

The build is **unsigned** for now (no signing certificates are configured): macOS shows a Gatekeeper warning and Windows a SmartScreen prompt on first launch. Re-running a failed job rebuilds only that platform and attaches to the same Release.

Things worth knowing:

- **First release:** `bun run release -- --first-release` tags the current version as-is without bumping.
- **Force a bump:** `bun run release -- --release-as minor`. Below 1.0.0 the tool follows the npm/cargo convention — only breaking changes raise the minor, everything else bumps the patch, so plain `feat:` commits go `0.1.0 → 0.1.1`; pass `--release-as minor` if you want `0.2.0`.
- **Never edit versions by hand.** `src/lib/version-sync.test.ts` fails the test suite if the four files drift apart, and custom updaters in `scripts/` rewrite only the version line of each file (formatting, inline arrays, and CRLF line endings are preserved).
- A `postbump` hook runs `cargo update --offline -p stylenotes` so `Cargo.lock` always matches `Cargo.toml`, and the release commit includes it.

## Project layout

```
src/                     SvelteKit frontend
  routes/                +page.svelte branches per window role
  lib/db/                SQLite repos
  lib/stores/            Svelte 5 rune stores
  lib/components/        workspace, overlay, dialogs, ui (shadcn-svelte)
  lib/content/           seed notes + markdown
src-tauri/               Rust backend
  src/lib.rs             Tauri setup, plugins, DB migrations
  tauri.conf.json        window + plugin config
  capabilities/          window permissions
packages/shared/         @stylenotes/shared — sync contract (MIT), shared with the cloud
```

See `AGENTS.md` for developer conventions and architecture notes.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).