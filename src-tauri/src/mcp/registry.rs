//! Tool registry mirror for the shim (docs/design/mcp-local-free.md #D9).
//!
//! The authoritative registry lives in `src/lib/content/mcp-tools.ts`; this is
//! the handshake-facing copy the shim serves over stdio. A test in the frontend
//! (`mcp-tools.test.ts`) asserts the two lists carry the same tool names, so a
//! mismatch is caught before release rather than by a confused model.

use serde::Serialize;
use serde_json::{json, Value};

/// Whether a tool reads the snapshot or forwards a write to the app.
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolKind {
    Read,
    Write,
}

#[derive(Clone, Copy, Serialize)]
pub struct ToolDescriptor {
    pub name: &'static str,
    pub kind: ToolKind,
    pub scope: &'static str,
    pub description: &'static str,
}

/// Every tool the shim advertises, including the write tools it may refuse
/// (`write_not_granted`) while read-only (#D6).
pub const TOOLS: &[ToolDescriptor] = &[
    ToolDescriptor {
        name: "list_notes",
        kind: ToolKind::Read,
        scope: "notes",
        description: "List notes with optional workspace, folder, tag and pin filters.",
    },
    ToolDescriptor {
        name: "search_notes",
        kind: ToolKind::Read,
        scope: "notes",
        description: "Substring search over note titles, tags and bodies.",
    },
    ToolDescriptor {
        name: "get_note",
        kind: ToolKind::Read,
        scope: "notes",
        description: "One note plus its wiki backlinks and outlinks.",
    },
    ToolDescriptor {
        name: "context",
        kind: ToolKind::Read,
        scope: "notes",
        description: "Relevant notes for a query, with their neighbourhood in the graph.",
    },
    ToolDescriptor {
        name: "list_tasks",
        kind: ToolKind::Read,
        scope: "tasks",
        description:
            "List tasks with status, priority, workspace, folder, due and overdue filters.",
    },
    ToolDescriptor {
        name: "get_task",
        kind: ToolKind::Read,
        scope: "tasks",
        description: "One task with blockers, dependents and linked notes.",
    },
    ToolDescriptor {
        name: "task_board",
        kind: ToolKind::Read,
        scope: "tasks",
        description: "Kanban columns in position order with per-status counts.",
    },
    ToolDescriptor {
        name: "daily_summary",
        kind: ToolKind::Read,
        scope: "tasks",
        description: "Due and completed work, in-progress tasks and recently touched notes.",
    },
    ToolDescriptor {
        name: "list_dependencies",
        kind: ToolKind::Read,
        scope: "dependency",
        description: "Every task-to-task dependency edge.",
    },
    ToolDescriptor {
        name: "critical_path",
        kind: ToolKind::Read,
        scope: "dependency",
        description: "Longest dependency chain ending at a task.",
    },
    ToolDescriptor {
        name: "graph_query",
        kind: ToolKind::Read,
        scope: "notes",
        description: "Graph nodes and edges around a node, by depth and edge kind.",
    },
    ToolDescriptor {
        name: "list_workspaces",
        kind: ToolKind::Read,
        scope: "workspace",
        description: "Every workspace with its note and task counts.",
    },
    ToolDescriptor {
        name: "create_note",
        kind: ToolKind::Write,
        scope: "notes",
        description: "Create a note from a title and body.",
    },
    ToolDescriptor {
        name: "update_note_body",
        kind: ToolKind::Write,
        scope: "notes",
        description: "Replace a note body (a backup copy is kept first).",
    },
    ToolDescriptor {
        name: "delete_note",
        kind: ToolKind::Write,
        scope: "notes",
        description: "Delete a note; requires confirm: true.",
    },
    ToolDescriptor {
        name: "create_task",
        kind: ToolKind::Write,
        scope: "tasks",
        description: "Create a task, optionally linked to notes.",
    },
    ToolDescriptor {
        name: "update_task",
        kind: ToolKind::Write,
        scope: "tasks",
        description: "Patch fields on an existing task.",
    },
    ToolDescriptor {
        name: "complete_task",
        kind: ToolKind::Write,
        scope: "tasks",
        description: "Mark a task done and completed.",
    },
    ToolDescriptor {
        name: "delete_task",
        kind: ToolKind::Write,
        scope: "tasks",
        description: "Delete a task; requires confirm: true.",
    },
    ToolDescriptor {
        name: "link_tasks",
        kind: ToolKind::Write,
        scope: "dependency",
        description: "Add a dependency; cycles and cross-workspace links are rejected.",
    },
    ToolDescriptor {
        name: "unlink_tasks",
        kind: ToolKind::Write,
        scope: "dependency",
        description: "Remove a dependency.",
    },
    ToolDescriptor {
        name: "create_workspace",
        kind: ToolKind::Write,
        scope: "workspace",
        description: "Create a workspace.",
    },
    ToolDescriptor {
        name: "rename_workspace",
        kind: ToolKind::Write,
        scope: "workspace",
        description: "Rename an existing workspace.",
    },
    ToolDescriptor {
        name: "delete_workspace",
        kind: ToolKind::Write,
        scope: "workspace",
        description: "Delete a workspace and its contents; requires confirm: true.",
    },
];

pub fn find(name: &str) -> Option<&'static ToolDescriptor> {
    TOOLS.iter().find(|tool| tool.name == name)
}

/// `tools/list` payload.
pub fn list_payload() -> Value {
    let tools: Vec<Value> = TOOLS
        .iter()
        .map(|tool| {
            json!({
                "name": tool.name,
                "description": tool.description,
                "inputSchema": schema_for(tool.name),
                "annotations": {
                    "title": tool.name,
                    "readOnlyHint": tool.kind == ToolKind::Read,
                    "scope": tool.scope
                }
            })
        })
        .collect();
    json!({ "tools": tools })
}

/// A permissive JSON schema per tool: names are advertised for discoverability,
/// while the app validates the actual arguments before acting on them.
fn schema_for(name: &str) -> Value {
    let mut properties = json!({
        "workspace": { "type": "string", "description": "Workspace id; omit for the active workspace." }
    });
    let mut required: Vec<&str> = Vec::new();
    match name {
        "get_note" | "get_task" | "delete_note" | "delete_task" | "complete_task" => {
            properties["id"] = json!({ "type": "string", "description": "Entity id, optionally prefixed with <workspaceId>/." });
            required.push("id");
        }
        "list_notes" | "search_notes" | "list_tasks" | "task_board" | "list_dependencies"
        | "critical_path" | "graph_query" | "context" | "daily_summary" => {}
        "create_note" => {
            properties["title"] = json!({ "type": "string" });
            properties["body"] = json!({ "type": "string" });
            properties["folder"] = json!({ "type": "string" });
            properties["tags"] = json!({ "type": "array", "items": { "type": "string" } });
        }
        "update_note_body" => {
            properties["id"] = json!({ "type": "string" });
            properties["body"] = json!({ "type": "string" });
            required.push("id");
            required.push("body");
        }
        "create_task" => {
            properties["title"] = json!({ "type": "string" });
            properties["status"] = json!({ "type": "string" });
            properties["priority"] = json!({ "type": "string" });
            properties["folder"] = json!({ "type": "string" });
            properties["dueAt"] = json!({ "type": "string" });
            properties["noteIds"] = json!({ "type": "array", "items": { "type": "string" } });
            required.push("title");
        }
        "update_task" => {
            properties["id"] = json!({ "type": "string" });
            properties["patch"] = json!({ "type": "object" });
            required.push("id");
        }
        "link_tasks" | "unlink_tasks" => {
            properties["id"] = json!({ "type": "string" });
            properties["dependsOn"] = json!({ "type": "string" });
            required.push("id");
            required.push("dependsOn");
        }
        "create_workspace" => {
            // A workspace is not scoped by `workspace`; it is the scope itself.
            let mut props = json!({
                "name": { "type": "string" },
                "color": { "type": "string" }
            });
            props["id"] = properties["id"].take();
            properties = props;
            required.push("name");
        }
        "rename_workspace" => {
            let mut props = json!({
                "id": { "type": "string" },
                "name": { "type": "string" }
            });
            props["workspace"] = properties["workspace"].take();
            properties = props;
            required.push("id");
            required.push("name");
        }
        "delete_workspace" => {
            let mut props = json!({
                "id": { "type": "string" },
                "confirm": { "type": "boolean" }
            });
            props["workspace"] = properties["workspace"].take();
            properties = props;
            required.push("id");
        }
        "list_workspaces" => {
            // No arguments: the list is inherently cross-workspace.
            properties = json!({});
        }
        _ => {}
    }
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": true
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_tool_has_a_unique_name() {
        let mut names: Vec<&str> = TOOLS.iter().map(|tool| tool.name).collect();
        names.sort_unstable();
        let before = names.len();
        names.dedup();
        assert_eq!(before, names.len());
    }

    #[test]
    fn list_payload_advertises_scope_and_readonly_hint() {
        let payload = list_payload();
        let tools = payload["tools"].as_array().expect("tools array");
        let get_task = tools
            .iter()
            .find(|tool| tool["name"] == "get_task")
            .expect("get_task is registered");
        assert_eq!(get_task["annotations"]["readOnlyHint"], true);
        assert_eq!(get_task["annotations"]["scope"], "tasks");
        assert_eq!(get_task["inputSchema"]["required"][0], "id");
    }

    #[test]
    fn find_is_exact() {
        assert!(find("get_task").is_some());
        assert!(find("get_task ").is_none());
        assert!(find("nope").is_none());
    }
}
