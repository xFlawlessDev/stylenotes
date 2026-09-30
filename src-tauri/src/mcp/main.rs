//! `stylenotes-mcp` — the local MCP server shim (docs/design/mcp-local-free.md).
//!
//! A plain stdin/stdout JSON-RPC process spawned by the MCP client. It holds no
//! state of its own: reads come from the snapshot the app wrote, writes become
//! job files the app executes (see `bridge`). It never opens SQLite.

mod bridge;
mod protocol;
mod read;
mod read_deps;
mod read_graph;
mod read_tasks;
mod read_workspaces;
mod registry;
mod write;

use std::io::{self, BufRead, Write};

use serde_json::{json, Value};

use bridge::{Bridge, Grant};
use protocol::Request;
use registry::ToolKind;

/// Server name advertised during `initialize`.
const SERVER_NAME: &str = "stylenotes";

/// How long the shim waits for the app to answer a write (mirrors `MCP_JOB_TIMEOUT_MS`).
pub const JOB_TIMEOUT_MS: u64 = 5_000;

fn main() {
    let instance = parse_instance(std::env::args().skip(1));
    let bridge = Bridge::discover();

    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(request) = serde_json::from_str::<Request>(trimmed) else {
            // A malformed line with no id cannot be answered; skip it rather
            // than crash the whole session.
            continue;
        };
        // Notifications have no id and expect no reply.
        let is_notification = request.id.is_none();
        let response = handle(&bridge, &instance, &request);
        if is_notification {
            continue;
        }
        if let Ok(serialised) = serde_json::to_string(&response) {
            let _ = writeln!(stdout, "{serialised}");
            let _ = stdout.flush();
        }
    }
}

/// `--instance <id>` identifies which client is talking, for status + audit.
fn parse_instance(args: impl Iterator<Item = String>) -> String {
    let mut args = args.peekable();
    while let Some(arg) = args.next() {
        if arg == "--instance" {
            if let Some(value) = args.next() {
                return value;
            }
        }
    }
    "unknown".to_string()
}

fn handle(bridge: &Option<Bridge>, instance: &str, request: &Request) -> Value {
    match request.method.as_str() {
        "initialize" => initialize(bridge, request.params.as_ref()),
        "notifications/initialized" | "notifications/cancelled" => {
            protocol::success(request.id.clone(), Value::Null)
        }
        "ping" => protocol::success(request.id.clone(), json!({})),
        "tools/list" => tools_list(bridge, request.id.clone()),
        "tools/call" => tools_call(bridge, instance, request),
        other => protocol::error(
            request.id.clone(),
            -32601,
            format!("Method not found: {other}"),
            None,
        ),
    }
}

fn initialize(bridge: &Option<Bridge>, params: Option<&Value>) -> Value {
    // A disabled server still answers `initialize`, then refuses every tool
    // call, so the client shows a clear reason instead of "server not found".
    let info = bridge.as_ref().and_then(Bridge::read_app_info);
    let requested = params
        .and_then(|params| params.get("protocolVersion"))
        .and_then(Value::as_str)
        .unwrap_or(protocol::SUPPORTED_VERSIONS[0]);
    let version = if protocol::SUPPORTED_VERSIONS.contains(&requested) {
        requested
    } else {
        protocol::SUPPORTED_VERSIONS[0]
    };
    let result = json!({
        "protocolVersion": version,
        "capabilities": protocol::capabilities(),
        "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
        "instructions": info.map(|info| info.app_version).unwrap_or_default()
    });
    protocol::success(None, result)
}

fn tools_list(bridge: &Option<Bridge>, id: Option<Value>) -> Value {
    let _ = bridge;
    protocol::success(id, registry::list_payload())
}

fn tools_call(bridge: &Option<Bridge>, instance: &str, request: &Request) -> Value {
    let id = request.id.clone();
    let Some(params) = request.params.as_ref() else {
        return protocol::success(id, protocol::tool_error("bad_arguments", "Missing params."));
    };
    let Some(name) = params.get("name").and_then(Value::as_str) else {
        return protocol::success(
            id,
            protocol::tool_error("bad_arguments", "Missing tool name."),
        );
    };
    let args = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let Some(descriptor) = registry::find(name) else {
        return protocol::success(
            id,
            protocol::tool_error("unknown_tool", format!("Unknown tool `{name}`.")),
        );
    };
    let Some(bridge) = bridge else {
        return protocol::success(
            id,
            protocol::tool_error(
                "app_not_running",
                "StyleNotes data directory was not found.",
            ),
        );
    };

    // Pre-flight: refuse a disabled or closed app before any work.
    let app_running = bridge.read_app_info();
    let (enabled, running) = match &app_running {
        Some(info) => (info.enabled, info.app_running),
        None => (false, false),
    };
    if !running {
        return protocol::success(id, bridge::app_not_running());
    }
    if !enabled {
        return protocol::success(id, bridge::disabled());
    }
    if let Some(info) = &app_running {
        if info.protocol != PROTOCOL {
            return protocol::success(
                id,
                protocol::tool_error(
                    "protocol_mismatch",
                    format!(
                        "Update StyleNotes: bridge protocol {PROTOCOL} is required, got {}.",
                        info.protocol
                    ),
                ),
            );
        }
    }

    let grant = grant_from_app_info(app_running.as_ref());
    let result = match descriptor.kind {
        ToolKind::Read => dispatch_read(bridge, name, &args),
        ToolKind::Write => write::call(bridge, name, &args, &grant, instance),
    };
    protocol::success(id, result)
}

/// The app publishes the active grant in `app-info.json`; until it does, the
/// shim assumes read-only, which is the safe default (#D6).
fn grant_from_app_info(info: Option<&bridge::AppInfo>) -> Grant {
    info.and_then(|info| info.grant.clone()).unwrap_or(Grant {
        access: "read".into(),
        scopes: Vec::new(),
    })
}

fn dispatch_read(bridge: &Bridge, name: &str, args: &Value) -> Value {
    read::dispatch(name, bridge, args)
}

/// Protocol version this shim speaks; mirrors `mcp_host::MCP_PROTOCOL`.
pub const PROTOCOL: u32 = 2;
