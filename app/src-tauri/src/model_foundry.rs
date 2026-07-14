use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const PROTOCOL_VERSION: u8 = 1;
const MAX_MESSAGE_BYTES: usize = 64 * 1024;
const EMBEDDED_WORKER: &str = include_str!("../workers/model_foundry/worker.py");
const EMBEDDED_REAL_TRAINING: &str = include_str!("../workers/model_foundry/real_training.py");
const EMBEDDED_REAL_REQUIREMENTS: &str =
    include_str!("../workers/model_foundry/requirements-real.lock");
const EMBEDDED_QLORA_REQUIREMENTS: &str =
    include_str!("../workers/model_foundry/requirements-qlora.lock");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerRuntimeStatus {
    ready: bool,
    root: String,
    python: Option<String>,
    worker_installed: bool,
    protocol_version: u8,
    detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealTrainingRuntimeStatus {
    installed: bool,
    qlora_installed: bool,
    detail: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProfile {
    os: String,
    architecture: String,
    logical_cores: usize,
    ram_bytes: Option<u64>,
    accelerator_status: String,
    accelerator_detail: String,
    detection_complete: bool,
    recommended_mode: String,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerProbeResult {
    healthy: bool,
    worker_version: String,
    capabilities: Vec<String>,
    protocol_version: u8,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeEnvelope {
    protocol_version: u8,
    #[serde(rename = "type")]
    message_type: String,
    request_id: String,
    job_id: String,
    sequence: u64,
    state: String,
    error: Option<serde_json::Value>,
    #[serde(default)]
    worker_version: String,
    #[serde(default)]
    capabilities: Vec<String>,
}

pub(crate) fn validate_storage_id(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 64 {
        return Err("Identifier must contain 1 through 64 characters.".into());
    }
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("Identifier contains unsupported characters.".into());
    }
    Ok(())
}

pub(crate) fn runtime_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("model-foundry"))
        .map_err(|error| format!("Unable to resolve the application data directory: {error}"))
}

pub(crate) fn venv_python(root: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        root.join("runtime").join("Scripts").join("python.exe")
    }
    #[cfg(not(windows))]
    {
        root.join("runtime").join("bin").join("python")
    }
}

fn worker_script(root: &Path) -> PathBuf {
    root.join("worker").join("worker.py")
}

fn real_training_script(root: &Path) -> PathBuf {
    root.join("worker").join("real_training.py")
}

fn real_requirements(root: &Path) -> PathBuf {
    root.join("worker").join("requirements-real.lock")
}

fn qlora_requirements(root: &Path) -> PathBuf {
    root.join("worker").join("requirements-qlora.lock")
}

fn allowed_environment_from<I>(environment: I) -> BTreeMap<String, String>
where
    I: IntoIterator<Item = (String, String)>,
{
    const ALLOWED: &[&str] = &[
        "SYSTEMROOT",
        "WINDIR",
        "TEMP",
        "TMP",
        "PATH",
        "HOME",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "LANG",
        "LC_ALL",
    ];
    environment
        .into_iter()
        .filter(|(key, _)| {
            ALLOWED
                .iter()
                .any(|allowed| key.eq_ignore_ascii_case(allowed))
        })
        .collect()
}

pub(crate) fn hardened_command(executable: &Path) -> Command {
    let mut command = Command::new(executable);
    command.env_clear();
    command.envs(allowed_environment_from(std::env::vars()));
    command.env("PYTHONUTF8", "1");
    command.env("PYTHONIOENCODING", "utf-8");
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

pub(crate) fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Worker path has no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Unable to create worker directory: {error}"))?;
    let temporary = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&temporary)
            .map_err(|error| format!("Unable to stage worker file: {error}"))?;
        file.write_all(contents)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Unable to persist worker file: {error}"))?;
    }
    fs::rename(&temporary, path).map_err(|error| format!("Unable to promote worker file: {error}"))
}

fn discover_bootstrap_python() -> Option<PathBuf> {
    let candidates = if cfg!(windows) {
        vec!["python.exe", "python3.exe"]
    } else {
        vec!["python3", "python"]
    };
    candidates.into_iter().find_map(|candidate| {
        let mut command = hardened_command(Path::new(candidate));
        command
            .arg("--version")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        command
            .status()
            .ok()
            .filter(|status| status.success())
            .map(|_| PathBuf::from(candidate))
    })
}

pub(crate) fn install_embedded_worker(root: &Path) -> Result<PathBuf, String> {
    let target = worker_script(root);
    if fs::read(&target).ok().as_deref() != Some(EMBEDDED_WORKER.as_bytes()) {
        atomic_write(&target, EMBEDDED_WORKER.as_bytes())?;
    }
    let training = real_training_script(root);
    if fs::read(&training).ok().as_deref() != Some(EMBEDDED_REAL_TRAINING.as_bytes()) {
        atomic_write(&training, EMBEDDED_REAL_TRAINING.as_bytes())?;
    }
    let requirements = real_requirements(root);
    if fs::read(&requirements).ok().as_deref() != Some(EMBEDDED_REAL_REQUIREMENTS.as_bytes()) {
        atomic_write(&requirements, EMBEDDED_REAL_REQUIREMENTS.as_bytes())?;
    }
    let qlora = qlora_requirements(root);
    if fs::read(&qlora).ok().as_deref() != Some(EMBEDDED_QLORA_REQUIREMENTS.as_bytes()) {
        atomic_write(&qlora, EMBEDDED_QLORA_REQUIREMENTS.as_bytes())?;
    }
    Ok(target)
}

pub(crate) fn real_training_dependencies_installed(python: &Path) -> bool {
    if !python.is_file() {
        return false;
    }
    let verification = "from importlib.metadata import version; expected={'accelerate':'1.8.1','peft':'0.16.0','safetensors':'0.5.3','torch':'2.7.1','transformers':'4.53.2'}; assert all(version(name)==wanted for name,wanted in expected.items())";
    let mut command = hardened_command(python);
    command
        .args(["-I", "-c", verification])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command.status().is_ok_and(|status| status.success())
}

fn qlora_dependencies_installed(python: &Path) -> bool {
    if !python.is_file() {
        return false;
    }
    let mut command = hardened_command(python);
    command
        .args(["-I", "-c", "from importlib.metadata import version; assert version('bitsandbytes') == '0.46.1'"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command.status().is_ok_and(|status| status.success())
}

fn parse_probe_message(
    bytes: &[u8],
    request_id: &str,
    job_id: &str,
) -> Result<WorkerProbeResult, String> {
    if bytes.len() > MAX_MESSAGE_BYTES {
        return Err("Worker response exceeded the protocol limit.".into());
    }
    let line = std::str::from_utf8(bytes)
        .map_err(|_| "Worker response was not UTF-8.".to_string())?
        .lines()
        .next()
        .ok_or_else(|| "Worker returned no protocol response.".to_string())?;
    let envelope: ProbeEnvelope = serde_json::from_str(line)
        .map_err(|_| "Worker returned malformed protocol JSON.".to_string())?;
    if envelope.protocol_version != PROTOCOL_VERSION
        || envelope.message_type != "result"
        || envelope.request_id != request_id
        || envelope.job_id != job_id
        || envelope.sequence != 1
        || envelope.state != "completed"
        || envelope.error.is_some()
    {
        return Err("Worker handshake did not match the requested protocol identity.".into());
    }
    Ok(WorkerProbeResult {
        healthy: true,
        worker_version: envelope.worker_version,
        capabilities: envelope.capabilities,
        protocol_version: envelope.protocol_version,
    })
}

fn physical_memory_bytes() -> Option<u64> {
    #[cfg(windows)]
    unsafe {
        let mut status = MEMORYSTATUSEX::default();
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        return GlobalMemoryStatusEx(&mut status)
            .ok()
            .map(|_| status.ullTotalPhys);
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[tauri::command]
pub fn model_foundry_hardware_profile() -> HardwareProfile {
    let ram_bytes = physical_memory_bytes();
    let logical_cores = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(1);
    let mut warnings = vec![
        "No accelerator API has been verified; GPU and VRAM are reported as unknown.".to_string(),
    ];
    if ram_bytes.is_none() {
        warnings.push("Total memory is unavailable on this platform build.".to_string());
    }
    let enough_for_small_cpu_lora = ram_bytes.is_some_and(|bytes| bytes >= 16 * 1024 * 1024 * 1024);
    HardwareProfile {
        os: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        logical_cores,
        ram_bytes,
        accelerator_status: "unknown".into(),
        accelerator_detail: "VibeSpace did not find a verified native accelerator probe.".into(),
        detection_complete: false,
        recommended_mode: if enough_for_small_cpu_lora {
            "small_cpu_lora_with_resource_guard".into()
        } else {
            "fixture_only_until_hardware_is_verified".into()
        },
        warnings,
    }
}

#[tauri::command]
pub fn model_foundry_runtime_status(app: tauri::AppHandle) -> Result<WorkerRuntimeStatus, String> {
    let root = runtime_root(&app)?;
    let python = venv_python(&root);
    let script = worker_script(&root);
    let ready = python.is_file() && script.is_file();
    Ok(WorkerRuntimeStatus {
        ready,
        root: root.to_string_lossy().into_owned(),
        python: python
            .is_file()
            .then(|| python.to_string_lossy().into_owned()),
        worker_installed: script.is_file(),
        protocol_version: PROTOCOL_VERSION,
        detail: if ready {
            "Project-scoped Model Foundry worker is ready.".into()
        } else {
            "Model Foundry worker runtime has not been prepared on this device.".into()
        },
    })
}

#[tauri::command]
pub fn model_foundry_prepare_runtime(app: tauri::AppHandle) -> Result<WorkerRuntimeStatus, String> {
    let root = runtime_root(&app)?;
    fs::create_dir_all(&root)
        .map_err(|error| format!("Unable to create the Model Foundry root: {error}"))?;
    install_embedded_worker(&root)?;
    let python = venv_python(&root);
    if !python.is_file() {
        let bootstrap = discover_bootstrap_python().ok_or_else(|| {
            "Python 3 was not found. Install a supported Python runtime, then retry; VibeSpace will not modify the global environment.".to_string()
        })?;
        let mut command = hardened_command(&bootstrap);
        command
            .args(["-m", "venv"])
            .arg(root.join("runtime"))
            .current_dir(&root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        let output = command
            .output()
            .map_err(|error| format!("Unable to start Python runtime preparation: {error}"))?;
        if !output.status.success() {
            return Err(
                "Python could not create the project-scoped Model Foundry environment.".into(),
            );
        }
    }
    model_foundry_runtime_status(app)
}

#[tauri::command]
pub fn model_foundry_training_runtime_status(
    app: tauri::AppHandle,
) -> Result<RealTrainingRuntimeStatus, String> {
    let root = runtime_root(&app)?;
    let python = venv_python(&root);
    let installed = real_training_dependencies_installed(&python);
    let qlora_installed = qlora_dependencies_installed(&python);
    Ok(RealTrainingRuntimeStatus {
        installed,
        qlora_installed,
        detail: if installed {
            if qlora_installed {
                "Pinned LoRA and QLoRA dependencies are installed. QLoRA still requires a verified CUDA device.".into()
            } else {
                "Pinned real LoRA dependencies are installed. The optional QLoRA add-on is not installed.".into()
            }
        } else {
            "Real LoRA training dependencies are not installed. Installation is optional and requires an explicit user action.".into()
        },
    })
}

#[tauri::command]
pub fn model_foundry_install_training_dependencies(
    app: tauri::AppHandle,
    include_qlora: Option<bool>,
) -> Result<RealTrainingRuntimeStatus, String> {
    model_foundry_prepare_runtime(app.clone())?;
    let root = runtime_root(&app)?;
    let python = venv_python(&root);
    install_embedded_worker(&root)?;
    let requirements = if include_qlora.unwrap_or(false) {
        qlora_requirements(&root)
    } else {
        real_requirements(&root)
    };
    let mut command = hardened_command(&python);
    command
        .args([
            "-I",
            "-m",
            "pip",
            "install",
            "--require-virtualenv",
            "--require-hashes",
            "--only-binary=:all:",
            "--disable-pip-version-check",
            "--no-input",
            "-r",
        ])
        .arg(&requirements)
        .current_dir(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let output = command.output().map_err(|error| {
        format!("Unable to start the pinned training dependency installer: {error}")
    })?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        let tail = detail
            .chars()
            .rev()
            .take(1200)
            .collect::<String>()
            .chars()
            .rev()
            .collect::<String>();
        return Err(format!(
            "Pinned training dependency installation failed: {tail}"
        ));
    }
    let status = model_foundry_training_runtime_status(app)?;
    if !status.installed || (include_qlora.unwrap_or(false) && !status.qlora_installed) {
        return Err(
            "Training dependencies were installed but their pinned versions could not be verified."
                .into(),
        );
    }
    Ok(status)
}
#[tauri::command]
pub fn model_foundry_worker_probe(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<WorkerProbeResult, String> {
    validate_storage_id(&project_id)?;
    let root = runtime_root(&app)?;
    let python = venv_python(&root);
    let script = install_embedded_worker(&root)?;
    if !python.is_file() {
        return Err("Model Foundry runtime is not prepared.".into());
    }
    let job_dir = root.join("projects").join(&project_id).join("probe");
    fs::create_dir_all(&job_dir)
        .map_err(|error| format!("Unable to create probe directory: {error}"))?;
    let request_id = "runtime-probe";
    let job_id = "probe";
    let payload = serde_json::json!({
        "protocolVersion": PROTOCOL_VERSION,
        "type": "command",
        "requestId": request_id,
        "jobId": job_id,
        "operation": "handshake"
    });
    let mut command = hardened_command(&python);
    command
        .arg("-I")
        .arg(&script)
        .arg("--job-dir")
        .arg(&job_dir)
        .current_dir(&job_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|error| format!("Unable to start Model Foundry worker: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Worker stdin was unavailable.".to_string())?;
    writeln!(stdin, "{}", payload)
        .map_err(|error| format!("Unable to write worker handshake: {error}"))?;
    drop(stdin);
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Unable to read worker handshake: {error}"))?;
    if !output.status.success() {
        return Err("Model Foundry worker exited before completing its handshake.".into());
    }
    parse_probe_message(&output.stdout, request_id, job_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn storage_ids_reject_traversal_and_shell_characters() {
        for invalid in ["", "../escape", "folder/name", "job;rm", "job id"] {
            assert!(validate_storage_id(invalid).is_err(), "accepted {invalid}");
        }
        assert!(validate_storage_id("project_01-safe").is_ok());
    }

    #[test]
    fn environment_allowlist_drops_secret_material() {
        let environment = vec![
            ("PATH".into(), "safe".into()),
            ("OPENAI_API_KEY".into(), "secret".into()),
            ("SUPABASE_SERVICE_ROLE_KEY".into(), "secret".into()),
            ("STRIPE_SECRET_KEY".into(), "secret".into()),
        ];
        let allowed = allowed_environment_from(environment);
        assert_eq!(allowed.get("PATH").map(String::as_str), Some("safe"));
        assert_eq!(allowed.len(), 1);
    }

    #[test]
    fn probe_parser_rejects_identity_mismatch_and_oversize() {
        let valid = br#"{"protocolVersion":1,"type":"result","requestId":"req","jobId":"job","sequence":1,"state":"completed","error":null,"workerVersion":"0.1.0","capabilities":["health"]}\n"#;
        assert!(parse_probe_message(valid, "req", "job").is_ok());
        assert!(parse_probe_message(valid, "other", "job").is_err());
        assert!(parse_probe_message(&vec![b'x'; MAX_MESSAGE_BYTES + 1], "req", "job").is_err());
    }

    #[test]
    fn worker_command_has_fixed_non_shell_arguments() {
        let mut command = hardened_command(Path::new("python"));
        command
            .arg("-I")
            .arg("worker.py")
            .arg("--job-dir")
            .arg("safe-job");
        let arguments: Vec<_> = command
            .get_args()
            .map(|value| value.to_string_lossy().into_owned())
            .collect();
        assert_eq!(arguments, ["-I", "worker.py", "--job-dir", "safe-job"]);
        assert!(!arguments.iter().any(|value| value.contains(';')));
    }
}
