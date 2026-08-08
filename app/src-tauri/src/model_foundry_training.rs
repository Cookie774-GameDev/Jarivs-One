use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

const WORKER_PROTOCOL: u8 = 1;
const WORKER_SOURCE: &str = include_str!("../workers/model_foundry/worker.py");

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
}
