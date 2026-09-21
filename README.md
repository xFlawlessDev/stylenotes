# StyleNotes

A desktop markdown note-taking app built with Tauri v2, SvelteKit (Svelte 5), and TypeScript. Notes live in a local SQLite database and the UI ships as a static SPA.

## Features

- Three windows driven by one route:
  - **workspace** — full note editor with feed, vault rail, command palette, settings, and notifications.
  - **overlay** — always-on-top dock rail for quick access.
  - **kanban** — task board that can lock itself to the desktop as an underlay (`Ctrl+Shift+K` toggles lock / always-on-top).
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
| `bun run check:all` | `check` + `fmt:check` + `clippy` |

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
```

See `AGENTS.md` for developer conventions and architecture notes.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).