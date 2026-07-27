use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, IsTerminal, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const PROTOCOL_VERSION: u8 = 1;
const KEYRING_SERVICE: &str = "ai.jarvis.desktop";
const KEYRING_ACCOUNT: &str = "terminal-cli-nonce";
const MANAGED_MARKER: &str = "VIBESPACE_CLI_MANAGED_V1";
const TERMINAL_SESSION_ENV: &str = "VIBESPACE_TERMINAL_SESSION_ID";
const TERMINAL_PANE_ENV: &str = "VIBESPACE_PANE_ID";
const TERMINAL_PROJECT_ENV: &str = "VIBESPACE_PROJECT_ID";
const MAX_WIRE_BYTES: u64 = 65_536;
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(15);
const LONG_RUNNING_RESPONSE_TIMEOUT: Duration = Duration::from_secs(120);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const SAFE_NONCE_LENGTH: usize = 64;
const MAX_PARAM_DEPTH: usize = 4;
const MAX_PARAM_KEYS: usize = 32;
const MAX_PARAM_ARRAY: usize = 32;
const MAX_PARAM_STRING: usize = 4_096;
const MAX_RESPONSE_DEPTH: usize = 6;
const MAX_RESPONSE_KEYS: usize = 128;
const MAX_RESPONSE_ARRAY: usize = 512;
const MAX_RESPONSE_STRING: usize = 16_384;
const MAX_ACTIVE_CONNECTIONS: usize = 8;

pub fn terminal_cli_response_timeout(method: &str) -> Duration {
    match method {
        "context.create" | "context.refresh" => LONG_RUNNING_RESPONSE_TIMEOUT,
        _ => RESPONSE_TIMEOUT,
    }
}

const METHODS: &[&str] = &[
    "context.list",
    "context.current",
    "context.use",
    "context.clear",
    "context.search",
    "context.open",
    "context.attach",
    "context.refresh",
    "context.sources",
    "context.status",
    "context.create",
    "skills.list",
    "skills.active",
    "skills.use",
    "skills.add",
    "skills.remove",
    "skills.clear",
    "skills.inspect",
    "agent.list",
    "agent.current",
    "agent.use",
    "agent.clear",
    "agent.status",
    "note.new",
    "note.open",
    "note.link",
    "daily.open",
    "daily.add",
    "project.current",
    "project.switch",
    "status",
    "help",
];

const RESPONSE_CODES: &[&str] = &[
    "ok",
    "app_not_running",
    "authentication_failed",
    "invalid_request",
    "unsupported_version",
    "permission_denied",
    "not_found",
    "conflict",
    "internal_error",
];

#[derive(Debug, Clone, PartialEq)]
pub struct TerminalCliInvocation {
    pub endpoint: PathBuf,
    pub json: bool,
    pub color: bool,
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerminalCliRequest {
    pub protocol_version: u8,
    pub request_id: String,
    pub nonce: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal_session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pane_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TerminalCliRequestScope {
    pub terminal_session_id: Option<String>,
    pub pane_id: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerminalCliResponse {
    pub request_id: String,
    pub ok: bool,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TerminalCliEndpoint {
    protocol_version: u8,
    address: String,
    keyring_service: String,
    keyring_account: String,
}

struct TerminalCliEndpointError {
    code: &'static str,
    message: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCliFrontendRequest {
    protocol_version: u8,
    request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminal_session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pane_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    project_id: Option<String>,
    method: String,
    params: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCliInstallStatus {
    installed: bool,
    bin_dir: String,
    command_names: [&'static str; 2],
}

#[derive(Default)]
pub struct TerminalCliState {
    endpoint_path: Mutex<Option<PathBuf>>,
    pending: Arc<Mutex<HashMap<String, SyncSender<TerminalCliResponse>>>>,
}

#[derive(Clone)]
pub struct TerminalCliConnectionLimiter {
    active: Arc<AtomicUsize>,
    maximum: usize,
}

pub struct TerminalCliConnectionPermit {
    active: Arc<AtomicUsize>,
}

impl TerminalCliConnectionLimiter {
    pub fn new(maximum: usize) -> Self {
        Self {
            active: Arc::new(AtomicUsize::new(0)),
            maximum,
        }
    }

    pub fn try_acquire(&self) -> Option<TerminalCliConnectionPermit> {
        if self.maximum == 0 {
            return None;
        }
        self.active
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |active| {
                (active < self.maximum).then_some(active + 1)
            })
            .ok()
            .map(|_| TerminalCliConnectionPermit {
                active: Arc::clone(&self.active),
            })
    }
}

impl Drop for TerminalCliConnectionPermit {
    fn drop(&mut self) {
        self.active.fetch_sub(1, Ordering::AcqRel);
    }
}

fn safe_atom(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value.chars().enumerate().all(|(index, ch)| {
            ch.is_ascii_alphanumeric()
                || (index > 0 && matches!(ch, '.' | '_' | ':' | '/' | '@' | '-'))
        })
}

fn safe_text(value: &str, maximum: usize) -> bool {
    !value.is_empty()
        && value.len() <= maximum
        && !value.chars().any(
            |ch| matches!(ch, '\0'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}' | '\u{7f}'..='\u{9f}'),
        )
}

fn closed_params<K: Into<String>>(entries: impl IntoIterator<Item = (K, Value)>) -> Value {
    Value::Object(
        entries
            .into_iter()
            .map(|(key, value)| (key.into(), value))
            .collect(),
    )
}

fn empty_params() -> Value {
    Value::Object(Map::new())
}

fn one_value(args: &[String], name: &str) -> Result<Value, String> {
    if args.len() != 1 || !safe_text(&args[0], MAX_PARAM_STRING) {
        return Err(format!("{name} requires one bounded value"));
    }
    Ok(Value::String(args[0].clone()))
}

fn no_values(args: &[String], name: &str) -> Result<Value, String> {
    if !args.is_empty() {
        return Err(format!("{name} does not accept extra arguments"));
    }
    Ok(empty_params())
}

fn parse_context(args: &[String]) -> Result<(String, Value), String> {
    let (subcommand, rest) = args
        .split_first()
        .ok_or_else(|| "context requires a subcommand".to_string())?;
    let method = format!("context.{subcommand}");
    let params = match subcommand.as_str() {
        "list" | "current" | "clear" | "sources" | "status" => no_values(rest, &method)?,
        "use" => closed_params([("map", one_value(rest, &method)?)]),
        "search" => closed_params([("query", one_value(rest, &method)?)]),
        "open" => closed_params([("target", one_value(rest, &method)?)]),
        "refresh" => {
            if rest.len() > 1 {
                return Err("context.refresh accepts at most one map".into());
            }
            closed_params([(
                "map",
                rest.first()
                    .map(|value| Value::String(value.clone()))
                    .unwrap_or(Value::Null),
            )])
        }
        "attach" => {
            if rest.is_empty() || rest.len() > 2 || !safe_text(&rest[0], MAX_PARAM_STRING) {
                return Err("context.attach requires an entity and optional --once".into());
            }
            let mode = match rest.get(1).map(String::as_str) {
                None => "persistent",
                Some("--once") => "one_turn",
                Some(_) => return Err("context.attach accepts only --once".into()),
            };
            closed_params([
                ("entity", Value::String(rest[0].clone())),
                ("mode", Value::String(mode.into())),
            ])
        }
        "create" => {
            if rest.len() < 2 {
                return Err("context.create requires --folder, --file, or --github".into());
            }
            match rest[0].as_str() {
                "--folder" if rest.len() == 2 => closed_params([
                    ("sourceKind", Value::String("folder".into())),
                    ("source", Value::String(rest[1].clone())),
                ]),
                "--file" if rest.len() == 2 => closed_params([
                    ("sourceKind", Value::String("file".into())),
                    ("source", Value::String(rest[1].clone())),
                ]),
                "--github" if rest.len() == 4 && rest[2] == "--ref" => closed_params([
                    ("sourceKind", Value::String("github".into())),
                    ("source", Value::String(rest[1].clone())),
                    ("ref", Value::String(rest[3].clone())),
                ]),
                _ => return Err("invalid context.create arguments".into()),
            }
        }
        _ => return Err("unknown context command".into()),
    };
    Ok((method, params))
}

fn parse_named_family(
    family: &str,
    args: &[String],
    no_arg: &[&str],
    one_arg: &[(&str, &str)],
) -> Result<(String, Value), String> {
    let (subcommand, rest) = args
        .split_first()
        .ok_or_else(|| format!("{family} requires a subcommand"))?;
    let method = format!("{family}.{subcommand}");
    if no_arg.contains(&subcommand.as_str()) {
        return Ok((method.clone(), no_values(rest, &method)?));
    }
    if let Some((_, param)) = one_arg
        .iter()
        .find(|(candidate, _)| *candidate == subcommand)
    {
        return Ok((
            method.clone(),
            closed_params([(*param, one_value(rest, &method)?)]),
        ));
    }
    Err(format!("unknown {family} command"))
}

fn parse_note(args: &[String]) -> Result<(String, Value), String> {
    let (subcommand, rest) = args
        .split_first()
        .ok_or_else(|| "note requires a subcommand".to_string())?;
    let method = format!("note.{subcommand}");
    match subcommand.as_str() {
        "new" => Ok((method.clone(), no_values(rest, &method)?)),
        "open" => Ok((
            method.clone(),
            closed_params([("name", one_value(rest, &method)?)]),
        )),
        "link" if rest.len() == 2 => Ok((
            method,
            closed_params([
                ("source", Value::String(rest[0].clone())),
                ("target", Value::String(rest[1].clone())),
            ]),
        )),
        _ => Err("invalid note command".into()),
    }
}

fn parse_daily(args: &[String]) -> Result<(String, Value), String> {
    if args.is_empty() {
        return Ok(("daily.open".into(), empty_params()));
    }
    if args.len() == 2 && args[0] == "add" && safe_text(&args[1], MAX_PARAM_STRING) {
        return Ok((
            "daily.add".into(),
            closed_params([("text", Value::String(args[1].clone()))]),
        ));
    }
    Err("daily accepts no arguments or `add <text>`".into())
}

pub fn parse_terminal_cli_args(args: &[String]) -> Result<TerminalCliInvocation, String> {
    let mut index = 0;
    let mut endpoint = None;
    let mut json_output = false;
    let mut color = std::io::stdout().is_terminal();
    while let Some(arg) = args.get(index) {
        match arg.as_str() {
            "--endpoint" => {
                if endpoint.is_some() {
                    return Err("--endpoint may be provided only once".into());
                }
                let value = args
                    .get(index + 1)
                    .ok_or_else(|| "--endpoint requires a path".to_string())?;
                if value.is_empty() || value.chars().any(char::is_control) {
                    return Err("invalid endpoint path".into());
                }
                endpoint = Some(PathBuf::from(value));
                index += 2;
            }
            "--json" => {
                json_output = true;
                color = false;
                index += 1;
            }
            "--no-color" => {
                color = false;
                index += 1;
            }
            "--color" => {
                color = true;
                index += 1;
            }
            _ if arg.starts_with('-') => return Err(format!("unknown option: {arg}")),
            _ => break,
        }
    }
    let endpoint = endpoint.ok_or_else(|| "missing managed --endpoint path".to_string())?;
    let command = args.get(index).map(String::as_str).unwrap_or("help");
    let rest = &args[(index + usize::from(index < args.len()))..];
    let (method, params) = match command {
        "status" | "help" => (command.to_string(), no_values(rest, command)?),
        "context" => parse_context(rest)?,
        "skills" => parse_named_family(
            "skills",
            rest,
            &["list", "active", "clear"],
            &[
                ("use", "skill"),
                ("add", "skill"),
                ("remove", "skill"),
                ("inspect", "skill"),
            ],
        )?,
        "agent" => parse_named_family(
            "agent",
            rest,
            &["list", "current", "clear", "status"],
            &[("use", "slug")],
        )?,
        "note" => parse_note(rest)?,
        "daily" => parse_daily(rest)?,
        "project" => parse_named_family("project", rest, &["current"], &[("switch", "projectId")])?,
        _ => return Err("unknown VibeSpace command".into()),
    };
    if !METHODS.contains(&method.as_str()) {
        return Err("unsupported VibeSpace command".into());
    }
    Ok(TerminalCliInvocation {
        endpoint,
        json: json_output,
        color: color && !json_output,
        method,
        params,
    })
}

fn valid_json(value: &Value, depth: usize) -> bool {
    match value {
        Value::Null | Value::Bool(_) => true,
        Value::Number(number) => number.as_f64().is_some_and(f64::is_finite),
        Value::String(text) => safe_text(text, MAX_PARAM_STRING),
        Value::Array(values) => {
            depth < MAX_PARAM_DEPTH
                && values.len() <= MAX_PARAM_ARRAY
                && values.iter().all(|value| valid_json(value, depth + 1))
        }
        Value::Object(values) => {
            depth < MAX_PARAM_DEPTH
                && values.len() <= MAX_PARAM_KEYS
                && values
                    .iter()
                    .all(|(key, value)| safe_atom(key) && valid_json(value, depth + 1))
        }
    }
}

fn valid_response_json(value: &Value, depth: usize) -> bool {
    match value {
        Value::Null | Value::Bool(_) => true,
        Value::Number(number) => number.as_f64().is_some_and(f64::is_finite),
        Value::String(text) => {
            text.len() <= MAX_RESPONSE_STRING
                && !text.chars().any(
                    |ch| matches!(ch, '\0'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}' | '\u{7f}'..='\u{9f}'),
                )
        }
        Value::Array(values) => {
            depth < MAX_RESPONSE_DEPTH
                && values.len() <= MAX_RESPONSE_ARRAY
                && values
                    .iter()
                    .all(|value| valid_response_json(value, depth + 1))
        }
        Value::Object(values) => {
            depth < MAX_RESPONSE_DEPTH
                && values.len() <= MAX_RESPONSE_KEYS
                && values
                    .iter()
                    .all(|(key, value)| safe_atom(key) && valid_response_json(value, depth + 1))
        }
    }
}

fn valid_nonce(value: &str) -> bool {
    value.len() == SAFE_NONCE_LENGTH && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn constant_time_eq(left: &str, right: &str) -> bool {
    let left = left.as_bytes();
    let right = right.as_bytes();
    let mut difference = left.len() ^ right.len();
    for index in 0..left.len().max(right.len()) {
        difference |= usize::from(*left.get(index).unwrap_or(&0) ^ *right.get(index).unwrap_or(&0));
    }
    difference == 0
}

pub fn build_terminal_cli_request(
    invocation: &TerminalCliInvocation,
    nonce: &str,
    request_id: &str,
) -> Result<TerminalCliRequest, String> {
    build_scoped_terminal_cli_request(
        invocation,
        nonce,
        request_id,
        terminal_cli_scope_from_environment()?,
    )
}

fn optional_scope_environment(name: &str) -> Result<Option<String>, String> {
    let Some(value) = std::env::var_os(name) else {
        return Ok(None);
    };
    let value = value
        .into_string()
        .map_err(|_| format!("{name} is not valid UTF-8"))?;
    if !safe_atom(&value) {
        return Err(format!("{name} is invalid"));
    }
    Ok(Some(value))
}

fn terminal_cli_scope_from_environment() -> Result<TerminalCliRequestScope, String> {
    Ok(TerminalCliRequestScope {
        terminal_session_id: optional_scope_environment(TERMINAL_SESSION_ENV)?,
        pane_id: optional_scope_environment(TERMINAL_PANE_ENV)?,
        project_id: optional_scope_environment(TERMINAL_PROJECT_ENV)?,
    })
}

pub fn build_scoped_terminal_cli_request(
    invocation: &TerminalCliInvocation,
    nonce: &str,
    request_id: &str,
    scope: TerminalCliRequestScope,
) -> Result<TerminalCliRequest, String> {
    let request = TerminalCliRequest {
        protocol_version: PROTOCOL_VERSION,
        request_id: request_id.into(),
        nonce: nonce.into(),
        terminal_session_id: scope.terminal_session_id,
        pane_id: scope.pane_id,
        project_id: scope.project_id,
        method: invocation.method.clone(),
        params: invocation.params.clone(),
    };
    validate_terminal_cli_request(&request, nonce)?;
    Ok(request)
}

pub fn validate_terminal_cli_request(
    request: &TerminalCliRequest,
    expected_nonce: &str,
) -> Result<(), String> {
    if let Some(code) = terminal_cli_request_error_code(request, expected_nonce) {
        return Err(code.into());
    }
    Ok(())
}

fn exact_object<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Map<String, Value>> {
    let Value::Object(values) = value else {
        return None;
    };
    (values.len() == keys.len() && keys.iter().all(|key| values.contains_key(*key)))
        .then_some(values)
}

fn bounded_string(value: Option<&Value>) -> bool {
    value
        .and_then(Value::as_str)
        .is_some_and(|text| safe_text(text, MAX_PARAM_STRING))
}

fn valid_method_params(method: &str, params: &Value) -> bool {
    match method {
        "context.list" | "context.current" | "context.clear" | "context.sources"
        | "context.status" | "skills.list" | "skills.active" | "skills.clear" | "agent.list"
        | "agent.current" | "agent.clear" | "agent.status" | "note.new" | "daily.open"
        | "project.current" | "status" | "help" => exact_object(params, &[]).is_some(),
        "context.use" => {
            exact_object(params, &["map"]).is_some_and(|values| bounded_string(values.get("map")))
        }
        "context.search" => exact_object(params, &["query"])
            .is_some_and(|values| bounded_string(values.get("query"))),
        "context.open" => exact_object(params, &["target"])
            .is_some_and(|values| bounded_string(values.get("target"))),
        "context.attach" => exact_object(params, &["entity", "mode"]).is_some_and(|values| {
            bounded_string(values.get("entity"))
                && matches!(
                    values.get("mode").and_then(Value::as_str),
                    Some("persistent" | "one_turn")
                )
        }),
        "context.refresh" => exact_object(params, &["map"]).is_some_and(|values| {
            values.get("map").is_some_and(|value| {
                value.is_null()
                    || value
                        .as_str()
                        .is_some_and(|text| safe_text(text, MAX_PARAM_STRING))
            })
        }),
        "context.create" => {
            let Value::Object(values) = params else {
                return false;
            };
            match values.get("sourceKind").and_then(Value::as_str) {
                Some("folder" | "file") => {
                    exact_object(params, &["sourceKind", "source"]).is_some()
                        && bounded_string(values.get("source"))
                }
                Some("github") => {
                    exact_object(params, &["sourceKind", "source", "ref"]).is_some()
                        && bounded_string(values.get("source"))
                        && bounded_string(values.get("ref"))
                }
                _ => false,
            }
        }
        "skills.use" | "skills.add" | "skills.remove" | "skills.inspect" => {
            exact_object(params, &["skill"])
                .is_some_and(|values| bounded_string(values.get("skill")))
        }
        "agent.use" => {
            exact_object(params, &["slug"]).is_some_and(|values| bounded_string(values.get("slug")))
        }
        "note.open" => {
            exact_object(params, &["name"]).is_some_and(|values| bounded_string(values.get("name")))
        }
        "note.link" => exact_object(params, &["source", "target"]).is_some_and(|values| {
            bounded_string(values.get("source")) && bounded_string(values.get("target"))
        }),
        "daily.add" => {
            exact_object(params, &["text"]).is_some_and(|values| bounded_string(values.get("text")))
        }
        "project.switch" => exact_object(params, &["projectId"])
            .is_some_and(|values| bounded_string(values.get("projectId"))),
        _ => false,
    }
}

pub fn terminal_cli_request_error_code(
    request: &TerminalCliRequest,
    expected_nonce: &str,
) -> Option<&'static str> {
    if !valid_nonce(&request.nonce)
        || !valid_nonce(expected_nonce)
        || !constant_time_eq(&request.nonce, expected_nonce)
    {
        return Some("authentication_failed");
    }
    if request.protocol_version != PROTOCOL_VERSION {
        return Some("unsupported_version");
    }
    if !safe_atom(&request.request_id)
        || request
            .terminal_session_id
            .as_deref()
            .is_some_and(|value| !safe_atom(value))
        || request
            .pane_id
            .as_deref()
            .is_some_and(|value| !safe_atom(value))
        || request
            .project_id
            .as_deref()
            .is_some_and(|value| !safe_atom(value))
        || !METHODS.contains(&request.method.as_str())
        || !valid_json(&request.params, 0)
        || !valid_method_params(&request.method, &request.params)
    {
        return Some("invalid_request");
    }
    None
}

fn validate_response(response: &TerminalCliResponse) -> Result<(), String> {
    if !safe_atom(&response.request_id)
        || !RESPONSE_CODES.contains(&response.code.as_str())
        || response.ok != (response.code == "ok")
        || !safe_text(&response.message, 2_000)
        || response
            .data
            .as_ref()
            .is_some_and(|value| !valid_response_json(value, 0))
        || serde_json::to_vec(response)
            .map(|bytes| bytes.len() as u64 > MAX_WIRE_BYTES)
            .unwrap_or(true)
    {
        return Err("invalid terminal CLI response".into());
    }
    Ok(())
}

pub fn render_terminal_cli_response(
    response: &TerminalCliResponse,
    json_output: bool,
    color: bool,
) -> Result<String, String> {
    validate_response(response)?;
    if json_output {
        return serde_json::to_string(response).map_err(|error| format!("serialize: {error}"));
    }
    if color {
        let color_code = if response.ok { "32" } else { "31" };
        return Ok(format!("\u{1b}[{color_code}m{}\u{1b}[0m", response.message));
    }
    Ok(response.message.clone())
}

fn shell_quote(value: &Path) -> Result<String, String> {
    let value = value
        .to_str()
        .ok_or_else(|| "CLI path is not valid UTF-8".to_string())?;
    if value.chars().any(|ch| matches!(ch, '\0' | '\r' | '\n')) {
        return Err("CLI path contains control characters".into());
    }
    Ok(value.replace('\'', "'\"'\"'"))
}

pub fn windows_terminal_cli_shim(executable: &Path, endpoint: &Path) -> Result<String, String> {
    let executable = executable
        .to_str()
        .ok_or_else(|| "CLI executable path is not valid UTF-8".to_string())?;
    let endpoint = endpoint
        .to_str()
        .ok_or_else(|| "CLI endpoint path is not valid UTF-8".to_string())?;
    if [executable, endpoint].iter().any(|value| {
        value
            .chars()
            .any(|ch| matches!(ch, '\0' | '\r' | '\n' | '"'))
    }) {
        return Err("CLI path cannot be represented safely".into());
    }
    let executable = executable.replace('%', "%%");
    let endpoint = endpoint.replace('%', "%%");
    Ok(format!(
        "@echo off\r\n:: {MANAGED_MARKER}\r\nsetlocal DisableDelayedExpansion\r\n\"{executable}\" --vibespace-cli --endpoint \"{endpoint}\" %*\r\n"
    ))
}

pub fn unix_terminal_cli_shim(executable: &Path, endpoint: &Path) -> Result<String, String> {
    Ok(format!(
        "#!/usr/bin/env sh\n# {MANAGED_MARKER}\nexec '{}' --vibespace-cli --endpoint '{}' \"$@\"\n",
        shell_quote(executable)?,
        shell_quote(endpoint)?
    ))
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| format!("terminal CLI credential store unavailable: {error}"))
}

fn generate_nonce() -> Result<String, String> {
    let random = nanoid::nanoid!(96);
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("clock: {error}"))?
        .as_nanos();
    let mut digest = Sha256::new();
    digest.update(random.as_bytes());
    digest.update(time.to_le_bytes());
    digest.update(std::process::id().to_le_bytes());
    Ok(format!("{:x}", digest.finalize()))
}

fn write_endpoint(path: &Path, endpoint: &TerminalCliEndpoint) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "terminal CLI endpoint has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("endpoint directory: {error}"))?;
    let temporary = path.with_file_name(format!(
        ".endpoint.{}.{}.json.tmp",
        std::process::id(),
        nanoid::nanoid!(12)
    ));
    let bytes =
        serde_json::to_vec(endpoint).map_err(|error| format!("endpoint serialize: {error}"))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("endpoint create: {error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("endpoint write: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("endpoint flush: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("endpoint permissions: {error}"))?;
    }
    if let Err(error) = atomic_replace_file(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("endpoint replace: {error}"));
    }
    Ok(())
}

fn response(
    request_id: &str,
    ok: bool,
    code: &str,
    message: &str,
    data: Option<Value>,
) -> TerminalCliResponse {
    TerminalCliResponse {
        request_id: request_id.into(),
        ok,
        code: code.into(),
        message: message.into(),
        data,
    }
}

fn write_wire_response(
    stream: &mut TcpStream,
    response: &TerminalCliResponse,
) -> Result<(), String> {
    validate_response(response)?;
    let mut bytes =
        serde_json::to_vec(response).map_err(|error| format!("response serialize: {error}"))?;
    bytes.push(b'\n');
    stream
        .write_all(&bytes)
        .map_err(|error| format!("response write: {error}"))
}

pub fn read_terminal_cli_wire_line<R: BufRead>(
    reader: &mut R,
    maximum: usize,
) -> Result<String, String> {
    let limit = maximum
        .checked_add(2)
        .ok_or_else(|| "terminal CLI wire size limit is invalid".to_string())?;
    let mut bytes = Vec::with_capacity(maximum.min(8_192));
    reader
        .take(limit as u64)
        .read_until(b'\n', &mut bytes)
        .map_err(|error| format!("terminal CLI wire read failed: {error}"))?;
    if bytes.last() != Some(&b'\n') {
        return Err(if bytes.len() > maximum {
            "terminal CLI wire message exceeds size limit".into()
        } else {
            "terminal CLI wire message is incomplete".into()
        });
    }
    bytes.pop();
    if bytes.last() == Some(&b'\r') {
        bytes.pop();
    }
    if bytes.len() > maximum {
        return Err("terminal CLI wire message exceeds size limit".into());
    }
    String::from_utf8(bytes).map_err(|_| "terminal CLI wire message is not valid UTF-8".into())
}

fn handle_connection(
    mut stream: TcpStream,
    expected_nonce: &str,
    app: &tauri::AppHandle,
    pending: &Arc<Mutex<HashMap<String, SyncSender<TerminalCliResponse>>>>,
) -> Result<(), String> {
    stream
        .set_read_timeout(Some(RESPONSE_TIMEOUT))
        .map_err(|error| format!("read timeout: {error}"))?;
    stream
        .set_write_timeout(Some(RESPONSE_TIMEOUT))
        .map_err(|error| format!("write timeout: {error}"))?;
    let mut reader = BufReader::new(
        stream
            .try_clone()
            .map_err(|error| format!("stream clone: {error}"))?,
    );
    let line = read_terminal_cli_wire_line(&mut reader, MAX_WIRE_BYTES as usize)?;
    let request: TerminalCliRequest =
        serde_json::from_str(&line).map_err(|_| "invalid terminal CLI request JSON".to_string())?;
    if let Some(code) = terminal_cli_request_error_code(&request, expected_nonce) {
        let message = match code {
            "unsupported_version" => "This VibeSpace CLI protocol version is not supported.",
            "invalid_request" => "The terminal CLI request is invalid.",
            _ => "Terminal CLI authentication failed.",
        };
        let failure = response(&request.request_id, false, code, message, None);
        let _ = write_wire_response(&mut stream, &failure);
        return Err(code.into());
    }
    if request.method == "status" {
        return write_wire_response(
            &mut stream,
            &response(
                &request.request_id,
                true,
                "ok",
                "VibeSpace is running.",
                Some(json!({
                    "version": env!("CARGO_PKG_VERSION"),
                    "protocolVersion": PROTOCOL_VERSION
                })),
            ),
        );
    }
    if request.method == "help" {
        return write_wire_response(
            &mut stream,
            &response(
                &request.request_id,
                true,
                "ok",
                "Commands: context, skills, agent, note, daily, project, status, help.",
                Some(json!({ "methods": METHODS })),
            ),
        );
    }

    let (sender, receiver) = mpsc::sync_channel(1);
    {
        let mut map = pending
            .lock()
            .map_err(|_| "terminal CLI pending registry unavailable".to_string())?;
        if map.contains_key(&request.request_id) {
            return write_wire_response(
                &mut stream,
                &response(
                    &request.request_id,
                    false,
                    "conflict",
                    "Duplicate terminal CLI request.",
                    None,
                ),
            );
        }
        map.insert(request.request_id.clone(), sender);
    }
    let response_timeout = terminal_cli_response_timeout(&request.method);
    let event = TerminalCliFrontendRequest {
        protocol_version: request.protocol_version,
        request_id: request.request_id.clone(),
        terminal_session_id: request.terminal_session_id,
        pane_id: request.pane_id,
        project_id: request.project_id,
        method: request.method,
        params: request.params,
    };
    if let Err(error) = app.emit("jarvis:terminal-cli-request", event) {
        eprintln!("[terminal-cli] frontend route failed: {error}");
        pending
            .lock()
            .ok()
            .and_then(|mut map| map.remove(&request.request_id));
        return write_wire_response(
            &mut stream,
            &response(
                &request.request_id,
                false,
                "internal_error",
                "Could not route the terminal CLI request.",
                None,
            ),
        );
    }
    let result = receiver.recv_timeout(response_timeout).unwrap_or_else(|_| {
        response(
            &request.request_id,
            false,
            "internal_error",
            "VibeSpace did not complete the terminal CLI request in time.",
            None,
        )
    });
    pending
        .lock()
        .ok()
        .and_then(|mut map| map.remove(&request.request_id));
    write_wire_response(&mut stream, &result)
}

pub fn start_terminal_cli_server(
    app: &tauri::AppHandle,
    state: &TerminalCliState,
) -> Result<PathBuf, String> {
    let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0))
        .map_err(|error| format!("terminal CLI bind: {error}"))?;
    let address = listener
        .local_addr()
        .map_err(|error| format!("terminal CLI address: {error}"))?;
    let nonce = generate_nonce()?;
    keyring_entry()?
        .set_password(&nonce)
        .map_err(|error| format!("terminal CLI credential save failed: {error}"))?;
    let endpoint_path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("terminal CLI app data: {error}"))?
        .join("terminal-cli")
        .join("endpoint.json");
    write_endpoint(
        &endpoint_path,
        &TerminalCliEndpoint {
            protocol_version: PROTOCOL_VERSION,
            address: address.to_string(),
            keyring_service: KEYRING_SERVICE.into(),
            keyring_account: KEYRING_ACCOUNT.into(),
        },
    )?;
    *state
        .endpoint_path
        .lock()
        .map_err(|_| "terminal CLI endpoint state unavailable".to_string())? =
        Some(endpoint_path.clone());

    let app = app.clone();
    let pending = Arc::clone(&state.pending);
    let limiter = TerminalCliConnectionLimiter::new(MAX_ACTIVE_CONNECTIONS);
    std::thread::spawn(move || {
        for connection in listener.incoming() {
            let Ok(stream) = connection else {
                continue;
            };
            let Some(permit) = limiter.try_acquire() else {
                drop(stream);
                continue;
            };
            let app = app.clone();
            let pending = Arc::clone(&pending);
            let nonce = nonce.clone();
            std::thread::spawn(move || {
                let _permit = permit;
                if let Err(error) = handle_connection(stream, &nonce, &app, &pending) {
                    eprintln!("[terminal-cli] {error}");
                }
            });
        }
    });
    Ok(endpoint_path)
}

fn read_endpoint(path: &Path) -> Result<TerminalCliEndpoint, TerminalCliEndpointError> {
    let bytes = fs::read(path).map_err(|error| TerminalCliEndpointError {
        code: if error.kind() == std::io::ErrorKind::PermissionDenied {
            "permission_denied"
        } else {
            "app_not_running"
        },
        message: if error.kind() == std::io::ErrorKind::PermissionDenied {
            "The VibeSpace terminal CLI endpoint is not readable."
        } else {
            "VibeSpace is not running."
        },
    })?;
    if bytes.len() as u64 > MAX_WIRE_BYTES {
        return Err(TerminalCliEndpointError {
            code: "invalid_request",
            message: "The VibeSpace terminal CLI endpoint is invalid.",
        });
    }
    let endpoint: TerminalCliEndpoint =
        serde_json::from_slice(&bytes).map_err(|_| TerminalCliEndpointError {
            code: "invalid_request",
            message: "The VibeSpace terminal CLI endpoint is invalid.",
        })?;
    if endpoint.protocol_version != PROTOCOL_VERSION {
        return Err(TerminalCliEndpointError {
            code: "unsupported_version",
            message: "This VibeSpace CLI protocol version is not supported.",
        });
    }
    if endpoint.keyring_service != KEYRING_SERVICE || endpoint.keyring_account != KEYRING_ACCOUNT {
        return Err(TerminalCliEndpointError {
            code: "authentication_failed",
            message: "The VibeSpace terminal CLI endpoint identity is invalid.",
        });
    }
    let address: SocketAddr = endpoint
        .address
        .parse()
        .map_err(|_| TerminalCliEndpointError {
            code: "invalid_request",
            message: "The VibeSpace terminal CLI endpoint address is invalid.",
        })?;
    if address.ip() != IpAddr::V4(Ipv4Addr::LOCALHOST) {
        return Err(TerminalCliEndpointError {
            code: "invalid_request",
            message: "The VibeSpace terminal CLI endpoint is not loopback-only.",
        });
    }
    Ok(endpoint)
}

fn request_id() -> Result<String, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("clock: {error}"))?
        .as_nanos();
    Ok(format!("cli-{}-{nanos}", std::process::id()))
}

fn send_terminal_cli_request(invocation: &TerminalCliInvocation) -> TerminalCliResponse {
    let id = request_id().unwrap_or_else(|_| format!("cli-{}", std::process::id()));
    let endpoint = match read_endpoint(&invocation.endpoint) {
        Ok(endpoint) => endpoint,
        Err(error) => {
            return response(&id, false, error.code, error.message, None);
        }
    };
    let nonce = match keyring_entry().and_then(|entry| {
        entry
            .get_password()
            .map_err(|error| format!("terminal CLI credential read failed: {error}"))
    }) {
        Ok(nonce) => nonce,
        Err(message) => {
            return response(&id, false, "authentication_failed", &message, None);
        }
    };
    let request = match build_terminal_cli_request(invocation, &nonce, &id) {
        Ok(request) => request,
        Err(message) => return response(&id, false, "invalid_request", &message, None),
    };
    let address: SocketAddr = match endpoint.address.parse() {
        Ok(address) => address,
        Err(_) => {
            return response(
                &id,
                false,
                "app_not_running",
                "VibeSpace is not running.",
                None,
            )
        }
    };
    let mut stream = match TcpStream::connect_timeout(&address, CONNECT_TIMEOUT) {
        Ok(stream) => stream,
        Err(_) => {
            return response(
                &id,
                false,
                "app_not_running",
                "VibeSpace is not running.",
                None,
            )
        }
    };
    let _ = stream.set_read_timeout(Some(terminal_cli_response_timeout(&request.method)));
    let _ = stream.set_write_timeout(Some(RESPONSE_TIMEOUT));
    let mut bytes = match serde_json::to_vec(&request) {
        Ok(bytes) => bytes,
        Err(error) => {
            return response(
                &id,
                false,
                "invalid_request",
                &format!("Could not encode request: {error}"),
                None,
            )
        }
    };
    bytes.push(b'\n');
    if stream.write_all(&bytes).is_err() {
        return response(
            &id,
            false,
            "app_not_running",
            "VibeSpace is not running.",
            None,
        );
    }
    let output =
        match read_terminal_cli_wire_line(&mut BufReader::new(stream), MAX_WIRE_BYTES as usize) {
            Ok(output) => output,
            Err(_) => {
                return response(
                    &id,
                    false,
                    "internal_error",
                    "VibeSpace returned an invalid terminal CLI response.",
                    None,
                )
            }
        };
    match serde_json::from_str::<TerminalCliResponse>(&output) {
        Ok(response) if validate_response(&response).is_ok() && response.request_id == id => {
            response
        }
        _ => response(
            &id,
            false,
            "internal_error",
            "VibeSpace returned an invalid terminal CLI response.",
            None,
        ),
    }
}

pub fn run_terminal_cli(args: &[String]) -> i32 {
    let invocation = match parse_terminal_cli_args(args) {
        Ok(invocation) => invocation,
        Err(message) => {
            eprintln!("{message}");
            return 2;
        }
    };
    let response = send_terminal_cli_request(&invocation);
    let rendered = render_terminal_cli_response(&response, invocation.json, invocation.color)
        .unwrap_or_else(|_| "VibeSpace returned an invalid terminal CLI response.".into());
    if response.ok {
        println!("{rendered}");
        0
    } else {
        eprintln!("{rendered}");
        match response.code.as_str() {
            "app_not_running" => 3,
            "authentication_failed" => 4,
            "invalid_request" | "unsupported_version" => 2,
            _ => 1,
        }
    }
}

fn terminal_cli_paths() -> Result<(PathBuf, [&'static str; 2]), String> {
    #[cfg(target_os = "windows")]
    {
        let home = std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .ok_or_else(|| "USERPROFILE is unavailable".to_string())?;
        return Ok((
            home.join(".jarvis").join("bin"),
            ["vibespace.cmd", "vs.cmd"],
        ));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "HOME is unavailable".to_string())?;
        Ok((home.join(".jarvis").join("bin"), ["vibespace", "vs"]))
    }
}

fn expected_shim(executable: &Path, endpoint: &Path) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        windows_terminal_cli_shim(executable, endpoint)
    }
    #[cfg(not(target_os = "windows"))]
    {
        unix_terminal_cli_shim(executable, endpoint)
    }
}

fn managed_file(path: &Path) -> Result<bool, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(content.lines().take(2).any(|line| {
            matches!(
                line,
                "# VIBESPACE_CLI_MANAGED_V1" | ":: VIBESPACE_CLI_MANAGED_V1"
            )
        })),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("CLI shim read failed: {error}")),
    }
}

#[cfg(target_os = "windows")]
fn atomic_replace_file(temporary: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let temporary_wide = temporary
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination_wide = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    unsafe {
        MoveFileExW(
            PCWSTR(temporary_wide.as_ptr()),
            PCWSTR(destination_wide.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "windows"))]
fn atomic_replace_file(temporary: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(temporary, destination).map_err(|error| error.to_string())
}

pub fn replace_managed_terminal_cli_shim(path: &Path, content: &str) -> Result<(), String> {
    if path.exists() && !managed_file(path)? {
        return Err(format!(
            "Refusing to replace user-owned CLI file: {}",
            path.display()
        ));
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "CLI shim path has no valid file name".to_string())?;
    let temporary = path.with_file_name(format!(
        ".{file_name}.{}.{}.tmp",
        std::process::id(),
        nanoid::nanoid!(12)
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("CLI shim create: {error}"))?;
    file.write_all(content.as_bytes())
        .map_err(|error| format!("CLI shim write: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("CLI shim flush: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o755))
            .map_err(|error| format!("CLI shim permissions: {error}"))?;
    }
    if let Err(error) = atomic_replace_file(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("CLI shim replace: {error}"));
    }
    Ok(())
}

pub fn replace_managed_terminal_cli_aliases(
    paths: &[PathBuf],
    content: &str,
) -> Result<(), String> {
    let mut originals = Vec::with_capacity(paths.len());
    for path in paths {
        if path.exists() && !managed_file(path)? {
            return Err(format!(
                "Refusing to replace user-owned CLI file: {}",
                path.display()
            ));
        }
        originals.push(if path.exists() {
            Some(
                fs::read_to_string(path)
                    .map_err(|error| format!("CLI shim backup read failed: {error}"))?,
            )
        } else {
            None
        });
    }

    for (index, path) in paths.iter().enumerate() {
        if let Err(install_error) = replace_managed_terminal_cli_shim(path, content) {
            let mut rollback_errors = Vec::new();
            for rollback_index in (0..index).rev() {
                let rollback_path = &paths[rollback_index];
                let rollback = match &originals[rollback_index] {
                    Some(previous) => replace_managed_terminal_cli_shim(rollback_path, previous),
                    None => match fs::remove_file(rollback_path) {
                        Ok(()) => Ok(()),
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                        Err(error) => Err(format!("CLI shim rollback removal failed: {error}")),
                    },
                };
                if let Err(error) = rollback {
                    rollback_errors.push(format!("{}: {error}", rollback_path.display()));
                }
            }
            if rollback_errors.is_empty() {
                return Err(install_error);
            }
            return Err(format!(
                "{install_error}; rollback also failed for {}",
                rollback_errors.join(", ")
            ));
        }
    }
    Ok(())
}

pub fn remove_managed_terminal_cli_aliases(paths: &[PathBuf]) -> Result<(), String> {
    for path in paths {
        if path.exists() && !managed_file(path)? {
            return Err(format!(
                "Refusing to remove user-owned CLI file: {}",
                path.display()
            ));
        }
    }

    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::with_capacity(paths.len());
    for path in paths {
        if !path.exists() {
            continue;
        }
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "CLI shim path has no valid file name".to_string())?;
        let temporary = path.with_file_name(format!(
            ".{file_name}.{}.{}.removing",
            std::process::id(),
            nanoid::nanoid!(12)
        ));
        if let Err(remove_error) = fs::rename(path, &temporary) {
            let mut rollback_errors = Vec::new();
            for (original, moved_path) in moved.iter().rev() {
                if let Err(error) = fs::rename(moved_path, original) {
                    rollback_errors.push(format!("{}: {error}", original.display()));
                }
            }
            if rollback_errors.is_empty() {
                return Err(format!("CLI shim removal failed: {remove_error}"));
            }
            return Err(format!(
                "CLI shim removal failed: {remove_error}; rollback also failed for {}",
                rollback_errors.join(", ")
            ));
        }
        moved.push((path.clone(), temporary));
    }

    for (_, temporary) in moved {
        if let Err(error) = fs::remove_file(&temporary) {
            eprintln!(
                "[terminal-cli] removed alias but could not clean up {}: {error}",
                temporary.display()
            );
        }
    }
    Ok(())
}

fn cli_install_status(state: &TerminalCliState) -> Result<TerminalCliInstallStatus, String> {
    let endpoint = state
        .endpoint_path
        .lock()
        .map_err(|_| "terminal CLI endpoint state unavailable".to_string())?
        .clone()
        .ok_or_else(|| "terminal CLI endpoint is not ready".to_string())?;
    let executable =
        std::env::current_exe().map_err(|error| format!("current executable: {error}"))?;
    let expected = expected_shim(&executable, &endpoint)?;
    let (bin_dir, names) = terminal_cli_paths()?;
    let installed = names.iter().all(|name| {
        fs::read_to_string(bin_dir.join(name)).is_ok_and(|content| content == expected)
    });
    Ok(TerminalCliInstallStatus {
        installed,
        bin_dir: bin_dir.to_string_lossy().into_owned(),
        command_names: ["vibespace", "vs"],
    })
}

#[tauri::command]
pub fn terminal_cli_install_status(
    state: tauri::State<'_, TerminalCliState>,
) -> Result<TerminalCliInstallStatus, String> {
    cli_install_status(&state)
}

#[tauri::command]
pub fn terminal_cli_install(
    state: tauri::State<'_, TerminalCliState>,
) -> Result<TerminalCliInstallStatus, String> {
    let endpoint = state
        .endpoint_path
        .lock()
        .map_err(|_| "terminal CLI endpoint state unavailable".to_string())?
        .clone()
        .ok_or_else(|| "terminal CLI endpoint is not ready".to_string())?;
    let executable =
        std::env::current_exe().map_err(|error| format!("current executable: {error}"))?;
    let content = expected_shim(&executable, &endpoint)?;
    let (bin_dir, names) = terminal_cli_paths()?;
    fs::create_dir_all(&bin_dir).map_err(|error| format!("CLI bin directory: {error}"))?;
    let paths = names.map(|name| bin_dir.join(name));
    replace_managed_terminal_cli_aliases(&paths, &content)?;
    cli_install_status(&state)
}

#[tauri::command]
pub fn terminal_cli_uninstall(
    state: tauri::State<'_, TerminalCliState>,
) -> Result<TerminalCliInstallStatus, String> {
    let (bin_dir, names) = terminal_cli_paths()?;
    let paths = names.map(|name| bin_dir.join(name));
    remove_managed_terminal_cli_aliases(&paths)?;
    cli_install_status(&state)
}

#[tauri::command]
pub fn terminal_cli_respond(
    state: tauri::State<'_, TerminalCliState>,
    response: TerminalCliResponse,
) -> Result<(), String> {
    validate_response(&response)?;
    let sender = state
        .pending
        .lock()
        .map_err(|_| "terminal CLI pending registry unavailable".to_string())?
        .remove(&response.request_id)
        .ok_or_else(|| "terminal CLI request is no longer pending".to_string())?;
    sender
        .send(response)
        .map_err(|_| "terminal CLI request receiver is unavailable".to_string())
}
