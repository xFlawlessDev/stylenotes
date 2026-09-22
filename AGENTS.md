# AGENTS.md

StyleNotes: Tauri v2 + SvelteKit (Svelte 5) + TypeScript desktop note app. Rust backend in `src-tauri`, frontend in `src`. Package manager is **bun** (not npm/pnpm).

## Commands

- `bun run dev` — Vite dev server only (frontend in browser; SQLite is stubbed, see below)
- `bun run tauri dev` — full desktop app (required for DB, windows, plugins)
- `bun run build` — frontend build to `build/` (adapter-static SPA)
- `bun run tauri build` — production bundle
- `bun run check` — svelte-check + sync (typecheck frontend)
- `bun run test` — Vitest unit tests (`src/**/*.test.ts`); `bun run test:watch` for watch mode
- `bun run check:all` — runs `check`, `fmt:check`, then `clippy`; use before finishing work
- `bun run release` — cut a release: bumps `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` in lockstep, updates `CHANGELOG.md`, commits, and tags `vX.Y.Z` (creates a commit/tag — run only when explicitly asked)
- `bun run release:dry` — preview the version bump and changelog without changing anything
- `bun run fmt` / `bun run fmt:check` — cargo fmt on `src-tauri`
- `bun run clippy` — cargo clippy, `-D warnings` (warnings fail)

## Hard rules

- **Never start a dev server.** Do not run `bun run dev`, `bun run tauri dev`, `bun run preview`, or `bun run tauri build`. The user runs and tests the app manually. Verify your work with `bun run check`, `bun run test`, `bun run fmt:check`, and `bun run clippy` only.
- Never edit an applied migration; add a new one with an incremented `version`.
- Never leave DB writes fire-and-forget without handling failure: repo helpers return `boolean` and callers must surface errors.
- Never remove `visible: false` window config or `revealCurrentWindow()`.
- Never add server-only code (`load` functions, `+server.ts`, Node APIs); SSR is off.
- Never use `localStorage` for app data — SQLite is the source of truth (the single exception is the pre-paint theme mirror in `app.html`/`applySettings`).
- Never commit or push unless explicitly asked.
- Never bump versions by hand — run `bun run release` so `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` stay in lockstep (enforced by `src/lib/version-sync.test.ts`). Release tooling lives in `.versionrc.json` + `scripts/*-updater.cjs`.

## Architecture

- **Tauri windows share one route.** `workspace`, `overlay`, and `kanban` are declared in `tauri.conf.json`; `note-<id>` and `task-<id>` detail windows are created on demand by `openNoteWindow`/`openTaskWindow` (`src/lib/windows.ts`). All load `/` and `src/routes/+page.svelte` branches on `currentWindowRole()` from `src/lib/windows.ts`. Any window logic must handle all roles.
- **SSR is off** (`+layout.ts` exports `ssr = false`); adapter-static with `index.html` fallback. Do not add server-only code/load functions.
- **Fixed dev port 1420** with `strictPort`; Vite ignores `src-tauri/**`.
- **Windows start invisible** (`visible: false`) and are revealed client-side: `revealCurrentWindow()` for the declared windows, `revealAndFocusCurrentWindow()` for note/task windows (they reveal themselves once the record is loaded). Don't remove that.

## Database / migrations

- SQLite via `tauri-plugin-sql`; URL `sqlite:stylenotes.db` is defined in **two places that must stay in sync**: `src-tauri/src/lib.rs` (`DB_URL`) and `tauri.conf.json` `plugins.sql.preload`.
- Schema/migrations live **only** in `src-tauri/src/lib.rs`. Add a new `Migration` entry with an incremented `version`; never edit an applied migration.
- Frontend DB access is `src/lib/db/index.ts` (`notesRepo`, `foldersRepo`, `notificationsRepo`, `settingsRepo`, `tasksRepo`, `metaRepo`). Stores in `src/lib/stores/` wrap these and call them.
- Outside Tauri, `getDb()` rejects and stores fall back to seed data (`src/lib/content/content.ts`, markdown in `src/lib/content/notes/`). Guard new DB work with `browser`/`isTauri` and swallow errors like existing stores do.

## Tauri / capabilities

- New window or plugin APIs need matching permissions in `src-tauri/capabilities/default.json` (window globs cover `note-*`/`task-*`). Missing permissions fail silently at runtime.
- Rust crate lib name is `stylenotes_lib` (`src-tauri/Cargo.toml`).
- `tauri-plugin-prevent-default` blocks browser shortcuts, but dev builds keep DevTools + Reload (`lib.rs`).
- The `workspace`, `overlay`, and `kanban` windows **hide instead of closing** (`hide_on_close` in `lib.rs`); the titlebar close button hides too. The system tray (`src-tauri/src/tray.rs`, requires tauri's `tray-icon` feature) keeps the app alive and its "Quit StyleNotes" item is the only way to exit.
- The `kanban` window locks to the desktop via `tauri-plugin-desktop-underlay` (`src/lib/stores/kanban.svelte.ts`, `desktop-underlay:default` permission): locked = desktop underlay, unlocked = always on top. Global shortcuts (`Ctrl+Shift+\` lock, `Ctrl+Shift+N`/`Ctrl+Shift+T` quick capture) are registered in Rust (`lib.rs`) and reported to the webviews through events; the lock state lives in `settings.kanbanLocked`.

## Frontend conventions

- Svelte 5 runes (`$state`, `$props`, `$derived`); rune-based stores use the `.svelte.ts` suffix (e.g. `settings.svelte.ts`). Plain logic modules use `.ts`.
- Two component layers, never duplicated:
  - `src/lib/components/base/` — the app's own primitives (`Button`, `Input`, `Textarea`, `Select`, `Switch`, `Slider`, `ColorField`, `SearchInput`, `SegmentedControl`, `ChoiceTile`, `Field`, `EmptyState`). Single source of truth for buttons and form controls: never hand-roll a native `<button>`/`<input>`/`<select>`/`<textarea>` in app code, and never style one from scratch.
  - `src/lib/components/ui/` — vendored shadcn-svelte primitives kept for behaviour (`dialog`, `alert-dialog`, `tooltip`, `dropdown-menu`, `breadcrumb`, `select`). They may import from `base/`; `base/` must not import them. Do not re-add shadcn's `button`, `input`, `label`, `card` or `separator` — use `base/` instead.
- Styling is Tailwind v4 + custom CSS in `src/routes/layout.css`, using both shadcn tokens and Material 3 `--color-*` tokens. Theme is applied via `html` classes (`light`/`dark`) and `data-*` attributes, bootstrapped pre-hydration in `src/app.html`.
- `cn` comes from `src/lib/cn.ts`, which registers the `layout.css` type scale (`text-body-md`, `text-label-sm`, …) as font sizes. Without that, the class merger treats them as text colours and drops them. Build variants with `tv` from `src/lib/components/base/variants.ts`.
- Markdown rendering uses `marked` + `dompurify`; sanitize any HTML output.

## Svelte best practices

- **Runes only.** No Svelte 4 syntax: no `export let`, `$:`, `on:event`, `createEventDispatcher`, or `<slot>`. Use `$props`, `$derived`, `$effect`, `onclick={...}`, callback props, and snippets (`{@render}`).
- Keep `$derived` pure — no side effects or DOM writes. Use `$effect` only to sync with external systems (DOM, workers, timers); return a cleanup function when you subscribe.
- `$effect` must not read and write the same reactive state it depends on. When an effect needs a value only once, wrap it in `untrack()` (see `focusToken` handling in `NoteEditor.svelte`).
- Prefer callback props (`onupdate`, `onselect`) over event dispatchers; keep child components dumb and lift state to the parent (`Workspace.svelte`).
- Bind component props with `$bindable()` and `bind:` only for two-way UI state (dialog `open`); pass data down and events up otherwise.
- Never mutate props or objects you don't own; produce new arrays/objects (`items = items.map(...)`).
- Always handle every window role (`workspace`, `overlay`, `kanban`, `note`, `task`) in shared components — never assume one window.
- Type every `$props()` with an inline type; no `any`. Run `bun run check` before finishing.
- Use `onMount` for browser-only setup; guard with `browser`/`isTauri` for Tauri/IPC and never touch `window`/`document` at module scope.
- Async work in effects/onMount must be cancellable or guarded (`let cancelled = false`) to avoid setting state after unmount.

## Rust best practices

- Application logic lives in `src-tauri/src/lib.rs`; `main.rs` stays a thin passthrough. Keep `#[cfg_attr(mobile, tauri::mobile_entry_point)]` on `pub fn run()`.
- Never unwrap/expect on user-triggered or I/O paths. Return `Result<T, E>` from commands and map errors; `expect` is only acceptable for app-startup invariants.
- Async commands take owned types (`String`, `Vec<T>`), never borrowed (`&str`) — borrows cannot cross await points. Derive `Serialize`/`Deserialize` for all IPC payloads.
- Register every command in `tauri::generate_handler![...]`; unregistered commands fail silently.
- Use `Mutex`/`RwLock` for shared mutable state via `State<T>`, and avoid holding a lock across `.await`.
- Never block the main thread; use `async` for I/O and `tauri::async_runtime::spawn` for background work.
- New plugin/window APIs require a permission in `capabilities/default.json` or they fail silently.
- Keep `clippy -D warnings` clean, run `cargo fmt`, and add a new `Migration` (never edit an applied one) for any schema change.
- Prefer `const` over `static mut`; no `unsafe` unless unavoidable and documented.

## Size / LOC

- **Target ≤ 300 LOC per file.** This is a soft budget: aim for it, and split before you reach the hard cap.
- **Hard cap 500 LOC.** No file may exceed it. Exceeding files must be split as part of the change that pushes them over, not "later".
- One concern per file. Component `.svelte` files hold markup + local UI state; pure logic, parsing, and formatting belong in `$lib/stores/*.ts` or `$lib/content/*.ts` where they are unit-testable.
- Extract before extracting is painful: pull repeated JSX/markup into a child component, and repeated non-UI logic into a helper function with a test.
- `src/lib/components/ui/**` (shadcn-svelte) and generated files (`src-tauri/gen/**`, `build/**`, `Cargo.lock`, `bun.lock`) are exempt from the cap — do not edit or split them by hand.
- Tests may exceed 300 LOC when they cover one module; split by `describe` block only past the 500 cap.
- Current known offender: `workspace/Workspace.svelte` (~540 lines). The former offenders (`DockRail.svelte`, `NoteEditor.svelte`, `SettingsPanel.svelte`) are back under the cap after the component-base refactor.

## Skills

Repo-local skills are in `.agents/skills/` (`svelte`, `shadcn-svelte`, `tauri-v2`). Load them when working in those areas.