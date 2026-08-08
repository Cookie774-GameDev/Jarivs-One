use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;
use tauri::Manager;

const WORKER_PROTOCOL: u8 = 1;
const WORKER_SOURCE: &str = include_str!("../workers/model_foundry/worker.py");
const TRAINING_ARTIFACT_MANIFEST: &str = ".vibespace-artifact.json";
const MAX_ARTIFACT_FILES: usize = 4_096;
const MAX_ARTIFACT_DEPTH: usize = 8;
const MAX_ARTIFACT_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const MAX_WORKER_LOG_BYTES: usize = 256 * 1024;
static ACTIVE_TRAINING: LazyLock<Mutex<BTreeMap<String, Arc<Mutex<Child>>>>> =
    LazyLock::new(|| Mutex::new(BTreeMap::new()));

struct TrainingRegistryGuard(String);

impl Drop for TrainingRegistryGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = ACTIVE_TRAINING.lock() {
            active.remove(&self.0);
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingWorkerStatus {
    installed: bool,
    attested: bool,
    protocol: u8,
    source_sha256: String,
    python: Option<String>,
    methods: Vec<String>,
    modalities: Vec<String>,
    precisions: Vec<String>,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrainingWorkerProbe {
    protocol: u8,
    local_only: bool,
    ready: bool,
    #[serde(default)]
    methods: Vec<String>,
    #[serde(default)]
    modalities: Vec<String>,
    #[serde(default)]
    precisions: Vec<String>,
    reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct TrainingArtifactFile {
    path: String,
    bytes: u64,
    sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrainingArtifactManifest {
    schema_version: u8,
    method: String,
    file_count: usize,
    storage_bytes: u64,
    sha256: String,
    files: Vec<TrainingArtifactFile>,
}

#[derive(Clone, Debug)]
pub(crate) struct TrainingArtifactEvidence {
    pub(crate) file_count: usize,
    pub(crate) storage_bytes: u64,
    pub(crate) sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrainingRunRequest {
    protocol: u8,
    local_only: bool,
    method: String,
    base_model_path: String,
    dataset_path: String,
    output_dir: String,
    epochs: u8,
    max_steps: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrainingRunResponse {
    protocol: u8,
    local_only: bool,
    completed: bool,
    method: String,
    artifact_path: String,
}

#[derive(Clone, Debug)]
pub(crate) struct TrainingRunResult {
    pub(crate) artifact_path: PathBuf,
    pub(crate) evidence: TrainingArtifactEvidence,
}

fn source_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn expected_source_sha256() -> String {
    source_sha256(WORKER_SOURCE.as_bytes())
}

fn training_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("model-foundry").join("training-runtime"))
        .map_err(|error| format!("Model Foundry training directory unavailable: {error}"))
}

fn worker_path(root: &Path) -> PathBuf {
    root.join("worker.py")
}

pub(crate) fn training_model_path(root: &Path, base_model_id: &str) -> Result<PathBuf, String> {
    let directory = match base_model_id {
        "qwen2.5:1.5b-instruct-q4_K_M" => "qwen2.5-1.5b-instruct",
        "qwen2.5:7b-instruct-q4_K_M" => "qwen2.5-7b-instruct",
        "llama3.1:8b-instruct-q4_K_M" => "llama3.1-8b-instruct",
        _ => return Err("The selected model has no verified local training manifest.".into()),
    };
    Ok(root.join("base-models").join(directory))
}

fn artifact_file_sha256(path: &Path) -> Result<(u64, String), String> {
    let file = fs::File::open(path)
        .map_err(|error| format!("Could not inspect training artifact: {error}"))?;
    let bytes = file
        .metadata()
        .map_err(|error| format!("Could not inspect training artifact: {error}"))?
        .len();
    let mut reader = BufReader::new(file);
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(|error| format!("Could not hash training artifact: {error}"))?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok((bytes, format!("{:x}", digest.finalize())))
}

fn collect_artifact_files(
    root: &Path,
    directory: &Path,
    depth: usize,
    files: &mut Vec<TrainingArtifactFile>,
) -> Result<(), String> {
    if depth > MAX_ARTIFACT_DEPTH {
        return Err("Training artifact directory nesting exceeds the safe limit.".into());
    }
    let mut entries = fs::read_dir(directory)
        .map_err(|error| format!("Could not inspect training artifact directory: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not inspect training artifact directory: {error}"))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Could not inspect training artifact entry: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err("Training artifacts may not contain symbolic links.".into());
        }
        if metadata.is_dir() {
            collect_artifact_files(root, &path, depth + 1, files)?;
            continue;
        }
        if !metadata.is_file() {
            return Err("Training artifact contains an unsupported filesystem entry.".into());
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|_| "Training artifact escaped its verified root.".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if relative == TRAINING_ARTIFACT_MANIFEST {
            continue;
        }
        if files.len() >= MAX_ARTIFACT_FILES {
            return Err("Training artifact contains too many files.".into());
        }
        let (bytes, sha256) = artifact_file_sha256(&path)?;
        files.push(TrainingArtifactFile {
            path: relative,
            bytes,
            sha256,
        });
    }
    Ok(())
}

fn artifact_manifest_from_files(
    method: &str,
    files: Vec<TrainingArtifactFile>,
) -> Result<TrainingArtifactManifest, String> {
    if !matches!(method, "lora" | "qlora" | "full") {
        return Err("Training artifact method is unsupported.".into());
    }
    if files.is_empty() {
        return Err("Training produced no artifact files.".into());
    }
    let storage_bytes = files.iter().try_fold(0_u64, |total, file| {
        total
            .checked_add(file.bytes)
            .ok_or_else(|| "Training artifact size overflowed.".to_string())
    })?;
    let mut aggregate = Sha256::new();
    for file in &files {
        aggregate.update(file.path.as_bytes());
        aggregate.update([0]);
        aggregate.update(file.bytes.to_le_bytes());
        aggregate.update(file.sha256.as_bytes());
        aggregate.update([0]);
    }
    Ok(TrainingArtifactManifest {
        schema_version: 1,
        method: method.to_string(),
        file_count: files.len(),
        storage_bytes,
        sha256: format!("{:x}", aggregate.finalize()),
        files,
    })
}

fn current_artifact_manifest(
    root: &Path,
    method: &str,
) -> Result<TrainingArtifactManifest, String> {
    if !root.is_dir() {
        return Err("Training artifact directory is missing.".into());
    }
    let mut files = Vec::new();
    collect_artifact_files(root, root, 0, &mut files)?;
    files.sort_by(|left, right| left.path.cmp(&right.path));
    artifact_manifest_from_files(method, files)
}

pub(crate) fn write_and_verify_training_artifact(
    root: &Path,
    method: &str,
) -> Result<TrainingArtifactEvidence, String> {
    let manifest = current_artifact_manifest(root, method)?;
    let bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("Could not encode training artifact manifest: {error}"))?;
    if bytes.len() as u64 > MAX_ARTIFACT_MANIFEST_BYTES {
        return Err("Training artifact manifest exceeds the safe size limit.".into());
    }
    let path = root.join(TRAINING_ARTIFACT_MANIFEST);
    let temporary = root.join(format!("{TRAINING_ARTIFACT_MANIFEST}.tmp"));
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Could not write training artifact manifest: {error}"))?;
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Could not activate training artifact manifest: {error}"))?;
    verify_training_artifact(root)
}

pub(crate) fn verify_training_artifact(root: &Path) -> Result<TrainingArtifactEvidence, String> {
    let path = root.join(TRAINING_ARTIFACT_MANIFEST);
    let metadata =
        fs::metadata(&path).map_err(|_| "Training artifact manifest is missing.".to_string())?;
    if metadata.len() > MAX_ARTIFACT_MANIFEST_BYTES {
        return Err("Training artifact manifest exceeds the safe size limit.".into());
    }
    let expected: TrainingArtifactManifest = serde_json::from_slice(
        &fs::read(&path)
            .map_err(|error| format!("Could not read training artifact manifest: {error}"))?,
    )
    .map_err(|error| format!("Training artifact manifest is invalid: {error}"))?;
    if expected.schema_version != 1
        || expected.file_count != expected.files.len()
        || expected.file_count == 0
        || expected.file_count > MAX_ARTIFACT_FILES
    {
        return Err("Training artifact manifest metadata is invalid.".into());
    }
    let current = current_artifact_manifest(root, &expected.method)?;
    if current.files != expected.files
        || current.file_count != expected.file_count
        || current.storage_bytes != expected.storage_bytes
        || current.sha256 != expected.sha256
    {
        return Err("Training artifact failed integrity verification.".into());
    }
    Ok(TrainingArtifactEvidence {
        file_count: current.file_count,
        storage_bytes: current.storage_bytes,
        sha256: current.sha256,
    })
}

fn locate_python() -> Option<String> {
    ["python3", "python", "py"]
        .into_iter()
        .find_map(|candidate| {
            Command::new(candidate)
                .arg("--version")
                .output()
                .ok()
                .filter(|output| output.status.success())
                .map(|_| candidate.to_string())
        })
}

fn validated_probe(bytes: &[u8]) -> Result<TrainingWorkerProbe, String> {
    let probe: TrainingWorkerProbe = serde_json::from_slice(bytes)
        .map_err(|error| format!("Training worker returned invalid status: {error}"))?;
    if probe.protocol != WORKER_PROTOCOL {
        return Err("Training worker protocol does not match this VibeSpace build.".into());
    }
    if !probe.local_only {
        return Err("Training worker did not attest to local-only execution.".into());
    }
    if probe
        .methods
        .iter()
        .any(|value| !matches!(value.as_str(), "lora" | "qlora" | "full"))
        || probe
            .modalities
            .iter()
            .any(|value| !matches!(value.as_str(), "text" | "image" | "video" | "audio"))
        || probe
            .precisions
            .iter()
            .any(|value| !matches!(value.as_str(), "fp32" | "fp16" | "bf16" | "int8" | "int4"))
    {
        return Err("Training worker advertised an unsupported capability.".into());
    }
    Ok(probe)
}

fn probe_worker(python: &str, path: &Path) -> Result<TrainingWorkerProbe, String> {
    let output = Command::new(python)
        .arg(path)
        .arg("probe")
        .output()
        .map_err(|error| format!("Could not start the verified local training worker: {error}"))?;
    if !output.status.success() {
        return Err("The verified local training worker could not inspect its libraries.".into());
    }
    validated_probe(&output.stdout)
}

fn inspect_worker(root: &Path) -> TrainingWorkerStatus {
    let expected = expected_source_sha256();
    let path = worker_path(root);
    if !path.is_file() {
        return TrainingWorkerStatus {
            installed: false,
            attested: false,
            protocol: WORKER_PROTOCOL,
            source_sha256: expected,
            python: locate_python(),
            methods: Vec::new(),
            modalities: Vec::new(),
            precisions: Vec::new(),
            reason: Some("The verified local training worker has not been installed.".into()),
        };
    }
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) => {
            return TrainingWorkerStatus {
                installed: true,
                attested: false,
                protocol: WORKER_PROTOCOL,
                source_sha256: expected,
                python: locate_python(),
                methods: Vec::new(),
                modalities: Vec::new(),
                precisions: Vec::new(),
                reason: Some(format!(
                    "Could not inspect the local training worker: {error}"
                )),
            }
        }
    };
    if source_sha256(&bytes) != expected {
        return TrainingWorkerStatus {
            installed: true,
            attested: false,
            protocol: WORKER_PROTOCOL,
            source_sha256: expected,
            python: locate_python(),
            methods: Vec::new(),
            modalities: Vec::new(),
            precisions: Vec::new(),
            reason: Some("The local training worker failed integrity verification.".into()),
        };
    }
    let python = locate_python();
    if python.is_none() {
        return TrainingWorkerStatus {
            installed: true,
            attested: true,
            protocol: WORKER_PROTOCOL,
            source_sha256: expected,
            python: None,
            methods: Vec::new(),
            modalities: Vec::new(),
            precisions: Vec::new(),
            reason: Some("Python 3 is required to run the local training worker.".into()),
        };
    }
    let python = python.unwrap_or_default();
    match probe_worker(&python, &path) {
        Ok(probe) if probe.ready => TrainingWorkerStatus {
            installed: true,
            attested: true,
            protocol: WORKER_PROTOCOL,
            source_sha256: expected,
            python: Some(python),
            methods: probe.methods,
            modalities: probe.modalities,
            precisions: probe.precisions,
            reason: probe.reason,
        },
        Ok(probe) => TrainingWorkerStatus {
            installed: true,
            attested: true,
            protocol: WORKER_PROTOCOL,
            source_sha256: expected,
            python: Some(python),
            methods: Vec::new(),
            modalities: Vec::new(),
            precisions: Vec::new(),
            reason: probe
                .reason
                .or_else(|| Some("Verified local training libraries are incomplete.".into())),
        },
        Err(error) => TrainingWorkerStatus {
            installed: true,
            attested: true,
            protocol: WORKER_PROTOCOL,
            source_sha256: expected,
            python: Some(python),
            methods: Vec::new(),
            modalities: Vec::new(),
            precisions: Vec::new(),
            reason: Some(error),
        },
    }
}

#[tauri::command]
pub fn model_foundry_training_worker_status(
    app: tauri::AppHandle,
) -> Result<TrainingWorkerStatus, String> {
    Ok(inspect_worker(&training_root(&app)?))
}

#[tauri::command]
pub fn model_foundry_install_training_worker(
    app: tauri::AppHandle,
) -> Result<TrainingWorkerStatus, String> {
    let root = training_root(&app)?;
    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create the private training directory: {error}"))?;
    let path = worker_path(&root);
    let temporary = root.join("worker.py.tmp");
    fs::write(&temporary, WORKER_SOURCE.as_bytes())
        .map_err(|error| format!("Could not write the verified local training worker: {error}"))?;
    fs::rename(&temporary, &path).map_err(|error| {
        format!("Could not activate the verified local training worker: {error}")
    })?;
    let status = inspect_worker(&root);
    if !status.attested {
        let _ = fs::remove_file(&path);
        return Err(status
            .reason
            .unwrap_or_else(|| "Training worker attestation failed.".into()));
    }
    Ok(status)
}

fn safe_job_id(value: &str) -> Result<&str, String> {
    if value.len() < 5
        || value.len() > 80
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
    {
        return Err("Invalid Model Foundry training job identifier.".into());
    }
    Ok(value)
}

fn drain_bounded<R: Read>(mut reader: R, maximum: usize) -> Vec<u8> {
    let mut output = Vec::with_capacity(maximum.min(16 * 1024));
    let mut buffer = [0_u8; 8 * 1024];
    loop {
        let count = match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(count) => count,
        };
        let remaining = maximum.saturating_sub(output.len());
        if remaining > 0 {
            output.extend_from_slice(&buffer[..count.min(remaining)]);
        }
    }
    output
}

fn write_bounded_log(path: &Path, bytes: &[u8]) {
    let _ = fs::write(path, &bytes[..bytes.len().min(MAX_WORKER_LOG_BYTES)]);
}

pub(crate) fn run_training_worker(
    app: &tauri::AppHandle,
    job_id: &str,
    base_model_id: &str,
    method: &str,
    dataset_path: &Path,
    job_dir: &Path,
    epochs: u8,
    max_steps: u32,
) -> Result<TrainingRunResult, String> {
    let job_id = safe_job_id(job_id)?;
    if !matches!(method, "lora" | "qlora" | "full") {
        return Err("Unsupported Model Foundry weight-training method.".into());
    }
    if !(1..=20).contains(&epochs) || !(1..=1_000_000).contains(&max_steps) {
        return Err("Model Foundry training limits are invalid.".into());
    }
    let root = training_root(app)?;
    let status = inspect_worker(&root);
    if !status.installed || !status.attested || !status.methods.iter().any(|value| value == method)
    {
        return Err(format!(
            "The verified local training worker cannot run {} on this computer.",
            method.to_uppercase()
        ));
    }
    let python = status
        .python
        .ok_or_else(|| "Python 3 is required for local training.".to_string())?;
    let worker = worker_path(&root);
    let model = training_model_path(&root, base_model_id)?;
    let model = model
        .canonicalize()
        .map_err(|_| "The verified trainable base model is not installed.".to_string())?;
    if !model.is_dir() || !model.join("config.json").is_file() {
        return Err("The verified trainable base model is incomplete.".into());
    }
    let dataset = dataset_path
        .canonicalize()
        .map_err(|_| "The local training dataset is unavailable.".to_string())?;
    if !dataset.is_file()
        || dataset
            .extension()
            .and_then(|value| value.to_str())
            .is_none_or(|value| !value.eq_ignore_ascii_case("jsonl"))
    {
        return Err("Weight training requires one local JSONL dataset.".into());
    }
    fs::create_dir_all(job_dir)
        .map_err(|error| format!("Could not prepare the private training job: {error}"))?;
    let output = job_dir.join("weight-artifact");
    if output.exists() {
        return Err("This Model Foundry version already has a training artifact.".into());
    }
    let request_path = job_dir.join("worker-request.json");
    let request = TrainingRunRequest {
        protocol: WORKER_PROTOCOL,
        local_only: true,
        method: method.to_string(),
        base_model_path: model.to_string_lossy().into_owned(),
        dataset_path: dataset.to_string_lossy().into_owned(),
        output_dir: output.to_string_lossy().into_owned(),
        epochs,
        max_steps,
    };
    let request_bytes = serde_json::to_vec_pretty(&request)
        .map_err(|error| format!("Could not encode the local training request: {error}"))?;
    let temporary = job_dir.join("worker-request.json.tmp");
    fs::write(&temporary, request_bytes)
        .map_err(|error| format!("Could not persist the local training request: {error}"))?;
    fs::rename(&temporary, &request_path)
        .map_err(|error| format!("Could not activate the local training request: {error}"))?;

    let mut child = Command::new(python)
        .arg(&worker)
        .arg("train")
        .arg(&request_path)
        .current_dir(&root)
        .env("HF_HUB_OFFLINE", "1")
        .env("TRANSFORMERS_OFFLINE", "1")
        .env("TOKENIZERS_PARALLELISM", "false")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start the verified local training worker: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Local training stdout was unavailable.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Local training stderr was unavailable.".to_string())?;
    let stdout_thread = std::thread::spawn(move || drain_bounded(stdout, MAX_WORKER_LOG_BYTES));
    let stderr_thread = std::thread::spawn(move || drain_bounded(stderr, MAX_WORKER_LOG_BYTES));
    let child = Arc::new(Mutex::new(child));
    {
        let mut active = ACTIVE_TRAINING
            .lock()
            .map_err(|_| "Model Foundry training registry is unavailable.".to_string())?;
        if active.insert(job_id.to_string(), child.clone()).is_some() {
            let _ = child.lock().map(|mut process| process.kill());
            return Err("This Model Foundry training job is already active.".into());
        }
    }
    let _registry_guard = TrainingRegistryGuard(job_id.to_string());
    let exit = loop {
        let result = child
            .lock()
            .map_err(|_| "Model Foundry training process is unavailable.".to_string())?
            .try_wait()
            .map_err(|error| format!("Could not monitor the local training worker: {error}"))?;
        if let Some(status) = result {
            break status;
        }
        std::thread::sleep(Duration::from_millis(250));
    };
    let stdout = stdout_thread.join().unwrap_or_default();
    let stderr = stderr_thread.join().unwrap_or_default();
    write_bounded_log(&job_dir.join("worker.stdout.log"), &stdout);
    write_bounded_log(&job_dir.join("worker.stderr.log"), &stderr);
    if !exit.success() {
        return Err("The local training worker failed. Review its bounded local job log.".into());
    }
    let response: TrainingRunResponse = serde_json::from_slice(&stdout).map_err(|_| {
        "The local training worker returned invalid completion evidence.".to_string()
    })?;
    if response.protocol != WORKER_PROTOCOL
        || !response.local_only
        || !response.completed
        || response.method != method
        || PathBuf::from(response.artifact_path) != output
    {
        return Err("The local training worker returned mismatched completion evidence.".into());
    }
    let evidence = write_and_verify_training_artifact(&output, method)?;
    Ok(TrainingRunResult {
        artifact_path: output,
        evidence,
    })
}

pub(crate) fn cancel_training_worker(job_id: &str) -> Result<bool, String> {
    let job_id = safe_job_id(job_id)?;
    let child = ACTIVE_TRAINING
        .lock()
        .map_err(|_| "Model Foundry training registry is unavailable.".to_string())?
        .get(job_id)
        .cloned();
    let Some(child) = child else {
        return Ok(false);
    };
    child
        .lock()
        .map_err(|_| "Model Foundry training process is unavailable.".to_string())?
        .kill()
        .map_err(|error| format!("Could not stop the local training worker: {error}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_worker_is_local_only_and_hash_attestable() {
        assert!(WORKER_SOURCE.contains("LOCAL_ONLY = True"));
        assert!(WORKER_SOURCE.contains("cloud execution is disabled"));
        assert_eq!(expected_source_sha256().len(), 64);
    }

    #[test]
    fn rejects_tampered_worker_source() {
        let root =
            std::env::temp_dir().join(format!("vibespace-foundry-training-{}", nanoid::nanoid!()));
        fs::create_dir_all(&root).unwrap();
        fs::write(worker_path(&root), b"tampered").unwrap();

        let status = inspect_worker(&root);
        assert!(status.installed);
        assert!(!status.attested);
        assert!(status.reason.unwrap().contains("integrity"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn accepts_only_local_ready_matching_protocol_probe() {
        let probe = validated_probe(
            br#"{"protocol":1,"localOnly":true,"ready":true,"packages":{"torch":"2"},"methods":["lora","full"],"modalities":["text"],"precisions":["fp32","bf16"],"reason":null}"#
        )
        .expect("matching local probe should validate");
        assert_eq!(probe.methods, vec!["lora", "full"]);
        assert_eq!(probe.modalities, vec!["text"]);
        assert_eq!(probe.precisions, vec!["fp32", "bf16"]);
        assert!(validated_probe(
            br#"{"protocol":2,"localOnly":true,"ready":true,"packages":{},"methods":[],"modalities":[],"precisions":[],"reason":null}"#
        )
        .is_err());
        assert!(validated_probe(
            br#"{"protocol":1,"localOnly":false,"ready":true,"packages":{},"methods":[],"modalities":[],"precisions":[],"reason":null}"#
        )
        .is_err());
    }

    #[test]
    fn worker_probe_advertises_only_closed_supported_capability_values() {
        let root =
            std::env::temp_dir().join(format!("vibespace-foundry-training-{}", nanoid::nanoid!()));
        fs::create_dir_all(&root).unwrap();
        fs::write(worker_path(&root), WORKER_SOURCE.as_bytes()).unwrap();

        let status = inspect_worker(&root);
        assert!(status.installed);
        assert!(status.attested);
        assert!(status
            .methods
            .iter()
            .all(|value| matches!(value.as_str(), "lora" | "qlora" | "full")));
        assert!(status
            .modalities
            .iter()
            .all(|value| matches!(value.as_str(), "text" | "image" | "video" | "audio")));
        assert!(status
            .precisions
            .iter()
            .all(|value| matches!(value.as_str(), "fp32" | "fp16" | "bf16" | "int8" | "int4")));
        if status.methods.is_empty() {
            assert!(status.reason.is_some());
        }

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn worker_validates_a_bounded_local_text_training_request_without_loading_a_model() {
        let Some(python) = locate_python() else {
            return;
        };
        let root =
            std::env::temp_dir().join(format!("vibespace-foundry-validate-{}", nanoid::nanoid!()));
        let model = root.join("model");
        let output = root.join("output");
        fs::create_dir_all(&model).unwrap();
        fs::write(worker_path(&root), WORKER_SOURCE.as_bytes()).unwrap();
        fs::write(model.join("config.json"), br#"{"model_type":"qwen2"}"#).unwrap();
        let dataset = root.join("examples.jsonl");
        fs::write(
            &dataset,
            b"{\"prompt\":\"Say hello\",\"response\":\"Hello.\"}\n",
        )
        .unwrap();
        let request_path = root.join("request.json");
        fs::write(
            &request_path,
            serde_json::to_vec(&serde_json::json!({
                "protocol": WORKER_PROTOCOL,
                "localOnly": true,
                "method": "lora",
                "baseModelPath": model,
                "datasetPath": dataset,
                "outputDir": output,
                "epochs": 1,
                "maxSteps": 2
            }))
            .unwrap(),
        )
        .unwrap();

        let result = Command::new(python)
            .arg(worker_path(&root))
            .arg("validate")
            .arg(&request_path)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let value: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
        assert_eq!(value["valid"], true);
        assert_eq!(value["examples"], 1);
        assert_eq!(value["method"], "lora");
        assert_eq!(value["localOnly"], true);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn worker_training_failure_is_structured_and_never_falls_back_to_cloud() {
        let Some(python) = locate_python() else {
            return;
        };
        let root =
            std::env::temp_dir().join(format!("vibespace-foundry-train-{}", nanoid::nanoid!()));
        let model = root.join("model");
        let output = root.join("output");
        fs::create_dir_all(&model).unwrap();
        fs::write(worker_path(&root), WORKER_SOURCE.as_bytes()).unwrap();
        fs::write(model.join("config.json"), br#"{"model_type":"qwen2"}"#).unwrap();
        let dataset = root.join("examples.jsonl");
        fs::write(&dataset, b"{\"text\":\"A local training example.\"}\n").unwrap();
        let request_path = root.join("request.json");
        fs::write(
            &request_path,
            serde_json::to_vec(&serde_json::json!({
                "protocol": WORKER_PROTOCOL,
                "localOnly": true,
                "method": "lora",
                "baseModelPath": model,
                "datasetPath": dataset,
                "outputDir": output,
                "epochs": 1,
                "maxSteps": 1
            }))
            .unwrap(),
        )
        .unwrap();

        let result = Command::new(python)
            .arg(worker_path(&root))
            .arg("train")
            .arg(&request_path)
            .output()
            .unwrap();
        assert!(!result.status.success());
        let value: serde_json::Value = serde_json::from_slice(&result.stderr).unwrap();
        assert_eq!(value["valid"], false);
        assert_eq!(value["localOnly"], true);
        assert!(value["error"]
            .as_str()
            .is_some_and(|error| !error.is_empty()));
        assert!(!output.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn training_model_directories_are_registry_owned_and_path_safe() {
        let root =
            std::env::temp_dir().join(format!("vibespace-foundry-model-{}", nanoid::nanoid!()));
        assert_eq!(
            training_model_path(&root, "qwen2.5:1.5b-instruct-q4_K_M").unwrap(),
            root.join("base-models").join("qwen2.5-1.5b-instruct")
        );
        assert!(training_model_path(&root, "../outside").is_err());
        assert!(training_model_path(&root, "unknown:model").is_err());
    }

    #[test]
    fn weight_artifact_manifest_detects_post_training_tampering() {
        let root =
            std::env::temp_dir().join(format!("vibespace-foundry-artifact-{}", nanoid::nanoid!()));
        let artifact = root.join("artifact");
        fs::create_dir_all(&artifact).unwrap();
        fs::write(artifact.join("adapter_model.safetensors"), b"adapter-bytes").unwrap();
        fs::write(
            artifact.join("adapter_config.json"),
            br#"{"base_model_name_or_path":"local"}"#,
        )
        .unwrap();

        let evidence = write_and_verify_training_artifact(&artifact, "lora").unwrap();
        assert_eq!(evidence.file_count, 2);
        assert!(evidence.storage_bytes > 0);
        assert_eq!(evidence.sha256.len(), 64);

        fs::write(artifact.join("adapter_model.safetensors"), b"tampered").unwrap();
        assert!(verify_training_artifact(&artifact).is_err());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn worker_logs_are_bounded_and_missing_job_cancellation_is_safe() {
        let input = vec![b'x'; MAX_WORKER_LOG_BYTES + 1024];
        assert_eq!(
            drain_bounded(std::io::Cursor::new(input), MAX_WORKER_LOG_BYTES).len(),
            MAX_WORKER_LOG_BYTES
        );
        assert!(!cancel_training_worker("job_missing").unwrap());
    }
}
