//! Write tools: never touch SQLite, always forward to the running app (#D2).
//!
//! The shim checks the grant first so a read-only session gets a clear
//! `write_not_granted` before any file is written. The app re-checks the same
//! grant before executing, because the user may have flipped the switch while
//! the call was in flight.

use serde_json::Value;

use crate::bridge::{self, new_request_id, Bridge, Grant};
use crate::protocol;
use crate::registry::{self, ToolKind};

/// Executes a write tool by handing a job to the app and waiting for its result.
pub fn call(bridge: &Bridge, tool: &str, args: &Value, grant: &Grant, instance: &str) -> Value {
    let Some(descriptor) = registry::find(tool) else {
        return protocol::tool_error("unknown_tool", format!("Unknown tool `{tool}`."));
    };
    if descriptor.kind != ToolKind::Write {
        return protocol::tool_error("unknown_tool", format!("`{tool}` is not a write tool."));
    }
    if !grant.allow_write(descriptor.scope) {
        return protocol::tool_error(
            "write_not_granted",
            format!(
                "Write access for `{}` is off. Enable it in Settings → MCP.",
                descriptor.scope
            ),
        );
    }
    // Destructive tools must be invoked with an explicit confirmation (#D16).
    if matches!(tool, "delete_note" | "delete_task" | "delete_workspace")
        && args.get("confirm").and_then(Value::as_bool) != Some(true)
    {
        return protocol::tool_error(
            "bad_arguments",
            "This tool permanently deletes data; pass `confirm: true` to proceed.",
        );
    }

    let workspace = args
        .get("workspace")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("workspace-default");

    let id = new_request_id();
    let submission = bridge::Submission {
        id: &id,
        tool,
        args,
        grant,
        instance,
        workspace,
        timeout_ms: crate::JOB_TIMEOUT_MS,
    };
    protocol::submission_result(bridge.submit(submission))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grant_gate_rejects_readonly() {
        let read = Grant {
            access: "read".into(),
            scopes: vec!["tasks".into()],
        };
        assert!(!read.allow_write("tasks"));
        let write = Grant {
            access: "write".into(),
            scopes: vec!["tasks".into()],
        };
        assert!(write.allow_write("tasks"));
    }
}
