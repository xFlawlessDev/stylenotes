# Workflows

Longer recipes that combine several tools. Each one starts by locating the
workspace, because an agent has no implicit current workspace.

## Locate before acting

```
1. list_workspaces
   -> pick the workspace whose name matches the user's wording; note its id.

2. list_tasks { workspace: "<id>" }         (or list_notes for notes)
   -> collect candidates.

3. get_task { id: "<ref>" }                 (only when more than one candidate)
   -> confirm title, status and dependencies.
```

## "What is blocking the release?"

```
1. list_tasks { workspace, status: "todo" }
2. get_task  { id: "<release task ref>" }
   -> blocked: true
   -> blockedBy: ["<dep id>"], blockedByTasks: [{ title: "Kunci desain", status: "review" }]
3. Report the blockers by title and status, not by id.
```

If `blocked` is true but `blockedByTasks` is empty, the blocking task was
deleted between snapshot builds. Re-run `list_dependencies` before reporting.

## "Mark the design task done"

```
1. list_tasks     { workspace }                  -> find it
2. get_task       { id }                         -> confirm it is the intended one
3. complete_task  { id }
4. get_task       { id }                         -> verify status == "done"
```

If step 3 returns `busy_local_edit`, the user has the task open with unsaved
changes. Ask them to save or close it; do not retry blindly.

## "Survey the workspace"

```
1. list_workspaces { }                -> counts per workspace
2. daily_summary   { workspace }      -> open, done, in progress, recent notes
3. task_board      { workspace }      -> full columns in position order
4. list_dependencies { workspace }    -> all edges
5. critical_path   { workspace }      -> longest chain
```

Present this as a short status summary: what is due, what is in progress, what
is blocked, and the longest chain. Do not dump raw JSON at the user.

## "How is this note connected?"

```
1. search_notes { query, workspace }        -> find the note ref
2. get_note     { id }                      -> backlinks + outlinks
3. graph_query  { id, depth: 2, kind: ["wiki"] }
   -> the wiki neighbourhood, two hops out
```

`graph_query` with `kind: ["wiki"]` excludes dependency edges, so a note graph
stays readable. Use `kind: ["dependency"]` to explore task chains instead.

## Create a workspace and seed it

```
1. create_workspace { name: "Q4 Launch", color: "tertiary" }
   -> workspace.id
2. Wait for the workspace to appear:
   list_workspaces   -> the new id must be present
   (the host republishes the snapshot after the write; a write issued in the
    same breath may still resolve against the old list)
3. create_note { title, body, folder, tags, workspace: "<new id>" }   (repeat)
4. create_task { title, status, priority, dueAt, workspace: "<new id>" } (repeat)
5. link_tasks  { id: "<dependent>", dependsOn: "<blocker>", workspace } (repeat)
6. get_note / get_task -> verify the bodies and links landed
```

The wait in step 2 matters: if you write before the workspace is visible, the
create calls fall back to `workspace-default` and the new workspace looks empty.

## Edit a note safely

```
1. get_note          { id }        -> read the current body
2. (compose the replacement body in full)
3. update_note_body  { id, body }  -> the app backs up the old body first
4. get_note          { id }        -> verify the change
```

`update_note_body` replaces the whole body. Preserve any existing content the
user still wants; do not summarise it away.

## Rules of thumb

- One write, then verify. Do not chain several writes and report at the end.
- Prefer `get_task` / `get_note` over guessing a field from a list response.
- When a call is refused, explain the code and the fix — never invent a cause.
- Keep the user's data: confirm before any `delete_*`, and never delete
  `workspace-default`.
