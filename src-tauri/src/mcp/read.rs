//! Read tools: pure filtering over the snapshot the app wrote (#D3).
//!
//! Nothing here touches the database, the graph algorithm, or the note parser.
//! The snapshot already carries the precomputed graph, so a read is a filter
//! over plain JSON — which is what keeps "monitor tasks / graph context" cheap.

use serde_json::{json, Value};

use crate::bridge::Bridge;
use crate::protocol;

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

/// Whether the snapshot carries note bodies or fell back to index-only mode.
pub(crate) fn render_bodies(snapshot: &Value) -> bool {
    !snapshot
        .get("truncated")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

pub(crate) fn matches_workspace(item: &Value, workspace: Option<&str>) -> bool {
    match workspace {
        Some(workspace) => item.get("workspaceId").and_then(Value::as_str) == Some(workspace),
        None => true,
    }
}

// --- search_notes -----------------------------------------------------------

pub fn search_notes(bridge: &Bridge, args: &Value) -> Value {
    let Some(snapshot) = bridge.read_snapshot() else {
        return fail(
            "snapshot_unavailable",
            "Snapshot unavailable; try again once the app settles.",
        );
    };
    let Some(query) = string_arg(args, "query") else {
        return fail("bad_arguments", "`query` is required.");
    };
    let needle = query.to_lowercase();
    let workspace = workspace_arg(args);
    let limit = limit_arg(args, "limit", 20, 200);
    let body = render_bodies(&snapshot);

    let mut hits: Vec<Value> = array_of(&snapshot, "notes")
        .iter()
        .filter(|note| matches_workspace(note, workspace.as_deref()))
        .filter(|note| note_matches(note, &needle, body))
        .take(limit)
        .map(with_prefixed_id)
        .collect();
    hits.sort_by_key(|note| std::cmp::Reverse(score_note(note, &needle)));
    ok(json!({
        "ok": true,
        "indexOnly": !body,
        "query": query,
        "notes": hits
    }))
}

fn note_matches(note: &Value, needle: &str, body: bool) -> bool {
    let title = note["title"].as_str().unwrap_or("").to_lowercase();
    if title.contains(needle) {
        return true;
    }
    let tags = note["tags"].as_array().cloned().unwrap_or_default();
    if tags
        .iter()
        .any(|tag| tag.as_str().unwrap_or("").to_lowercase().contains(needle))
    {
        return true;
    }
    let excerpt = note["excerpt"].as_str().unwrap_or("").to_lowercase();
    if excerpt.contains(needle) {
        return true;
    }
    body && note["body"]
        .as_str()
        .unwrap_or("")
        .to_lowercase()
        .contains(needle)
}

/// Title hits outrank tag hits, which outrank body hits.
fn score_note(note: &Value, needle: &str) -> i64 {
    let title = note["title"]
        .as_str()
        .unwrap_or("")
        .to_lowercase()
        .matches(needle)
        .count() as i64;
    let tags: i64 = note["tags"]
        .as_array()
        .map(|tags| {
            tags.iter()
                .filter(|tag| tag.as_str().unwrap_or("").to_lowercase().contains(needle))
                .count()
        })
        .unwrap_or(0) as i64;
    let body = note["body"]
        .as_str()
        .unwrap_or("")
        .to_lowercase()
        .matches(needle)
        .count() as i64;
    title * 10 + tags * 5 + body
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
    ok(payload)
}

pub(crate) fn graph_node_id(kind: &str, item: &Value) -> String {
    let workspace = item
        .get("workspaceId")
        .and_then(Value::as_str)
        .unwrap_or("workspace-default");
    let id = item.get("id").and_then(Value::as_str).unwrap_or("");
    format!("{kind}:{workspace}/{id}")
}

/// Incoming and outgoing wiki edges for a node, resolved to display refs.
fn links_for(snapshot: &Value, node: &str) -> (Vec<Value>, Vec<Value>) {
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

// --- context ----------------------------------------------------------------

/// "What do I know about X?": score notes for a query, then attach each hit's
/// one-hop graph neighbourhood so the model can walk outward on its own.
pub fn context(bridge: &Bridge, args: &Value) -> Value {
    let Some(snapshot) = bridge.read_snapshot() else {
        return fail(
            "snapshot_unavailable",
            "Snapshot unavailable; try again once the app settles.",
        );
    };
    let Some(query) = string_arg(args, "query") else {
        return fail("bad_arguments", "`query` is required.");
    };
    let workspace = workspace_arg(args);
    let limit = limit_arg(args, "limit", 5, 25);
    let depth = limit_arg(args, "depth", 1, 3);
    let needle = query.to_lowercase();
    let body = render_bodies(&snapshot);

    let mut scored: Vec<(&Value, i64)> = array_of(&snapshot, "notes")
        .iter()
        .filter(|note| matches_workspace(note, workspace.as_deref()))
        .filter_map(|note| {
            let score = score_context(note, &needle, body);
            (score > 0).then_some((note, score))
        })
        .collect();
    scored.sort_by_key(|entry| std::cmp::Reverse(entry.1));

    let hits: Vec<Value> = scored
        .into_iter()
        .take(limit)
        .map(|(note, score)| {
            let mut item = with_prefixed_id(note);
            if !body {
                item["body"] = Value::Null;
            }
            item["score"] = json!(score);
            let node = graph_node_id("note", note);
            let (backlinks, outlinks) = links_for(&snapshot, &node);
            item["neighbours"] = json!({
                "backlinks": backlinks,
                "outlinks": outlinks,
                "depth": depth
            });
            item
        })
        .collect();
    ok(json!({
        "ok": true,
        "query": query,
        "indexOnly": !body,
        "notes": hits
    }))
}

/// Weighted score over title (strong), tags (medium) and body (weak).
fn score_context(note: &Value, needle: &str, body: bool) -> i64 {
    let title = note["title"].as_str().unwrap_or("").to_lowercase();
    let title_hits = if title.contains(needle) { 3 } else { 0 };
    let tag_hits = note["tags"]
        .as_array()
        .map(|tags| {
            tags.iter()
                .filter(|tag| tag.as_str().unwrap_or("").to_lowercase().contains(needle))
                .count()
                .min(2)
        })
        .unwrap_or(0) as i64;
    let body_hits = if body
        && note["body"]
            .as_str()
            .unwrap_or("")
            .to_lowercase()
            .contains(needle)
    {
        1
    } else {
        0
    };
    title_hits * 4 + tag_hits * 2 + body_hits
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

    #[test]
    fn search_ranks_title_above_body() {
        let hot = json!({ "title": "arsitektur MCP", "tags": [], "excerpt": "", "body": "" });
        let cold = json!({ "title": "lain", "tags": [], "excerpt": "", "body": "arsitektur" });
        assert!(score_note(&hot, "arsitektur") > score_note(&cold, "arsitektur"));
    }
}
