//! System prompts and message shaping for the assistant tasks.
//!
//! Kept pure and unit-tested so the prompt contract is easy to review: the
//! provider layer only sees the final `Vec<ChatMessage>`.
//!
//! Two cross-task rules are appended to every prompt:
//!
//! * **Diagram rule** — any diagram output must be a fenced `mermaid` block, so
//!   the note renderer can draw it instead of showing ASCII art.
//! * **Current time** — the wall clock is hydrated per request so the model can
//!   reason about "today", deadlines and relative dates. The frontend builds it
//!   in the user's timezone (`settings.timezone`); [`system_now`] is the
//!   fallback when a client sends no timestamp.

use crate::ai::types::{ChatMessage, Role, Task};
use std::time::{SystemTime, UNIX_EPOCH};

/// Instructs the model to always express diagrams as Mermaid fenced blocks.
const DIAGRAM_RULE: &str = "When the user asks for a diagram — a flowchart, sequence, class, \
     state, ER, gantt or mind map — always write it as a Mermaid diagram in a ```mermaid \
     fenced code block. Never draw a diagram with ASCII or box-drawing characters, and never \
     attach a Mermaid diagram unless one was asked for.";

/// Builds the system prompt for a task, folding in the extra instruction.
///
/// The clock-free half of the prompt contract: [`system_prompt_with_now`] adds
/// the shared diagram rule and the hydrated current time.
pub fn system_prompt(task: Task, instruction: Option<&str>) -> String {
    let base = match task {
        Task::Chat => {
            "You are the StyleNotes assistant, working across all of the user's notes and \
             tasks. Use the provided tools to find and read what you need before answering; \
             never guess at their contents. When you refer to an existing note or task, write \
             it as a wiki link — [[Exact Title]] — so the user can click through to it. When \
             the user asks you to change something, call the matching tool — the app asks \
             them to confirm before it runs. Answer clearly and briefly, using Markdown when \
             it helps."
        }
        Task::Summarize => {
            "Summarize the note the user provides. Lead with a one-sentence summary, \
             then 3-6 bullet points of the key facts. Output Markdown only."
        }
        Task::Rewrite => {
            "Rewrite the text the user provides so it is clearer and better structured. \
             Preserve meaning and tone unless told otherwise. Output only the rewritten \
             text, no preamble."
        }
        Task::Continue => {
            "Continue the note the user provides from where it stops. Match the existing \
             voice, tense and formatting. Output only the continuation, no preamble."
        }
        Task::Custom => {
            "You are the StyleNotes writing assistant. Follow the user's instruction \
             exactly and output only what they asked for."
        }
        Task::Title => {
            "Name this conversation in 3 to 6 words. Output only the title: no quotes, \
             no trailing punctuation, no preamble. Match the language of the conversation."
        }
    };

    match instruction.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => format!("{base}\n\nExtra instruction: {value}"),
        None => base.to_string(),
    }
}

/// The machine's wall clock as `YYYY-MM-DD HH:MM:SS UTC`.
///
/// The frontend normally builds the timestamp from `settings.timezone`; this is
/// the fallback the `ai_stream` command uses when a client sends none.
pub fn system_now() -> String {
    format_now(SystemTime::now())
}

/// Like [`with_system_prompt_for_now`], but for the machine's own clock.
pub fn with_system_prompt(
    task: Task,
    instruction: Option<&str>,
    messages: Vec<ChatMessage>,
) -> Vec<ChatMessage> {
    let now = system_now();
    with_system_prompt_for_now(task, instruction, &now, messages)
}

/// Like [`with_system_prompt`], but with the clock supplied by the caller.
///
/// The timestamp is usually built by the frontend from `settings.timezone`, so
/// the model sees the user's local time; tests pin it for determinism.
pub fn with_system_prompt_for_now(
    task: Task,
    instruction: Option<&str>,
    now: &str,
    mut messages: Vec<ChatMessage>,
) -> Vec<ChatMessage> {
    let system = ChatMessage::text(Role::System, system_prompt_with_now(task, instruction, now));
    messages.insert(0, system);
    messages
}

/// The full system prompt: task prompt, diagram rule, then the current time.
pub fn system_prompt_with_now(task: Task, instruction: Option<&str>, now: &str) -> String {
    format!(
        "{}\n\n{DIAGRAM_RULE}\n\n{}",
        system_prompt(task, instruction),
        time_context(now)
    )
}

/// The time block hydrating "now" for the model.
pub fn time_context(now: &str) -> String {
    format!(
        "Current date and time: {now}. Treat this as \"now\" when the user says today, \
         yesterday or tomorrow, and when you reason about deadlines or relative dates."
    )
}

/// Formats an instant as `YYYY-MM-DD HH:MM:SS UTC`.
///
/// Hand-rolled from the Unix epoch so the prompt layer stays dependency-free;
/// the calendar conversion is the standard civil-from-days algorithm and is
/// covered by tests. Instants before the epoch clamp to 1970-01-01 rather than
/// panicking on a negative duration.
pub fn format_now(time: SystemTime) -> String {
    format_epoch_seconds(
        time.duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0),
    )
}

/// Formats whole seconds since the Unix epoch as `YYYY-MM-DD HH:MM:SS UTC`.
pub fn format_epoch_seconds(seconds: u64) -> String {
    let days = (seconds / 86_400) as i64;
    let seconds_of_day = seconds % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02} UTC",
        seconds_of_day / 3_600,
        (seconds_of_day % 3_600) / 60,
        seconds_of_day % 60
    )
}

/// Days since 1970-01-01 to a proleptic Gregorian date (Howard Hinnant's
/// `civil_from_days`).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = (z - era * 146_097) as u64;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era as i64 + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user(content: &str) -> ChatMessage {
        ChatMessage::text(Role::User, content)
    }

    #[test]
    fn system_prompt_is_added_first() {
        let messages = with_system_prompt(Task::Chat, None, vec![user("hi")]);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, Role::System);
        assert_eq!(messages[1].role, Role::User);
    }

    #[test]
    fn instruction_is_appended_when_present() {
        let prompt = system_prompt(Task::Rewrite, Some("make it formal"));
        assert!(prompt.contains("Extra instruction: make it formal"));
    }

    #[test]
    fn blank_instruction_is_ignored() {
        let prompt = system_prompt(Task::Rewrite, Some("   "));
        assert!(!prompt.contains("Extra instruction"));
    }

    #[test]
    fn each_task_has_a_distinct_prompt() {
        let tasks = [
            Task::Chat,
            Task::Summarize,
            Task::Rewrite,
            Task::Continue,
            Task::Custom,
            Task::Title,
        ];
        let mut seen = std::collections::HashSet::new();
        for task in tasks {
            assert!(
                seen.insert(system_prompt(task, None)),
                "duplicate prompt for {task:?}"
            );
        }
    }

    #[test]
    fn every_task_gets_the_diagram_rule() {
        for task in [Task::Chat, Task::Summarize, Task::Rewrite, Task::Custom] {
            let prompt = system_prompt_with_now(task, None, "2026-09-29 08:30:00 UTC");
            assert!(
                prompt.contains(DIAGRAM_RULE),
                "no diagram rule for {task:?}"
            );
            assert!(prompt.contains("```mermaid"));
        }
    }

    #[test]
    fn the_current_time_is_hydrated_into_every_prompt() {
        for task in [Task::Chat, Task::Summarize, Task::Title] {
            let messages =
                with_system_prompt_for_now(task, None, "2026-09-29 08:30:00 UTC", vec![user("hi")]);
            let system = &messages[0];
            assert_eq!(system.role, Role::System);
            assert!(system.content.contains("Current date and time:"));
            assert!(system.content.contains("2026-09-29 08:30:00 UTC"));
        }
    }

    #[test]
    fn a_frontend_timestamp_is_used_verbatim() {
        // What the app sends after resolving `settings.timezone`.
        let messages = with_system_prompt_for_now(
            Task::Chat,
            None,
            "2026-09-29 15:30:00 UTC+07:00",
            vec![user("hi")],
        );
        assert!(messages[0]
            .content
            .contains("2026-09-29 15:30:00 UTC+07:00"));
        // The frontend owns the clock, so Rust must not append its own.
        assert!(!messages[0].content.contains("1970-"));
    }

    #[test]
    fn system_now_is_utc_and_formatted() {
        let now = system_now();
        assert!(now.ends_with(" UTC"), "{now}");
        assert_eq!(now.len(), "1970-01-01 00:00:00 UTC".len());
    }

    #[test]
    fn with_system_prompt_uses_the_real_clock() {
        let messages = with_system_prompt(Task::Chat, None, vec![user("hi")]);
        assert!(messages[0].content.contains("Current date and time:"));
        assert!(messages[0].content.contains("UTC"));
    }

    #[test]
    fn the_instruction_lands_before_the_shared_sections() {
        let prompt =
            system_prompt_with_now(Task::Chat, Some("be terse"), "2026-01-01 00:00:00 UTC");
        let instruction = prompt
            .find("Extra instruction: be terse")
            .expect("instruction");
        let diagram = prompt.find(DIAGRAM_RULE).expect("diagram rule");
        let clock = prompt.find("Current date and time:").expect("clock");
        assert!(instruction < diagram && diagram < clock);
    }

    #[test]
    fn epoch_formats_as_utc() {
        assert_eq!(format_epoch_seconds(0), "1970-01-01 00:00:00 UTC");
        // 2000-03-01 12:34:56 UTC — a leap-year February has just rolled over.
        assert_eq!(format_epoch_seconds(951_914_096), "2000-03-01 12:34:56 UTC");
        // 2026-09-30 05:50:00 UTC.
        assert_eq!(
            format_epoch_seconds(1_790_747_400),
            "2026-09-30 05:50:00 UTC"
        );
        // Just before midnight on 2020-02-28, before that leap day begins.
        assert_eq!(
            format_epoch_seconds(1_582_934_399),
            "2020-02-28 23:59:59 UTC"
        );
    }

    #[test]
    fn dates_before_the_epoch_still_format() {
        // `format_now` clamps negative instants to the epoch rather than panicking.
        let before = UNIX_EPOCH - std::time::Duration::from_secs(10);
        assert_eq!(format_now(before), "1970-01-01 00:00:00 UTC");
    }
}
