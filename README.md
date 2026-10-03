<div align="center">

<img src="docs/assets/logo.png" alt="StyleNotes" width="104" height="104">

# StyleNotes

**A calm, private notebook for your ideas, lists, and drafts.**

Markdown notes, tasks, and a graph that connects them — in a fast desktop app that
works entirely offline. No account. No internet required.

[![CI](https://github.com/xFlawlessDev/stylenotes/actions/workflows/ci.yml/badge.svg)](https://github.com/xFlawlessDev/stylenotes/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/xFlawlessDev/stylenotes?sort=semver&label=release&color=3B82F6)](https://github.com/xFlawlessDev/stylenotes/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/xFlawlessDev/stylenotes/total?label=downloads&color=22C55E)](https://github.com/xFlawlessDev/stylenotes/releases)
[![License](https://img.shields.io/github/license/xFlawlessDev/stylenotes?label=license&color=3B82F6)](LICENSE)

[![Tauri v2](https://img.shields.io/badge/Tauri_v2-24C8DB?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Svelte 5](https://img.shields.io/badge/Svelte_5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

<img src="docs/assets/screenshots/notes.webp" alt="The StyleNotes workspace: a folder rail, a note feed, and a rendered Markdown note" width="100%">

</div>

StyleNotes keeps everything you write down — and everything you mean to do — in one
local place. Write in plain Markdown and see it rendered live; file notes into
folders and tags; link them with `[[wiki links]]` so ideas connect themselves; and
keep commitments as tasks with due dates, priorities, and dependencies. It is built
with Tauri v2, SvelteKit (Svelte 5), and TypeScript, stores your notes in a local
SQLite database, and ships as a static SPA.

## What it does

- **Notes that are just Markdown.** Write in plain text — headings, tables,
  checklists, blockquotes, code, math, and Mermaid diagrams all render in a live
  preview. Nothing is locked in a proprietary format, and export is plain `.md`.
- **Tasks beside your thinking.** A board for status, a list for focus, a Gantt view
  for what is blocked by what. Link a task to the notes it came from.
- **A graph, not a filing cabinet.** `[[wiki links]]` turn your notes into a map you
  can explore, hover, and search.
- **Search that finds the thought, not just the word.** A command palette (`Ctrl K`)
  jumps to any note, task, or action; full-text search covers titles, tags, and
  bodies. An optional local embedder adds meaning-based recall.
- **Windows that fit how you work.** A full workspace for deep work, an always-on-top
  dock for capture, and a Kanban board that can sit *behind* your other windows as a
  desktop underlay.
- **Capture from anywhere.** `Ctrl+Shift+N` and `Ctrl+Shift+T` open a new note or task
  in a small, always-on-top window — without leaving what you were doing.
- **Yours to make.** Light/dark, accent color, density, reduced motion, and the
  editor layout are all a setting away.

## Built for the desktop

### Floating above, or tucked underneath

The **overlay dock** stays on top of your other apps, so quick access is always one
click away — hover a note or task for a preview, double-click to open its detail
window. When you would rather not be interrupted, the **Kanban board** locks itself to
the desktop as an *underlay*: your tasks follow you behind every window instead of on
top of them. `Ctrl+Shift+\` flips between the two.

<img src="docs/assets/screenshots/overlay-and-underlay.webp" alt="The always-on-top overlay dock floating over the desktop, and the Kanban board locked as a desktop underlay behind other windows" width="100%">

### A sticky note, one keystroke away

`Ctrl+Shift+N` drops a new note and `Ctrl+Shift+T` a new task into a small,
always-on-top detail window. Jot the thought down over whatever you were doing — it
saves as you type and is waiting in the workspace next time.

<img src="docs/assets/screenshots/quick-windows.webp" alt="A floating quick-capture note window and a task window open on top of other applications" width="100%">

## A look around

| | |
| :---: | :---: |
| <img src="docs/assets/screenshots/note-markdown.webp" alt="A Markdown note with tables, a checklist, and a rendered Mermaid diagram" width="100%"><br>**Markdown, rendered live** | <img src="docs/assets/screenshots/kanban.webp" alt="The Kanban task board with Backlog, To do, In progress, In review, and Done columns" width="100%"><br>**Tasks as a board** |
| <img src="docs/assets/screenshots/gantt.webp" alt="The Gantt view showing task bars and Blocked-by badges" width="100%"><br>**Gantt with dependencies** | <img src="docs/assets/screenshots/graph.webp" alt="The workspace graph showing notes, tasks, and the links between them" width="100%"><br>**The graph of your notes** |
| <img src="docs/assets/screenshots/journal.webp" alt="A daily journal entry with a Focus list and notes" width="100%"><br>**A daily journal page** | <img src="docs/assets/screenshots/command-palette.webp" alt="The command palette searching notes and tasks" width="100%"><br>**Command palette (Ctrl K)** |

## Your notes, your device

StyleNotes is **local-first by design**. Notes live in a SQLite file on your machine,
the app opens and edits with no connection, and nothing is sent anywhere unless you
explicitly turn on an optional cloud feature. You can point a workspace at a folder
and get a plain-Markdown mirror of it, exported and re-imported automatically, so
your writing is never trapped in the app either.

## Open core

This repository is the **full, free desktop app**. Cloud sync, a hosted AI gateway,
and remote MCP are optional capabilities served by a separate (proprietary) service
— the desktop app is cloud-ready but works completely offline without it.

| Part | License |
| --- | --- |
| The app (`src/`, `src-tauri/`) | [AGPL-3.0-only](LICENSE) |
| The shared protocol (`packages/shared/`) | [MIT](packages/shared/LICENSE) |

`packages/shared` is the sync contract (types, Hybrid Logical Clock, entitlements)
shared with the cloud service. It is deliberately framework-free so third parties can
build their own client or server against the same protocol.

Contributions are welcome under the CLA described in [CONTRIBUTING.md](CONTRIBUTING.md).

## Requirements

- [bun](https://bun.sh/) (package manager)
- [Rust](https://www.rust-lang.org/tools/install) toolchain
- Tauri v2 system dependencies: https://v2.tauri.app/start/prerequisites/

## Getting started

```bash
bun install
bun run tauri dev   # full desktop app (DB, windows, plugins)
```

`bun run dev` starts only the Vite dev server. In a plain browser the SQLite layer is
unavailable and stores fall back to bundled seed notes — use `bun run tauri dev` for
real data.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Vite dev server only (frontend in browser) |
| `bun run tauri dev` | Full desktop app |
| `bun run build` | Frontend build to `build/` |
| `bun run tauri build` | Production bundle |
| `bun run check` | `svelte-check` typecheck |
| `bun run test` | Vitest unit tests |
| `bun run fmt` / `bun run fmt:check` | `cargo fmt` on `src-tauri` |
| `bun run clippy` | `cargo clippy` with `-D warnings` |
| `bun run check:shared` | Typecheck `packages/shared` (`tsc`) |
| `bun run check:all` | `check` + `check:shared` + `fmt:check` + `clippy` |
| `bun run release` | Cut a release: bump versions, update `CHANGELOG.md`, commit, tag `vX.Y.Z` |
| `bun run release:dry` | Preview the version bump and changelog without changing anything |

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

The four window roles all load the same route and branch on the current role:
`workspace` (the full editor), `overlay` (the always-on-top dock), `kanban` (the task
board, lockable to the desktop), and on-demand `note-<id>` / `task-<id>` detail
windows.

See `AGENTS.md` for developer conventions and architecture notes.

## Versioning & releases

Versions follow [Semantic Versioning](https://semver.org/) and are derived
automatically from [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:` → minor, `fix:` → patch, `!` / `BREAKING CHANGE` → major) via
[`commit-and-tag-version`](https://github.com/absolute-version/commit-and-tag-version)
— the maintained successor of the deprecated `standard-version`.

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

Pushing the tag starts the **Release** workflow (`.github/workflows/release.yml`). It
builds the installers on Windows, macOS (arm64 + Intel), and Linux with
[`tauri-action`](https://github.com/tauri-apps/tauri-action) and publishes the GitHub
Release for the tag:

```bash
git push origin main        # the release commit
git push origin v0.1.0      # the tag — this is what triggers the build
```

The build is **unsigned** for now (no signing certificates are configured): macOS
shows a Gatekeeper warning and Windows a SmartScreen prompt on first launch.
Re-running a failed job rebuilds only that platform and attaches to the same Release.

Things worth knowing:

- **First release:** `bun run release -- --first-release` tags the current version as-is without bumping.
- **Force a bump:** `bun run release -- --release-as minor`. Below 1.0.0 the tool follows the npm/cargo convention — only breaking changes raise the minor, everything else bumps the patch, so plain `feat:` commits go `0.1.0 → 0.1.1`; pass `--release-as minor` if you want `0.2.0`.
- **Never edit versions by hand.** `src/lib/version-sync.test.ts` fails the test suite if the four files drift apart, and custom updaters in `scripts/` rewrite only the version line of each file (formatting, inline arrays, and CRLF line endings are preserved).
- A `postbump` hook runs `cargo update --offline -p stylenotes` so `Cargo.lock` always matches `Cargo.toml`, and the release commit includes it.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
