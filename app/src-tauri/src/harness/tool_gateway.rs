use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub const MAX_REQUEST_BODY_BYTES: usize = 64 * 1024;
pub const MAX_RESPONSE_BODY_BYTES: usize = 128 * 1024;
const MAX_ID_BYTES: usize = 200;
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_ACTIVE_CONNECTIONS: usize = 16;
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_MCP_CALL_IDS: usize = 4096;
pub const TOOL_REQUEST_EVENT: &str = "vibespace://tool-gateway/request";

const TOOL_CATALOG: &[&str] = &[
    "terminal.list",
    "terminal.open",
    "terminal.focus",
    "terminal.spawn",
    "terminal.write",
    "terminal.read",
    "terminal.schedule",
    "command.list",
    "command.run",
    "profile.allAboutMe.read",
    "profile.allAboutMe.update",
    "memory.learning.read",
    "memory.learning.update",
    "context.list",
    "context.read",
    "context.attach",
    "vibespace_context",
    "skills.list",
    "skills.load",
    "plugins.list",
    "plugins.run",
    "tasks.create",
    "tasks.update",
    "schedule.create",
    "app.navigate",
    "app.getState",
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ToolGatewayRequest {
    pub protocol_version: u8,
    pub request_id: String,
    pub session_id: String,
    pub message_id: String,
    pub tool: String,
    pub args: Value,
    pub directory: Option<String>,
    pub worktree: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolGatewayResponse {
    pub request_id: String,
    pub ok: bool,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ToolGatewayError {
    pub code: &'static str,
    pub message: &'static str,
}

fn error(code: &'static str, message: &'static str) -> ToolGatewayError {
    ToolGatewayError { code, message }
}

fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_ID_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._:/@-".contains(&byte))
}

fn safe_absolute_directory(value: &str) -> bool {
    if value.is_empty() || value.len() > 4096 || value.contains('\0') {
        return false;
    }
    let bytes = value.as_bytes();
    value.starts_with('/')
        || value.starts_with(r"\\")
        || (bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && (bytes[2] == b'\\' || bytes[2] == b'/'))
}

pub fn validate_bearer(header: Option<&str>, expected: &str) -> bool {
    if expected.len() < 32 {
        return false;
    }
    let Some(candidate) = header.and_then(|value| value.strip_prefix("Bearer ")) else {
        return false;
    };
    let expected_hash = Sha256::digest(expected.as_bytes());
    let candidate_hash = Sha256::digest(candidate.as_bytes());
    expected_hash
        .iter()
        .zip(candidate_hash.iter())
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

pub fn parse_tool_request(body: &[u8]) -> Result<ToolGatewayRequest, ToolGatewayError> {
    if body.len() > MAX_REQUEST_BODY_BYTES {
        return Err(error(
            "request_too_large",
            "The tool request exceeded the safe size limit.",
        ));
    }
    let request: ToolGatewayRequest = serde_json::from_slice(body).map_err(|_| {
        error(
            "invalid_request",
            "The tool request did not match the gateway protocol.",
        )
    })?;
    if request.protocol_version != 1
        || !safe_id(&request.request_id)
        || !safe_id(&request.session_id)
        || !safe_id(&request.message_id)
        || !request.args.is_object()
    {
        return Err(error(
            "invalid_request",
            "The tool request did not match the gateway protocol.",
        ));
    }
    if !TOOL_CATALOG.contains(&request.tool.as_str()) {
        return Err(error(
            "unknown_tool",
            "The requested semantic tool is unavailable.",
        ));
    }
    if request
        .directory
        .as_deref()
        .is_some_and(|value| !safe_absolute_directory(value))
        || request
            .worktree
            .as_deref()
            .is_some_and(|value| !safe_absolute_directory(value))
    {
        return Err(error(
            "invalid_scope",
            "The tool request directory scope is invalid.",
        ));
    }
    Ok(request)
}

#[derive(Default)]
pub struct PendingRequests {
    inner: Mutex<HashMap<String, mpsc::SyncSender<ToolGatewayResponse>>>,
}

impl PendingRequests {
    pub fn reserve(
        &self,
        request_id: &str,
    ) -> Result<mpsc::Receiver<ToolGatewayResponse>, ToolGatewayError> {
        if !safe_id(request_id) {
            return Err(error("invalid_request", "The tool request ID is invalid."));
        }
        let (sender, receiver) = mpsc::sync_channel(1);
        let mut pending = self
            .inner
            .lock()
            .map_err(|_| error("internal_error", "The tool gateway is unavailable."))?;
        if pending.contains_key(request_id) {
            return Err(error("conflict", "The tool request ID is already active."));
        }
        pending.insert(request_id.to_string(), sender);
        Ok(receiver)
    }

    pub fn respond(&self, response: ToolGatewayResponse) -> Result<(), ToolGatewayError> {
        let sender = self
            .inner
            .lock()
            .map_err(|_| error("internal_error", "The tool gateway is unavailable."))?
            .remove(&response.request_id)
            .ok_or_else(|| error("request_not_found", "The tool request is no longer active."))?;
        sender
            .send(response)
            .map_err(|_| error("request_not_found", "The tool request is no longer active."))
    }

    fn cancel(&self, request_id: &str) {
        if let Ok(mut pending) = self.inner.lock() {
            pending.remove(request_id);
        }
    }
}

pub fn bounded_response_json(
    mut response: ToolGatewayResponse,
) -> Result<Vec<u8>, ToolGatewayError> {
    if !safe_id(&response.request_id) || !safe_id(&response.code) {
        return Err(error(
            "invalid_response",
            "The tool response did not match the gateway protocol.",
        ));
    }
    fn redact(value: &mut Value) {
        match value {
            Value::Object(object) => {
                for (key, value) in object {
                    let normalized = key.to_ascii_lowercase();
                    if [
                        "secret",
                        "token",
                        "password",
                        "authorization",
                        "apikey",
                        "api_key",
                    ]
                    .iter()
                    .any(|needle| normalized.contains(needle))
                    {
                        *value = Value::String("[redacted]".into());
                    } else {
                        redact(value);
                    }
                }
            }
            Value::Array(values) => values.iter_mut().for_each(redact),
            _ => {}
        }
    }
    if let Some(data) = response.data.as_mut() {
        redact(data);
    }
    if !response.ok && response.code == "internal_error" {
        response.message = "The tool request could not be completed.".into();
        response.data = None;
    }
    response.message = response.message.chars().take(2048).collect();
    let mut encoded = serde_json::to_vec(&response).map_err(|_| {
        error(
            "invalid_response",
            "The tool response could not be encoded.",
        )
    })?;
    if encoded.len() > MAX_RESPONSE_BODY_BYTES {
        response.ok = false;
        response.code = "response_too_large".into();
        response.message = "The tool response exceeded the safe size limit.".into();
        response.data = None;
        encoded = serde_json::to_vec(&response).map_err(|_| {
            error(
                "invalid_response",
                "The tool response could not be encoded.",
            )
        })?;
    }
    Ok(encoded)
}

#[derive(Clone)]
pub struct ToolGatewayEndpoint {
    pub url: String,
    pub token: String,
}

#[derive(Default)]
pub struct ToolGatewayState {
    endpoint: Mutex<Option<ToolGatewayEndpoint>>,
    pending: Arc<PendingRequests>,
}

pub struct CodexContextLease {
    url: String,
    token: String,
    revoked: Arc<AtomicBool>,
}

impl CodexContextLease {
    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn token(&self) -> &str {
        &self.token
    }
}

impl Drop for CodexContextLease {
    fn drop(&mut self) {
        self.revoked.store(true, Ordering::Release);
    }
}

impl ToolGatewayState {
    pub fn endpoint(&self) -> Result<ToolGatewayEndpoint, ToolGatewayError> {
        self.endpoint
            .lock()
            .map_err(|_| error("internal_error", "The tool gateway is unavailable."))?
            .clone()
            .ok_or_else(|| error("gateway_unavailable", "The tool gateway is not running."))
    }
}

fn http_response(status: &str, body: &[u8]) -> Vec<u8> {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",
        body.len()
    );
    [header.as_bytes(), body].concat()
}

fn mcp_response(id: &Value, result: Value) -> Vec<u8> {
    let encoded = serde_json::to_vec(&serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    }))
    .unwrap_or_else(|_| {
        br#"{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"Internal error"}}"#
            .to_vec()
    });
    if encoded.len() <= MAX_RESPONSE_BODY_BYTES {
        encoded
    } else {
        mcp_error(Some(id), -32002, "Response exceeded the safe size limit")
    }
}

fn mcp_error(id: Option<&Value>, code: i64, message: &str) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "jsonrpc": "2.0",
        "id": id.unwrap_or(&Value::Null),
        "error": { "code": code, "message": message },
    }))
    .unwrap_or_else(|_| {
        br#"{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"Internal error"}}"#
            .to_vec()
    })
}

fn context_tool_descriptor() -> Value {
    serde_json::json!({
        "name": "vibespace_context",
        "description": "Search or open the current VibeSpace Context Map within its bounded authority.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["operation"],
            "properties": {
                "operation": { "type": "string", "enum": ["search", "open"] },
                "query": { "type": "string", "maxLength": 32768 },
                "limit": { "type": "integer", "minimum": 1, "maximum": 5 },
                "pointer": { "type": "string", "maxLength": 4096 }
            }
        }
    })
}

fn reserve_mcp_call_id(seen: &mut HashSet<String>, id: Option<&Value>) -> bool {
    let Some(id) = id.and_then(|value| match value {
        Value::String(value) if safe_id(value) => Some(format!("s:{value}")),
        Value::Number(value) => Some(format!("n:{value}")),
        _ => None,
    }) else {
        return false;
    };
    if seen.len() >= MAX_MCP_CALL_IDS {
        return false;
    }
    seen.insert(id)
}

fn parse_http_request(
    stream: &mut TcpStream,
    expected_path: &str,
) -> Result<(String, Vec<u8>), ToolGatewayError> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 4096];
    let header_end = loop {
        let read = stream
            .read(&mut buffer)
            .map_err(|_| error("invalid_request", "The request was unreadable."))?;
        if read == 0 {
            return Err(error("invalid_request", "The request ended early."));
        }
        bytes.extend_from_slice(&buffer[..read]);
        if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            break index + 4;
        }
        if bytes.len() > MAX_HEADER_BYTES {
            return Err(error(
                "request_too_large",
                "The headers exceeded the safe size limit.",
            ));
        }
    };
    let header = std::str::from_utf8(&bytes[..header_end])
        .map_err(|_| error("invalid_request", "The request headers were invalid."))?;
    let mut lines = header.split("\r\n");
    let expected_request_line = format!("POST {expected_path} HTTP/1.1");
    if lines.next() != Some(expected_request_line.as_str()) {
        return Err(error("invalid_request", "The endpoint is unavailable."));
    }
    let mut authorization = None;
    let mut content_length = None;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.eq_ignore_ascii_case("authorization") {
            authorization = Some(value.trim().to_string());
        } else if name.eq_ignore_ascii_case("content-length") {
            content_length = value.trim().parse::<usize>().ok();
        }
    }
    let length = content_length
        .ok_or_else(|| error("invalid_request", "The request length was missing."))?;
    if length > MAX_REQUEST_BODY_BYTES {
        return Err(error(
            "request_too_large",
            "The request exceeded the safe size limit.",
        ));
    }
    while bytes.len() - header_end < length {
        let read = stream
            .read(&mut buffer)
            .map_err(|_| error("invalid_request", "The request body was unreadable."))?;
        if read == 0 {
            return Err(error("invalid_request", "The request body ended early."));
        }
        bytes.extend_from_slice(&buffer[..read]);
    }
    Ok((
        authorization.unwrap_or_default(),
        bytes[header_end..header_end + length].to_vec(),
    ))
}

fn handle_codex_mcp_connection(
    mut stream: TcpStream,
    path: &str,
    token: &str,
    session_id: &str,
    directory: Option<&str>,
    app: &AppHandle,
    pending: &PendingRequests,
    seen_call_ids: &mut HashSet<String>,
) -> Result<(), ToolGatewayError> {
    let (authorization, body) = match parse_http_request(&mut stream, path) {
        Ok(value) => value,
        Err(_) => {
            let _ = stream.write_all(&http_response(
                "400 Bad Request",
                &mcp_error(None, -32600, "Invalid request"),
            ));
            return Ok(());
        }
    };
    if !validate_bearer(Some(&authorization), token) {
        let _ = stream.write_all(&http_response(
            "401 Unauthorized",
            &mcp_error(None, -32001, "Authentication failed"),
        ));
        return Ok(());
    }
    let value: Value = match serde_json::from_slice::<Value>(&body) {
        Ok(value) if value.is_object() => value,
        _ => {
            let _ = stream.write_all(&http_response(
                "400 Bad Request",
                &mcp_error(None, -32700, "Parse error"),
            ));
            return Ok(());
        }
    };
    let id = value.get("id");
    let method = value
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let response = match method {
        "initialize" => {
            let protocol_version = value
                .pointer("/params/protocolVersion")
                .and_then(Value::as_str)
                .filter(|version| matches!(*version, "2024-11-05" | "2025-03-26" | "2025-06-18"))
                .unwrap_or("2025-06-18");
            mcp_response(
                id.unwrap_or(&Value::Null),
                serde_json::json!({
                    "protocolVersion": protocol_version,
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": "vibespace-context", "version": "1" }
                }),
            )
        }
        "notifications/initialized" => {
            let _ = stream.write_all(&http_response("202 Accepted", &[]));
            return Ok(());
        }
        "tools/list" => mcp_response(
            id.unwrap_or(&Value::Null),
            serde_json::json!({ "tools": [context_tool_descriptor()] }),
        ),
        "tools/call" => {
            let params = value.get("params").and_then(Value::as_object);
            if !reserve_mcp_call_id(seen_call_ids, id) {
                mcp_error(id, -32600, "Invalid or replayed request ID")
            } else if params
                .and_then(|item| item.get("name"))
                .and_then(Value::as_str)
                != Some("vibespace_context")
            {
                mcp_error(id, -32601, "Tool unavailable")
            } else {
                let args = params
                    .and_then(|item| item.get("arguments"))
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({}));
                if !args.is_object() {
                    mcp_error(id, -32602, "Invalid tool arguments")
                } else {
                    let request_id = format!("codex-{}", nanoid::nanoid!(32));
                    let request = ToolGatewayRequest {
                        protocol_version: 1,
                        request_id: request_id.clone(),
                        session_id: session_id.to_string(),
                        message_id: format!("mcp-{}", nanoid::nanoid!(24)),
                        tool: "vibespace_context".into(),
                        args,
                        directory: directory.map(str::to_string),
                        worktree: directory.map(str::to_string),
                    };
                    let receiver = pending.reserve(&request_id)?;
                    if app.emit(TOOL_REQUEST_EVENT, request).is_err() {
                        pending.cancel(&request_id);
                        mcp_error(id, -32603, "Context routing unavailable")
                    } else {
                        let tool_response = match receiver.recv_timeout(RESPONSE_TIMEOUT) {
                            Ok(response) => response,
                            Err(_) => {
                                pending.cancel(&request_id);
                                ToolGatewayResponse {
                                    request_id,
                                    ok: false,
                                    code: "request_timeout".into(),
                                    message: "The Context Map request timed out.".into(),
                                    data: None,
                                }
                            }
                        };
                        let bounded = bounded_response_json(tool_response.clone())?;
                        let text = String::from_utf8(bounded)
                            .unwrap_or_else(|_| r#"{"ok":false,"code":"invalid_response"}"#.into());
                        mcp_response(
                            id.unwrap_or(&Value::Null),
                            serde_json::json!({
                                "content": [{ "type": "text", "text": text }],
                                "isError": !tool_response.ok
                            }),
                        )
                    }
                }
            }
        }
        _ => mcp_error(id, -32601, "Method unavailable"),
    };
    stream
        .write_all(&http_response("200 OK", &response))
        .map_err(|_| {
            error(
                "connection_closed",
                "The Codex Context Map connection closed.",
            )
        })
}

pub fn create_codex_context_lease(
    app: &AppHandle,
    state: &ToolGatewayState,
    session_id: &str,
    directory: Option<&str>,
) -> Result<CodexContextLease, String> {
    if !safe_id(session_id) {
        return Err("The Codex Context Map session ID is invalid.".into());
    }
    if directory.is_some_and(|value| !safe_absolute_directory(value)) {
        return Err("The Codex Context Map directory scope is invalid.".into());
    }
    let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0))
        .map_err(|_| "The Codex Context Map lease could not bind to loopback.".to_string())?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "The Codex Context Map lease could not be isolated.".to_string())?;
    let address = listener
        .local_addr()
        .map_err(|_| "The Codex Context Map lease address is unavailable.".to_string())?;
    let lease_id = nanoid::nanoid!(32);
    let path = format!("/v1/codex-context/{lease_id}");
    let token = nanoid::nanoid!(64);
    let revoked = Arc::new(AtomicBool::new(false));
    let thread_revoked = Arc::clone(&revoked);
    let app = app.clone();
    let pending = Arc::clone(&state.pending);
    let thread_token = token.clone();
    let thread_session_id = session_id.to_string();
    let thread_directory = directory.map(str::to_string);
    let thread_path = path.clone();
    std::thread::Builder::new()
        .name(format!("codex-context-{lease_id}"))
        .spawn(move || {
            let mut seen_call_ids = HashSet::new();
            while !thread_revoked.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let _ = handle_codex_mcp_connection(
                            stream,
                            &thread_path,
                            &thread_token,
                            &thread_session_id,
                            thread_directory.as_deref(),
                            &app,
                            &pending,
                            &mut seen_call_ids,
                        );
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => break,
                }
            }
        })
        .map_err(|_| "The Codex Context Map lease could not start.".to_string())?;
    Ok(CodexContextLease {
        url: format!("http://{address}{path}"),
        token,
        revoked,
    })
}

fn error_body(request_id: &str, failure: ToolGatewayError) -> Vec<u8> {
    bounded_response_json(ToolGatewayResponse {
        request_id: if safe_id(request_id) {
            request_id.into()
        } else {
            "invalid-request".into()
        },
        ok: false,
        code: failure.code.into(),
        message: failure.message.into(),
        data: None,
    })
    .unwrap_or_else(|_| br#"{"ok":false,"code":"internal_error"}"#.to_vec())
}

fn read_http_request(stream: &mut TcpStream) -> Result<(String, Vec<u8>), ToolGatewayError> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 4096];
    let header_end = loop {
        let read = stream.read(&mut buffer).map_err(|_| {
            error(
                "invalid_request",
                "The tool gateway request was unreadable.",
            )
        })?;
        if read == 0 {
            return Err(error(
                "invalid_request",
                "The tool gateway request ended early.",
            ));
        }
        bytes.extend_from_slice(&buffer[..read]);
        if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            break index + 4;
        }
        if bytes.len() > MAX_HEADER_BYTES {
            return Err(error(
                "request_too_large",
                "The tool gateway headers exceeded the safe size limit.",
            ));
        }
    };
    let header = std::str::from_utf8(&bytes[..header_end])
        .map_err(|_| error("invalid_request", "The tool gateway headers were invalid."))?;
    let mut lines = header.split("\r\n");
    if lines.next() != Some("POST /v1/tool HTTP/1.1") {
        return Err(error(
            "invalid_request",
            "Only the semantic tool endpoint is available.",
        ));
    }
    let mut authorization = None;
    let mut content_length = None;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.eq_ignore_ascii_case("authorization") {
            authorization = Some(value.trim().to_string());
        } else if name.eq_ignore_ascii_case("content-length") {
            content_length = value.trim().parse::<usize>().ok();
        }
    }
    let length = content_length.ok_or_else(|| {
        error(
            "invalid_request",
            "The tool gateway request length was missing.",
        )
    })?;
    if length > MAX_REQUEST_BODY_BYTES {
        return Err(error(
            "request_too_large",
            "The tool request exceeded the safe size limit.",
        ));
    }
    while bytes.len() - header_end < length {
        let read = stream
            .read(&mut buffer)
            .map_err(|_| error("invalid_request", "The tool request body was unreadable."))?;
        if read == 0 {
            return Err(error(
                "invalid_request",
                "The tool request body ended early.",
            ));
        }
        bytes.extend_from_slice(&buffer[..read]);
    }
    Ok((
        authorization.unwrap_or_default(),
        bytes[header_end..header_end + length].to_vec(),
    ))
}

fn handle_connection(
    mut stream: TcpStream,
    token: &str,
    app: &AppHandle,
    pending: &PendingRequests,
) -> Result<(), ToolGatewayError> {
    let (authorization, body) = match read_http_request(&mut stream) {
        Ok(value) => value,
        Err(failure) => {
            let response =
                http_response("400 Bad Request", &error_body("invalid-request", failure));
            let _ = stream.write_all(&response);
            return Ok(());
        }
    };
    if !validate_bearer(Some(&authorization), token) {
        let response = http_response(
            "401 Unauthorized",
            &error_body(
                "invalid-request",
                error(
                    "authentication_failed",
                    "Tool gateway authentication failed.",
                ),
            ),
        );
        let _ = stream.write_all(&response);
        return Ok(());
    }
    let request = match parse_tool_request(&body) {
        Ok(request) => request,
        Err(failure) => {
            let response =
                http_response("400 Bad Request", &error_body("invalid-request", failure));
            let _ = stream.write_all(&response);
            return Ok(());
        }
    };
    let receiver = pending.reserve(&request.request_id)?;
    if app.emit(TOOL_REQUEST_EVENT, request.clone()).is_err() {
        pending.cancel(&request.request_id);
        let response = http_response(
            "503 Service Unavailable",
            &error_body(
                &request.request_id,
                error(
                    "renderer_unavailable",
                    "VibeSpace could not route the semantic tool request.",
                ),
            ),
        );
        let _ = stream.write_all(&response);
        return Ok(());
    }
    let response = match receiver.recv_timeout(RESPONSE_TIMEOUT) {
        Ok(response) => response,
        Err(_) => {
            pending.cancel(&request.request_id);
            ToolGatewayResponse {
                request_id: request.request_id,
                ok: false,
                code: "request_timeout".into(),
                message: "VibeSpace did not complete the tool request in time.".into(),
                data: None,
            }
        }
    };
    let body = bounded_response_json(response)?;
    stream
        .write_all(&http_response("200 OK", &body))
        .map_err(|_| error("connection_closed", "The OpenCode tool connection closed."))
}

pub fn start_tool_gateway_server(
    app: &AppHandle,
    state: &ToolGatewayState,
) -> Result<ToolGatewayEndpoint, String> {
    let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0))
        .map_err(|_| "The VibeSpace tool gateway could not bind to loopback.".to_string())?;
    let address = listener
        .local_addr()
        .map_err(|_| "The VibeSpace tool gateway address is unavailable.".to_string())?;
    let endpoint = ToolGatewayEndpoint {
        url: format!("http://{address}/v1/tool"),
        token: nanoid::nanoid!(64),
    };
    *state
        .endpoint
        .lock()
        .map_err(|_| "The VibeSpace tool gateway state is unavailable.".to_string())? =
        Some(endpoint.clone());

    let app = app.clone();
    let pending = Arc::clone(&state.pending);
    let token = endpoint.token.clone();
    std::thread::spawn(move || {
        let active = Arc::new(Mutex::new(0_usize));
        for connection in listener.incoming() {
            let Ok(stream) = connection else {
                continue;
            };
            let mut count = match active.lock() {
                Ok(count) => count,
                Err(_) => continue,
            };
            if *count >= MAX_ACTIVE_CONNECTIONS {
                drop(stream);
                continue;
            }
            *count += 1;
            drop(count);
            let app = app.clone();
            let pending = Arc::clone(&pending);
            let token = token.clone();
            let active = Arc::clone(&active);
            std::thread::spawn(move || {
                let _ = handle_connection(stream, &token, &app, &pending);
                if let Ok(mut count) = active.lock() {
                    *count = count.saturating_sub(1);
                }
            });
        }
    });
    Ok(endpoint)
}

#[tauri::command]
pub fn tool_gateway_respond(
    state: State<'_, ToolGatewayState>,
    response: ToolGatewayResponse,
) -> Result<(), String> {
    state
        .pending
        .respond(response)
        .map_err(|failure| failure.message.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        bounded_response_json, context_tool_descriptor, mcp_response, parse_tool_request,
        reserve_mcp_call_id, validate_bearer, CodexContextLease, PendingRequests,
        ToolGatewayResponse, MAX_REQUEST_BODY_BYTES, MAX_RESPONSE_BODY_BYTES,
    };
    use serde_json::json;
    use std::collections::HashSet;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    fn request(tool: &str) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "protocolVersion": 1,
            "requestId": "tool-request-1",
            "sessionId": "session-1",
            "messageId": "message-1",
            "tool": tool,
            "args": {},
            "directory": "C:\\workspace",
            "worktree": "C:\\workspace"
        }))
        .unwrap()
    }

    #[test]
    fn accepts_only_the_fixed_semantic_catalog_and_never_generic_native_invoke() {
        let parsed = parse_tool_request(&request("terminal.list")).unwrap();
        assert_eq!(parsed.tool, "terminal.list");
        assert_eq!(parsed.directory.as_deref(), Some("C:\\workspace"));
        assert_eq!(
            parse_tool_request(&request("vibespace_context"))
                .unwrap()
                .tool,
            "vibespace_context"
        );

        for rejected in [
            "tauri.invoke",
            "native.invoke",
            "terminal_list",
            "terminal.list;rm",
            "context.update",
            "",
        ] {
            assert_eq!(
                parse_tool_request(&request(rejected)).unwrap_err().code,
                "unknown_tool"
            );
        }
    }

    #[test]
    fn codex_mcp_catalog_exposes_only_bounded_context_map_and_lease_drop_revokes() {
        let descriptor = context_tool_descriptor();
        assert_eq!(descriptor["name"], "vibespace_context");
        assert_eq!(descriptor["inputSchema"]["additionalProperties"], false);
        assert_eq!(
            descriptor["inputSchema"]["properties"]["limit"]["maximum"],
            5
        );
        let revoked = Arc::new(AtomicBool::new(false));
        let lease = CodexContextLease {
            url: "http://127.0.0.1:1/v1/codex-context/test".into(),
            token: "t".repeat(64),
            revoked: Arc::clone(&revoked),
        };
        assert!(!revoked.load(Ordering::Acquire));
        drop(lease);
        assert!(revoked.load(Ordering::Acquire));
        let oversized = mcp_response(
            &json!(1),
            json!({ "data": "x".repeat(MAX_RESPONSE_BODY_BYTES) }),
        );
        assert!(oversized.len() <= MAX_RESPONSE_BODY_BYTES);
        assert!(String::from_utf8(oversized)
            .unwrap()
            .contains("Response exceeded the safe size limit"));
        let mut seen = HashSet::new();
        assert!(reserve_mcp_call_id(&mut seen, Some(&json!("call-1"))));
        assert!(!reserve_mcp_call_id(&mut seen, Some(&json!("call-1"))));
        assert!(!reserve_mcp_call_id(&mut seen, None));
    }

    #[test]
    fn rejects_missing_or_inexact_bearer_authority() {
        let token = "t".repeat(64);
        assert!(validate_bearer(Some(&format!("Bearer {token}")), &token));
        assert!(!validate_bearer(None, &token));
        assert!(!validate_bearer(Some(&format!("bearer {token}")), &token));
        assert!(!validate_bearer(Some(&format!("Bearer {token}x")), &token));
    }

    #[test]
    fn rejects_oversized_malformed_or_unscoped_requests() {
        assert_eq!(
            parse_tool_request(&vec![b'x'; MAX_REQUEST_BODY_BYTES + 1])
                .unwrap_err()
                .code,
            "request_too_large"
        );
        assert_eq!(
            parse_tool_request(br#"{"protocolVersion":1}"#)
                .unwrap_err()
                .code,
            "invalid_request"
        );
        let mut unsafe_scope: serde_json::Value =
            serde_json::from_slice(&request("app.getState")).unwrap();
        unsafe_scope["directory"] = json!("..\\outside");
        assert_eq!(
            parse_tool_request(&serde_json::to_vec(&unsafe_scope).unwrap())
                .unwrap_err()
                .code,
            "invalid_scope"
        );
    }

    #[test]
    fn reserves_each_request_id_once_until_the_response_is_consumed() {
        let pending = PendingRequests::default();
        let receiver = pending.reserve("request-1").unwrap();
        assert_eq!(pending.reserve("request-1").unwrap_err().code, "conflict");
        pending
            .respond(ToolGatewayResponse {
                request_id: "request-1".into(),
                ok: true,
                code: "ok".into(),
                message: "Ready".into(),
                data: Some(json!({ "route": "chat" })),
            })
            .unwrap();
        assert_eq!(receiver.recv().unwrap().code, "ok");
        assert!(pending.reserve("request-1").is_ok());
    }

    #[test]
    fn bounds_and_sanitizes_renderer_results_before_returning_them_to_opencode() {
        let response = ToolGatewayResponse {
            request_id: "request-1".into(),
            ok: false,
            code: "internal_error".into(),
            message: format!("secret-token {}", "x".repeat(MAX_RESPONSE_BODY_BYTES)),
            data: Some(json!({ "apiKey": "must-not-leak" })),
        };
        let encoded = bounded_response_json(response).unwrap();
        assert!(encoded.len() <= MAX_RESPONSE_BODY_BYTES);
        let value: serde_json::Value = serde_json::from_slice(&encoded).unwrap();
        assert_eq!(value["requestId"], "request-1");
        assert_eq!(value["ok"], false);
        assert!(!value["message"].as_str().unwrap().contains("secret-token"));
        assert!(!value.to_string().contains("must-not-leak"));
    }
}
