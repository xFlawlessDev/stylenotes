//! Remote MCP HTTP listener (docs/design/constella-features.md #D12).
//!
//! A single `POST /mcp` endpoint speaking MCP Streamable HTTP, in the subset a
//! tools-only server needs. It authenticates with a Bearer token, validates the
//! request headers, then forwards a `tools/call` as a job file into the same
//! bridge the stdio shim uses. There is no second write path: the workspace
//! window still performs every write (#D2).

use std::convert::Infallible;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};

use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde_json::{json, Value};
use tokio::net::TcpListener;

use crate::mcp_host;
use crate::remote_mcp::net::{request_is_trusted, token_matches, ExposureMode, REMOTE_MCP_PORT};
use crate::{protocol, registry};

/// How long the listener waits for the app to answer one forwarded call.
const JOB_TIMEOUT_MS: u64 = 15_000;

/// Live state the listener needs: the token hash and the app handle.
pub struct RemoteState<R: tauri::Runtime> {
    pub app: tauri::AppHandle<R>,
    /// Hash of the current token; empty means the endpoint refuses everything.
    pub token_hash: String,
    /// Mode, echoed into audit so the origin of a call is recorded.
    pub mode: ExposureMode,
    /// Per-IP request counts inside the current minute (#D12 rate limit).
    pub hits: tokio::sync::Mutex<std::collections::HashMap<IpAddr, (Instant, u32)>>,
}

/// Handle returned once the listener is bound, so it can be shut down.
pub struct ListenerHandle {
    pub addr: SocketAddr,
    shutdown: tokio::sync::oneshot::Sender<()>,
    /// Resolves when the accept loop has returned and the socket is released.
    /// A restart waits on this so a rebind cannot race the old listener and
    /// fail with `os error 10048` (address already in use).
    released: tauri::async_runtime::JoinHandle<()>,
}

impl ListenerHandle {
    /// Stops the listener and waits for the port to actually be released.
    ///
    /// The accept loop only observes the shutdown signal on its next `select!`
    /// tick, so returning immediately would let the caller's `bind` collide
    /// with the still-open socket.
    pub async fn stop_and_wait(self) {
        let _ = self.shutdown.send(());
        let _ = self.released.await;
    }
}

/// Binds and serves the endpoint for `mode`.
///
/// Loopback for `Local` and `Tunnel`; one detected private interface for `Lan`.
/// A `Lan` bind with no detectable private address is refused rather than
/// widened to `0.0.0.0`, which is the failure this whole module exists to avoid.
pub async fn start<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    mode: ExposureMode,
    token_hash: String,
) -> Result<ListenerHandle, String> {
    let ip = match mode {
        ExposureMode::Lan => crate::remote_mcp::http::detect_lan_ip()
            .ok_or_else(|| "no local network address was found for LAN mode".to_string())?,
        _ => IpAddr::V4(Ipv4Addr::LOCALHOST),
    };
    let addr = SocketAddr::new(ip, REMOTE_MCP_PORT);
    let listener = bind_with_retry(addr).await?;
    let bound = listener.local_addr().map_err(|error| error.to_string())?;

    let state = Arc::new(RemoteState {
        app,
        token_hash,
        mode,
        hits: tokio::sync::Mutex::new(std::collections::HashMap::new()),
    });

    let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let released = tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut shutdown_rx => break,
                accepted = listener.accept() => {
                    let Ok((stream, peer)) = accepted else { continue };
                    let state = state.clone();
                    tauri::async_runtime::spawn(async move {
                        let io = TokioIo::new(stream);
                        let service = service_fn(move |req| {
                            let state = state.clone();
                            async move { handle(state, peer, req).await }
                        });
                        let _ = hyper::server::conn::http1::Builder::new()
                            .serve_connection(io, service)
                            .await;
                    });
                }
            }
        }
        // Dropping `listener` here releases the port; `released` resolving is
        // what lets a restart bind immediately afterwards.
        drop(listener);
    });

    Ok(ListenerHandle {
        addr: bound,
        shutdown: shutdown_tx,
        released,
    })
}

/// How many times a bind is retried, and the pause between attempts.
const BIND_ATTEMPTS: u32 = 10;
const BIND_RETRY_MS: u64 = 50;

/// Binds `addr`, retrying briefly while the previous listener releases the port.
///
/// A stop -> start cycle should already be serialized (`stop_and_wait`), but a
/// listener torn down by an app restart, or a socket in `TIME_WAIT` from a live
/// client, can still briefly hold the port. Retrying turns a hard 10048 into a
/// short wait instead of a failure the user sees in Settings.
async fn bind_with_retry(addr: SocketAddr) -> Result<TcpListener, String> {
    let mut last = String::new();
    for attempt in 0..BIND_ATTEMPTS {
        match TcpListener::bind(addr).await {
            Ok(listener) => return Ok(listener),
            Err(error) => {
                last = error.to_string();
                if attempt + 1 < BIND_ATTEMPTS {
                    tokio::time::sleep(Duration::from_millis(BIND_RETRY_MS)).await;
                }
            }
        }
    }
    Err(format!("could not bind {addr}: {last}"))
}

/// The machine's LAN address, or `None` when only loopback is available.
///
/// Uses the standard "connect a UDP socket and read the chosen local address"
/// trick: it never sends a packet, it just asks the OS to route one.
pub fn detect_lan_ip() -> Option<IpAddr> {
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    // A public address is used only as a routing hint; nothing is transmitted.
    socket.connect("192.0.2.1:9").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    crate::remote_mcp::net::is_lan_address(ip).then_some(ip)
}

/// Refuses a caller that has exceeded the per-minute budget (#D12).
async fn rate_limited<R: tauri::Runtime>(state: &RemoteState<R>, peer: IpAddr) -> bool {
    const LIMIT: u32 = 60;
    let mut hits = state.hits.lock().await;
    let entry = hits.entry(peer).or_insert((Instant::now(), 0));
    if entry.0.elapsed() >= Duration::from_secs(60) {
        *entry = (Instant::now(), 0);
    }
    entry.1 += 1;
    entry.1 > LIMIT
}

/// Reads a `Bearer` token from the `Authorization` header.
fn bearer_token(req: &Request<hyper::body::Incoming>) -> Option<String> {
    let header = req
        .headers()
        .get(hyper::header::AUTHORIZATION)?
        .to_str()
        .ok()?;
    header
        .strip_prefix("Bearer ")
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

fn host_of(req: &Request<hyper::body::Incoming>) -> Option<String> {
    req.headers()
        .get(hyper::header::HOST)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
}

fn origin_of(req: &Request<hyper::body::Incoming>) -> Option<String> {
    req.headers()
        .get(hyper::header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
}

fn json_response(status: StatusCode, body: Value) -> Response<Full<Bytes>> {
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from(body.to_string())))
        .unwrap_or_else(|_| Response::new(Full::new(Bytes::from("{}"))))
}

async fn handle<R: tauri::Runtime>(
    state: Arc<RemoteState<R>>,
    peer: SocketAddr,
    req: Request<hyper::body::Incoming>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    // 1. Method: only POST carries a JSON-RPC call here.
    if req.method() != hyper::Method::POST {
        return Ok(json_response(
            StatusCode::METHOD_NOT_ALLOWED,
            json!({ "error": "only POST /mcp is supported" }),
        ));
    }

    // 2. Header validation before any work: a browser request is refused, and a
    //    foreign Host is refused (DNS rebinding).
    let host = host_of(&req);
    let origin = origin_of(&req);
    if !request_is_trusted(host.as_deref(), origin.as_deref()) {
        return Ok(json_response(
            StatusCode::FORBIDDEN,
            json!({ "error": "origin_not_allowed" }),
        ));
    }

    // 3. Bearer auth.
    let presented = bearer_token(&req).unwrap_or_default();
    if state.token_hash.is_empty() || !token_matches(&presented, &state.token_hash) {
        return Ok(json_response(
            StatusCode::UNAUTHORIZED,
            json!({ "error": "unauthorized" }),
        ));
    }

    // 4. Rate limit.
    if rate_limited(&state, peer.ip()).await {
        return Ok(json_response(
            StatusCode::TOO_MANY_REQUESTS,
            json!({ "error": "rate_limited" }),
        ));
    }

    // 5. Body: one JSON-RPC request.
    let body = match req.into_body().collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(_) => {
            return Ok(json_response(
                StatusCode::BAD_REQUEST,
                json!({ "error": "unreadable body" }),
            ))
        }
    };
    let request: protocol::Request = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(_) => {
            return Ok(json_response(
                StatusCode::BAD_REQUEST,
                protocol::error(None, -32700, "Parse error", None),
            ))
        }
    };

    let response = dispatch(&state, &request, peer).await;
    Ok(json_response(StatusCode::OK, response))
}

/// Answers one JSON-RPC request: handshake and `tools/list` locally, every
/// `tools/call` by forwarding a job the app executes.
async fn dispatch<R: tauri::Runtime>(
    state: &RemoteState<R>,
    request: &protocol::Request,
    peer: SocketAddr,
) -> Value {
    match request.method.as_str() {
        "initialize" => protocol::success(
            request.id.clone(),
            json!({
                "protocolVersion": protocol::SUPPORTED_VERSIONS[0],
                "capabilities": protocol::capabilities(),
                "serverInfo": { "name": "stylenotes-remote", "version": env!("CARGO_PKG_VERSION") }
            }),
        ),
        "notifications/initialized" | "notifications/cancelled" | "ping" => {
            protocol::success(request.id.clone(), json!({}))
        }
        "tools/list" => protocol::success(request.id.clone(), registry::list_payload()),
        "tools/call" => {
            let Some(params) = request.params.as_ref() else {
                return protocol::error(request.id.clone(), -32602, "Missing params", None);
            };
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            let args = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            if name.is_empty() {
                return protocol::error(request.id.clone(), -32602, "Missing tool name", None);
            }
            let result = forward(state, name, &args, peer).await;
            protocol::success(request.id.clone(), result)
        }
        other => protocol::error(
            request.id.clone(),
            -32601,
            format!("Method not found: {other}"),
            None,
        ),
    }
}

/// Answers a read tool from the app's snapshot, in-process (#D3).
///
/// This reuses the shim's `read::dispatch` so the two servers can never drift:
/// a read the stdio client can run, the remote client can run identically.
fn forward_read<R: tauri::Runtime>(state: &RemoteState<R>, tool: &str, args: &Value) -> Value {
    let Some(root) = mcp_host::mcp_root(&state.app) else {
        return protocol::tool_error(
            "snapshot_unavailable",
            "Snapshot unavailable; try again once the app settles.",
        );
    };
    let bridge = crate::bridge::Bridge::at(root);
    crate::read::dispatch(tool, &bridge, args)
}

/// Answers one tool call.
///
/// Reads are filtered from the snapshot in-process, exactly as the stdio shim
/// does, so the remote endpoint never sends a read down the write pipe (#D3).
/// Writes mirror the shim's `bridge::submit` — write `jobs/<id>.json`, poll
/// `results/<id>.json` — so there is still only one write path (#D2).
async fn forward<R: tauri::Runtime>(
    state: &RemoteState<R>,
    tool: &str,
    args: &Value,
    peer: SocketAddr,
) -> Value {
    let Some(descriptor) = registry::find(tool) else {
        return protocol::tool_error("unknown_tool", format!("Unknown tool `{tool}`."));
    };

    if descriptor.kind == registry::ToolKind::Read {
        return forward_read(state, tool, args);
    }

    let id = format!("remote-{:x}-{}", peer.port(), now_millis());
    let workspace = args
        .get("workspace")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("workspace-default");

    // The remote endpoint carries the same grant the local bridge publishes.
    let grant = mcp_host::read_app_info(&state.app)
        .and_then(|info| info.grant)
        .unwrap_or_else(mcp_host::GrantInfo::read_only);
    if !grant.allow_write(descriptor.scope) {
        return protocol::tool_error(
            "write_not_granted",
            format!("Write access for `{}` is off.", descriptor.scope),
        );
    }

    let deadline = now_millis() + JOB_TIMEOUT_MS;
    let instance = format!("remote:{}:{}", state.mode.as_str(), peer);
    let job = json!({
        "id": id,
        "tool": tool,
        "args": args,
        "grant": { "access": grant.access, "scopes": grant.scopes },
        "instance": instance,
        "workspace": workspace,
        "deadline": deadline,
    });

    if let Err(error) = write_job(&state.app, &id, &job) {
        return protocol::tool_error("write_failed", error);
    }
    wait_for_result(&state.app, &id).await
}

fn write_job<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
    job: &Value,
) -> Result<(), String> {
    let dir = mcp_host::jobs_dir(app).ok_or("app data directory unavailable")?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let payload = serde_json::to_vec(job).map_err(|error| error.to_string())?;
    let target = dir.join(format!("{id}.json"));
    let tmp = dir.join(format!("{id}.tmp"));
    std::fs::write(&tmp, payload).map_err(|error| error.to_string())?;
    std::fs::rename(&tmp, &target).map_err(|error| error.to_string())
}

async fn wait_for_result<R: tauri::Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Value {
    let results = match mcp_host::mcp_root(app) {
        Some(root) => root.join("results"),
        None => {
            return protocol::tool_error("write_failed", "app data directory unavailable");
        }
    };
    let path = results.join(format!("{id}.json"));
    let started = Instant::now();
    loop {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            let _ = std::fs::remove_file(&path);
            if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                let ok = value.get("ok").and_then(Value::as_bool).unwrap_or(false);
                if ok {
                    let data = value.get("data").cloned().unwrap_or(Value::Null);
                    let text = serde_json::to_string_pretty(&data).unwrap_or_default();
                    return protocol::tool_result(text, Some(data));
                }
                let code = value
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("write_failed");
                let message = value
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("the app refused the call");
                return protocol::tool_error(code, message);
            }
        }
        if started.elapsed() >= Duration::from_millis(JOB_TIMEOUT_MS) {
            let _ = std::fs::remove_file(path);
            return protocol::tool_error("timeout", "the app did not answer in time");
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Grabs an ephemeral port and releases it, so a test can bind it for real.
    async fn free_port() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind ephemeral");
        listener.local_addr().expect("addr").port()
    }

    /// The port is held, then freed mid-retry: `bind_with_retry` must wait it
    /// out instead of failing the way a single bind would (os error 10048).
    #[tokio::test]
    async fn retries_until_the_port_is_released() {
        let port = free_port().await;
        let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);

        let held = TcpListener::bind(addr).await.expect("hold the port");
        let release = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(75)).await;
            drop(held);
        });

        let listener = bind_with_retry(addr)
            .await
            .expect("retry should win the port");
        assert_eq!(listener.local_addr().expect("addr").port(), port);
        release.await.expect("release task");
    }

    /// A port that never frees is reported, not retried forever.
    #[tokio::test]
    async fn gives_up_when_the_port_never_frees() {
        let port = free_port().await;
        let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
        let _held = TcpListener::bind(addr).await.expect("hold the port");

        let error = bind_with_retry(addr).await.expect_err("must fail");
        assert!(
            error.contains("could not bind"),
            "unexpected error: {error}"
        );
    }
}
