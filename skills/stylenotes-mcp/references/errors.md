# Errors

Every failed tool call returns an error code in `structuredContent.error` and a
human sentence in the text content. Match on the code, not the sentence.

| Code | Meaning | Fix |
|---|---|---|
| `app_not_running` | The StyleNotes desktop app is closed. | Ask the user to open StyleNotes, then retry. Reads returned the last snapshot and may be stale. |
| `mcp_disabled` | The MCP server is switched off. | Ask the user to enable MCP in Settings → MCP. |
| `protocol_mismatch` | App and bridge speak different versions. | Ask the user to update or restart StyleNotes. |
| `snapshot_unavailable` | No snapshot has been written yet. | The app is still starting. Wait a moment and retry. |
| `snapshot_truncated` | The vault is too large, so note bodies were dropped. | Narrow the query by `workspace` or `folder`. `get_note` is unavailable in this mode. |
| `write_not_granted` | Write access or the matching scope is off. | State which scope is off (`notes`, `tasks`, `dependency`, `workspace`) and ask the user to enable it in Settings → MCP. |
| `unknown_tool` | The tool name is not in the registry. | Check the name against [tool-reference.md](tool-reference.md). |
| `unknown_tool` | The tool name is not in the registry — including `find_contradictions`, which the server deliberately does not expose (it spends the user's model key). | Check the name against [tool-reference.md](tool-reference.md). |
| `tool_failed` | A forwarded semantic tool (`semantic_search`, `related_notes`, `list_themes`) ran in the app but could not answer — most often the memory index is not built. | Read the message. If the index is not ready, fall back to `search_notes` / `context`; do not treat it as a broken server. |
| `bad_arguments` | A required argument is missing or invalid, or a destructive tool lacks `confirm: true`. | Fix the arguments; add `confirm: true` after the user agrees to the deletion. |
| `unknown_workspace` | The `workspace` id does not exist. | Call `list_workspaces` and use a real id. |
| `ambiguous_id` | A bare id matches more than one workspace. | Retry with the prefixed `ref` (`<workspaceId>/<id>`). |
| `not_found` | No entity matches the id. | Re-find it with `list_*` or `search_notes`. |
| `busy_local_edit` | The note or task has unsaved edits in the app. | Ask the user to save or close that editor, then retry. |
| `dependency_cycle` | The link repeats an edge, crosses workspaces, links a task to itself, or closes a loop. | Inspect `list_dependencies` and pick a link that keeps the graph acyclic. |
| `last_workspace` | Tried to delete `workspace-default` or the last remaining workspace. | Choose a different workspace, or create one first. |
| `write_failed` | The app could not persist the change. | Retry once; if it persists, report it to the user without inventing a cause. |
| `timeout` | The app did not execute the job in time. | Retry once. If it repeats, ask the user to check the app is responsive. |

## How to report a failure

Do not translate a coded failure into a vague apology. Say what happened and
what the user can do:

- Good: "Write access for tasks is off. Enable **Tasks** under Settings → MCP and I'll retry."
- Poor: "Sorry, something went wrong."

Never claim a write succeeded when the call returned an error. A refusal is
information, not a failure of the request.
