//! Read tools: pure filtering over the snapshot the app wrote (#D3).
//!
//! Nothing here touches the database, the graph algorithm, or the note parser.
//! The snapshot already carries the precomputed graph, so a read is a filter
//! over plain JSON — which is what keeps "monitor tasks / graph context" cheap.

use serde_json::{json, Value};

use crate::bridge::Bridge;
use crate::protocol;
use crate::semantic;

/// Resolves the workspace filter: explicit argument, or `None` for all.
pub(crate) fn workspace_arg(args: &Value) -> Option<String> {
    args.get("workspace")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn string_arg(args: &Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn bool_arg(args: &Value, key: &str) -> Option<bool> {
    args.get(key).and_then(Value::as_bool)
}

pub(crate) fn limit_arg(args: &Value, key: &str, default: usize, max: usize) -> usize {
    args.get(key)
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(default)
        .min(max)
}

pub(crate) fn array_of<'a>(snapshot: &'a Value, key: &str) -> &'a [Value] {
    snapshot
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

/// Matches `id` against the entity's plain id, a `<workspaceId>/<id>` prefix,
/// or its graph node id. Ambiguous plain ids are reported, not guessed (§13b).
pub(crate) fn resolve_entity<'a>(
    items: &'a [Value],
    raw: &str,
    workspace: Option<&str>,
) -> Resolved<'a> {
    let (prefix, plain) = match raw.split_once('/') {
        Some((prefix, rest)) if !rest.is_empty() => (Some(prefix), rest),
        _ => (None, raw),
    };
    let mut matches: Vec<&Value> = items
        .iter()
        .filter(|item| item.get("id").and_then(Value::as_str) == Some(plain))
        .filter(|item| match prefix {
            Some(prefix) => item.get("workspaceId").and_then(Value::as_str) == Some(prefix),
            None => match workspace {
                Some(workspace) => {
                    item.get("workspaceId").and_then(Value::as_str) == Some(workspace)
                }
                None => true,
            },
        })
        .collect();
    if matches.is_empty() && prefix.is_none() && workspace.is_none() {
        // No prefix and no workspace: fall back to any workspace match.
        matches = items
            .iter()
            .filter(|item| item.get("id").and_then(Value::as_str) == Some(plain))
            .collect();
    }
    match matches.len() {
        0 => Resolved::NotFound,
        1 => Resolved::One(matches[0]),
        _ => Resolved::Ambiguous(matches.iter().map(|item| entity_ref(item)).collect()),
    }
}

pub(crate) enum Resolved<'a> {
    One(&'a Value),
    Ambiguous(Vec<Value>),
    NotFound,
}

pub(crate) fn entity_ref(item: &Value) -> Value {
    json!({
        "id": prefixed_id(item),
        "title": item.get("title").cloned().unwrap_or(Value::Null),
        "workspaceId": item.get("workspaceId").cloned().unwrap_or(Value::Null)
    })
}

/// `<workspaceId>/<entityId>` — every id in a response is prefixed (§13b).
pub fn prefixed_id(item: &Value) -> String {
    let workspace = item
        .get("workspaceId")
        .and_then(Value::as_str)
        .unwrap_or("workspace-default");
    let id = item.get("id").and_then(Value::as_str).unwrap_or("");
    format!("{workspace}/{id}")
}

/// Adds the prefixed id to an entity copy so callers never see a bare id.
pub(crate) fn with_prefixed_id(item: &Value) -> Value {
    let mut copy = item.clone();
    copy["ref"] = json!(prefixed_id(item));
    copy
}

/// Wraps a successful read result.
pub fn ok(value: Value) -> Value {
    protocol::tool_result(
        serde_json::to_string_pretty(&value).unwrap_or_default(),
        Some(value),
    )
}

pub(crate) fn fail(code: &str, message: &str) -> Value {
    protocol::tool_error(code, message)
}

pub(crate) fn resolve_error(resolved: Resolved<'_>) -> Value {
    match resolved {
        Resolved::Ambiguous(candidates) => protocol::tool_error_with_data(
            "ambiguous_id",
            "That id exists in more than one workspace; use a <workspaceId>/<id> prefix.",
            json!({ "candidates": candidates }),
        ),
        _ => fail("not_found", "No entity matches that id."),
    }
}

// --- list_notes -------------------------------------------------------------

pub fn list_notes(bridge: &Bridge, args: &Value) -> Value {
    let Some(snapshot) = bridge.read_snapshot() else {
        return fail(
            "snapshot_unavailable",
            "Snapshot unavailable; try again once the app settles.",
        );
    };
    let workspace = workspace_arg(args);
    let folder = string_arg(args, "folder");
    let tag = string_arg(args, "tag");
    let pinned = bool_arg(args, "pinned");
    let limit = limit_arg(args, "limit", 50, 500);
    let order = string_arg(args, "order").unwrap_or_else(|| "created".into());

    let mut notes: Vec<&Value> = array_of(&snapshot, "notes")
        .iter()
        .filter(|note| matches_workspace(note, workspace.as_deref()))
        .filter(|note| {
            folder
                .as_deref()
                .is_none_or(|value| note["folder"] == value)
        })
        .filter(|note| {
            tag.as_deref().is_none_or(|value| {
                note["tags"]
                    .as_array()
                    .is_some_and(|tags| tags.iter().any(|item| item == value))
            })
        })
        .filter(|note| pinned.is_none_or(|value| note["pinned"].as_bool() == Some(value)))
        .collect();

    match order.as_str() {
        "updated" => {
            notes.sort_by_key(|note| std::cmp::Reverse(note["updatedAt"].as_u64().unwrap_or(0)))
        }
        "title" => notes.sort_by_key(|note| note["title"].as_str().unwrap_or("").to_lowercase()),
        _ => notes.sort_by_key(|note| std::cmp::Reverse(note["createdAt"].as_u64().unwrap_or(0))),
    }
    let total = notes.len();
    let body = render_bodies(&snapshot);
    let items: Vec<Value> = notes
        .into_iter()
        .take(limit)
        .map(with_prefixed_id)
        .map(|mut note| {
            if !body {
                note["body"] = Value::Null;
            } else {
                null_body(&mut note);
            }
            note
        })
        .collect();
    ok(json!({
        "ok": true,
        "total": total,
        "returned": items.len(),
        "indexOnly": !body,
        "notes": items
    }))
}

/// Whether the snapshot carries note bodies, i.e. it is not index-only.
///
/// v3 splits the two meanings `truncated` used to carry: `indexOnly` says
/// whether *no* body shipped, while `truncated` now only reports that content
/// was trimmed somewhere — a cut or withheld body on one note no longer means
/// every other note lost its text too. A pre-v3 snapshot has no `indexOnly`,
/// and there `truncated` meant exactly this, hence the fallback.
pub(crate) fn render_bodies(snapshot: &Value) -> bool {
    if let Some(index_only) = snapshot.get("indexOnly").and_then(Value::as_bool) {
        return !index_only;
    }
    !snapshot
        .get("truncated")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

/// Forces `body` into a note payload: `null` when the snapshot withheld it.
///
/// An absent field reads as "the writer forgot"; `null` reads as "there is
/// none here", which a client can pair with the note's `truncated` flag to
/// tell a withheld body from one the user never wrote.
pub(crate) fn null_body(item: &mut Value) {
    if item.get("body").is_none() {
        item["body"] = Value::Null;
    }
}

pub(crate) fn matches_workspace(item: &Value, workspace: Option<&str>) -> bool {
    match workspace {
        Some(workspace) => item.get("workspaceId").and_then(Value::as_str) == Some(workspace),
        None => true,
    }
}

// --- get_note ---------------------------------------------------------------

pub fn get_note(bridge: &Bridge, args: &Value, workspace: Option<&str>) -> Value {
    let Some(snapshot) = bridge.read_snapshot() else {
        return fail(
            "snapshot_unavailable",
            "Snapshot unavailable; try again once the app settles.",
        );
    };
    let Some(raw) = string_arg(args, "id") else {
        return fail("bad_arguments", "`id` is required.");
    };
    if !render_bodies(&snapshot) {
        return fail(
            "snapshot_truncated",
            "Snapshot is in index-only mode; narrow by workspace or folder.",
        );
    }
    let resolved = resolve_entity(array_of(&snapshot, "notes"), &raw, workspace);
    let Resolved::One(note) = resolved else {
        return resolve_error(resolved);
    };
    let node = graph_node_id("note", note);
    let (backlinks, outlinks) = links_for(&snapshot, &node);
    let mut payload = with_prefixed_id(note);
    payload["backlinks"] = Value::Array(backlinks);
    payload["outlinks"] = Value::Array(outlinks);

    // A missing `body` means the size budget withheld it — an empty note
    // carries `""`. Answering with an empty string would tell the client the
    // user never wrote anything, so the omission is reported as an error that
    // still hands over the excerpt and links instead of nothing at all.
    if payload.get("body").and_then(Value::as_str).is_none() {
        return protocol::tool_error_with_data(
            "snapshot_truncated",
            "This note's body was left out of the snapshot to keep it within the size budget; the note is not empty. Work from the excerpt and links below, or ask the user to narrow the workspace.",
            payload,
        );
    }
    ok(payload)
}

/// Graph node id for an entity, matching `graphNodeId()` in
/// `src/lib/content/workspace-graph.ts`: `<kind>:<id>`, **no** workspace segment.
///
/// The workspace is deliberately absent because the app builds the snapshot's
/// graph that way, and `links_for` looks nodes up by this exact key. Adding a
/// workspace prefix here silently empties every `backlinks`/`outlinks`/`neighbours`
/// payload — see the regression test `graph_node_id_matches_workspace_graph`.
pub(crate) fn graph_node_id(kind: &str, item: &Value) -> String {
    let id = item.get("id").and_then(Value::as_str).unwrap_or("");
    format!("{kind}:{id}")
}

/// Incoming and outgoing wiki edges for a node, resolved to display refs.
pub(crate) fn links_for(snapshot: &Value, node: &str) -> (Vec<Value>, Vec<Value>) {
    let node_index = snapshot
        .get("graph")
        .and_then(|graph| graph.get("nodes"))
        .and_then(Value::as_array);
    let describe = |graph_id: &str| -> Option<Value> {
        let nodes = node_index?;
        let node = nodes
            .iter()
            .find(|candidate| candidate.get("id").and_then(Value::as_str) == Some(graph_id))?;
        Some(json!({
            "id": graph_id,
            "title": node.get("title").cloned().unwrap_or(Value::Null),
            "kind": node.get("kind").cloned().unwrap_or(Value::Null)
        }))
    };
    let edges = snapshot
        .get("graph")
        .and_then(|graph| graph.get("edges"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut backlinks = Vec::new();
    let mut outlinks = Vec::new();
    for edge in edges {
        let source = edge["source"].as_str().unwrap_or("");
        let target = edge["target"].as_str().unwrap_or("");
        if target == node {
            if let Some(item) = describe(source) {
                backlinks.push(item);
            }
        } else if source == node {
            if let Some(item) = describe(target) {
                outlinks.push(item);
            }
        }
    }
    (backlinks, outlinks)
}

/// Runs one read tool against the snapshot, so the stdio shim and the remote
/// HTTP listener share a single implementation (#D2, #D3).
///
/// `name` is guaranteed to be a registered read tool by the caller; an unknown
/// name still answers with a clear `unknown_tool` error rather than panicking.
///
/// Semantic reads are the exception: vectors never enter the snapshot, so they
/// are handed to the app as a job (like a write) and executed there (#D15).
pub fn dispatch(name: &str, bridge: &Bridge, args: &Value, instance: &str) -> Value {
    let workspace = workspace_arg(args);
    match name {
        "list_notes" => list_notes(bridge, args),
        "search_notes" => crate::search::search_notes(bridge, args),
        "search_tasks" => crate::search::search_tasks(bridge, args),
        "search_all" => crate::search::search_all(bridge, args),
        "get_note" => get_note(bridge, args, workspace.as_deref()),
        "context" => crate::search::context(bridge, args),
        "list_tasks" => crate::read_tasks::list_tasks(bridge, args),
        "get_task" => crate::read_tasks::get_task(bridge, args, workspace.as_deref()),
        "task_board" => crate::read_tasks::task_board(bridge, args),
        "daily_summary" => crate::read_tasks::daily_summary(bridge, args),
        "list_dependencies" => crate::read_deps::list_dependencies(bridge, args),
        "critical_path" => crate::read_deps::critical_path(bridge, args),
        "graph_query" => crate::read_graph::graph_query(bridge, args),
        "list_workspaces" => crate::read_workspaces::list_workspaces(bridge, args),
        "list_folders" => crate::read_workspaces::list_folders(bridge, args),
        "list_tags" => crate::read_workspaces::list_tags(bridge, args),
        // Semantic reads execute inside the app (docs/design/constella-features.md
        // #D15): vectors never enter the snapshot, so they are forwarded as a
        // job. `find_contradictions` is not a registered MCP tool — it calls the
        // app's model, so it stays `aiOnly` in the assistant.
        other if semantic::LOCAL_TOOLS.contains(&other) => {
            semantic::call(bridge, other, args, instance)
        }
        other => fail("unknown_tool", &format!("Unknown read tool `{other}`.")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(id: &str, workspace: &str, title: &str) -> Value {
        json!({
            "id": id, "workspaceId": workspace, "title": title,
            "folder": "personal", "tags": [], "pinned": false,
            "excerpt": "", "body": "", "createdAt": 1, "updatedAt": 1
        })
    }

    #[test]
    fn prefixed_id_uses_workspace() {
        assert_eq!(prefixed_id(&note("a", "wk", "A")), "wk/a");
    }

    /// Guards the contract with `graphNodeId()` in `workspace-graph.ts`:
    /// `<kind>:<id>`, no workspace segment. A workspace prefix here made
    /// `links_for` miss every node, so backlinks/outlinks were always empty.
    #[test]
    fn graph_node_id_matches_workspace_graph() {
        assert_eq!(graph_node_id("note", &note("a", "wk", "A")), "note:a");
    }

    #[test]
    fn links_for_resolves_edges_between_production_node_ids() {
        let snapshot = json!({
            "graph": {
                "nodes": [
                    { "id": "note:a", "entityId": "a", "kind": "note", "workspaceId": "wk", "title": "A" },
                    { "id": "note:b", "entityId": "b", "kind": "note", "workspaceId": "wk", "title": "B" }
                ],
                "edges": [
                    { "id": "wiki:note:a->note:b", "source": "note:a", "target": "note:b", "kind": "wiki" }
                ]
            }
        });
        let (backlinks, outlinks) = links_for(&snapshot, "note:a");
        assert_eq!(backlinks.len(), 0);
        assert_eq!(outlinks.len(), 1);
        assert_eq!(outlinks[0]["id"], "note:b");

        let (backlinks, outlinks) = links_for(&snapshot, "note:b");
        assert_eq!(backlinks.len(), 1);
        assert_eq!(backlinks[0]["id"], "note:a");
        assert_eq!(outlinks.len(), 0);
    }

    #[test]
    fn resolve_reports_ambiguity_without_guessing() {
        let items = vec![note("retro", "one", "R"), note("retro", "two", "R")];
        match resolve_entity(&items, "retro", None) {
            Resolved::Ambiguous(candidates) => assert_eq!(candidates.len(), 2),
            _ => panic!("expected ambiguity"),
        }
        match resolve_entity(&items, "two/retro", None) {
            Resolved::One(item) => assert_eq!(item["workspaceId"], "two"),
            _ => panic!("expected prefix to disambiguate"),
        }
    }

    /// The v3 split: `truncated` only says content was trimmed, `indexOnly`
    /// says no body shipped at all. Getting this backwards hides bodies that
    /// are sitting right there in the file.
    #[test]
    fn render_bodies_follows_index_only_not_the_trim_flag() {
        assert!(render_bodies(
            &json!({ "truncated": true, "indexOnly": false })
        ));
        assert!(!render_bodies(
            &json!({ "truncated": true, "indexOnly": true })
        ));

        // A pre-v3 snapshot has no `indexOnly`, where `truncated` meant
        // exactly this — a stale file must still be readable.
        assert!(!render_bodies(&json!({ "truncated": true })));
        assert!(render_bodies(&json!({ "truncated": false })));
    }

    #[test]
    fn null_body_reports_a_withheld_body_without_inventing_one() {
        let mut withheld = json!({ "id": "a", "truncated": true });
        null_body(&mut withheld);
        assert_eq!(withheld["body"], Value::Null);

        // An empty note keeps its empty string: withheld and empty stay
        // distinguishable, which is the whole reason for the flag.
        let mut empty = json!({ "id": "b", "body": "" });
        null_body(&mut empty);
        assert_eq!(empty["body"], json!(""));
    }
}
