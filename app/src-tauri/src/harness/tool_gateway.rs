use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub const MAX_REQUEST_BODY_BYTES: usize = 64 * 1024;
pub const MAX_RESPONSE_BODY_BYTES: usize = 128 * 1024;
const MAX_ID_BYTES: usize = 200;
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_ACTIVE_CONNECTIONS: usize = 16;
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);
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
        bounded_response_json, parse_tool_request, validate_bearer, PendingRequests,
        ToolGatewayResponse, MAX_REQUEST_BODY_BYTES, MAX_RESPONSE_BODY_BYTES,
    };
    use serde_json::json;

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

        for rejected in [
            "tauri.invoke",
            "native.invoke",
            "terminal_list",
            "terminal.list;rm",
            "",
        ] {
            assert_eq!(
                parse_tool_request(&request(rejected)).unwrap_err().code,
                "unknown_tool"
            );
        }
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
