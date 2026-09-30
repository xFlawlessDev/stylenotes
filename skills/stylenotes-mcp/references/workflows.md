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

## "What do my notes say about X?"

The recall loop: search, read the text, walk one hop, answer with sources.

```
1. list_workspaces { }                 -> pick the vault the user means
2. context         { query, workspace }         -> scored hits + neighbours
   (fall back to search_notes when context returns nothing)
3. get_note        { id }                        -> the full body, not the excerpt
4. graph_query     { id, depth: 2, kind: ["wiki"] } -> what the hits connect to
5. Answer in prose, citing note titles, and say plainly when the vault is silent
```

Rules for a recall answer:

- Answer **from the notes**, not from your own knowledge; the user is asking what
  *they* wrote. If the notes only touch the topic, say so.
- Cite the note titles you used so the user can open them.
- Never invent a note or a link. If `context` and `search_notes` both come back
  empty, report that the vault has nothing on the topic.
- One hop is usually enough; `depth` above 2 drags in loosely related notes.

## Capture a thought into the vault

Second-brain writes are **additive**: file the thought, link it, leave the rest
alone.

```
1. list_workspaces { }                   -> confirm the target vault
2. search_notes    { query, workspace }  -> is there already a note for this?
3. list_folders    { workspace }         -> pick a real folder id
   list_tags       { workspace }         -> reuse the vocabulary that exists
4. create_note     { title, body, folder, tags, workspace }
5. get_note        { id }                -> verify the body and its links landed
```

- Search before creating. A second brain rots when the same idea gets three
  notes; extend the existing one with `update_note_body` instead.
- Write the body in `[[wiki links]]` to any related note so the new thought
  joins the graph instead of landing in it as an orphan.
- `update_note_body` replaces the **whole** body. Read it first and carry the
  user's existing prose forward — never overwrite a note with a summary of it.
- When the thought implies an action, `create_task` with `noteIds: [<note id>]`
  so the commitment stays attached to the reasoning behind it.

## Tidy a note that was captured badly

Capture is fast and often wrong: a title of "Untitled note", no tags, filed in
the wrong folder. Repairing that is metadata work, so it is `update_note`, not
`update_note_body`.

```
1. search_notes { query, workspace }         -> find the note ref
2. get_note     { id }                       -> read it, so the new title matches the content
3. list_folders { workspace }                -> a real folder id
   list_tags    { workspace }                -> the tags that already exist
4. update_note  { id, patch: { title, folder, tags } }
5. get_note     { id }                       -> verify
```

- Send only the fields that change; everything omitted is left alone.
- Never pass `body` here — that is `update_note_body`'s job, and mixing the two
  in one intention is how prose gets lost.
- Tags are replaced wholesale, so send the full intended list. Check `list_tags`
  first: `spec` and `Spec` are two different tags to the vault.
- Confirm the new title with the user when you are inventing one. The vault is
  theirs, and a tidy note with a title they would not have chosen is still a
  note they have to fix.

## Add work to the vault

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

Whole-body rewrite — the expensive path. Only when you cannot name what changes.

```
1. get_note          { id }        -> read the current body
2. (compose the replacement body in full)
3. update_note_body  { id, body }  -> the app backs up the old body first
4. get_note          { id }        -> verify the change
```

`update_note_body` replaces the whole body. Preserve any existing content the
user still wants; do not summarise it away.

## Rename something everywhere in a note

The token-cheap path, and the one to reach for by default.

```
1. edit_note_body { id, op: "replace", find: "alnair", replace: "stylenotes" }
   -> { matched: 7, replaced: 7 }
2. Report the count. Do not read the note back.
```

- Verify from `matched`/`replaced`, not with a follow-up `get_note`. That
  re-read is exactly the cost this tool exists to avoid.
- `find` must be literal and exact. Get it from `get_note` if you are unsure of
  the spelling, spacing or capitalisation.
- If `matched` is lower than you expected, your needle was too specific — or the
  word appears with different case, which this tool does not match.
- To change one occurrence among several, add surrounding context until `find`
  is unique, then use `occurrence: "once"`. Do not settle for replacing the
  wrong one.

## Add to a note without reading it

```
1. list_notes / search_notes        -> find the note ref
2. edit_note_body { id, op: "insert", text: "- new thought", position: "end" }
```

Use this for a running log, a daily entry, or any note that grows. It never
reads the body, so it stays cheap no matter how long the note is.

## Rules of thumb

- **A workspace is a vault.** StyleNotes is the user's second brain, kept local.
  Notes are thoughts, tasks are commitments, and the wiki links between notes are
  the point of the thing.
- **Patch, don't rewrite.** `edit_note_body` for a change you can name,
  `update_note_body` only when the whole body really must change. Rewriting a
  long note to fix one word costs the user tokens and risks their prose.
- **Recall beats invention.** When the user asks a question about their own
  world, answer from the vault and cite the note titles; never fill a gap from
  your own knowledge without saying so.
- **Add, don't rearrange.** File new thoughts where they will be found, link
  them, and leave notes the user did not ask you to touch alone. Repairing a
  note you were pointed at is fine; sweeping the vault is not.
- One write, then verify. Do not chain several writes and report at the end.
- Prefer `get_task` / `get_note` over guessing a field from a list response.
- When a call is refused, explain the code and the fix — never invent a cause.
- Keep the user's data: confirm before any `delete_*`, and never delete
  `workspace-default`.
