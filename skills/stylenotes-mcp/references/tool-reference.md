# Tool reference

All 34 StyleNotes MCP tools. Read tools answer from the app snapshot; write tools
are executed by the running app. `workspace` is optional on every tool that
takes it and falls back to `workspace-default`.

Three read tools — `semantic_search`, `related_notes` and `list_themes` — read
the in-app memory index, which never enters the snapshot: the server forwards
them to the app as a job, so they work over MCP (local and remote) with slightly
more latency. `find_contradictions` is **not** an MCP tool — it calls the app's
own model, so it is kept out of the registry to protect the user's key; run it in
the in-app assistant.

Entity ids may be given bare (`abc`) or prefixed (`<workspaceId>/abc`); responses
label entities with `ref` in the prefixed form.

---

## Read tools

### `list_workspaces`

No arguments. Returns every workspace with counts.

```json
{ "ok": true, "count": 2, "workspaces": [
  { "id": "workspace-default", "name": "Personal", "noteCount": 1, "taskCount": 0, "openTaskCount": 0 }
]}
```

### `list_folders`

| Argument | Type |
|---|---|
| `workspace` | string |

Returns `{ ok, count, folders[] }` where each folder is
`{ id, label, workspaceId, noteCount }`.

`label` mirrors `id` — the snapshot carries no display name for a folder. The id
is what `list_notes { folder }` and `update_note { patch: { folder } }` accept;
a label matches nothing. A folder that exists in two workspaces is two rows.

```json
{ "ok": true, "count": 2, "folders": [
  { "id": "launch", "label": "launch", "workspaceId": "abc-123", "noteCount": 4 },
  { "id": "personal", "label": "personal", "workspaceId": "abc-123", "noteCount": 11 }
]}
```

### `list_tags`

| Argument | Type |
|---|---|
| `workspace` | string |

Returns `{ ok, count, tags[] }` where each tag is
`{ tag, noteCount, workspaceId }`, most used first then alphabetical.

Call this before tagging a note so you extend the existing vocabulary instead of
inventing a near-duplicate. A tag used in two workspaces is two rows.

```json
{ "ok": true, "count": 2, "tags": [
  { "tag": "spec", "noteCount": 7, "workspaceId": "abc-123" },
  { "tag": "pricing", "noteCount": 2, "workspaceId": "abc-123" }
]}
```

### `list_notes`

| Argument | Type | Notes |
|---|---|---|
| `workspace` | string | omit for `workspace-default` |
| `folder` | string | exact folder id |
| `tag` | string | exact tag match |
| `pinned` | boolean | |
| `limit` | number | default 50, max 500 |
| `order` | string | `created` (default), `updated`, `title` |

Returns `{ ok, total, returned, indexOnly, notes[] }`. Bodies are `null` when
`indexOnly` is true (snapshot fell back to index-only mode).

### `search_notes`

| Argument | Type | Notes |
|---|---|---|
| `query` | string | **required** |
| `workspace` | string | |
| `limit` | number | default 20, max 200 |

Case-insensitive substring over title, tags, excerpt and body, ranked by weight
(title 10, tags 5, excerpt 3, body 1). The same weights the Rust shim uses in
`rank.rs` are mirrored in `search-rank.ts`, so every search tool agrees.

### `search_tasks`

Find a task by text instead of by id. Takes every `list_tasks` filter, so you
can search a title and filter to an overdue, high-priority, open task in one call.

| Argument | Type | Notes |
|---|---|---|
| `query` | string | **required**; matched against the title and the task's `notes` field |
| `workspace`, `status`, `priority`, `folder` | string | exact match |
| `dueBefore` | string | `YYYY-MM-DD`, strictly before |
| `overdueOnly` | boolean | due before the user's local day and not `done` |
| `includeDone` | boolean | default `true` |
| `limit` | number | default 20, max 200 |

Ranked title 10, notes 3. Returns `{ ok, query, tasks[] }` with each task in
`list_tasks` shape.

### `search_all`

One ranked search across notes **and** tasks, for "where did I write about X"
when it is unclear whether it is a note or a task.

| Argument | Type | Notes |
|---|---|---|
| `query` | string | **required** |
| `workspace` | string | |
| `includeDone` | boolean | default `true` (applies to the task half) |
| `limit` | number | default 20, max 200 — per kind |

Returns `{ ok, query, indexOnly, notes[], tasks[] }`. The two lists are kept
separate rather than interleaved: a task's `notes` mention and a note's title hit
score on different scales, so a merged ordering would compare unlike numbers.

### `get_note`

| Argument | Type |
|---|---|
| `id` | string, **required** |
| `workspace` | string |

Returns the note fields at the **top level**, plus `backlinks` and `outlinks`
(arrays of `{ id, title, kind }`). Fails `snapshot_truncated` in index-only mode.

`createdAt` is the epoch millisecond the note was first written; `updatedAt` the
last write. Both are real timestamps — `list_notes { order: "created" }` is
meaningful.

### `context`

"What do I know about X?" — scored notes plus each hit's one-hop neighbourhood.

| Argument | Type | Notes |
|---|---|---|
| `query` | string | **required** |
| `workspace` | string | |
| `limit` | number | default 5, max 25 |
| `depth` | number | default 1, max 3 (reported back, not expanded) |

Each hit carries `score` and `neighbours { backlinks, outlinks, depth }`.

### `semantic_search`

Meaning-based search over notes and tasks. Use it when the user asks for notes
about an **idea** rather than a specific word or id; use `search_notes` for exact
terms and codes. The server forwards it to the app, which embeds the query, so it
takes a little longer than a snapshot read.

| Argument | Type | Notes |
|---|---|---|
| `query` | string | **required**; the idea to search for |
| `workspace` | string | |
| `limit` | number | default 10 |

Returns `{ ok, total, results[] }`, each result
`{ kind, id, ref, title, score }`. When the memory index is not built it returns a
`tool_failed` error saying it is not ready — fall back to `search_notes`.

### `related_notes`

Notes and tasks most similar in meaning to one entity — the connections the user
may not have linked by hand.

| Argument | Type | Notes |
|---|---|---|
| `id` | string | **required**; an id from `list_notes`, `search_notes` or `semantic_search` |
| `kind` | string | `note` (default) or `task` |
| `workspace` | string | |
| `limit` | number | default 8 |

Returns the same `{ ok, total, results[] }` shape as `semantic_search`.

### `list_themes`

The current topic clusters over the notes and tasks, each with a label and member
ids. Answers "what am I writing about" or gives a broad question a starting map.

| Argument | Type | Notes |
|---|---|---|
| `workspace` | string | |
| `limit` | number | default 8 |

Returns `{ ok, total, themes[] }` where each theme is
`{ label, members[] }` and each member is `{ kind, id, ref, title, score }`.

### `find_contradictions` *(not an MCP tool)*

Pairs of notes whose claims conflict, verified by a model over the most similar
pairs. It calls the app's own model stream, so the server does **not** expose it
over MCP — ask the user to run it in the in-app assistant.

### `list_tasks`

| Argument | Type | Notes |
|---|---|---|
| `workspace`, `status`, `priority`, `folder` | string | exact match |
| `dueBefore` | string | `YYYY-MM-DD`, strictly before |
| `overdueOnly` | boolean | due date before the user's local day and not `done` |
| `includeDone` | boolean | default `true` |
| `limit` | number | default 100, max 1000 |

Sorted priority (high first), then due date, then position. Statuses are
`todo`, `doing`, `review`, `done`; priorities are `low`, `medium`, `high`.

### `get_task`

| Argument | Type |
|---|---|
| `id` | string, **required** |
| `workspace` | string |

Returns task fields at the top level plus `blockedByTasks`, `blockingTasks`
and `linkedNotes`, each an array of `{ id, title, ... }`. The raw id arrays
`blockedBy`, `blocking` and `noteIds` are present too.

### `task_board`

| Argument | Type |
|---|---|
| `workspace` | string |

Returns four fixed columns in order `todo, doing, review, done`, each with
`status`, `count` and `tasks` (ordered by position).

### `daily_summary`

| Argument | Type |
|---|---|
| `workspace` | string |

Returns `{ ok, openTasks, doneTasks, inProgress[], recentNotes[] }`. `inProgress`
lists `doing` tasks by position; `recentNotes` are notes with the newest
`updatedAt` (up to 10).

This is a **status report, not a journal**: it reads tasks and recent notes and
writes nothing. The snapshot's `today` field is the user's local day, which is
what `overdueOnly` uses elsewhere.

### `list_dependencies`

| Argument | Type |
|---|---|
| `workspace` | string |

Every edge, as `{ taskId, dependsOnTaskId, taskTitle, dependsOnTitle }`, with a
`count`.

### `critical_path`

| Argument | Type | Notes |
|---|---|---|
| `toId` | string | longest chain **ending** at this task; omit for the overall longest |
| `workspace` | string | |

Returns `{ ok, length, chain[] }` where each chain entry is
`{ id, title, status, blocked }`. The walk is cycle-guarded.

### `graph_query`

| Argument | Type | Notes |
|---|---|---|
| `id` | string | anchor; a graph id (`note:<id>`) or an entity ref. Omit for the whole graph |
| `depth` | number | default 1, max 6 |
| `kind` | string \| array | `wiki`, `dependency`, `link`; empty = all |
| `workspace` | string | |

Returns `{ ok, anchor, depth, nodes[], edges[] }`. Nodes carry `id`, `entityId`,
`kind`, `workspaceId`, `title`, `orphan`, `degree` and `status` for tasks. Edges
carry `id`, `source`, `target`, `kind`.

---

## Write tools

All write tools require a grant with `access: "write"` and the matching scope
(`notes`, `tasks`, `dependency`, `workspace`).

### `create_note`

| Argument | Type | Notes |
|---|---|---|
| `title`, `body`, `folder` | string | |
| `tags` | string[] | |
| `workspace` | string | |

Returns `{ note: { id, workspaceId, title } }`.

### `update_note_body`

| Argument | Type | Notes |
|---|---|---|
| `id` | string | **required** |
| `body` | string | **required** |
| `workspace` | string | |

The app keeps a backup of the previous body first. Returns the note id and new
`chars`. Refused with `busy_local_edit` if that note has unsaved edits in the app.

### `update_note`

| Argument | Type | Notes |
|---|---|---|
| `id` | string | **required** |
| `patch` | object | **required**; keys: `title`, `folder`, `tags`, `pinned` |
| `workspace` | string | |

Patches metadata only — the body is never touched. Use it to fix a bad title,
re-file a note, or add the tags the recall tools rank by.

- A key you omit is left alone. `tags` **replaces** the whole list.
- Tags are trimmed and de-duplicated; an empty result removes every tag.
- `title` must not be blank — a blank title is refused with `bad_arguments`
  rather than silently ignored.
- Refused with `busy_local_edit` if that note has unsaved edits in the app.

```json
{ "name": "update_note", "arguments": { "id": "abc-123/note-uuid", "patch": { "title": "Pricing model", "folder": "launch", "tags": ["spec", "pricing"] } } }
```

### `edit_note_body`

Patch the body **in place**. Prefer this over `update_note_body` whenever you can
name the text you want to change: you never have to read the note or send it
back.

| Argument | Type | Notes |
|---|---|---|
| `id` | string | **required** |
| `op` | string | **required**; `replace` or `insert` |
| `find` | string | `op: "replace"`; the exact text to find |
| `replace` | string | `op: "replace"`; the replacement. `""` deletes |
| `occurrence` | string | `op: "replace"`; `all` (default) or `once` |
| `text` | string | `op: "insert"`; the text to add |
| `position` | string | `op: "insert"`; `start` or `end` (default) |
| `workspace` | string | |

Returns `{ ok, note: { id, workspaceId, chars }, op, matched, replaced }`.

**Refusals — all `bad_arguments`, and none of them write anything:**

- `find` is empty. It would insert between every character.
- `find` does not appear in the note. Check the exact text with `get_note`.
- `occurrence: "once"` and `find` matches more than once. Add context, or pass
  `"all"`.
- `text` is empty for an insert; `op` or a `position` value is not in the set.

`replace` is literal text, not a regex, and is case-sensitive. Matching is
non-overlapping: `find: "aa"` in `"aaa"` matches once.

Insert appends with exactly one blank line between the old body and the new
text, whatever the body already ended with, and adds nothing to an empty body.

```json
{ "name": "edit_note_body", "arguments": { "id": "abc-123/note-uuid", "op": "replace", "find": "alnair", "replace": "stylenotes" } }
{ "name": "edit_note_body", "arguments": { "id": "abc-123/note-uuid", "op": "insert", "text": "- reviewed the pricing model", "position": "end" } }
```

### `journal_today`

| Argument | Type |
|---|---|
| `workspace` | string |

Finds — or starts — the journal entry for the user's **local today**. Returns
`{ ok, created, note: { id, workspaceId, title, journalDay } }`.

Registered as a write because it may create a note, but it does the useful half
under a read grant too: it returns the existing entry and only the create is
refused. Journal must be switched on in **Settings → Journal**; when it is off
the call returns `mcp_disabled` with that instruction.

The day comes from the app's clock and timezone, never from the caller. Do not
pass a date, and do not create the entry with `create_note` — the vault allows one
entry per day, and a hand-made duplicate is refused by the database.

`created: true` means this call started the entry. Add to it with
`edit_note_body`; `journalDay` is the day it represents, which is not the same as
when it was written.

```json
{ "name": "journal_today", "arguments": { "workspace": "abc-123" } }
```

### `delete_note`

| Argument | Type | Notes |
|---|---|---|
| `id` | string | **required** |
| `confirm` | boolean | must be `true` |

A backup of the body is kept. Hard delete; there is no tombstone.

### `create_task`

| Argument | Type | Notes |
|---|---|---|
| `title` | string | **required** |
| `status` | string | defaults to `todo` |
| `priority` | string | defaults to `medium` |
| `folder` | string | |
| `dueAt`, `startAt` | string | `YYYY-MM-DD` |
| `noteIds` | string[] | unknown ids are dropped |
| `workspace` | string | |

Returns `{ task: { id, workspaceId, title } }`.

### `update_task`

| Argument | Type | Notes |
|---|---|---|
| `id` | string | **required** |
| `patch` | object | **required**; keys: `title`, `notes`, `status`, `priority`, `folder`, `dueAt`, `startAt`, `completed`, `overlay`, `noteIds` |
| `workspace` | string | |

Only known patch keys with valid values are applied. Refused with
`busy_local_edit` if that task has unsaved edits in a detail window.

### `complete_task`

| Argument | Type | Notes |
|---|---|---|
| `id` | string | **required** |
| `workspace` | string | |

Sets `status = "done"` and `completed = true`.

### `delete_task`

| Argument | Type | Notes |
|---|---|---|
| `id` | string | **required** |
| `confirm` | boolean | must be `true` |

Also removes the task's dependencies and note links.

### `link_tasks`

| Argument | Type | Notes |
|---|---|---|
| `id` | string | the dependent task, **required** |
| `dependsOn` | string | what it waits for, **required** |
| `workspace` | string | |

Reads as "`id` depends on `dependsOn`". Rejected with `dependency_cycle` for a
self-link, a cross-workspace link, a duplicate edge, or a true cycle.

### `unlink_tasks`

| Argument | Type | Notes |
|---|---|---|
| `id`, `dependsOn` | string | **required** |
| `workspace` | string | |

Removes the edge. Succeeds even if the edge does not exist.

### `create_workspace`

| Argument | Type | Notes |
|---|---|---|
| `name` | string | **required**; must be unique (case-insensitive) |
| `color` | string | `primary` (default), `secondary`, `tertiary`, `error` |

Returns `{ workspace: { id, name, color } }`.

### `rename_workspace`

| Argument | Type | Notes |
|---|---|---|
| `id` | string | **required** |
| `name` | string | **required** |

### `delete_workspace`

| Argument | Type | Notes |
|---|---|---|
| `id` | string | **required** |
| `confirm` | boolean | must be `true` |

Deletes the workspace and everything scoped to it (notes, tasks, dependencies,
folders). Refused for `workspace-default` and for the last remaining workspace
with `last_workspace`.
