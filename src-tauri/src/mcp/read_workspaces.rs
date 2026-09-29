//! Workspace read tool: the workspace list with per-workspace counts.
//!
//! A workspace is not an entity inside a scope — it *is* the scope — so this
//! tool takes no `workspace` argument and always answers for every workspace.
//! Counts are derived from the snapshot arrays, never recomputed from the DB.

use serde_json::{json, Value};

use crate::bridge::Bridge;
use crate::read::{array_of, matches_workspace, ok};
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

/// Folder ids, labels and note counts.
///
/// The snapshot's folder list is derived from the notes' `folder` field, so this
/// answers with what actually exists. Callers need the `id` for `list_notes
/// { folder }` and `update_note { patch: { folder } }`, neither of which accepts
/// a label.
pub fn list_folders(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let items = folders_in(&snapshot, crate::read::workspace_arg(args).as_deref());
    let count = items.len();
    ok(json!({ "ok": true, "count": count, "folders": items }))
}

/// Aggregates the notes' `folder` field into folder rows.
///
/// A folder is identified by `(workspaceId, id)`: the same folder id in two
/// workspaces is two folders, never one merged entry. The label mirrors the id
/// because the snapshot has no display name for a folder.
fn folders_in(snapshot: &Value, workspace: Option<&str>) -> Vec<Value> {
    let mut items: Vec<Value> = Vec::new();
    for note in array_of(snapshot, "notes") {
        if !matches_workspace(note, workspace) {
            continue;
        }
        let id = note["folder"].as_str().unwrap_or("");
        let workspace_id = note["workspaceId"].as_str().unwrap_or("workspace-default");
        if let Some(entry) = items
            .iter_mut()
            .find(|entry| entry["id"] == id && entry["workspaceId"] == workspace_id)
        {
            let count = entry["noteCount"].as_u64().unwrap_or(0);
            entry["noteCount"] = json!(count + 1);
            continue;
        }
        items.push(json!({
            "id": id,
            "label": id,
            "workspaceId": workspace_id,
            "noteCount": 1
        }));
    }
    items.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    items
}

/// Every tag in use, with how many notes carry it — the vocabulary a caller
/// needs before tagging anything.
pub fn list_tags(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let items = tags_in(&snapshot, crate::read::workspace_arg(args).as_deref());
    let count = items.len();
    ok(json!({ "ok": true, "count": count, "tags": items }))
}

/// Counts tags per `(workspaceId, tag)`, most used first, then alphabetical.
/// A tag used in two workspaces yields two rows, as with folders.
fn tags_in(snapshot: &Value, workspace: Option<&str>) -> Vec<Value> {
    let mut counts: Vec<(String, usize, String)> = Vec::new();
    for note in array_of(snapshot, "notes") {
        if !matches_workspace(note, workspace) {
            continue;
        }
        let workspace_id = note["workspaceId"].as_str().unwrap_or("workspace-default");
        for tag in note["tags"].as_array().into_iter().flatten() {
            let Some(tag) = tag.as_str() else { continue };
            match counts
                .iter_mut()
                .find(|entry| entry.0 == tag && entry.2 == workspace_id)
            {
                Some(entry) => entry.1 += 1,
                None => counts.push((tag.to_string(), 1, workspace_id.to_string())),
            }
        }
    }
    counts.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    counts
        .into_iter()
        .map(|(tag, note_count, workspace_id)| {
            json!({ "tag": tag, "noteCount": note_count, "workspaceId": workspace_id })
        })
        .collect()
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
    fn list_folders_counts_notes_per_workspace_folder() {
        let snap = json!({
            "notes": [
                { "id": "n1", "workspaceId": "ws-a", "folder": "launch" },
                { "id": "n2", "workspaceId": "ws-a", "folder": "launch" },
                { "id": "n3", "workspaceId": "ws-b", "folder": "launch" }
            ]
        });
        let folders = folders_in(&snap, None);
        // Same folder id, two workspaces: they must not be merged.
        assert_eq!(folders.len(), 2);
        let ws_a = folders
            .iter()
            .find(|folder| folder["workspaceId"] == "ws-a")
            .expect("ws-a folder");
        assert_eq!(ws_a["noteCount"], 2);
        assert_eq!(ws_a["label"], "launch");

        let scoped = folders_in(&snap, Some("ws-b"));
        assert_eq!(scoped.len(), 1);
        assert_eq!(scoped[0]["noteCount"], 1);
    }

    #[test]
    fn list_tags_counts_and_orders_by_frequency() {
        let snap = json!({
            "notes": [
                { "id": "n1", "workspaceId": "ws-a", "tags": ["spec", "pricing"] },
                { "id": "n2", "workspaceId": "ws-a", "tags": ["spec"] },
                { "id": "n3", "workspaceId": "ws-b", "tags": ["spec"] },
                { "id": "n4", "workspaceId": "ws-a", "tags": [] }
            ]
        });
        let tags = tags_in(&snap, None);
        // "spec" appears in ws-a twice and ws-b once, so it is listed twice.
        assert_eq!(tags.len(), 3);
        assert_eq!(tags[0]["tag"], "spec");
        assert_eq!(tags[0]["noteCount"], 2);
        assert_eq!(tags[0]["workspaceId"], "ws-a");

        let scoped = tags_in(&snap, Some("ws-a"));
        assert_eq!(scoped.len(), 2);
        assert_eq!(scoped[0]["tag"], "spec");
        assert_eq!(scoped[0]["noteCount"], 2);
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
