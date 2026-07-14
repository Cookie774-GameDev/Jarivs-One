use crate::model_foundry::{
    atomic_write, hardened_command, install_embedded_worker,
    real_training_dependencies_installed, runtime_root, validate_storage_id, venv_python,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

const PROTOCOL_VERSION: u8 = 1;
const MAX_MESSAGE_BYTES: usize = 64 * 1024;
const MAX_DATASET_BYTES: usize = 64 * 1024 * 1024;
const MAX_EXAMPLES: usize = 100_000;
static ACTIVE_JOBS: OnceLock<Mutex<HashMap<String, JobControl>>> = OnceLock::new();

#[derive(Clone)]
struct JobControl {
    sender: Sender<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTrainingExample {
    prompt: String,
    completion: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTrainingConfig {
    method: String,
    seed: u64,
    epochs: u32,
    batch_size: u32,
    gradient_accumulation: u32,
    max_sequence_length: u32,
    learning_rate: f64,
    lora_rank: u32,
    lora_alpha: u32,
    lora_dropout: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTrainingRequest {
    project_id: String,
    job_id: String,
    model_id: String,
    dataset_version_id: String,
    dataset_manifest_hash: String,
    dataset_fingerprint: String,
    dataset_approved: bool,
    train_examples: Vec<NativeTrainingExample>,
    validation_examples: Vec<NativeTrainingExample>,
    training_config: NativeTrainingConfig,
    target_modules: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTrainingResult {
    started: bool,
    project_id: String,
    job_id: String,
    job_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerMessageEvent {
    project_id: String,
    job_id: String,
    message: serde_json::Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSnapshotManifest {
    model_id: String,
    revision: String,
    license: String,
    files: Vec<StoredSnapshotFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSnapshotFile {
    path: String,
    sha256: String,
}

fn active_jobs() -> &'static Mutex<HashMap<String, JobControl>> {
    ACTIVE_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn job_key(project_id: &str, job_id: &str) -> String {
    format!("{project_id}:{job_id}")
}

fn validate_sha256(value: &str, label: &str) -> Result<(), String> {
    if value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(format!("{label} must be a SHA-256 hex digest."))
    }
}

fn validate_training_config(config: &NativeTrainingConfig) -> Result<(), String> {
    if !matches!(config.method.as_str(), "lora" | "qlora") {
        return Err("Training method must be lora or qlora.".into());
    }
    if !(1..=50).contains(&config.epochs)
        || !(1..=64).contains(&config.batch_size)
        || !(1..=1024).contains(&config.gradient_accumulation)
        || !(64..=32_768).contains(&config.max_sequence_length)
        || !(1..=512).contains(&config.lora_rank)
        || !(1..=2048).contains(&config.lora_alpha)
        || !config.learning_rate.is_finite()
        || !(0.0 < config.learning_rate && config.learning_rate <= 1.0)
        || !config.lora_dropout.is_finite()
        || !(0.0..1.0).contains(&config.lora_dropout)
    {
        return Err("Training configuration is outside the governed bounds.".into());
    }
    Ok(())
}

fn validate_target_modules(modules: Option<&[String]>) -> Result<(), String> {
    let Some(modules) = modules else {
        return Ok(());
    };
    if modules.is_empty() || modules.len() > 64 {
        return Err("targetModules must contain between 1 and 64 module names.".into());
    }
    for module in modules {
        if module.is_empty()
            || module.len() > 128
            || !module
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.'))
        {
            return Err("A target module name contains unsupported characters.".into());
        }
    }
    Ok(())
}

fn serialize_examples(examples: &[NativeTrainingExample], label: &str) -> Result<Vec<u8>, String> {
    if examples.is_empty() || examples.len() > MAX_EXAMPLES {
        return Err(format!("{label} must contain between 1 and {MAX_EXAMPLES} examples."));
    }
    let mut output = Vec::new();
    for example in examples {
        if example.prompt.len() > 1024 * 1024
            || example.completion.is_empty()
            || example.completion.len() > 1024 * 1024
        {
            return Err(format!("{label} contains an empty or oversized example."));
        }
        let line = serde_json::to_vec(&serde_json::json!({
            "prompt": example.prompt,
            "completion": example.completion,
        }))
        .map_err(|error| format!("Unable to serialize {label}: {error}"))?;
        if output.len().saturating_add(line.len() + 1) > MAX_DATASET_BYTES {
            return Err(format!("{label} exceeds the {} MiB limit.", MAX_DATASET_BYTES / 1024 / 1024));
        }
        output.extend_from_slice(&line);
        output.push(b'\n');
    }
    Ok(output)
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn safe_snapshot_file_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && !value.starts_with('.')
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn load_snapshot(model_dir: &Path, model_id: &str) -> Result<StoredSnapshotManifest, String> {
    let manifest_path = model_dir.join("snapshot-manifest.json");
    let manifest: StoredSnapshotManifest = serde_json::from_slice(
        &fs::read(&manifest_path)
            .map_err(|_| "The complete verified model snapshot is not installed.".to_string())?,
    )
    .map_err(|_| "The installed model snapshot manifest is malformed.".to_string())?;
    if manifest.model_id != model_id
        || manifest.revision.len() != 40
        || manifest.license.is_empty()
        || manifest.files.is_empty()
    {
        return Err("The installed model snapshot manifest has invalid identity metadata.".into());
    }
    let mut required = (false, false, false);
    for file in &manifest.files {
        if !safe_snapshot_file_name(&file.path) {
            return Err("The model snapshot manifest contains an unsafe file name.".into());
        }
        validate_sha256(&file.sha256, "Model snapshot file checksum")?;
        required.0 |= file.path == "config.json";
        required.1 |= file.path == "tokenizer.json";
        required.2 |= file.path == "model.safetensors";
    }
    if !required.0 || !required.1 || !required.2 {
        return Err("The model snapshot is incomplete.".into());
    }
    Ok(manifest)
}

fn read_bounded_line<R: Read>(reader: &mut R) -> Result<Option<Vec<u8>>, String> {
    let mut line = Vec::with_capacity(1024);
    let mut byte = [0_u8; 1];
    loop {
        let count = reader
            .read(&mut byte)
            .map_err(|error| format!("Unable to read worker output: {error}"))?;
        if count == 0 {
            return if line.is_empty() { Ok(None) } else { Ok(Some(line)) };
        }
        if byte[0] == b'\n' {
            return Ok(Some(line));
        }
        if line.len() >= MAX_MESSAGE_BYTES {
            return Err("Worker output exceeded the protocol message limit.".into());
        }
        line.push(byte[0]);
    }
}

fn worker_identity_valid(message: &serde_json::Value, request_id: &str, job_id: &str) -> bool {
    message.get("protocolVersion").and_then(serde_json::Value::as_u64)
        == Some(PROTOCOL_VERSION as u64)
        && message.get("requestId").and_then(serde_json::Value::as_str) == Some(request_id)
        && message.get("jobId").and_then(serde_json::Value::as_str) == Some(job_id)
        && matches!(
            message.get("type").and_then(serde_json::Value::as_str),
            Some("event" | "result")
        )
}

fn emit_supervisor_failure(app: &tauri::AppHandle, project_id: &str, job_id: &str, code: &str, message: &str) {
    let _ = app.emit(
        "model-foundry:worker-message",
        WorkerMessageEvent {
            project_id: project_id.to_string(),
            job_id: job_id.to_string(),
            message: serde_json::json!({
                "protocolVersion": PROTOCOL_VERSION,
                "type": "result",
                "requestId": format!("run-{job_id}"),
                "jobId": job_id,
                "sequence": 0,
                "state": "failed",
                "error": {"code": code, "message": message, "recoverable": false, "suggestions": []},
            }),
        },
    );
}

fn spawn_worker(
    app: tauri::AppHandle,
    project_id: String,
    job_id: String,
    job_dir: PathBuf,
    model_root: PathBuf,
    manifest_path: PathBuf,
) -> Result<(), String> {
    let root = runtime_root(&app)?;
    let python = venv_python(&root);
    if !real_training_dependencies_installed(&python) {
        return Err("The pinned real-training runtime is not installed.".into());
    }
    let worker = install_embedded_worker(&root)?;
    let request_id = format!("run-{job_id}");
    let command = serde_json::json!({
        "protocolVersion": PROTOCOL_VERSION,
        "type": "command",
        "requestId": request_id,
        "jobId": job_id,
        "operation": "train",
        "manifestPath": manifest_path,
    });
    let mut process = hardened_command(&python);
    process
        .arg("-I")
        .arg(&worker)
        .arg("--job-dir")
        .arg(&job_dir)
        .arg("--model-root")
        .arg(&model_root)
        .current_dir(&job_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = process
        .spawn()
        .map_err(|error| format!("Unable to start the real-training worker: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Training worker stdin was unavailable.".to_string())?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Training worker stdout was unavailable.".to_string())?;
    writeln!(stdin, "{command}")
        .and_then(|_| stdin.flush())
        .map_err(|error| format!("Unable to submit the training job: {error}"))?;

    let (sender, receiver) = mpsc::channel::<String>();
    let key = job_key(&project_id, &job_id);
    {
        let mut active = active_jobs()
            .lock()
            .map_err(|_| "Training job state is unavailable.".to_string())?;
        if active.contains_key(&key) {
            child.kill().ok();
            return Err("This training job is already active.".into());
        }
        active.insert(key.clone(), JobControl { sender });
    }

    std::thread::spawn(move || {
        let control_request_id = format!("control-{job_id}");
        let writer_job_id = job_id.clone();
        let writer = std::thread::spawn(move || {
            for operation in receiver {
                let payload = serde_json::json!({
                    "protocolVersion": PROTOCOL_VERSION,
                    "type": "command",
                    "requestId": control_request_id,
                    "jobId": writer_job_id,
                    "operation": operation,
                });
                if writeln!(stdin, "{payload}").and_then(|_| stdin.flush()).is_err() {
                    break;
                }
            }
        });

        let mut terminal = false;
        loop {
            let line = match read_bounded_line(&mut stdout) {
                Ok(Some(line)) => line,
                Ok(None) => break,
                Err(error) => {
                    emit_supervisor_failure(&app, &project_id, &job_id, "supervisor.protocol", &error);
                    child.kill().ok();
                    break;
                }
            };
            let message: serde_json::Value = match serde_json::from_slice(&line) {
                Ok(message) => message,
                Err(_) => {
                    emit_supervisor_failure(&app, &project_id, &job_id, "supervisor.json", "Worker output was not valid protocol JSON.");
                    child.kill().ok();
                    break;
                }
            };
            if !worker_identity_valid(&message, &request_id, &job_id) {
                emit_supervisor_failure(&app, &project_id, &job_id, "supervisor.identity", "Worker output did not match the active job identity.");
                child.kill().ok();
                break;
            }
            let _ = app.emit(
                "model-foundry:worker-message",
                WorkerMessageEvent {
                    project_id: project_id.clone(),
                    job_id: job_id.clone(),
                    message: message.clone(),
                },
            );
            if message.get("type").and_then(serde_json::Value::as_str) == Some("result") {
                terminal = true;
                break;
            }
        }
        if let Ok(mut active) = active_jobs().lock() {
            active.remove(&key);
        }
        writer.join().ok();
        let status = child.wait().ok();
        if !terminal {
            let detail = status
                .and_then(|value| value.code())
                .map(|code| format!("Training worker exited with code {code}."))
                .unwrap_or_else(|| "Training worker exited without a terminal result.".into());
            emit_supervisor_failure(&app, &project_id, &job_id, "supervisor.exit", &detail);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn model_foundry_start_training(
    app: tauri::AppHandle,
    request: StartTrainingRequest,
) -> Result<StartTrainingResult, String> {
    validate_storage_id(&request.project_id)?;
    validate_storage_id(&request.job_id)?;
    validate_storage_id(&request.model_id)?;
    validate_storage_id(&request.dataset_version_id)?;
    validate_sha256(&request.dataset_manifest_hash, "Dataset manifest hash")?;
    validate_sha256(&request.dataset_fingerprint, "Dataset fingerprint")?;
    if !request.dataset_approved {
        return Err("Explicit approval of the immutable dataset version is required.".into());
    }
    validate_training_config(&request.training_config)?;
    validate_target_modules(request.target_modules.as_deref())?;
    let train_bytes = serialize_examples(&request.train_examples, "Training split")?;
    let validation_bytes = serialize_examples(&request.validation_examples, "Validation split")?;

    let root = runtime_root(&app)?;
    let model_dir = root.join("models").join(&request.model_id);
    let snapshot = load_snapshot(&model_dir, &request.model_id)?;
    let model_files: BTreeMap<_, _> = snapshot
        .files
        .iter()
        .map(|file| (file.path.clone(), file.sha256.clone()))
        .collect();
    let job_dir = root
        .join("projects")
        .join(&request.project_id)
        .join("jobs")
        .join(&request.job_id);
    let manifest_path = job_dir.join("training-manifest.json");
    if manifest_path.exists() {
        return Err("This immutable training job already exists; choose a new job identifier.".into());
    }
    fs::create_dir_all(&job_dir)
        .map_err(|error| format!("Unable to create the training job directory: {error}"))?;
    let train_path = job_dir.join("train.jsonl");
    let validation_path = job_dir.join("validation.jsonl");
    atomic_write(&train_path, &train_bytes)?;
    atomic_write(&validation_path, &validation_bytes)?;
    let output_dir = job_dir.join("output");
    let manifest = serde_json::json!({
        "protocolVersion": PROTOCOL_VERSION,
        "jobId": request.job_id,
        "projectId": request.project_id,
        "backend": "real",
        "modelId": request.model_id,
        "modelRevision": snapshot.revision,
        "modelLicense": snapshot.license,
        "modelDir": model_dir,
        "modelFiles": model_files,
        "datasetVersionId": request.dataset_version_id,
        "datasetManifestHash": request.dataset_manifest_hash,
        "datasetFingerprint": request.dataset_fingerprint,
        "trainDatasetPath": train_path,
        "validationDatasetPath": validation_path,
        "trainDatasetSha256": sha256_bytes(&train_bytes),
        "validationDatasetSha256": sha256_bytes(&validation_bytes),
        "outputDir": output_dir,
        "trainingConfig": request.training_config,
        "targetModules": request.target_modules,
    });
    atomic_write(
        &manifest_path,
        &serde_json::to_vec(&manifest)
            .map_err(|error| format!("Unable to serialize training manifest: {error}"))?,
    )?;
    spawn_worker(
        app,
        request.project_id.clone(),
        request.job_id.clone(),
        job_dir.clone(),
        root.join("models"),
        manifest_path,
    )?;
    Ok(StartTrainingResult {
        started: true,
        project_id: request.project_id,
        job_id: request.job_id,
        job_dir: job_dir.to_string_lossy().into_owned(),
    })
}

fn send_control(project_id: String, job_id: String, operation: &str) -> Result<bool, String> {
    validate_storage_id(&project_id)?;
    validate_storage_id(&job_id)?;
    let active = active_jobs()
        .lock()
        .map_err(|_| "Training job state is unavailable.".to_string())?;
    let Some(control) = active.get(&job_key(&project_id, &job_id)) else {
        return Ok(false);
    };
    control
        .sender
        .send(operation.to_string())
        .map_err(|_| "Training worker control channel is closed.".to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn model_foundry_cancel_training(project_id: String, job_id: String) -> Result<bool, String> {
    send_control(project_id, job_id, "cancel")
}

#[tauri::command]
pub fn model_foundry_stop_after_checkpoint(
    project_id: String,
    job_id: String,
) -> Result<bool, String> {
    send_control(project_id, job_id, "stop_after_checkpoint")
}

#[tauri::command]
pub fn model_foundry_training_active(project_id: String, job_id: String) -> Result<bool, String> {
    validate_storage_id(&project_id)?;
    validate_storage_id(&job_id)?;
    active_jobs()
        .lock()
        .map(|active| active.contains_key(&job_key(&project_id, &job_id)))
        .map_err(|_| "Training job state is unavailable.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> NativeTrainingConfig {
        NativeTrainingConfig {
            method: "lora".into(),
            seed: 7,
            epochs: 1,
            batch_size: 1,
            gradient_accumulation: 4,
            max_sequence_length: 256,
            learning_rate: 0.0002,
            lora_rank: 8,
            lora_alpha: 16,
            lora_dropout: 0.05,
        }
    }

    #[test]
    fn training_configuration_and_target_modules_are_bounded() {
        assert!(validate_training_config(&config()).is_ok());
        let mut invalid = config();
        invalid.epochs = 0;
        assert!(validate_training_config(&invalid).is_err());
        assert!(validate_target_modules(Some(&["q_proj".into(), "v_proj".into()])).is_ok());
        assert!(validate_target_modules(Some(&["../escape".into()])).is_err());
    }

    #[test]
    fn dataset_serialization_is_jsonl_and_rejects_empty_completion() {
        let bytes = serialize_examples(
            &[NativeTrainingExample {
                prompt: "review this".into(),
                completion: "approved".into(),
            }],
            "train",
        )
        .unwrap();
        assert_eq!(String::from_utf8(bytes).unwrap(), "{\"completion\":\"approved\",\"prompt\":\"review this\"}\n");
        assert!(serialize_examples(
            &[NativeTrainingExample {
                prompt: "prompt".into(),
                completion: String::new(),
            }],
            "train",
        )
        .is_err());
    }

    #[test]
    fn protocol_identity_and_line_bounds_fail_closed() {
        let valid = serde_json::json!({
            "protocolVersion": 1,
            "type": "event",
            "requestId": "run-job",
            "jobId": "job",
        });
        assert!(worker_identity_valid(&valid, "run-job", "job"));
        assert!(!worker_identity_valid(&valid, "other", "job"));
        let bytes = vec![b'x'; MAX_MESSAGE_BYTES + 1];
        let mut oversized = bytes.as_slice();
        assert!(read_bounded_line(&mut oversized).is_err());
    }
}
