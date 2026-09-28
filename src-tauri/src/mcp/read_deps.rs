//! Dependency read tools: the edge list and the critical path (§5).
//!
//! Both work off the snapshot's dependency rows. The graph walk is guarded
//! against cycles even though the app prevents them, so a hand-edited database
//! cannot hang the shim.

use serde_json::{json, Value};

use crate::bridge::Bridge;
use crate::read::{
    array_of, matches_workspace, ok, prefixed_id, resolve_entity, resolve_error, string_arg,
    workspace_arg, Resolved,
};
use crate::read_tasks::snapshot_or_error;

pub fn list_dependencies(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let workspace = workspace_arg(args);
    let tasks = array_of(&snapshot, "tasks");
    let by_id = |id: &str| tasks.iter().find(|task| task["id"].as_str() == Some(id));
    let edges: Vec<Value> = array_of(&snapshot, "dependencies")
        .iter()
        .filter(|edge| {
            workspace.as_deref().is_none_or(|workspace| {
                by_id(edge["taskId"].as_str().unwrap_or(""))
                    .map(|task| task["workspaceId"] == workspace)
                    .unwrap_or(false)
            })
        })
        .map(|edge| {
            let task = by_id(edge["taskId"].as_str().unwrap_or(""));
            let dep = by_id(edge["dependsOnTaskId"].as_str().unwrap_or(""));
            json!({
                "taskId": task.map(prefixed_id),
                "dependsOnTaskId": dep.map(prefixed_id),
                "taskTitle": task.map(|t| t["title"].clone()),
                "dependsOnTitle": dep.map(|d| d["title"].clone())
            })
        })
        .collect();
    let count = edges.len();
    ok(json!({ "ok": true, "count": count, "dependencies": edges }))
}

/// Longest dependency chain ending at `toId` (or the overall longest chain).
pub fn critical_path(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let workspace = workspace_arg(args);
    let to_id = string_arg(args, "toId");
    let tasks = array_of(&snapshot, "tasks");
    // task id -> ids it depends on
    let mut deps: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for edge in array_of(&snapshot, "dependencies") {
        if let (Some(task), Some(dep)) = (edge["taskId"].as_str(), edge["dependsOnTaskId"].as_str())
        {
            deps.entry(task.to_string())
                .or_default()
                .push(dep.to_string());
        }
    }
    let in_workspace = |id: &str| -> bool {
        tasks
            .iter()
            .find(|task| task["id"].as_str() == Some(id))
            .is_some_and(|task| matches_workspace(task, workspace.as_deref()))
    };
    let described = |id: &str| -> Option<Value> {
        let task = tasks.iter().find(|task| task["id"].as_str() == Some(id))?;
        Some(json!({
            "id": prefixed_id(task),
            "title": task["title"].clone(),
            "status": task["status"].clone(),
            "blocked": task["blocked"].clone()
        }))
    };

    let starts: Vec<String> = match &to_id {
        Some(raw) => {
            let resolved = resolve_entity(tasks, raw, workspace.as_deref());
            match resolved {
                Resolved::One(task) => vec![task["id"].as_str().unwrap_or("").to_string()],
                other => return resolve_error(other),
            }
        }
        None => tasks
            .iter()
            .filter(|task| matches_workspace(task, workspace.as_deref()))
            .filter_map(|task| task["id"].as_str().map(str::to_string))
            .collect(),
    };

    let mut best: Vec<String> = Vec::new();
    for start in starts {
        let chain = longest(&start, &deps, &mut Vec::new());
        if chain.len() > best.len() {
            best = chain;
        }
    }
    let chain: Vec<Value> = best
        .iter()
        .filter(|id| in_workspace(id))
        .filter_map(|id| described(id))
        .collect();
    let length = chain.len();
    ok(json!({ "ok": true, "length": length, "chain": chain }))
}

// Depth-first longest chain, guarded by a visiting set so a cycle (which the
// app prevents, but a hand-edited DB might still contain) cannot hang us.
fn longest(
    id: &str,
    deps: &std::collections::HashMap<String, Vec<String>>,
    visiting: &mut Vec<String>,
) -> Vec<String> {
    if visiting.iter().any(|seen| seen == id) {
        return vec![id.to_string()];
    }
    visiting.push(id.to_string());
    let mut best: Vec<String> = Vec::new();
    for dep in deps.get(id).map(Vec::as_slice).unwrap_or(&[]) {
        let chain = longest(dep, deps, visiting);
        if chain.len() > best.len() {
            best = chain;
        }
    }
    visiting.pop();
    best.push(id.to_string());
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn longest_stops_on_a_cycle() {
        let mut deps: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();
        deps.insert("a".into(), vec!["b".into()]);
        deps.insert("b".into(), vec!["a".into()]);
        let chain = longest("a", &deps, &mut Vec::new());
        // a -> b -> (guard stops the repeat of a): the walk is bounded, never
        // infinite, even though the app prevents this cycle from existing.
        assert_eq!(chain, vec!["a", "b", "a"]);
    }

    #[test]
    fn longest_picks_the_deepest_branch() {
        let mut deps: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();
        deps.insert("c".into(), vec!["a".into(), "b1".into()]);
        deps.insert("b1".into(), vec!["b2".into()]);
        let chain = longest("c", &deps, &mut Vec::new());
        assert_eq!(chain, vec!["b2", "b1", "c"]);
    }
}
