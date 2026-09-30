# stylenotes-mcp

An [Agent Skill](https://agentskills.io/specification) for using the StyleNotes
local MCP server. It works with any MCP-capable agent (Claude Code / Desktop,
Cursor, Codex, Zed, …) that can reach a local `stdio` server.

## What it gives an agent

- **What the app is for** — a workspace is a vault and StyleNotes is the user's
  second brain — a local-first home for personal knowledge, where a workspace is
  a vault — so an agent recalls from their notes instead of answering from its
  own memory.
- **Which tool for which question** — a short routing table instead of 28
  undifferentiated tools.
- **Which body write to use** — patch in place, add to the end, or rewrite;
  the cheapest one that fits, so a one-word fix does not cost a full note.
- **The correct call order** — locate the workspace, then the entity, then read,
  then write, then verify.
- **The traps** — missing `workspace` silently targeting `workspace-default`,
  ignoring `blocked`, misreading `dependency_cycle`, trusting `dueAt` strings,
  deleting without `confirm`, stale snapshots, quoting an excerpt as the body.
- **Error recovery** — every code mapped to its cause and fix.
- **Recipes** — recall a topic across the vault, capture a thought into it, and
  the task/dependency workflows.

## Install

1. Enable the local MCP server in StyleNotes: **Settings → MCP**, turn it on,
   and grant the scopes you want the agent to have.
2. Copy the client config from **Settings → MCP** for your client, or adapt
   [assets/mcp-client-config.json](assets/mcp-client-config.json).
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
│   ├── tool-reference.md             # all 28 tools, args, response fields
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
