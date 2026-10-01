# stylenotes-mcp

An [Agent Skill](https://agentskills.io/specification) for using the StyleNotes
MCP server. It works with any MCP-capable agent (Claude Code / Desktop, Cursor,
Codex, Zed, …) that can reach the server — locally over stdio, or through the
app's remote HTTP endpoint.

## What it gives an agent

- **What the app is for** — StyleNotes is the user's second brain, a local-first
  home for their thinking and their commitments, where a workspace is a vault — so
  an agent recalls from their notes instead of answering from its own memory.
- **Which tool for which question** — a short routing table instead of 32
  undifferentiated tools.
- **Which body write to use** — patch in place, add to the end, or rewrite;
  the cheapest one that fits, so a one-word fix does not cost a full note.
- **The journal** — one entry per local day, reached through `journal_today`
  rather than by hunting for a note whose title looks like a date.
- **What runs where** — the three memory tools (`semantic_search`, `related_notes`,
  `list_themes`) are forwarded to the app, so they work over MCP; the skill notes
  the extra latency and points `find_contradictions` at the in-app assistant.
- **The correct call order** — locate the workspace, then the entity, then read,
  then write, then verify.
- **The traps** — missing `workspace` silently targeting `workspace-default`,
  ignoring `blocked`, misreading `dependency_cycle`, trusting `dueAt` strings,
  deleting without `confirm`, stale snapshots, quoting an excerpt as the body.
- **Error recovery** — every code mapped to its cause and fix.
- **Recipes** — recall a topic across the vault, capture a thought into it, and
  the task/dependency workflows.

## Install

1. Enable MCP in StyleNotes: **Settings → MCP**, turn it on, and grant the scopes
   you want the agent to have. Choose the local (stdio) server for a same-machine
   client, or the remote (HTTP) endpoint to reach it from elsewhere.
2. Copy the client config from **Settings → MCP** for your client and transport,
   or adapt [assets/mcp-client-config.json](assets/mcp-client-config.json).
3. Drop this directory where your agent looks for skills. Typical locations:
   - Claude Code / OpenCode: `.agents/skills/` or `~/.agents/skills/`
   - Claude Desktop: `~/Library/Application Support/Claude/skills/` (macOS)
   - Cursor / others: the skills directory named in the client's docs
4. Restart the client so it picks up both the skill and the new MCP server.

## Layout

```
stylenotes-mcp/
├── SKILL.md                          # entry point: model, workflow, traps
├── references/
│   ├── tool-reference.md             # all 32 tools, args, response fields
│   ├── errors.md                     # error codes -> cause -> fix
│   └── workflows.md                  # longer end-to-end recipes
├── scripts/
│   └── validate-skill.mjs            # checks this skill against the spec
└── assets/
    └── mcp-client-config.json        # config template
```

## Validate

```bash
node scripts/validate-skill.mjs .
```

Checks frontmatter, the `name` ↔ directory rule, description length, relative
links, and the 500-line budget. Add it to CI to catch drift.

## Notes

- The skill only describes the client contract. It does not ship the server; the
  binary and the file bridge live in the StyleNotes app.
- Read-only is the default. Writes need both a grant in Settings and the
  matching scope; the skill explains how to ask the user for it.
