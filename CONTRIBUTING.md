# Contributing to StyleNotes

Thanks for wanting to help. StyleNotes is open core: the **desktop app** is free and
open source (AGPL-3.0), and the **cloud service** is a separate, private project.
Everything in this repository is the app.

## Before you start

- Read `AGENTS.md` — it is the developer handbook (commands, architecture, hard rules).
- For anything larger than a bug fix, open an issue first so we can agree on the shape.

## Development

```bash
bun install
bun run tauri dev     # full desktop app (DB, windows, plugins)
```

Run the full gate before opening a pull request:

```bash
bun run check:all     # svelte-check + shared typecheck + cargo fmt + clippy
bun run test          # Vitest
```

No pull request is merged with a red `check:all` or a failing test.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:` …). Releases are derived from them automatically, so a
well-formed message is what decides the next version.

## Contributor License Agreement (CLA)

StyleNotes keeps the option to relicense and to keep the cloud service proprietary.
To make that possible, every contributor must sign a CLA **before their first pull
request is merged**. The CLA only grants the project the right to use your
contribution under the project's licenses; **you keep the copyright to your work**.

The signing flow is set up on the hosting provider (a CLA assistant bot on pull
requests). If it is not yet live when you contribute, a maintainer will ask you to
acknowledge the CLA in the pull request.

## Licensing of contributions

Unless you state otherwise, any contribution you submit is licensed under
**AGPL-3.0-only** for the app, and — for files under `packages/shared/` —
**MIT**, matching the surrounding code.

## Code of conduct

Participation is covered by `CODE_OF_CONDUCT.md`. Be kind; we are all here to make
a calm, private notebook.
