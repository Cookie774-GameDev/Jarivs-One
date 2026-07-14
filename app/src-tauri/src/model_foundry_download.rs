use reqwest::blocking::Client;
use reqwest::header::{CONTENT_LENGTH, RANGE};
use reqwest::{redirect, StatusCode, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{Emitter, Manager};

const MAX_MODEL_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const CHUNK_BYTES: usize = 256 * 1024;
static DOWNLOADS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadRequest {
    project_id: String,
    model_id: String,
    url: String,
    expected_sha256: String,
    expected_size_bytes: u64,
    license_approved: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadResult {
    model_id: String,
    path: String,
    sha256: String,
    size_bytes: u64,
    resumed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    project_id: String,
    model_id: String,
    downloaded_bytes: u64,
    expected_size_bytes: u64,
    resumed: bool,
}

fn downloads() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    DOWNLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn validate_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("Model download identifier is invalid.".into());
    }
    Ok(())
}

fn validate_checksum(value: &str) -> Result<(), String> {
    if value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Expected model checksum must be a SHA-256 hex digest.".into())
    }
}

fn allowed_download_url(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    matches!(
        url.host_str(),
        Some("huggingface.co")
            | Some("cdn-lfs.huggingface.co")
            | Some("cdn-lfs-us-1.huggingface.co")
            | Some("cdn-lfs-eu-1.huggingface.co")
            | Some("cas-bridge.xethub.hf.co")
    )
}

fn model_root(app: &tauri::AppHandle, model_id: &str) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("model-foundry").join("models").join(model_id))
        .map_err(|error| format!("Unable to resolve the application data directory: {error}"))
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file =
        File::open(path).map_err(|error| format!("Unable to read model artifact: {error}"))?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; CHUNK_BYTES];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("Unable to checksum model artifact: {error}"))?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

#[tauri::command]
pub fn model_foundry_download_model(
    app: tauri::AppHandle,
    request: ModelDownloadRequest,
) -> Result<ModelDownloadResult, String> {
    validate_id(&request.project_id)?;
    validate_id(&request.model_id)?;
    validate_checksum(&request.expected_sha256)?;
    if !request.license_approved {
        return Err("Explicit model license approval is required before download.".into());
    }
    if request.expected_size_bytes == 0 || request.expected_size_bytes > MAX_MODEL_BYTES {
        return Err("Expected model size is outside the supported download limit.".into());
    }
    let url = Url::parse(&request.url).map_err(|_| "Model URL is invalid.".to_string())?;
    if !allowed_download_url(&url) {
        return Err("Model URL is not an approved HTTPS source.".into());
    }

    let key = format!("{}:{}", request.project_id, request.model_id);
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = downloads()
            .lock()
            .map_err(|_| "Download state is unavailable.".to_string())?;
        if active.contains_key(&key) {
            return Err("This model download is already active.".into());
        }
        active.insert(key.clone(), cancelled.clone());
    }

    let result = (|| {
        let root = model_root(&app, &request.model_id)?;
        fs::create_dir_all(&root)
            .map_err(|error| format!("Unable to create model directory: {error}"))?;
        let final_path = root.join("model.safetensors");
        let partial_path = root.join("model.safetensors.partial");
        if final_path.is_file() {
            let sha256 = file_sha256(&final_path)?;
            let size_bytes = fs::metadata(&final_path)
                .map_err(|error| format!("Unable to inspect model artifact: {error}"))?
                .len();
            if sha256.eq_ignore_ascii_case(&request.expected_sha256) {
                return Ok(ModelDownloadResult {
                    model_id: request.model_id.clone(),
                    path: final_path.to_string_lossy().into_owned(),
                    sha256,
                    size_bytes,
                    resumed: false,
                });
            }
            return Err("Existing model artifact failed checksum verification.".into());
        }

        let existing_bytes = fs::metadata(&partial_path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        if existing_bytes > request.expected_size_bytes {
            fs::remove_file(&partial_path)
                .map_err(|error| format!("Unable to remove oversized partial download: {error}"))?;
        }
        let resume_from = fs::metadata(&partial_path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        let resumed = resume_from > 0;
        let policy = redirect::Policy::custom(|attempt| {
            if allowed_download_url(attempt.url()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        });
        let client = Client::builder()
            .redirect(policy)
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(30 * 60))
            .build()
            .map_err(|error| format!("Unable to initialize model download: {error}"))?;
        let mut request_builder = client.get(url);
        if resumed {
            request_builder = request_builder.header(RANGE, format!("bytes={resume_from}-"));
        }
        let mut response = request_builder
            .send()
            .map_err(|error| format!("Model download failed: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Model source returned HTTP {}.",
                response.status().as_u16()
            ));
        }
        let append = resumed && response.status() == StatusCode::PARTIAL_CONTENT;
        let mut downloaded = if append { resume_from } else { 0 };
        if let Some(length) = response
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
        {
            if downloaded.saturating_add(length) > request.expected_size_bytes {
                return Err("Model response exceeds the approved size.".into());
            }
        }
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(&partial_path)
            .map_err(|error| format!("Unable to open partial model file: {error}"))?;
        let mut buffer = vec![0_u8; CHUNK_BYTES];
        loop {
            if cancelled.load(Ordering::Relaxed) {
                file.sync_all().ok();
                return Err(
                    "Model download cancelled; verified partial data was retained for resume."
                        .into(),
                );
            }
            let count = response
                .read(&mut buffer)
                .map_err(|error| format!("Model download stream failed: {error}"))?;
            if count == 0 {
                break;
            }
            downloaded = downloaded.saturating_add(count as u64);
            if downloaded > request.expected_size_bytes {
                drop(file);
                fs::remove_file(&partial_path).ok();
                return Err("Model download exceeded the approved size.".into());
            }
            file.write_all(&buffer[..count])
                .map_err(|error| format!("Unable to write model download: {error}"))?;
            let _ = app.emit(
                "model-foundry:download-progress",
                DownloadProgress {
                    project_id: request.project_id.clone(),
                    model_id: request.model_id.clone(),
                    downloaded_bytes: downloaded,
                    expected_size_bytes: request.expected_size_bytes,
                    resumed,
                },
            );
        }
        file.sync_all()
            .map_err(|error| format!("Unable to persist model download: {error}"))?;
        drop(file);
        let sha256 = file_sha256(&partial_path)?;
        if !sha256.eq_ignore_ascii_case(&request.expected_sha256) {
            fs::remove_file(&partial_path).ok();
            return Err("Downloaded model failed SHA-256 verification and was removed.".into());
        }
        fs::rename(&partial_path, &final_path)
            .map_err(|error| format!("Unable to promote verified model artifact: {error}"))?;
        Ok(ModelDownloadResult {
            model_id: request.model_id.clone(),
            path: final_path.to_string_lossy().into_owned(),
            sha256,
            size_bytes: downloaded,
            resumed,
        })
    })();

    if let Ok(mut active) = downloads().lock() {
        active.remove(&key);
    }
    result
}

#[tauri::command]
pub fn model_foundry_cancel_download(project_id: String, model_id: String) -> Result<bool, String> {
    validate_id(&project_id)?;
    validate_id(&model_id)?;
    let key = format!("{project_id}:{model_id}");
    let active = downloads()
        .lock()
        .map_err(|_| "Download state is unavailable.".to_string())?;
    Ok(active
        .get(&key)
        .map(|flag| {
            flag.store(true, Ordering::Relaxed);
            true
        })
        .unwrap_or(false))
}

#[tauri::command]
pub fn model_foundry_cleanup_partial_download(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<bool, String> {
    validate_id(&model_id)?;
    let partial = model_root(&app, &model_id)?.join("model.safetensors.partial");
    if !partial.exists() {
        return Ok(false);
    }
    fs::remove_file(partial)
        .map_err(|error| format!("Unable to remove partial model download: {error}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_allowlist_requires_https_and_exact_hosts() {
        assert!(allowed_download_url(
            &Url::parse("https://huggingface.co/org/model/resolve/rev/model.safetensors").unwrap()
        ));
        assert!(allowed_download_url(
            &Url::parse("https://cas-bridge.xethub.hf.co/file").unwrap()
        ));
        assert!(!allowed_download_url(
            &Url::parse("http://huggingface.co/file").unwrap()
        ));
        assert!(!allowed_download_url(
            &Url::parse("https://huggingface.co.evil.example/file").unwrap()
        ));
    }

    #[test]
    fn identifiers_and_checksums_are_strict() {
        assert!(validate_id("smollm2-135m").is_ok());
        assert!(validate_id("../escape").is_err());
        assert!(validate_checksum(&"a".repeat(64)).is_ok());
        assert!(validate_checksum("not-a-checksum").is_err());
    }
}
