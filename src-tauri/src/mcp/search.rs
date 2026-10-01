//! Text search read tools: ranked filtering over the snapshot (#D3).
//!
//! `search_notes`, `search_tasks` and `search_all` share one ranking contract
//! (`crate::rank`) so a note cannot rank differently depending on which tool
//! found it. `context` lives here too: it is the same scoring plus a one-hop
//! graph neighbourhood. Everything is a pure filter over the snapshot JSON —
//! no database, no parser, no reimplementation of the app's logic.

use serde_json::{json, Value};

use crate::bridge::Bridge;
use crate::rank;
use crate::read::{
    array_of, fail, limit_arg, matches_workspace, null_body, ok, render_bodies, string_arg,
    with_prefixed_id, workspace_arg,
};
use crate::read_tasks::{filtered_tasks, snapshot_or_error};

// --- search_notes -----------------------------------------------------------

pub fn search_notes(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let Some(query) = string_arg(args, "query") else {
        return fail("bad_arguments", "`query` is required.");
    };
    let needle = query.to_lowercase();
    let workspace = workspace_arg(args);
    let limit = limit_arg(args, "limit", 20, 200);
    let body = render_bodies(&snapshot);

    let hits = ranked_notes(&snapshot, workspace.as_deref(), &needle, body, limit);
    ok(json!({
        "ok": true,
        "indexOnly": !body,
        "query": query,
        "notes": hits
    }))
}

// --- search_tasks -----------------------------------------------------------

pub fn search_tasks(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let Some(query) = string_arg(args, "query") else {
        return fail("bad_arguments", "`query` is required.");
    };
    let needle = query.to_lowercase();
    let limit = limit_arg(args, "limit", 20, 200);

    let tasks = ranked_tasks(&snapshot, args, &needle, limit);
    ok(json!({ "ok": true, "query": query, "tasks": tasks }))
}

// --- search_all -------------------------------------------------------------

/// One ranked search across both kinds, returned as two lists.
///
/// The two score scales are not directly comparable across kinds (a task's
/// `notes` mention is not a note's title hit), so the lists stay separate
/// rather than interleaving on a number that means two different things.
pub fn search_all(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let Some(query) = string_arg(args, "query") else {
        return fail("bad_arguments", "`query` is required.");
    };
    let needle = query.to_lowercase();
    let workspace = workspace_arg(args);
    let limit = limit_arg(args, "limit", 20, 200);
    let body = render_bodies(&snapshot);

    let notes = ranked_notes(&snapshot, workspace.as_deref(), &needle, body, limit);
    let tasks = ranked_tasks(&snapshot, args, &needle, limit);
    ok(json!({
        "ok": true,
        "indexOnly": !body,
        "query": query,
        "notes": notes,
        "tasks": tasks
    }))
}

/// Notes that match `needle`, highest score first, capped at `limit`.
///
/// `body` is whether bodies ship at all; a hit's body is nulled when withheld
/// so "no text" is never read as "the note is empty".
fn ranked_notes(
    snapshot: &Value,
    workspace: Option<&str>,
    needle: &str,
    body: bool,
    limit: usize,
) -> Vec<Value> {
    let mut scored: Vec<(&Value, i64)> = array_of(snapshot, "notes")
        .iter()
        .filter(|note| matches_workspace(note, workspace))
        .filter_map(|note| {
            let score = rank::score_note(note, needle);
            (score > 0).then_some((note, score))
        })
        .collect();
    // Sort before the cap: taking `limit` first would drop the strongest hits
    // whenever the snapshot's own order is uncorrelated with relevance.
    scored.sort_by_key(|entry| std::cmp::Reverse(entry.1));
    scored
        .into_iter()
        .take(limit)
        .map(|(note, _score)| shape_note(note, body))
        .collect()
}

/// A note hit: prefixed id, body nulled when withheld, never an empty string.
fn shape_note(note: &Value, body: bool) -> Value {
    let mut item = with_prefixed_id(note);
    if !body {
        item["body"] = Value::Null;
    } else {
        null_body(&mut item);
    }
    item
}

/// Tasks matching `needle` under the shared `list_tasks` filters, ranked.
fn ranked_tasks(snapshot: &Value, args: &Value, needle: &str, limit: usize) -> Vec<Value> {
    let mut scored: Vec<(Value, i64)> = filtered_tasks(snapshot, args)
        .into_iter()
        .filter_map(|task| {
            let score = rank::score_task(task, needle);
            (score > 0).then_some((task.clone(), score))
        })
        .collect();
    scored.sort_by_key(|entry| std::cmp::Reverse(entry.1));
    scored
        .into_iter()
        .take(limit)
        .map(|(task, _score)| with_prefixed_id(&task))
        .collect()
}

// --- context ----------------------------------------------------------------

/// "What do I know about X?": score notes for a query, then attach each hit's
/// one-hop graph neighbourhood so the model can walk outward on its own.
pub fn context(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
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
            let score = rank::score_note(note, &needle);
            (score > 0).then_some((note, score))
        })
        .collect();
    scored.sort_by_key(|entry| std::cmp::Reverse(entry.1));

    let hits: Vec<Value> = scored
        .into_iter()
        .take(limit)
        .map(|(note, score)| {
            let mut item = shape_note(note, body);
            item["score"] = json!(score);
            let node = crate::read::graph_node_id("note", note);
            let (backlinks, outlinks) = crate::read::links_for(&snapshot, &node);
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn note(id: &str, workspace: &str, title: &str, body: &str) -> Value {
        json!({
            "id": id, "workspaceId": workspace, "title": title, "tags": [],
            "excerpt": "", "body": body, "folder": "personal",
            "pinned": false, "createdAt": 1, "updatedAt": 1
        })
    }

    #[test]
    fn ranked_notes_orders_by_score_not_snapshot_order() {
        let snapshot = json!({ "notes": [
            note("weak", "w", "other", "roadmap"),
            note("strong", "w", "roadmap", ""),
        ]});
        let hits = ranked_notes(&snapshot, None, "roadmap", true, 10);
        assert_eq!(hits[0]["id"], "strong");
        assert_eq!(hits[1]["id"], "weak");
    }

    #[test]
    fn ranked_notes_caps_after_ranking() {
        let snapshot = json!({ "notes": [
            note("weak", "w", "other", "roadmap roadmap"),
            note("strong", "w", "roadmap", ""),
        ]});
        let hits = ranked_notes(&snapshot, None, "roadmap", true, 1);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0]["id"], "strong");
    }

    #[test]
    fn ranked_notes_nulls_a_withheld_body() {
        // `body: false` is index-only: the hit must read as withheld, not empty.
        let snapshot = json!({ "notes": [note("n", "w", "roadmap", "text")] });
        let hits = ranked_notes(&snapshot, None, "roadmap", false, 10);
        assert_eq!(hits[0]["body"], Value::Null);
        assert_eq!(hits[0]["ref"], "w/n");
    }

    #[test]
    fn ranked_tasks_respects_filters_and_ranks() {
        let snapshot = json!({
            "today": "2026-01-01",
            "tasks": [
                json!({ "id": "done", "workspaceId": "w", "title": "ship", "notes": "", "status": "done", "priority": "high", "folder": "work", "dueAt": null, "position": 0, "blocked": false, "blockedBy": [], "blocking": [], "noteIds": [] }),
                json!({ "id": "open", "workspaceId": "w", "title": "other", "notes": "ship it", "status": "todo", "priority": "low", "folder": "work", "dueAt": null, "position": 1, "blocked": false, "blockedBy": [], "blocking": [], "noteIds": [] }),
            ]
        });
        let args = json!({ "includeDone": false });
        let hits = ranked_tasks(&snapshot, &args, "ship", 10);
        // The done task is filtered out despite carrying the title hit.
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0]["id"], "open");
    }
}
