//! System prompts and message shaping for the assistant tasks.
//!
//! Kept pure and unit-tested so the prompt contract is easy to review: the
//! provider layer only sees the final `Vec<ChatMessage>`.

use crate::ai::types::{ChatMessage, Role, Task};

/// Builds the system prompt for a task, folding in the extra instruction.
pub fn system_prompt(task: Task, instruction: Option<&str>) -> String {
    let base = match task {
        Task::Chat => {
            "You are the StyleNotes assistant, working across all of the user's notes and \
             tasks. Use the provided tools to find and read what you need before answering; \
             never guess at their contents. When the user asks you to change something, call \
             the matching tool — the app asks them to confirm before it runs. Answer clearly \
             and briefly, using Markdown when it helps."
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

/// Prepends the task's system prompt to the conversation.
pub fn with_system_prompt(
    task: Task,
    instruction: Option<&str>,
    mut messages: Vec<ChatMessage>,
) -> Vec<ChatMessage> {
    let system = ChatMessage::text(Role::System, system_prompt(task, instruction));
    messages.insert(0, system);
    messages
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
}
