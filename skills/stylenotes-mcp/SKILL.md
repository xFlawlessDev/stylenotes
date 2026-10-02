---
name: stylenotes-mcp
description: Query and edit a StyleNotes workspace through its MCP server — the user's personal knowledge base for notes and tasks. Search and read notes, follow the wiki links between them, trace task dependencies, and create or update notes, tasks and workspaces. Use when the user mentions StyleNotes, a StyleNotes vault or workspace, notes or tasks backed by StyleNotes, wiki links between notes, blocked tasks or a dependency chain, or asks to read or change data in StyleNotes. Also use when the user treats StyleNotes as their second brain — a lasting home for their thinking and their commitments — and wants a question answered from what they wrote, two ideas connected, a sprawling topic mapped, or a new thought captured, linked and filed back where they will find it again. Do not use for generic markdown notes unrelated to StyleNotes.
license: MIT
compatibility: Requires a running StyleNotes desktop app with MCP enabled in Settings, and its remote HTTP endpoint turned on. It exposes the same tools to every client.
metadata:
  author: stylenotes
  version: "1.0"
---

# StyleNotes MCP

StyleNotes exposes an MCP server over 34 tools — 19 read, 15 write — through a
Streamable HTTP endpoint in the app itself. Every write goes through the same
validation the UI uses, not straight to the database.

This skill tells you which tool to reach for, the order to call them in, and the
traps that make results look wrong when you ignore them.

## What StyleNotes is for

StyleNotes is a **second brain** — a local-first home for everything the user
writes down and everything they mean to do. Treat a workspace as a vault, not as
a table of records:

- **Notes are thoughts.** A note holds prose, tags and a folder, and reaches the
  rest of the vault through `[[wiki links]]`. Those links form a graph.
- **Tasks are commitments** hanging off that knowledge, with statuses,
  priorities, due dates and dependency edges.
- **Folders, tags and wiki links are three ways into the same corpus.** Folders
  are for filing, tags for cross-cutting themes, wiki links for meaning. The
  graph is what makes it a brain rather than a filing cabinet.

So the useful work here is not "list my rows". It is answering a question from
the user's own notes, connecting two things they never linked by hand, and
filing a new thought back where they will find it again. Lean on `context`,
`search_notes` and `graph_query` for recall, `get_note` for the text and its
links, and `daily_summary` for the human view of a day.

The vault belongs to the user. Prefer the wording and structure they already
use; do not re-file, re-tag or rewrite a note that was not part of the request.

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
6. **"Today" is the user's local day.** The snapshot's `today` field
   (`YYYY-MM-DD`) is their civil date, not UTC — `overdueOnly` and any date you
   reason about follow it. Do not compute a day yourself from `generatedAt`.
7. **The journal is per day, not per note title.** `journal_today` returns the
   entry for the user's local today, creating it if needed. Do not search for a
   note whose title looks like a date, and do not create one by hand.
8. **Most recall tools are local; one is app-only.** `semantic_search`,
   `related_notes` and `list_themes` answer from the memory index, which lives in
   the app and never enters the snapshot — the server forwards them to the app as
   a job. Allow a little extra latency: a call embeds the query before ranking. `find_contradictions` is
   the exception — it calls the app's own model, so it is **not** exposed over MCP;
   ask the user to run it in the in-app assistant.

See [references/tool-reference.md](references/tool-reference.md) for every tool's
arguments and response shape, and
[references/errors.md](references/errors.md) for every error code and its fix.

## Workflow

### Step 1 — locate before you read

Never guess an id. Find the workspace first, then the entity:

```
list_workspaces                                  -> ids, names, counts
list_notes / list_tasks  { workspace, folder, ... } -> refs
search_notes / search_tasks / search_all  { query } -> ranked refs
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
| "Find my task about X" | `search_tasks { query, status, ... }` |
| "Where did I write about X?" | `search_all { query }` — notes and tasks together |
| "Show that note" | `get_note { id }` |
| "What links to / from this note?" | `get_note` — its `backlinks` / `outlinks` |
| "What folders / tags do I have?" | `list_folders` / `list_tags` |
| "Add this to today's journal" | `journal_today` → `edit_note_body { op: "insert" }` |
| "How is the board?" | `task_board { workspace }` |
| "What is due / in progress?" | `daily_summary { workspace }` |
| "Why is this task stuck?" | `get_task { id }` — `blockedBy`, `blockedByTasks` |
| "What does this task block?" | `get_task { id }` — `blocking`, `blockingTasks` |
| "Longest chain to X" | `critical_path { toId }` |
| "Everything connected to this note" | `graph_query { id, depth, kind }` |
| "Notes about an idea, not a word" | `semantic_search { query }` |
| "What else is like this note?" | `related_notes { id }` |
| "What am I writing about?" | `list_themes` |
| "Do my notes disagree?" | *(in-app only)* — ask the user to use the assistant |

`semantic_search`, `related_notes` and `list_themes` read the memory index; the
server forwards them to the app as a job, so they work from an external client
too (allow extra latency). `find_contradictions` is not exposed over MCP — it
spends the user's model key, so keep it in the app.

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

### Step 4 — pick the cheapest body write

Three tools change a note body, and picking the wrong one is the difference
between sending 120 bytes and sending 40 KB. Choose by what you can name:

| You can name | Use | Cost |
|---|---|---|
| The exact text to change | `edit_note_body { op: "replace", find, replace }` | Small — you never read the note back in |
| Where to add, not what to change | `edit_note_body { op: "insert", text, position }` | Small — no read at all |
| Nothing — the whole body must change | `update_note_body { id, body }` | Large — read it first, then send it all |

Prefer `replace` even for one-word corrections. A rename like "`alnair` →
`stylenotes`" or "version `0.1.0` → `0.2.0`" is exactly what it is for: one
call, every occurrence, and the result tells you how many were replaced.

`edit_note_body` never sends the body back to you, so verify from its `replaced`
count instead of re-reading the note.

### Step 5 — verify a write with a fresh read

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
  compares them against the user's **local** day (`today` in the snapshot), so a
  task due in the future is never overdue, a `done` task never is, and "today"
  means today where the user is — not in UTC.
- **Filing with a label instead of an id.** `folder` is an exact folder id in
  `list_notes` and in `update_note`; a display name silently matches nothing.
  Call `list_folders` first.
- **Tagging with invented tags.** Nothing deduplicates them for you. Run
  `list_tags` and reuse what is there, or the vault grows `spec`, `Spec` and
  `specs` as three unrelated themes.
- **Editing a note's title or tags with `update_note_body`.** It replaces the
  body and leaves metadata alone. Metadata is `update_note`.
- **Sweeping with `occurrence: "once"` on a repeated word.** It is refused, not
  guessed. Either add surrounding context until `find` is unique, or mean it and
  pass `"all"`.
- **Hunting for the journal by title.** Entries are keyed by a stored day, not by
  a title that looks like a date, and the user can rename them freely. Always
  reach the entry through `journal_today`.
- **Writing to the journal without `journal_today` first.** The day may have no
  entry yet; creating one by hand produces a second note for that day, which the
  app will refuse to save.
- **Reporting a body edit succeeded without checking `replaced`.** A match of 0
  never happens — the call is refused — but `matched: 1, replaced: 1` on a word
  you expected 7 times means your needle was too specific.
- **Deleting without `confirm`.** `delete_note`, `delete_task` and
  `delete_workspace` return `bad_arguments` unless the call includes
  `confirm: true`. This is deliberate; confirm with the user first.
- **Trying to delete the fallback.** `delete_workspace` refuses
  `workspace-default` and the last remaining workspace with `last_workspace`.
- **Reading a stale snapshot as truth.** Check `appRunning` in the response
  metadata; when false, the data is the last known state and writes will fail.
- **Treating a semantic call as instant.** `semantic_search`, `related_notes`
  and `list_themes` are forwarded to the app, which embeds the query before
  ranking. They work, but expect a little more latency than a snapshot read; do
  not retry a slow one as if it had failed.
- **Calling `find_contradictions` over MCP.** It is not an MCP tool — it calls the
  app's own model, so the server keeps it out of the registry to protect the
  user's key. Ask the user to run it in the in-app assistant.
- **Computing "today" from `generatedAt`.** That field is UTC. The snapshot's
  `today` is the user's local day; for anyone outside UTC the two differ for
  part of every day, and a date computed from `generatedAt` is off by one.
- **Answering from the snapshot field you saw first.** A note's `body` may be
  truncated in index-only mode and a `list_notes` hit carries only an excerpt.
  Read the full note with `get_note` before quoting it back to the user.
- **Reporting graph edges as prose.** `degree` counts both directions;
  `orphan: true` means no wiki link at all. A note with a high `degree` is a hub,
  not necessarily an authority — say what it links to, not how important it is.

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

- [references/tool-reference.md](references/tool-reference.md) — all 34 tools, arguments, response fields.
- [references/errors.md](references/errors.md) — error codes, causes, and fixes.
- [references/workflows.md](references/workflows.md) — longer end-to-end recipes, including second-brain recall and capture.
