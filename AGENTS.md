# AGENTS.md

StyleNotes: Tauri v2 + SvelteKit (Svelte 5) + TypeScript desktop note app. Rust backend in `src-tauri`, frontend in `src`. Package manager is **bun** (not npm/pnpm).

## Commands

- `bun run dev` — Vite dev server only (frontend in browser; SQLite is stubbed, see below)
- `bun run tauri dev` — full desktop app (required for DB, windows, plugins)
- `bun run mcp:sidecar` — builds the `stylenotes-mcp` shim and copies it beside `src-tauri/` under the target-triple name (`beforeDevCommand`/`beforeBuildCommand` run this automatically)
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

## Local MCP (stdio)

- **Binary + build.** The shim is `src-tauri/src/mcp/` (bin target `stylenotes-mcp`, `[[bin]]` in `Cargo.toml`) and is bundled via `bundle.externalBin` in `tauri.conf.json`. Tauri resolves that to `src-tauri/stylenotes-mcp-<target-triple>.exe`, so `scripts/mcp-sidecar.cjs` builds and copies it; it runs from `beforeDevCommand`/`beforeBuildCommand` and is **gitignored** (never commit the binary).
- **No port, no auth (#D11).** Transport is stdio, one process per client, spawned by the MCP client itself. The trust boundary is "can run a local process", so there is no token to configure.
- **Writes always go through the app (#D2).** The shim never opens SQLite: reads answer from `mcp/snapshot.json`, writes become job files in `mcp/jobs/` that the always-alive `workspace` window executes. `src-tauri/src/mcp_host.rs` owns the file bridge; `src/lib/stores/mcp-host.svelte.ts` runs in the workspace window and executes jobs through `src/lib/content/mcp-write-actions.ts` (validators + repos + `*-changed` events). Never add a second write path that bypasses the store.
- **Reads are a snapshot (#D3).** `src/lib/content/mcp-snapshot.ts` builds it with the same `buildWorkspaceGraph`/`isTaskBlocked` the UI uses; the shim only filters. Default is **read-only**; write needs an explicit grant (`mcp_settings`, `meta:mcp/enabled`) and is audited (`mcp_audit`). MCP settings are **device-local** — keep them out of the synced `settings` row.
- **Settings page** is `src/lib/components/workspace/McpSettings.svelte` (nav `MCP` in `SettingsPanel.svelte`; `AI` is a separate section). `app-info.json`/`snapshot.json`/`backups/` live under `app_data_dir()/mcp/` and are **not** app data to commit.
- Design + decisions: `docs/design/mcp-local-free.md` (#D1–#D16).

## AI assistant (BYOK, device-local)

- **Free tier is bring-your-own-key.** The user configures an OpenAI-compatible or Anthropic endpoint in `Settings → AI`; there is no server in this repo. `docs/design/cloud-sync-ai-mcp.md` §8 describes the future hosted gateway; the client provider contract is designed so it can move behind that gateway without UI changes.
- **Rust owns crypto + network; the frontend owns persistence.** `src-tauri/src/ai/` holds the provider stack (ported from the `alnair-router` gateway), the AES-256-GCM cipher, and the commands. The key is encrypted at rest in `ai_settings.api_key` (`enc:v1:` marker); the cipher key lives in `app_data_dir()/ai/secrets.key` and is created on first use. The key crosses IPC as plaintext only for the duration of a request.
- **Commands:** `ai_encrypt_key`, `ai_decrypt_key`, `ai_test_connection`, `ai_stream` (streams tokens over a Tauri `Channel`). All registered in `generate_handler!`.
- **Frontend pieces:** store `src/lib/stores/ai.svelte.ts`, repo `src/lib/db/ai.ts`, contract `src/lib/content/ai-types.ts`, pure UI logic `src/lib/content/ai-assistant.ts`. Settings UI is `AiSettings.svelte`; the editor popover is `note/AiAssistantPopover.svelte` (via `note/AiEditorAssist.svelte`); the docked chat is `workspace/AiChatPanel.svelte`.
- **Markdown:** assistant replies render through `note/AiMessageBody.svelte`, which reuses the note-preview pipeline (`renderNoteHtml` → `renderNotePreviewHtml`, DOMPurify-sanitized) with a `markdown-body--compact` variant. It shows raw text while a reply is streaming so tokens do not re-render on every chunk. `[[wiki links]]` in a reply are **clickable**: the body forwards clicks to the chat panel (`onwikilink`), which closes the panel so the target note/task shows. Because the chat is global, `Workspace.handleChatWikiClick` resolves without a source note.
- **Mentions:** the composer (`note/AiComposer.svelte`) supports `@` to pull a note or task into the message. Parsing/ranking/id round-trip live in `content/ai-mentions.ts` (pure, tested); `AiChatPanel.svelte` turns the resolved `@Title` tokens into system-context blocks via `mentionedIds`. The picker is `note/MentionPopover.svelte`.
- **Thread titles:** after the first exchange the panel calls `generateThreadTitle(id)` **fire-and-forget** (no await, no timeout), so a slow provider never stalls the chat. The title is written when it resolves and the thread list refreshes in parallel. Only threads still marked auto-titleable (`markThreadAutoTitle`, set on generic creation, cleared by `renameThread`) are renamed, so a manual rename is never clobbered; `titleState` drives the chip spinner.
- **Layout:** the chat panel (`AiChatPanel.svelte`) is **always a left-side overlay drawer** (fixed, scrim, `min(380px, 100vw-1.25rem)`) at every window size, so opening it never squeezes the editor. It is a floating layer, not a flex sibling. `Escape` or the scrim closes it.
- **Global chat with MCP tools.** The chat is **not** scoped to the open note: it answers across every note and task via tools, and the note-body context was removed. Tool definitions live in `content/ai-tool-schema.ts` (names/kinds/scopes must match `mcp-tools.ts`; `mcp-tools.test.ts` enforces it). The executor is `content/ai-tools.ts`: reads filter the in-app snapshot, writes delegate to `mcp-write-actions.ts`. `content/ai-context.ts` builds the snapshot + write context from the stores, independent of whether the MCP server is enabled.
- **Tool grant is separate from MCP.** `ai_settings.access`/`scopes` (migration 14) gate write tools for the assistant alone; read tools need no grant. `Settings → AI` exposes it. Read tools run automatically; **every write asks the user to Allow/Decline inline** in `AiChatPanel` before `executeToolCall` runs it. The provider tool loop lives in `streamCompletion` (`AI_MAX_TOOL_STEPS` caps round trips).
- **Rust tool-calling:** `ProviderConfig.tools` carries OpenAI-shape definitions; `StreamEvent::ToolCall` returns assembled calls. OpenAI accumulates streamed `tool_calls` fragments; Anthropic accumulates `tool_use`/`input_json_delta` blocks and converts tool definitions to its `input_schema` shape.
- **Reasoning and tool traffic are recorded (migration 16).** `StreamEvent::Reasoning` is separate from `StreamEvent::Delta` so a chain of thought never reads as the answer: OpenAI parsers read `delta.reasoning_content` (DeepSeek) or `delta.reasoning` (OpenRouter), Anthropic reads `thinking_delta` blocks. `ai_messages` stores `reasoning`, `tool_calls` and `tool_results` alongside `content` (the answer body only), so a reopened chat shows how an answer was reached. `appendMessage` takes an optional `trace`; `AiChatPanel.send` captures it via `onReasoning` + the tool runner. A call with no stored result means the app closed mid-turn — `interrupted`, never invent a verdict.
- **Trace UI:** `components/ai/AiReasoning.svelte` (collapsible chain of thought) and `components/ai/AiToolTrace.svelte` (collapsible tool calls with parameters/result). Both are hand-ported from Svelte AI Elements — no `runed`, no shiki `code`, no shadcn `badge`/`collapsible` — and their pure logic lives in `content/ai-trace.ts`.
- **Assistant-only tools.** `ask_user_question`, `web_search` and `web_fetch` carry `aiOnly: true` in `ai-tool-schema.ts` and are **deliberately absent** from `mcp-tools.ts` / the Rust shim, so an external MCP client cannot use the app as a network proxy or prompt the user. `mcp-tools.test.ts` asserts the split both ways.
- **`ask_user_question` is interactive.** `spec.interactive` makes the chat park the turn on the user: `executeToolCall` awaits an `ask` hook that `AiChatPanel` supplies, which renders `components/ai/AiQuestionCard.svelte` inline. Validation and answer shaping are pure in `content/ai-questions.ts`. Every question keeps a Skip and the card has a "Decide for me" escape, so the turn can never deadlock; a stored call with no result stays `interrupted`.
- **Web tools are BYOK and Rust-owned.** `ai_settings.search_provider` / `search_api_key` (migration 17) hold the provider and its `enc:v1:` key, like the model key; `provider = ''` means search is off. `src-tauri/src/ai/web.rs` does the network (Tavily / Brave / Exa / Serper, or `combo`), `web_html.rs` owns the SSRF guard (`is_blocked_host`/`vet_url` — blocks localhost, private ranges, cloud metadata) plus HTML→text, and `web_commands.rs` exposes `ai_web_search` / `ai_web_fetch` / `ai_search_providers`. The frontend resolves the key and passes it in, as with the model provider.
- **Tables (migration 13/14/16/17):** `ai_settings` (adds `search_provider`, `search_api_key`, `search_fallbacks` in 17), `ai_threads`, `ai_messages` (adds `reasoning`, `tool_calls`, `tool_results` in 16). AI settings and chat history are **device-local** — keep them out of the synced `settings` row.
- **Store layout:** `stores/ai.svelte.ts` owns the conversation and streaming, `stores/ai-settings.svelte.ts` the settings persistence (it re-exports through `ai.svelte.ts` for callers), and `stores/ai-web.svelte.ts` the web hooks and provider list.

## Database / migrations

- SQLite via `tauri-plugin-sql`; URL `sqlite:stylenotes.db` is defined in **two places that must stay in sync**: `src-tauri/src/lib.rs` (`DB_URL`) and `tauri.conf.json` `plugins.sql.preload`.
- Schema/migrations live **only** in `src-tauri/src/lib.rs`. Add a new `Migration` entry with an incremented `version`; never edit an applied migration.
- Frontend DB access is `src/lib/db/index.ts` (`notesRepo`, `foldersRepo`, `notificationsRepo`, `settingsRepo`, `tasksRepo`, `metaRepo`), `src/lib/db/ui-plugins.ts`, and `src/lib/db/mcp.ts` (`mcpRepo`). Stores in `src/lib/stores/` wrap these and call them.
- **`notes.updated_at`** (migration 12) is the machine-readable timestamp; `notes.updated` stays a display string. Any new note write must set `updatedAt` (`notesRepo.upsert` stamps it when absent). Cloud-sync Phase 0 must **backfill**, not re-add the column.
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
- The former offenders (`Workspace.svelte`, `DockRail.svelte`, `NoteEditor.svelte`, `SettingsPanel.svelte`) are back under the cap. `Workspace.svelte` is now a thin shell over `$lib/stores/workspace-controller.svelte.ts` (state + operations), `workspace-session.svelte.ts` (hydration + cross-window listeners), `workspace-folder-ops.ts` and `workspace-wiki.ts`.

## Skills

Repo-local skills are in `.agents/skills/` (`svelte`, `shadcn-svelte`, `tauri-v2`). Load them when working in those areas.