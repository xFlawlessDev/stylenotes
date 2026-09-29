# Tool reference

All 24 StyleNotes MCP tools. Read tools answer from the app snapshot; write tools
are executed by the running app. `workspace` is optional on every tool that
takes it and falls back to `workspace-default`.

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

Case-insensitive substring over title, tags, excerpt and body. Ranking weights
title above tags above body.

### `get_note`

| Argument | Type |
|---|---|
| `id` | string, **required** |
| `workspace` | string |

Returns the note fields at the **top level**, plus `backlinks` and `outlinks`
(arrays of `{ id, title, kind }`). Fails `snapshot_truncated` in index-only mode.

### `context`

"What do I know about X?" — scored notes plus each hit's one-hop neighbourhood.

| Argument | Type | Notes |
|---|---|---|
| `query` | string | **required** |
| `workspace` | string | |
| `limit` | number | default 5, max 25 |
| `depth` | number | default 1, max 3 (reported back, not expanded) |

Each hit carries `score` and `neighbours { backlinks, outlinks, depth }`.

### `list_tasks`

| Argument | Type | Notes |
|---|---|---|
| `workspace`, `status`, `priority`, `folder` | string | exact match |
| `dueBefore` | string | `YYYY-MM-DD`, strictly before |
| `overdueOnly` | boolean | due date before the snapshot day and not `done` |
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
