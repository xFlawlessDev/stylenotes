//! Text ranking for the search tools (mirror of `src/lib/content/search-rank.ts`).
//!
//! `search_notes`, `search_tasks` and `search_all` order hits with the weights
//! below. The weights are duplicated in TypeScript on purpose — the shim cannot
//! call the app's code — so `mcp-search-parity.test.ts` parses this file and
//! fails if the two ever disagree.
//!
//! Occurrence counts are **non-overlapping**, matching `str::matches` and the
//! TS `countOccurrences`: `"aa"` in `"aaa"` counts once.

use serde_json::Value;

pub const NOTE_TITLE_WEIGHT: i64 = 10;
pub const NOTE_TAGS_WEIGHT: i64 = 5;
pub const NOTE_EXCERPT_WEIGHT: i64 = 3;
pub const NOTE_BODY_WEIGHT: i64 = 1;

pub const TASK_TITLE_WEIGHT: i64 = 10;
/// A task's own `notes` field (a description), distinct from linked notes.
pub const TASK_NOTES_WEIGHT: i64 = 3;

/// Non-overlapping occurrences of `needle` in `haystack`, both lower-cased.
pub fn count_occurrences(haystack: &str, needle: &str) -> usize {
    if needle.is_empty() {
        return 0;
    }
    haystack.matches(needle).count()
}

fn field_hits(item: &Value, key: &str, needle: &str) -> usize {
    count_occurrences(&item[key].as_str().unwrap_or("").to_lowercase(), needle)
}

/// Weighted score of a note. A withheld body is simply absent and scores zero.
pub fn score_note(note: &Value, needle: &str) -> i64 {
    let title = field_hits(note, "title", needle) as i64;
    let tags: i64 = note["tags"]
        .as_array()
        .map(|tags| {
            tags.iter()
                .map(|tag| count_occurrences(&tag.as_str().unwrap_or("").to_lowercase(), needle))
                .sum::<usize>() as i64
        })
        .unwrap_or(0);
    let excerpt = field_hits(note, "excerpt", needle) as i64;
    let body = field_hits(note, "body", needle) as i64;
    title * NOTE_TITLE_WEIGHT
        + tags * NOTE_TAGS_WEIGHT
        + excerpt * NOTE_EXCERPT_WEIGHT
        + body * NOTE_BODY_WEIGHT
}

/// Weighted score of a task over its title and its `notes` field.
pub fn score_task(task: &Value, needle: &str) -> i64 {
    let title = field_hits(task, "title", needle) as i64;
    let notes = field_hits(task, "notes", needle) as i64;
    title * TASK_TITLE_WEIGHT + notes * TASK_NOTES_WEIGHT
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn counts_are_non_overlapping() {
        assert_eq!(count_occurrences("aaa", "aa"), 1);
        assert_eq!(count_occurrences("aaaa", "aa"), 2);
        assert_eq!(count_occurrences("anything", ""), 0);
    }

    #[test]
    fn title_outweighs_body() {
        let needle = "roadmap";
        let hot = json!({ "title": "roadmap", "tags": [], "excerpt": "", "body": "" });
        let cold = json!({ "title": "other", "tags": [], "excerpt": "", "body": "roadmap" });
        assert!(score_note(&hot, needle) > score_note(&cold, needle));
        // 10 (title) > 3 (excerpt) > 1 (body).
        assert_eq!(score_note(&hot, needle), NOTE_TITLE_WEIGHT);
    }

    #[test]
    fn a_withheld_body_scores_without_one() {
        let tagged = json!({ "title": "", "tags": ["roadmap"], "excerpt": "", "body": "roadmap" });
        let cut = json!({ "title": "", "tags": ["roadmap"], "excerpt": "" });
        assert_eq!(
            score_note(&tagged, "roadmap"),
            NOTE_TAGS_WEIGHT + NOTE_BODY_WEIGHT
        );
        assert_eq!(score_note(&cut, "roadmap"), NOTE_TAGS_WEIGHT);
    }

    #[test]
    fn task_scores_title_over_notes() {
        let needle = "ship";
        let titled = json!({ "title": "ship it", "notes": "" });
        let described = json!({ "title": "other", "notes": "ship" });
        assert!(score_task(&titled, needle) > score_task(&described, needle));
        assert_eq!(score_task(&titled, needle), TASK_TITLE_WEIGHT);
    }
}
