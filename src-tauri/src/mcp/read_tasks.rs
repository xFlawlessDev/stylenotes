//! Task read tools over the snapshot (#D3, §5).
//!
//! Blocked state (`blocked`/`blockedBy`/`blocking`) is precomputed by the app
//! in the snapshot, so these tools only filter and sort — they never re-derive
//! the cycle-safe dependency rules that live in the TypeScript store.

use serde_json::{json, Value};

use crate::bridge::Bridge;
use crate::read::{
    array_of, bool_arg, fail, limit_arg, matches_workspace, ok, prefixed_id, resolve_entity,
    resolve_error, string_arg, with_prefixed_id, workspace_arg, Resolved,
};

pub(crate) fn snapshot_or_error(bridge: &Bridge) -> Result<Value, Value> {
    bridge.read_snapshot().ok_or_else(|| {
        fail(
            "snapshot_unavailable",
            "Snapshot unavailable; try again once the app settles.",
        )
    })
}

/// Sort tasks by priority (high first), then due date, then position — the same
/// order the app's `sortTasks` produces.
fn sort_smart(tasks: &mut [Value]) {
    tasks.sort_by(|a, b| {
        let rank = |task: &Value| match task["priority"].as_str().unwrap_or("medium") {
            "high" => 0,
            "low" => 2,
            _ => 1,
        };
        rank(a)
            .cmp(&rank(b))
            .then_with(|| due_key(a).cmp(&due_key(b)))
            .then_with(|| {
                a["position"]
                    .as_i64()
                    .unwrap_or(0)
                    .cmp(&b["position"].as_i64().unwrap_or(0))
            })
    });
}

fn due_key(task: &Value) -> String {
    task["dueAt"].as_str().unwrap_or("9999-12-31").to_string()
}

// --- list_tasks -------------------------------------------------------------

pub fn list_tasks(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let workspace = workspace_arg(args);
    let status = string_arg(args, "status");
    let priority = string_arg(args, "priority");
    let folder = string_arg(args, "folder");
    let due_before = string_arg(args, "dueBefore");
    let overdue_only = bool_arg(args, "overdueOnly").unwrap_or(false);
    let include_done = bool_arg(args, "includeDone").unwrap_or(true);
    let limit = limit_arg(args, "limit", 100, 1000);

    let mut tasks: Vec<Value> = array_of(&snapshot, "tasks")
        .iter()
        .filter(|task| matches_workspace(task, workspace.as_deref()))
        .filter(|task| {
            status
                .as_deref()
                .is_none_or(|value| task["status"] == value)
        })
        .filter(|task| {
            priority
                .as_deref()
                .is_none_or(|value| task["priority"] == value)
        })
        .filter(|task| {
            folder
                .as_deref()
                .is_none_or(|value| task["folder"] == value)
        })
        .filter(|task| include_done || task["status"] != "done")
        .filter(|task| {
            due_before
                .as_deref()
                .is_none_or(|limit| task["dueAt"].as_str().is_some_and(|due| due < limit))
        })
        .filter(|task| !overdue_only || is_overdue(task, &snapshot))
        .cloned()
        .collect();

    sort_smart(&mut tasks);
    let total = tasks.len();
    let items = tasks
        .into_iter()
        .take(limit)
        .map(|task| with_prefixed_id(&task))
        .collect::<Vec<_>>();
    ok(json!({ "ok": true, "total": total, "returned": items.len(), "tasks": items }))
}

/// Whether a task is overdue as of the snapshot's own day.
///
/// `dueAt` is a plain `YYYY-MM-DD` string, so a lexicographic comparison against
/// the snapshot's `today` field is exact — no date library needed. A task is
/// overdue when its due date is strictly before that day and it is not `done`.
/// No due date means not overdue.
///
/// `today` is the user's **local** day (#D19): slicing the UTC `generatedAt`
/// made a task due today look not-yet-due for anyone east of UTC and overdue a
/// day early for anyone west of it.
fn is_overdue(task: &Value, snapshot: &Value) -> bool {
    if task["status"] == "done" {
        return false;
    }
    let Some(due) = task["dueAt"].as_str().filter(|due| !due.is_empty()) else {
        return false;
    };
    let Some(today) = snapshot["today"].as_str().filter(|today| today.len() >= 10) else {
        // A snapshot without a usable day cannot judge overdue-ness; stay
        // conservative rather than flag everything.
        return false;
    };
    due < today
}

// --- get_task ---------------------------------------------------------------

pub fn get_task(bridge: &Bridge, args: &Value, workspace: Option<&str>) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let Some(raw) = string_arg(args, "id") else {
        return fail("bad_arguments", "`id` is required.");
    };
    let resolved = resolve_entity(array_of(&snapshot, "tasks"), &raw, workspace);
    let Resolved::One(task) = resolved else {
        return resolve_error(resolved);
    };
    let blocked_by = resolve_task_refs(&snapshot, &task["blockedBy"]);
    let blocking = resolve_task_refs(&snapshot, &task["blocking"]);
    let linked_notes = resolve_note_refs(&snapshot, &task["noteIds"]);
    let mut payload = with_prefixed_id(task);
    payload["blockedByTasks"] = Value::Array(blocked_by);
    payload["blockingTasks"] = Value::Array(blocking);
    payload["linkedNotes"] = Value::Array(linked_notes);
    ok(payload)
}

fn resolve_task_refs(snapshot: &Value, ids: &Value) -> Vec<Value> {
    let tasks = array_of(snapshot, "tasks");
    ids.as_array()
        .map(|ids| {
            ids.iter()
                .filter_map(Value::as_str)
                .filter_map(|id| tasks.iter().find(|task| task["id"].as_str() == Some(id)))
                .map(|task| {
                    json!({
                        "id": prefixed_id(task),
                        "title": task["title"].clone(),
                        "status": task["status"].clone()
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn resolve_note_refs(snapshot: &Value, ids: &Value) -> Vec<Value> {
    let notes = array_of(snapshot, "notes");
    ids.as_array()
        .map(|ids| {
            ids.iter()
                .filter_map(Value::as_str)
                .filter_map(|id| notes.iter().find(|note| note["id"].as_str() == Some(id)))
                .map(|note| json!({ "id": prefixed_id(note), "title": note["title"].clone() }))
                .collect()
        })
        .unwrap_or_default()
}

// --- task_board -------------------------------------------------------------

pub fn task_board(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let workspace = workspace_arg(args);
    let statuses = ["todo", "doing", "review", "done"];
    let mut columns = Vec::new();
    for status in statuses {
        let mut tasks: Vec<Value> = array_of(&snapshot, "tasks")
            .iter()
            .filter(|task| matches_workspace(task, workspace.as_deref()))
            .filter(|task| task["status"] == status)
            .cloned()
            .collect();
        tasks.sort_by_key(|task| task["position"].as_i64().unwrap_or(0));
        let count = tasks.len();
        columns.push(json!({
            "status": status,
            "count": count,
            "tasks": tasks.into_iter().map(|task| with_prefixed_id(&task)).collect::<Vec<_>>()
        }));
    }
    ok(json!({ "ok": true, "columns": columns }))
}

// --- daily_summary ----------------------------------------------------------

pub fn daily_summary(bridge: &Bridge, args: &Value) -> Value {
    let snapshot = match snapshot_or_error(bridge) {
        Ok(value) => value,
        Err(error) => return error,
    };
    let workspace = workspace_arg(args);
    let scoped: Vec<&Value> = array_of(&snapshot, "tasks")
        .iter()
        .filter(|task| matches_workspace(task, workspace.as_deref()))
        .collect();
    let due: Vec<&Value> = scoped
        .iter()
        .copied()
        .filter(|task| task["status"] != "done")
        .collect();
    let mut in_progress: Vec<Value> = scoped
        .iter()
        .filter(|task| task["status"] == "doing")
        .map(|task| with_prefixed_id(task))
        .collect();
    in_progress.sort_by_key(|task| task["position"].as_i64().unwrap_or(0));
    let done = scoped
        .iter()
        .filter(|task| task["status"] == "done")
        .count();

    let notes_cutoff = recent_note_cutoff(&snapshot);
    let mut recent_notes: Vec<Value> = array_of(&snapshot, "notes")
        .iter()
        .filter(|note| matches_workspace(note, workspace.as_deref()))
        .filter(|note| note["updatedAt"].as_u64().unwrap_or(0) >= notes_cutoff)
        .map(with_prefixed_id)
        .collect();
    recent_notes.sort_by_key(|note| std::cmp::Reverse(note["updatedAt"].as_u64().unwrap_or(0)));

    ok(json!({
        "ok": true,
        "openTasks": due.len(),
        "doneTasks": done,
        "inProgress": in_progress,
        "recentNotes": recent_notes.into_iter().take(10).collect::<Vec<_>>()
    }))
}

/// Notes considered "new" in `daily_summary`: the last 24h before the snapshot.
fn recent_note_cutoff(snapshot: &Value) -> u64 {
    // The snapshot's `generatedAt` is an ISO string; epoch is unavailable in the
    // shim without a date dependency, so fall back to 0 (all notes qualify as
    // "recent"). The app can narrow this later without changing the tool shape.
    let _ = snapshot;
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str, status: &str, priority: &str, position: i64) -> Value {
        json!({
            "id": id, "workspaceId": "ws", "title": id, "status": status,
            "priority": priority, "position": position, "completed": status == "done",
            "blocked": false, "blockedBy": [], "blocking": [], "noteIds": [],
            "dueAt": Value::Null, "folder": "personal"
        })
    }

    #[test]
    fn sort_smart_orders_priority_then_position() {
        let mut tasks = vec![
            task("low", "todo", "low", 0),
            task("high-b", "todo", "high", 5),
            task("high-a", "todo", "high", 1),
        ];
        sort_smart(&mut tasks);
        let ids: Vec<&str> = tasks.iter().map(|t| t["id"].as_str().unwrap()).collect();
        assert_eq!(ids, vec!["high-a", "high-b", "low"]);
    }

    fn dated(id: &str, status: &str, due: Value) -> Value {
        let mut t = task(id, status, "medium", 0);
        t["dueAt"] = due;
        t
    }

    /// A snapshot carrying only the field `is_overdue` reads.
    fn snapshot_day(today: &str) -> Value {
        json!({ "today": today })
    }

    #[test]
    fn overdue_compares_due_against_snapshot_day() {
        let snapshot = snapshot_day("2026-09-29");
        // Past due, still open -> overdue.
        assert!(is_overdue(
            &dated("a", "todo", json!("2026-09-28")),
            &snapshot
        ));
        assert!(is_overdue(
            &dated("b", "doing", json!("2020-01-01")),
            &snapshot
        ));
        // Due today is not overdue (strictly before).
        assert!(!is_overdue(
            &dated("c", "todo", json!("2026-09-29")),
            &snapshot
        ));
        // Future due is not overdue — this was the bug: it used to be flagged.
        assert!(!is_overdue(
            &dated("d", "todo", json!("2030-01-01")),
            &snapshot
        ));
        // Done tasks are never overdue.
        assert!(!is_overdue(
            &dated("e", "done", json!("2026-09-01")),
            &snapshot
        ));
        // No due date is never overdue.
        assert!(!is_overdue(&dated("f", "todo", Value::Null), &snapshot));
    }

    #[test]
    fn overdue_is_conservative_without_a_usable_clock() {
        assert!(!is_overdue(
            &dated("a", "todo", json!("2026-09-01")),
            &snapshot_day("")
        ));
        // A snapshot that predates the `today` field must not flag everything.
        assert!(!is_overdue(
            &dated("a", "todo", json!("2026-09-01")),
            &json!({
                "generatedAt": "2026-09-29T10:00:00.000Z"
            })
        ));
    }

    /// The regression #D19 exists to prevent: at 2026-09-29T18:00Z it is already
    /// the 30th in Jakarta, so a task due on the 30th is not overdue there. Under
    /// the old UTC-prefix rule it was compared against the 29th.
    #[test]
    fn overdue_uses_the_local_day_not_the_utc_day() {
        let utc_day = snapshot_day("2026-09-29");
        let jakarta_day = snapshot_day("2026-09-30");
        let due_tomorrow_locally = dated("a", "todo", json!("2026-09-30"));

        // Due "today" in Jakarta: not overdue there.
        assert!(!is_overdue(&due_tomorrow_locally, &jakarta_day));
        // The same task in UTC (where today is still the 29th) is due tomorrow.
        assert!(!is_overdue(&due_tomorrow_locally, &utc_day));

        // And a task due on Jakarta's yesterday IS overdue locally, even though
        // UTC would still consider it due today.
        let due_yesterday_locally = dated("b", "todo", json!("2026-09-29"));
        assert!(is_overdue(&due_yesterday_locally, &jakarta_day));
        assert!(!is_overdue(&due_yesterday_locally, &utc_day));
    }
}
