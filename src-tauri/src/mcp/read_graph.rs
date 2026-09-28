//! Graph query over the snapshot's precomputed graph (docs/design/mcp-local-free.md §5).
//!
//! The app builds the graph with `buildWorkspaceGraph`; this module only walks
//! and filters it, so wiki-link resolution is never reimplemented here.

use serde_json::{json, Value};

use crate::bridge::Bridge;
use crate::read::{fail, limit_arg, matches_workspace, ok, string_arg, workspace_arg};
use crate::read_tasks::snapshot_or_error;

pub fn graph_query(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let workspace = workspace_arg(args);
    let start = string_arg(args, "id");
    let depth = limit_arg(args, "depth", 1, 6);
    let kinds = kind_filter(args);
    let graph = snapshot
        .get("graph")
        .cloned()
        .unwrap_or_else(|| json!({ "nodes": [], "edges": [] }));
    let nodes = graph["nodes"].as_array().cloned().unwrap_or_default();
    let edges = graph["edges"].as_array().cloned().unwrap_or_default();

    let scoped_nodes: Vec<&Value> = nodes
        .iter()
        .filter(|node| matches_workspace(node, workspace.as_deref()))
        .collect();
    let allowed = |id: &str| {
        scoped_nodes
            .iter()
            .any(|node| node["id"].as_str() == Some(id))
    };

    let Some(start) = start else {
        // No anchor: return the whole scoped graph, edges filtered by kind.
        let out_edges: Vec<Value> = edges
            .iter()
            .filter(|edge| {
                allowed(edge["source"].as_str().unwrap_or(""))
                    && allowed(edge["target"].as_str().unwrap_or(""))
            })
            .filter(|edge| kind_allowed(edge, &kinds))
            .cloned()
            .collect();
        return ok(json!({ "ok": true, "nodes": scoped_nodes, "edges": out_edges }));
    };

    // The anchor may be a graph id (`note:ws/id`) or a plain entity ref.
    let anchor = resolve_graph_anchor(&graph, &start, workspace.as_deref());
    let Some(anchor) = anchor else {
        return fail("not_found", "No graph node matches that id.");
    };

    let mut frontier: Vec<String> = vec![anchor.clone()];
    let mut visited: std::collections::HashSet<String> = frontier.iter().cloned().collect();
    for _ in 0..depth {
        let mut next = Vec::new();
        for id in &frontier {
            for edge in &edges {
                if !kind_allowed(edge, &kinds) {
                    continue;
                }
                let source = edge["source"].as_str().unwrap_or("");
                let target = edge["target"].as_str().unwrap_or("");
                let neighbour = if source == id {
                    target
                } else if target == id {
                    source
                } else {
                    continue;
                };
                if !allowed(neighbour) || visited.contains(neighbour) {
                    continue;
                }
                visited.insert(neighbour.to_string());
                next.push(neighbour.to_string());
            }
        }
        if next.is_empty() {
            break;
        }
        frontier = next;
    }

    let selected_nodes: Vec<Value> = nodes
        .iter()
        .filter(|node| node["id"].as_str().is_some_and(|id| visited.contains(id)))
        .cloned()
        .collect();
    let selected_edges: Vec<Value> = edges
        .iter()
        .filter(|edge| {
            edge["source"]
                .as_str()
                .is_some_and(|id| visited.contains(id))
                && edge["target"]
                    .as_str()
                    .is_some_and(|id| visited.contains(id))
        })
        .filter(|edge| kind_allowed(edge, &kinds))
        .cloned()
        .collect();
    ok(json!({
        "ok": true,
        "anchor": anchor,
        "depth": depth,
        "nodes": selected_nodes,
        "edges": selected_edges
    }))
}

fn kind_filter(args: &Value) -> Vec<String> {
    match args.get("kind") {
        Some(Value::String(kind)) => vec![kind.clone()],
        Some(Value::Array(kinds)) => kinds
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn kind_allowed(edge: &Value, kinds: &[String]) -> bool {
    kinds.is_empty()
        || edge["kind"]
            .as_str()
            .is_some_and(|kind| kinds.iter().any(|k| k == kind))
}

fn resolve_graph_anchor(graph: &Value, raw: &str, workspace: Option<&str>) -> Option<String> {
    let nodes = graph["nodes"].as_array()?;
    // Exact graph id first, then a `<workspaceId>/<entityId>` or bare id match.
    if let Some(node) = nodes.iter().find(|node| node["id"].as_str() == Some(raw)) {
        return node["id"].as_str().map(str::to_string);
    }
    let (prefix, plain) = match raw.split_once('/') {
        Some((prefix, rest)) if !rest.is_empty() => (Some(prefix), rest),
        _ => (None, raw),
    };
    nodes
        .iter()
        .filter(|node| node["entityId"].as_str() == Some(plain))
        .filter(|node| prefix.is_none_or(|prefix| node["workspaceId"] == prefix))
        .filter(|node| {
            prefix.is_some() || workspace.is_none_or(|workspace| node["workspaceId"] == workspace)
        })
        .find_map(|node| node["id"].as_str().map(str::to_string))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graph_anchor_matches_prefixed_and_graph_ids() {
        let graph = json!({ "nodes": [
            { "id": "note:ws/a", "entityId": "a", "workspaceId": "ws" },
            { "id": "task:ws/t1", "entityId": "t1", "workspaceId": "ws" }
        ]});
        assert_eq!(
            resolve_graph_anchor(&graph, "note:ws/a", None).as_deref(),
            Some("note:ws/a")
        );
        assert_eq!(
            resolve_graph_anchor(&graph, "ws/a", None).as_deref(),
            Some("note:ws/a")
        );
        assert_eq!(
            resolve_graph_anchor(&graph, "t1", Some("ws")).as_deref(),
            Some("task:ws/t1")
        );
        assert_eq!(resolve_graph_anchor(&graph, "missing", None), None);
    }

    #[test]
    fn kind_filter_empty_allows_everything() {
        let edge = json!({ "kind": "wiki" });
        assert!(kind_allowed(&edge, &[]));
        assert!(kind_allowed(&edge, &["wiki".into()]));
        assert!(!kind_allowed(&edge, &["dependency".into()]));
    }
}
