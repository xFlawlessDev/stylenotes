---
name: stylenotes-mcp
description: Query and edit a StyleNotes workspace through its local MCP server — search notes, trace wiki-link graphs, inspect task dependencies, and create or update notes, tasks, workspaces. Use when the user mentions StyleNotes, a StyleNotes vault or workspace, notes and tasks backed by StyleNotes, wiki links between notes, blocked tasks or a dependency chain, or asks to read or change data in StyleNotes. Do not use for generic markdown notes unrelated to StyleNotes.
license: MIT
compatibility: Requires a running StyleNotes desktop app on the same machine with its local MCP server enabled in Settings. Tools are reached over stdio; no network access is needed.
metadata:
  author: stylenotes
  version: "1.0"
---

# StyleNotes MCP

StyleNotes exposes a **local** MCP server: 24 tools (11 read, 13 write) over stdio.
A thin shim process talks to the running desktop app through a file bridge, so
every write goes through the same validation the UI uses.

This skill tells you which tool to reach for, the order to call them in, and the
traps that make results look wrong when you ignore them.

## Core mental model

1. **Reads are a snapshot.** `list_*`, `search_*`, `get_*`, `context`,
   `task_board`, `daily_summary`, `critical_path` and `graph_query` answer from a
   JSON snapshot the app refreshes after changes. They never touch the database.
2. **Writes go through the app.** Every `create_*`, `update_*`, `complete_*`,
   `delete_*`, `link_*`, `unlink_*` becomes a job the running app executes. If the
   app is closed, reads return the **last** snapshot and writes fail with
   `app_not_running`.
3. **Read-only is the default.** A write without a grant returns
   `write_not_granted`. That is a permission state, not a bug — tell the user to
   enable it in Settings → MCP.
4. **Workspaces are the scope.** There is no "current workspace" for an agent.
   Pass `workspace` explicitly or you operate on `workspace-default`.
5. **Ids are workspace-prefixed.** Every entity in a read response carries
   `ref` of the form `<workspaceId>/<entityId>`; `id` alone is the bare id.
   Both forms are accepted on input.

See [references/tool-reference.md](references/tool-reference.md) for every tool's
arguments and response shape, and
[references/errors.md](references/errors.md) for every error code and its fix.

## Workflow

### Step 1 — locate before you read

Never guess an id. Find the workspace first, then the entity:

```
list_workspaces                                  -> ids, names, counts
list_notes / list_tasks  { workspace, folder, ... } -> refs
search_notes            { query, workspace }        -> ranked note refs
```

`list_workspaces` takes no arguments and always returns every workspace with
`noteCount`, `taskCount` and `openTaskCount`. Use it to discover the exact
`workspace` id before any workspace-scoped call.

### Step 2 — read with the right tool

Pick the narrowest tool that answers the question:

| The user asks | Call |
|---|---|
| "What do I know about X?" | `context { query, workspace, depth }` |
| "Find my note about X" | `search_notes { query, workspace }` |
| "Show that note" | `get_note { id }` |
| "What links to / from this note?" | `get_note` — its `backlinks` / `outlinks` |
| "How is the board?" | `task_board { workspace }` |
| "What is due / in progress?" | `daily_summary { workspace }` |
| "Why is this task stuck?" | `get_task { id }` — `blockedBy`, `blockedByTasks` |
| "What does this task block?" | `get_task { id }` — `blocking`, `blockingTasks` |
| "Longest chain to X" | `critical_path { toId }` |
| "Everything connected to this note" | `graph_query { id, depth, kind }` |

`get_note` and `get_task` return the entity fields at the **top level** of the
response (not nested under `note` / `task`). `create_note` and `create_task`
**do** nest: `{ note: { id, ... } }`.

### Step 3 — write only after you can name the target

A correct write sequence for "mark the pricing task done":

```
1. list_tasks { workspace, status: "todo" }   -> find the task ref
2. get_task  { id: ref }                       -> confirm it is the right one
3. complete_task { id: ref }                   -> only now mutate
```

Do not skip step 2 when more than one candidate exists. `ambiguous_id` is
returned instead of guessing when the same bare id exists in two workspaces.

### Step 4 — verify a write with a fresh read

After any write, re-read the entity before reporting success to the user. The
snapshot refreshes a moment after a write, so allow a short wait on a quick
re-read — a read that returns the old value is a timing artefact, not a failed
write.

## Traps that produce wrong-looking answers

These are the mistakes that make a correct server look broken:

- **Forgetting `workspace`.** Omitting it silently targets `workspace-default`.
  A task "missing" from a workspace you created almost always lives elsewhere.
- **Ignoring `blocked`.** A task's `blocked` flag is computed from its open
  dependencies. Never state a task is ready without checking it.
- **Assuming a link means a cycle.** `link_tasks { id, dependsOn }` means
  "`id` depends on `dependsOn`". `dependency_cycle` is only returned when the
  new edge would close a loop — read the existing edges with
  `list_dependencies` before concluding a refusal is wrong.
- **Trusting `dueAt` strings as dates.** They are `YYYY-MM-DD`. `overdueOnly`
  compares them against the snapshot's own day, so a task due in the future is
  never overdue, and a `done` task never is.
- **Deleting without `confirm`.** `delete_note`, `delete_task` and
  `delete_workspace` return `bad_arguments` unless the call includes
  `confirm: true`. This is deliberate; confirm with the user first.
- **Trying to delete the fallback.** `delete_workspace` refuses
  `workspace-default` and the last remaining workspace with `last_workspace`.
- **Reading a stale snapshot as truth.** Check `appRunning` in the response
  metadata; when false, the data is the last known state and writes will fail.

## Minimal examples

Find and summarise a note:

```json
{ "name": "search_notes", "arguments": { "query": "launch brief", "workspace": "abc-123" } }
{ "name": "get_note",     "arguments": { "id": "abc-123/note-uuid" } }
```

Create a note and link a task to it:

```json
{ "name": "create_note", "arguments": { "title": "Launch brief", "body": "# Brief\n\nSee [[Pricing model]].", "folder": "launch", "tags": ["spec"], "workspace": "abc-123" } }
{ "name": "create_task", "arguments": { "title": "Approve pricing", "status": "doing", "priority": "high", "dueAt": "2026-10-01", "noteIds": ["<note id>"], "workspace": "abc-123" } }
```

Trace a dependency chain:

```json
{ "name": "list_dependencies", "arguments": { "workspace": "abc-123" } }
{ "name": "get_task",          "arguments": { "id": "abc-123/task-uuid" } }
{ "name": "critical_path",     "arguments": { "toId": "abc-123/task-uuid" } }
```

## Reference

- [references/tool-reference.md](references/tool-reference.md) — all 24 tools, arguments, response fields.
- [references/errors.md](references/errors.md) — error codes, causes, and fixes.
- [references/workflows.md](references/workflows.md) — longer end-to-end recipes.
