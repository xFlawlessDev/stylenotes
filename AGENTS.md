# AGENTS.md

StyleNotes: Tauri v2 + SvelteKit (Svelte 5) + TypeScript desktop note app. Rust backend in `src-tauri`, frontend in `src`. Package manager is **bun** (not npm/pnpm).

## Commands

- `bun run dev` — Vite dev server only (frontend in browser; SQLite is stubbed, see below)
- `bun run tauri dev` — full desktop app (required for DB, windows, plugins)
- `bun run build` — frontend build to `build/` (adapter-static SPA)
- `bun run tauri build` — production bundle
- `bun run check` — svelte-check + sync (typecheck frontend)
- `bun run check:all` — runs `check`, `fmt:check`, then `clippy`; use before finishing work
- `bun run fmt` / `bun run fmt:check` — cargo fmt on `src-tauri`
- `bun run clippy` — cargo clippy, `-D warnings` (warnings fail)

## Architecture

- **Two Tauri windows share one route.** `workspace` and `overlay` are declared in `tauri.conf.json`, both load `/`. `src/routes/+page.svelte` branches on `currentWindowRole()` from `src/lib/windows.ts`. Any window logic must handle both roles.
- **SSR is off** (`+layout.ts` exports `ssr = false`); adapter-static with `index.html` fallback. Do not add server-only code/load functions.
- **Fixed dev port 1420** with `strictPort`; Vite ignores `src-tauri/**`.
- **Windows start invisible** (`visible: false`) and are revealed client-side by `revealCurrentWindow()`. Don't remove that.

## Database / migrations

- SQLite via `tauri-plugin-sql`; URL `sqlite:stylenotes.db` is defined in **two places that must stay in sync**: `src-tauri/src/lib.rs` (`DB_URL`) and `tauri.conf.json` `plugins.sql.preload`.
- Schema/migrations live **only** in `src-tauri/src/lib.rs`. Add a new `Migration` entry with an incremented `version`; never edit an applied migration.
- Frontend DB access is `src/lib/db/index.ts` (`notesRepo`, `foldersRepo`, `notificationsRepo`, `settingsRepo`, `metaRepo`). Stores in `src/lib/stores/` wrap these and call them.
- Outside Tauri, `getDb()` rejects and stores fall back to seed data (`src/lib/content/content.ts`, markdown in `src/lib/content/notes/`). Guard new DB work with `browser`/`isTauri` and swallow errors like existing stores do.

## Tauri / capabilities

- New window or plugin APIs need matching permissions in `src-tauri/capabilities/default.json` (applies to both `workspace` and `overlay`). Missing permissions fail silently at runtime.
- Rust crate lib name is `stylenotes_lib` (`src-tauri/Cargo.toml`).
- `tauri-plugin-prevent-default` blocks browser shortcuts, but dev builds keep DevTools + Reload (`lib.rs`).

## Frontend conventions

- Svelte 5 runes (`$state`, `$props`, `$derived`); rune-based stores use the `.svelte.ts` suffix (e.g. `settings.svelte.ts`). Plain logic modules use `.ts`.
- shadcn-svelte components live in `src/lib/components/ui/`; aliases from `components.json` (`$lib/components`, `$lib/utils`, `$lib/components/ui`). Add via `bunx shadcn-svelte add`.
- Styling is Tailwind v4 + custom CSS in `src/routes/layout.css`, using both shadcn tokens and Material 3 `--color-*` tokens. Theme is applied via `html` classes (`light`/`dark`) and `data-*` attributes, bootstrapped pre-hydration in `src/app.html`.
- Markdown rendering uses `marked` + `dompurify`; sanitize any HTML output.

## Skills

Repo-local skills are in `.agents/skills/` (`svelte`, `shadcn-svelte`, `tauri-v2`). Load them when working in those areas.