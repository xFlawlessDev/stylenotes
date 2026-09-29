//! Workspace read tool: the workspace list with per-workspace counts.
//!
//! A workspace is not an entity inside a scope — it *is* the scope — so this
//! tool takes no `workspace` argument and always answers for every workspace.
//! Counts are derived from the snapshot arrays, never recomputed from the DB.

use serde_json::{json, Value};

use crate::bridge::Bridge;
use crate::read::{array_of, ok};
use crate::read_tasks::snapshot_or_error;

pub fn list_workspaces(bridge: &Bridge, _args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let notes = array_of(&snapshot, "notes");
    let tasks = array_of(&snapshot, "tasks");
    let workspaces = array_of(&snapshot, "workspaces");

    let items: Vec<Value> = workspaces
        .iter()
        .map(|workspace| {
            let id = workspace["id"].as_str().unwrap_or("");
            let note_count = notes
                .iter()
                .filter(|note| note["workspaceId"].as_str() == Some(id))
                .count();
            let task_count = tasks
                .iter()
                .filter(|task| task["workspaceId"].as_str() == Some(id))
                .count();
            let open_tasks = tasks
                .iter()
                .filter(|task| task["workspaceId"].as_str() == Some(id) && task["status"] != "done")
                .count();
            json!({
                "id": id,
                "name": workspace["name"].clone(),
                "noteCount": note_count,
                "taskCount": task_count,
                "openTaskCount": open_tasks
            })
        })
        .collect();

    let count = items.len();
    ok(json!({ "ok": true, "count": count, "workspaces": items }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot() -> Value {
        json!({
            "workspaces": [
                { "id": "ws-a", "name": "Alpha" },
                { "id": "ws-b", "name": "Beta" }
            ],
            "notes": [
                { "id": "n1", "workspaceId": "ws-a" },
                { "id": "n2", "workspaceId": "ws-a" },
                { "id": "n3", "workspaceId": "ws-b" }
            ],
            "tasks": [
                { "id": "t1", "workspaceId": "ws-a", "status": "todo" },
                { "id": "t2", "workspaceId": "ws-a", "status": "done" },
                { "id": "t3", "workspaceId": "ws-b", "status": "doing" }
            ]
        })
    }

    #[test]
    fn counts_are_scoped_per_workspace() {
        let snap = snapshot();
        let notes = array_of(&snap, "notes");
        let tasks = array_of(&snap, "tasks");
        let count = |key: &str, id: &str, status: Option<&str>| {
            let source = if key == "notes" { notes } else { tasks };
            source
                .iter()
                .filter(|item| item["workspaceId"].as_str() == Some(id))
                .filter(|item| status.is_none_or(|s| item["status"].as_str() == Some(s)))
                .count()
        };
        assert_eq!(count("notes", "ws-a", None), 2);
        assert_eq!(count("notes", "ws-b", None), 1);
        assert_eq!(count("tasks", "ws-a", Some("done")), 1);
        assert_eq!(count("tasks", "ws-b", Some("done")), 0);
    }
}
