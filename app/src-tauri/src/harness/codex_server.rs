use crate::cli_bridge::CliBridgeState;
use crate::harness::managed_codex_app_server::{
    codex_app_server_handshake, CodexAppServerFrameDecoder, CODEX_APP_SERVER_MAX_FRAME_BYTES,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::VecDeque;
use std::io::{BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Webview};

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const READER_CHANNEL_CAPACITY: usize = 256;
const READER_CHUNK_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodexAppServerStartRequest {
    executable_id: String,
    owner_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAppServerStartResponse {
    generation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CodexAppServerStreamMessage {
    Frame { frame: Value },
    Done,
    Error { message: &'static str },
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CodexLaunchRequest {
    executable: PathBuf,
    arguments: [String; 2],
}

fn valid_identifier(value: &str, maximum_bytes: usize) -> bool {
    let mut bytes = value.bytes();
    matches!(bytes.next(), Some(first) if first.is_ascii_alphanumeric())
        && value.len() <= maximum_bytes
        && bytes.all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'@' | b'/' | b'-')
        })
}

fn caller_allowed(label: &str) -> bool {
    matches!(label, "main" | "workbench-main")
}

fn validate_start_request(
    caller_label: &str,
    request: &CodexAppServerStartRequest,
) -> Result<(), String> {
    if !caller_allowed(caller_label) {
        return Err("Codex app-server caller is not authorized.".to_string());
    }
    if !valid_identifier(&request.executable_id, 256) {
        return Err("Codex executable identity is invalid.".to_string());
    }
    if !valid_identifier(&request.owner_id, 256) {
        return Err("Codex owner identity is invalid.".to_string());
    }
    Ok(())
}

fn is_codex_executable(executable: &std::path::Path) -> bool {
    let name = executable
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        name.as_str(),
        "codex" | "codex.exe" | "codex-x86_64-pc-windows-msvc.exe"
    )
}

fn resolve_launch_request<F>(executable_id: &str, resolver: F) -> Result<CodexLaunchRequest, String>
where
    F: FnOnce(&str) -> Result<PathBuf, String>,
{
    if !valid_identifier(executable_id, 256) {
        return Err("Codex executable identity is invalid.".to_string());
    }
    let executable = resolver(executable_id)?;
    if !executable.is_absolute() || !is_codex_executable(&executable) {
        return Err("Codex app-server requires a trusted Codex executable.".to_string());
    }
    Ok(CodexLaunchRequest {
        executable,
        arguments: ["app-server".to_string(), "--stdio".to_string()],
    })
}

fn encode_outbound_frame(message: &Value) -> Result<Vec<u8>, String> {
    if !message.is_object() {
        return Err("Codex app-server message must be a JSON object.".to_string());
    }
    let mut bytes = serde_json::to_vec(message)
        .map_err(|_| "Codex app-server message could not be encoded.".to_string())?;
    if bytes.is_empty() || bytes.len() > CODEX_APP_SERVER_MAX_FRAME_BYTES {
        return Err("Codex app-server message exceeded its safe bound.".to_string());
    }
    bytes.push(b'\n');
    Ok(bytes)
}

struct HandshakeOutcome {
    buffered_frames: Vec<Value>,
    decoder: CodexAppServerFrameDecoder,
}

fn perform_start_handshake<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    client_version: &str,
) -> Result<HandshakeOutcome, String> {
    let handshake = codex_app_server_handshake(1, client_version)
        .map_err(|_| "Codex app-server handshake could not be created.".to_string())?;
    writer
        .write_all(&handshake.initialize)
        .and_then(|_| writer.flush())
        .map_err(|_| "Codex app-server initialize request could not be written.".to_string())?;

    let mut decoder = CodexAppServerFrameDecoder::default();
    let mut buffered_frames = Vec::new();
    let mut chunk = [0_u8; READER_CHUNK_BYTES];
    let initialized = loop {
        let count = reader
            .read(&mut chunk)
            .map_err(|_| "Codex app-server initialize response could not be read.".to_string())?;
        if count == 0 {
            break false;
        }
        let frames = decoder
            .push(&chunk[..count])
            .map_err(|_| "Codex app-server initialize response was invalid.".to_string())?;
        let mut matched = false;
        for frame in frames {
            if frame.get("id").and_then(Value::as_u64) == Some(1) {
                if frame.get("error").is_some()
                    || !frame.get("result").is_some_and(Value::is_object)
                {
                    return Err("Codex app-server rejected initialization.".to_string());
                }
                matched = true;
            } else {
                buffered_frames.push(frame);
            }
        }
        if matched {
            break true;
        }
    };
    if !initialized {
        return Err("Codex app-server ended before initialization.".to_string());
    }
    writer
        .write_all(&handshake.initialized)
        .and_then(|_| writer.flush())
        .map_err(|_| {
            "Codex app-server initialized notification could not be written.".to_string()
        })?;
    Ok(HandshakeOutcome {
        buffered_frames,
        decoder,
    })
}

trait OwnedCodexProcess: Send {
    fn has_exited(&mut self) -> Result<bool, String>;
    fn terminate(&mut self) -> Result<(), String>;
}

struct ProductionProcess {
    child: Arc<Mutex<Child>>,
    terminated: bool,
}

impl OwnedCodexProcess for ProductionProcess {
    fn has_exited(&mut self) -> Result<bool, String> {
        self.child
            .lock()
            .map_err(|_| "Codex app-server process state is unavailable.".to_string())?
            .try_wait()
            .map(|status| status.is_some())
            .map_err(|_| "Codex app-server process status could not be read.".to_string())
    }

    fn terminate(&mut self) -> Result<(), String> {
        if self.terminated {
            return Ok(());
        }
        let mut child = self
            .child
            .lock()
            .map_err(|_| "Codex app-server process state is unavailable.".to_string())?;
        if child
            .try_wait()
            .map_err(|_| "Codex app-server process status could not be read.".to_string())?
            .is_none()
        {
            child
                .kill()
                .map_err(|_| "Codex app-server process could not be terminated.".to_string())?;
        }
        child
            .wait()
            .map_err(|_| "Codex app-server process could not be reaped.".to_string())?;
        self.terminated = true;
        Ok(())
    }
}

struct OwnedProcessGuard {
    process: Box<dyn OwnedCodexProcess>,
    stopped: bool,
}

impl OwnedProcessGuard {
    fn new(process: Box<dyn OwnedCodexProcess>) -> Self {
        Self {
            process,
            stopped: false,
        }
    }

    fn has_exited(&mut self) -> Result<bool, String> {
        self.process.has_exited()
    }

    fn stop(&mut self) -> Result<(), String> {
        if self.stopped {
            return Ok(());
        }
        self.process.terminate()?;
        self.stopped = true;
        Ok(())
    }
}

impl Drop for OwnedProcessGuard {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

enum ReaderMessage {
    Frame(Value),
    Done,
    Error,
}

struct ActiveStream {
    stream_id: String,
    caller_label: String,
    cancelled: Arc<AtomicBool>,
    task: Option<thread::JoinHandle<()>>,
}

pub struct RunningCodexServer {
    executable_id: String,
    caller_label: String,
    owner_id: String,
    generation: String,
    stdin: Option<Arc<Mutex<ChildStdin>>>,
    receiver: Option<mpsc::Receiver<ReaderMessage>>,
    buffered_frames: VecDeque<Value>,
    reader_task: Option<thread::JoinHandle<()>>,
    stderr_task: Option<thread::JoinHandle<()>>,
    active_stream: Option<ActiveStream>,
    process: OwnedProcessGuard,
    stopped: bool,
}

impl RunningCodexServer {
    #[cfg(test)]
    fn new_for_test(
        executable_id: &str,
        caller_label: &str,
        owner_id: &str,
        generation: &str,
        process: Box<dyn OwnedCodexProcess>,
    ) -> Self {
        Self {
            executable_id: executable_id.to_string(),
            caller_label: caller_label.to_string(),
            owner_id: owner_id.to_string(),
            generation: generation.to_string(),
            stdin: None,
            receiver: None,
            buffered_frames: VecDeque::new(),
            reader_task: None,
            stderr_task: None,
            active_stream: None,
            process: OwnedProcessGuard::new(process),
            stopped: false,
        }
    }

    fn stop_owned(&mut self) -> Result<(), String> {
        if self.stopped {
            return Ok(());
        }
        if let Some(active) = self.active_stream.as_mut() {
            active.cancelled.store(true, Ordering::Release);
            active.task.take();
        }
        self.active_stream = None;
        self.receiver.take();
        self.stdin.take();
        let result = self.process.stop();
        self.reader_task.take();
        self.stderr_task.take();
        self.stopped = true;
        result
    }
}

impl Drop for RunningCodexServer {
    fn drop(&mut self) {
        let _ = self.stop_owned();
    }
}

#[derive(Default)]
struct ControllerInner {
    running: Option<RunningCodexServer>,
}

#[derive(Default)]
pub struct CodexAppServerState {
    inner: Mutex<ControllerInner>,
}

fn stop_running(
    running: &mut Option<RunningCodexServer>,
    caller_label: &str,
    generation: &str,
) -> Result<bool, String> {
    let Some(current) = running.as_ref() else {
        return Ok(false);
    };
    if current.caller_label != caller_label || current.generation != generation {
        return Ok(false);
    }
    let mut current = running.take().expect("checked above");
    current.stop_owned()?;
    Ok(true)
}

fn spawn_stdout_reader<R: Read + Send + 'static>(
    mut reader: R,
    mut decoder: CodexAppServerFrameDecoder,
    sender: mpsc::SyncSender<ReaderMessage>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut chunk = [0_u8; READER_CHUNK_BYTES];
        loop {
            let count = match reader.read(&mut chunk) {
                Ok(count) => count,
                Err(_) => {
                    let _ = sender.send(ReaderMessage::Error);
                    return;
                }
            };
            if count == 0 {
                let terminal = if decoder.finish().is_ok() {
                    ReaderMessage::Done
                } else {
                    ReaderMessage::Error
                };
                let _ = sender.send(terminal);
                return;
            }
            let frames = match decoder.push(&chunk[..count]) {
                Ok(frames) => frames,
                Err(_) => {
                    let _ = sender.send(ReaderMessage::Error);
                    return;
                }
            };
            for frame in frames {
                if sender.send(ReaderMessage::Frame(frame)).is_err() {
                    return;
                }
            }
        }
    })
}

fn spawn_stderr_drain<R: Read + Send + 'static>(mut stderr: R) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut chunk = [0_u8; 8 * 1024];
        loop {
            match stderr.read(&mut chunk) {
                Ok(0) | Err(_) => return,
                Ok(_) => {}
            }
        }
    })
}

fn launch_server(
    launch: CodexLaunchRequest,
    executable_id: String,
    caller_label: String,
    owner_id: String,
) -> Result<RunningCodexServer, String> {
    let mut command = Command::new(&launch.executable);
    command
        .args(&launch.arguments)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Codex app-server process could not be started.".to_string())?;
    let mut stdin = match child.stdin.take() {
        Some(stdin) => stdin,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Codex app-server stdin is unavailable.".to_string());
        }
    };
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Codex app-server stdout is unavailable.".to_string());
        }
    };
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Codex app-server stderr is unavailable.".to_string());
        }
    };

    let child = Arc::new(Mutex::new(child));
    let mut process = OwnedProcessGuard::new(Box::new(ProductionProcess {
        child: child.clone(),
        terminated: false,
    }));
    let stderr_task = spawn_stderr_drain(stderr);
    let (watchdog_cancel, watchdog_receiver) = mpsc::sync_channel(1);
    let watchdog_child = child.clone();
    let watchdog = thread::spawn(move || {
        if watchdog_receiver.recv_timeout(HANDSHAKE_TIMEOUT).is_err() {
            if let Ok(mut child) = watchdog_child.lock() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
    let mut reader = BufReader::new(stdout);
    let handshake = perform_start_handshake(&mut reader, &mut stdin, env!("CARGO_PKG_VERSION"));
    let _ = watchdog_cancel.send(());
    let _ = watchdog.join();
    let handshake = match handshake {
        Ok(handshake) => handshake,
        Err(error) => {
            let _ = process.stop();
            let _ = stderr_task.join();
            return Err(error);
        }
    };

    let (sender, receiver) = mpsc::sync_channel(READER_CHANNEL_CAPACITY);
    let reader_task = spawn_stdout_reader(reader, handshake.decoder, sender);
    Ok(RunningCodexServer {
        executable_id,
        caller_label,
        owner_id,
        generation: format!("codex-generation-{}", nanoid::nanoid!(20)),
        stdin: Some(Arc::new(Mutex::new(stdin))),
        receiver: Some(receiver),
        buffered_frames: handshake.buffered_frames.into(),
        reader_task: Some(reader_task),
        stderr_task: Some(stderr_task),
        active_stream: None,
        process,
        stopped: false,
    })
}

fn start_internal(
    app: &AppHandle,
    caller_label: &str,
    request: CodexAppServerStartRequest,
) -> Result<CodexAppServerStartResponse, String> {
    validate_start_request(caller_label, &request)?;
    let state = app.state::<CodexAppServerState>();
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Codex app-server state is unavailable.".to_string())?;
    if let Some(running) = inner.running.as_mut() {
        if !running.process.has_exited()? {
            if running.executable_id == request.executable_id
                && running.caller_label == caller_label
                && running.owner_id == request.owner_id
            {
                return Ok(CodexAppServerStartResponse {
                    generation: running.generation.clone(),
                });
            }
            return Err("Codex app-server is already active for another owner.".to_string());
        }
    }
    inner.running.take();

    let cli_state = app.state::<CliBridgeState>();
    let launch = resolve_launch_request(&request.executable_id, |executable_id| {
        cli_state.resolve_trusted_executable(executable_id)
    })?;
    let running = launch_server(
        launch,
        request.executable_id,
        caller_label.to_string(),
        request.owner_id,
    )?;
    let generation = running.generation.clone();
    inner.running = Some(running);
    Ok(CodexAppServerStartResponse { generation })
}

#[tauri::command]
pub async fn codex_app_server_start(
    app: AppHandle,
    webview: Webview,
    request: CodexAppServerStartRequest,
) -> Result<CodexAppServerStartResponse, String> {
    validate_start_request(webview.label(), &request)?;
    let caller_label = webview.label().to_string();
    tauri::async_runtime::spawn_blocking(move || start_internal(&app, &caller_label, request))
        .await
        .map_err(|_| "Codex app-server start worker failed.".to_string())?
}

#[tauri::command]
pub fn codex_app_server_stream(
    webview: Webview,
    state: tauri::State<'_, CodexAppServerState>,
    generation: String,
    stream_id: String,
    on_event: Channel<CodexAppServerStreamMessage>,
) -> Result<(), String> {
    if !caller_allowed(webview.label()) {
        return Err("Codex app-server caller is not authorized.".to_string());
    }
    if !valid_identifier(&generation, 256) || !valid_identifier(&stream_id, 128) {
        return Err("Codex app-server stream identity is invalid.".to_string());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Codex app-server state is unavailable.".to_string())?;
    let running = inner
        .running
        .as_mut()
        .ok_or_else(|| "Codex app-server is unavailable.".to_string())?;
    if running.generation != generation
        || running.caller_label != webview.label()
        || running.process.has_exited()?
    {
        return Err("Codex app-server generation is unavailable.".to_string());
    }
    if running.active_stream.is_some() {
        return Err("Codex app-server stream is already active.".to_string());
    }
    let receiver = running
        .receiver
        .take()
        .ok_or_else(|| "Codex app-server stream is unavailable.".to_string())?;
    let buffered_frames = std::mem::take(&mut running.buffered_frames);
    let cancelled = Arc::new(AtomicBool::new(false));
    let task_cancelled = cancelled.clone();
    let task = thread::spawn(move || {
        for frame in buffered_frames {
            if task_cancelled.load(Ordering::Acquire)
                || on_event
                    .send(CodexAppServerStreamMessage::Frame { frame })
                    .is_err()
            {
                return;
            }
        }
        loop {
            if task_cancelled.load(Ordering::Acquire) {
                let _ = on_event.send(CodexAppServerStreamMessage::Done);
                return;
            }
            match receiver.recv_timeout(Duration::from_millis(50)) {
                Ok(ReaderMessage::Frame(frame)) => {
                    if on_event
                        .send(CodexAppServerStreamMessage::Frame { frame })
                        .is_err()
                    {
                        return;
                    }
                }
                Ok(ReaderMessage::Done) => {
                    let _ = on_event.send(CodexAppServerStreamMessage::Done);
                    return;
                }
                Ok(ReaderMessage::Error) => {
                    let _ = on_event.send(CodexAppServerStreamMessage::Error {
                        message: "Codex app-server stream failed.",
                    });
                    return;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    let _ = on_event.send(CodexAppServerStreamMessage::Done);
                    return;
                }
            }
        }
    });
    running.active_stream = Some(ActiveStream {
        stream_id,
        caller_label: webview.label().to_string(),
        cancelled,
        task: Some(task),
    });
    Ok(())
}

#[tauri::command]
pub fn codex_app_server_write(
    webview: Webview,
    state: tauri::State<'_, CodexAppServerState>,
    generation: String,
    message: Value,
) -> Result<(), String> {
    if !caller_allowed(webview.label()) {
        return Err("Codex app-server caller is not authorized.".to_string());
    }
    if !valid_identifier(&generation, 256) {
        return Err("Codex app-server generation is invalid.".to_string());
    }
    let frame = encode_outbound_frame(&message)?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Codex app-server state is unavailable.".to_string())?;
    let running = inner
        .running
        .as_mut()
        .ok_or_else(|| "Codex app-server is unavailable.".to_string())?;
    if running.generation != generation
        || running.caller_label != webview.label()
        || running.process.has_exited()?
    {
        return Err("Codex app-server generation is unavailable.".to_string());
    }
    let active = running
        .active_stream
        .as_ref()
        .ok_or_else(|| "Codex app-server stream must be subscribed before writes.".to_string())?;
    if active.caller_label != webview.label() || active.stream_id.is_empty() {
        return Err("Codex app-server stream owner is unavailable.".to_string());
    }
    let stdin = running
        .stdin
        .as_ref()
        .ok_or_else(|| "Codex app-server stdin is unavailable.".to_string())?;
    let mut writer = stdin
        .lock()
        .map_err(|_| "Codex app-server stdin is unavailable.".to_string())?;
    writer
        .write_all(&frame)
        .and_then(|_| writer.flush())
        .map_err(|_| "Codex app-server message could not be written.".to_string())
}

#[tauri::command]
pub fn codex_app_server_stop(
    webview: Webview,
    state: tauri::State<'_, CodexAppServerState>,
    generation: String,
) -> Result<bool, String> {
    if !caller_allowed(webview.label()) {
        return Err("Codex app-server caller is not authorized.".to_string());
    }
    if !valid_identifier(&generation, 256) {
        return Err("Codex app-server generation is invalid.".to_string());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Codex app-server state is unavailable.".to_string())?;
    stop_running(&mut inner.running, webview.label(), &generation)
}

pub fn shutdown_owned_server(app: &AppHandle) {
    let state = app.state::<CodexAppServerState>();
    if let Ok(mut inner) = state.inner.lock() {
        if let Some(mut running) = inner.running.take() {
            let _ = running.stop_owned();
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::managed_codex_app_server::{
        CodexAppServerFrameDecoder, CODEX_APP_SERVER_MAX_FRAME_BYTES,
    };
    use serde_json::json;
    use std::io::{BufReader, Cursor};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    #[derive(Debug)]
    struct RecordingProcess {
        terminated: Arc<AtomicBool>,
    }

    impl OwnedCodexProcess for RecordingProcess {
        fn has_exited(&mut self) -> Result<bool, String> {
            Ok(false)
        }

        fn terminate(&mut self) -> Result<(), String> {
            self.terminated.store(true, Ordering::Release);
            Ok(())
        }
    }

    #[test]
    fn start_request_accepts_only_a_trusted_executable_id_and_valid_owner() {
        let request: CodexAppServerStartRequest = serde_json::from_value(json!({
            "executableId": "cli-executable-0000000000000001",
            "ownerId": "chat_session-01",
        }))
        .expect("valid start request");
        assert_eq!(request.executable_id, "cli-executable-0000000000000001");
        assert_eq!(request.owner_id, "chat_session-01");
        assert!(validate_start_request("main", &request).is_ok());

        assert!(serde_json::from_value::<CodexAppServerStartRequest>(json!({
            "executableId": "cli-executable-0000000000000001",
            "ownerId": "chat_session-01",
            "executablePath": "C:\\untrusted\\codex.exe",
        }))
        .is_err());
        for (caller, executable_id, owner_id) in [
            (
                "pet-overlay",
                "cli-executable-0000000000000001",
                "chat_session-01",
            ),
            ("main", "../codex.exe", "chat_session-01"),
            ("main", "cli-executable-0000000000000001", "bad owner"),
            ("main", "cli-executable-0000000000000001", ""),
        ] {
            assert!(validate_start_request(
                caller,
                &CodexAppServerStartRequest {
                    executable_id: executable_id.to_string(),
                    owner_id: owner_id.to_string(),
                },
            )
            .is_err());
        }
    }

    #[test]
    fn trusted_resolver_output_is_the_only_executable_used_for_launch() {
        let trusted = PathBuf::from(r"C:\Program Files\Codex\codex.exe");
        let launch = resolve_launch_request("cli-executable-0000000000000001", |executable_id| {
            assert_eq!(executable_id, "cli-executable-0000000000000001");
            Ok(trusted.clone())
        })
        .expect("trusted launch");

        assert_eq!(launch.executable, trusted);
        assert_eq!(launch.arguments, ["app-server", "--stdio"]);
        assert!(resolve_launch_request("cli-executable-missing", |_| {
            Err("executableId is not registered".to_string())
        })
        .is_err());
    }

    #[test]
    fn initialize_response_is_required_before_initialized_and_stream_frames() {
        let stdout = Cursor::new(
            br#"{"method":"server/progress","params":{"message":"queued"}}
{"id":1,"result":{"userAgent":"codex-cli"}}
"#,
        );
        let mut reader = BufReader::new(stdout);
        let mut stdin = Vec::new();

        let handshake =
            perform_start_handshake(&mut reader, &mut stdin, "1.5.0").expect("valid handshake");
        let writes = String::from_utf8(stdin).expect("utf8 JSONL");
        let lines = writes.lines().collect::<Vec<_>>();
        assert_eq!(lines.len(), 2);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(lines[0]).unwrap()["method"],
            "initialize"
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(lines[1]).unwrap()["method"],
            "initialized"
        );
        assert_eq!(handshake.buffered_frames.len(), 1);
        assert_eq!(handshake.buffered_frames[0]["method"], "server/progress");

        let mut rejected_reader = BufReader::new(Cursor::new(
            br#"{"id":1,"error":{"message":"denied"}}
"#,
        ));
        let mut rejected_stdin = Vec::new();
        assert!(
            perform_start_handshake(&mut rejected_reader, &mut rejected_stdin, "1.5.0").is_err()
        );
        assert_eq!(
            String::from_utf8(rejected_stdin).unwrap().lines().count(),
            1
        );
    }

    #[test]
    fn outbound_json_frames_are_objects_newline_delimited_and_bounded() {
        assert_eq!(
            encode_outbound_frame(&json!({"method":"model/list","id":2})).unwrap(),
            b"{\"id\":2,\"method\":\"model/list\"}\n"
        );
        assert!(encode_outbound_frame(&json!(["not", "an", "object"])).is_err());
        assert!(encode_outbound_frame(&json!({
            "method": "oversized",
            "params": {"value": "x".repeat(CODEX_APP_SERVER_MAX_FRAME_BYTES)},
        }))
        .is_err());
    }

    #[test]
    fn stop_requires_the_exact_owner_and_generation_and_is_idempotent() {
        let terminated = Arc::new(AtomicBool::new(false));
        let mut running = Some(running_fixture(terminated.clone()));

        assert!(!stop_running(&mut running, "main", "codex-generation-wrong").unwrap());
        assert!(!terminated.load(Ordering::Acquire));
        assert!(running.is_some());
        assert!(!stop_running(&mut running, "workbench-main", "codex-generation-01").unwrap());
        assert!(!terminated.load(Ordering::Acquire));

        assert!(stop_running(&mut running, "main", "codex-generation-01").unwrap());
        assert!(terminated.load(Ordering::Acquire));
        assert!(running.is_none());
        assert!(!stop_running(&mut running, "main", "codex-generation-01").unwrap());
    }

    #[test]
    fn owned_process_is_terminated_when_controller_state_is_dropped() {
        let terminated = Arc::new(AtomicBool::new(false));
        {
            let _running = running_fixture(terminated.clone());
        }
        assert!(terminated.load(Ordering::Acquire));
    }

    #[test]
    fn stop_never_waits_for_an_unresponsive_stream_worker() {
        let terminated = Arc::new(AtomicBool::new(false));
        let mut running = running_fixture(terminated.clone());
        running.active_stream = Some(ActiveStream {
            stream_id: "codex-stream-01".to_string(),
            caller_label: "main".to_string(),
            cancelled: Arc::new(AtomicBool::new(false)),
            task: Some(thread::spawn(|| thread::sleep(Duration::from_millis(250)))),
        });

        let started = Instant::now();
        running.stop_owned().expect("bounded stop");

        assert!(started.elapsed() < Duration::from_millis(100));
        assert!(terminated.load(Ordering::Acquire));
    }

    #[test]
    fn stream_decoder_never_forwards_private_reasoning() {
        let mut decoder = CodexAppServerFrameDecoder::default();
        let frames = decoder
            .push(
                br#"{"method":"item/reasoning/textDelta","params":{"delta":"private"}}
{"method":"item/reasoning/summaryTextDelta","params":{"delta":"public"}}
"#,
            )
            .expect("safe frames");
        assert_eq!(
            frames,
            [json!({
                "method": "item/reasoning/summaryTextDelta",
                "params": {"delta": "public"},
            })]
        );
        assert!(!serde_json::to_string(&frames).unwrap().contains("private"));
    }

    fn running_fixture(terminated: Arc<AtomicBool>) -> RunningCodexServer {
        RunningCodexServer::new_for_test(
            "cli-executable-0000000000000001",
            "main",
            "chat_session-01",
            "codex-generation-01",
            Box::new(RecordingProcess { terminated }),
        )
    }
}
