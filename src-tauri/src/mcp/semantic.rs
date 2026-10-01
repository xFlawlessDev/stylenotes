//! Semantic read tools: forward to the app because vectors never enter the
//! snapshot (#D15).
//!
//! `semantic_search`, `related_notes` and `list_themes` are local work — the
//! app's embedder and cosine over the `embeddings` table — so the shim hands
//! them to the always-alive `workspace` window as a job, exactly like a write
//! (#D2). They are advertised as reads because a grant is never needed.
//!
//! `find_contradictions` is **not** here: verifying a pair calls the app's own
//! `ai_stream`, so an external MCP client could use the app as a model proxy
//! that spends the user's key. It is `aiOnly` in `ai-tool-schema.ts` and absent
//! from the MCP registry, like `web_search`/`ask_user_question`.

use serde_json::Value;

use crate::bridge::{Bridge, Grant};
use crate::protocol;

/// A job timeout for local semantic work. `search` embeds the query once and
/// cosines the index; `related` and `themes` are pure reads. All stay well
/// inside this ceiling unless the app is mid-index.
pub const SEMANTIC_JOB_TIMEOUT_MS: u64 = 30_000;

/// The semantic tools the app executes as jobs. The one that needs the app's
/// model (`find_contradictions`) is deliberately absent.
pub const LOCAL_TOOLS: [&str; 3] = ["semantic_search", "related_notes", "list_themes"];

/// Submits one semantic read as a job to the running app.
pub fn call(bridge: &Bridge, tool: &str, args: &Value, instance: &str) -> Value {
    semantic_job(bridge, tool, args, instance, SEMANTIC_JOB_TIMEOUT_MS)
}

/// The shim's submission: a blocking poll over the job bridge.
fn semantic_job(
    bridge: &Bridge,
    tool: &str,
    args: &Value,
    instance: &str,
    timeout_ms: u64,
) -> Value {
    let workspace = args
        .get("workspace")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("workspace-default");
    // A read needs no `write` scope; an empty read grant keeps the job shape
    // identical to a write without granting anything (#D6).
    let grant = Grant {
        access: "read".into(),
        scopes: Vec::new(),
    };
    let id = crate::bridge::new_request_id();
    let submission = crate::bridge::Submission {
        id: &id,
        tool,
        args,
        grant: &grant,
        instance,
        workspace,
        timeout_ms,
    };
    protocol::submission_result(bridge.submit(submission))
}
