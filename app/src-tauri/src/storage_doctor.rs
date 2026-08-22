use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

const DATABASE_NAME: &str = "jarvis-v1";
const REQUEST_NAME: &str = "storage-repair-request-v1.json";
const RECEIPT_NAME: &str = "storage-repair-ready-v1.json";
const RESTORE_RECEIPT_NAME: &str = "storage-restore-completed-v1.json";
const FAILURE_NAME: &str = "storage-repair-failed-v1.json";
const MANIFEST_NAME: &str = "manifest-v1.json";
const MAX_MARKER_BYTES: u64 = 4096;
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum RepairOperation {
    Repair,
    Restore,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RepairRequest {
    version: u8,
    operation: RepairOperation,
    database_name: String,
    origin: String,
    requested_at_ms: u64,
    confirmation_token: String,
    backup_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupFileRecord {
    relative_path: String,
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupManifest {
    version: u8,
    database_name: String,
    origin: String,
    backup_id: String,
    created_at_ms: u64,
    total_bytes: u64,
    tree_sha256: String,
    files: Vec<BackupFileRecord>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RepairReceipt {
    version: u8,
    operation: String,
    database_name: String,
    origin: String,
    backup_id: String,
    backup_bytes: u64,
    backup_sha256: String,
    completed_at_ms: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum PreWebviewRepairOutcome {
    NoRequest,
    RepairReady {
        backup_id: String,
        backup_bytes: u64,
        backup_sha256: String,
    },
    RestoreApplied {
        backup_id: String,
        pre_restore_backup_id: String,
    },
}

fn valid_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && [8, 13, 18, 23].iter().all(|index| bytes[*index] == b'-')
        && bytes.iter().enumerate().all(|(index, byte)| {
            [8, 13, 18, 23].contains(&index)
                || byte.is_ascii_digit()
                || (b'a'..=b'f').contains(&byte.to_ascii_lowercase())
        })
        && matches!(bytes[14], b'1'..=b'5')
        && matches!(bytes[19].to_ascii_lowercase(), b'8' | b'9' | b'a' | b'b')
}

fn valid_backup_id(value: &str) -> bool {
    let value = value.strip_prefix("pre-restore-").unwrap_or(value);
    value.len() == 50
        && value.as_bytes()[..13].iter().all(u8::is_ascii_digit)
        && value.as_bytes()[13] == b'-'
        && valid_uuid(&value[14..])
}

fn origin_directory_name(origin: &str) -> Result<&'static str, String> {
    match origin {
        "http://localhost:5173" => Ok("http_localhost_5173.indexeddb.leveldb"),
        "http://tauri.localhost" => Ok("http_tauri.localhost_0.indexeddb.leveldb"),
        "https://tauri.localhost" => Ok("https_tauri.localhost_0.indexeddb.leveldb"),
        "tauri://localhost" => Ok("tauri_localhost_0.indexeddb.leveldb"),
        _ => Err("storage_repair_origin_not_allowed".to_string()),
    }
}

fn validate_request(request: &RepairRequest) -> Result<(), String> {
    if request.version != 1
        || request.database_name != DATABASE_NAME
        || request.requested_at_ms < 1_600_000_000_000
        || !valid_uuid(&request.confirmation_token)
    {
        return Err("storage_repair_request_invalid".to_string());
    }
    origin_directory_name(&request.origin)?;
    match request.operation {
        RepairOperation::Repair if request.backup_id.is_none() => Ok(()),
        RepairOperation::Restore if request.backup_id.as_deref().is_some_and(valid_backup_id) => {
            Ok(())
        }
        _ => Err("storage_repair_request_invalid".to_string()),
    }
}

fn read_bounded_json<T: for<'de> Deserialize<'de>>(
    path: &Path,
    max_bytes: u64,
) -> Result<T, String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "storage_repair_marker_missing")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > max_bytes {
        return Err("storage_repair_marker_invalid".to_string());
    }
    let mut contents = Vec::with_capacity(metadata.len() as usize);
    File::open(path)
        .and_then(|mut file| file.read_to_end(&mut contents))
        .map_err(|_| "storage_repair_marker_read_failed".to_string())?;
    serde_json::from_slice(&contents).map_err(|_| "storage_repair_marker_invalid".to_string())
}

fn safe_relative(path: &Path) -> Result<String, String> {
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("storage_repair_backup_path_invalid".to_string());
    }
    Ok(path.to_string_lossy().replace('\\', "/"))
}

fn collect_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    fn visit(root: &Path, current: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
        let metadata = fs::symlink_metadata(current)
            .map_err(|_| "storage_repair_source_read_failed".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("storage_repair_link_blocked".to_string());
        }
        if metadata.is_file() {
            output.push(
                current
                    .strip_prefix(root)
                    .map_err(|_| "storage_repair_backup_path_invalid".to_string())?
                    .to_path_buf(),
            );
            return Ok(());
        }
        if !metadata.is_dir() {
            return Err("storage_repair_source_type_invalid".to_string());
        }
        let mut entries = fs::read_dir(current)
            .map_err(|_| "storage_repair_source_read_failed".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "storage_repair_source_read_failed".to_string())?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            visit(root, &entry.path(), output)?;
        }
        Ok(())
    }
    let mut files = Vec::new();
    visit(root, root, &mut files)?;
    Ok(files)
}

fn hash_file(path: &Path) -> Result<(u64, String), String> {
    let mut file = File::open(path).map_err(|_| "storage_repair_source_read_failed".to_string())?;
    let mut digest = Sha256::new();
    let mut total = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "storage_repair_source_read_failed".to_string())?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
        total = total
            .checked_add(read as u64)
            .ok_or_else(|| "storage_repair_backup_too_large".to_string())?;
    }
    Ok((total, format!("sha256:{:x}", digest.finalize())))
}

fn snapshot_records(root: &Path) -> Result<(Vec<BackupFileRecord>, u64, String), String> {
    let mut records = Vec::new();
    let mut total = 0_u64;
    let mut tree = Sha256::new();
    for relative in collect_files(root)? {
        if relative == Path::new(MANIFEST_NAME) {
            continue;
        }
        let relative_path = safe_relative(&relative)?;
        let (bytes, sha256) = hash_file(&root.join(&relative))?;
        total = total
            .checked_add(bytes)
            .ok_or_else(|| "storage_repair_backup_too_large".to_string())?;
        tree.update(relative_path.as_bytes());
        tree.update([0]);
        tree.update(sha256.as_bytes());
        tree.update([0]);
        tree.update(bytes.to_le_bytes());
        records.push(BackupFileRecord {
            relative_path,
            bytes,
            sha256,
        });
    }
    Ok((records, total, format!("sha256:{:x}", tree.finalize())))
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir(destination).map_err(|_| "storage_repair_backup_create_failed".to_string())?;
    for relative in collect_files(source)? {
        let from = source.join(&relative);
        let to = destination.join(&relative);
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)
                .map_err(|_| "storage_repair_backup_create_failed".to_string())?;
        }
        let mut input =
            File::open(from).map_err(|_| "storage_repair_source_read_failed".to_string())?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(to)
            .map_err(|_| "storage_repair_backup_create_failed".to_string())?;
        std::io::copy(&mut input, &mut output)
            .map_err(|_| "storage_repair_backup_write_failed".to_string())?;
        output
            .sync_all()
            .map_err(|_| "storage_repair_backup_sync_failed".to_string())?;
    }
    Ok(())
}

fn write_json_create_new<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|_| "storage_repair_record_invalid")?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| "storage_repair_record_create_failed".to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.write_all(b"\n"))
        .and_then(|_| file.sync_all())
        .map_err(|_| "storage_repair_record_write_failed".to_string())
}

fn create_backup(
    source: &Path,
    backups: &Path,
    backup_id: &str,
    origin: &str,
    created_at_ms: u64,
) -> Result<BackupManifest, String> {
    if !valid_backup_id(backup_id) {
        return Err("storage_repair_backup_id_invalid".to_string());
    }
    fs::create_dir_all(backups).map_err(|_| "storage_repair_backup_create_failed".to_string())?;
    let pending = backups.join(format!(".pending-{backup_id}"));
    let final_path = backups.join(backup_id);
    if pending.exists() || final_path.exists() {
        return Err("storage_repair_backup_exists".to_string());
    }
    let pending_origin = pending.join("origin-indexeddb");
    fs::create_dir(&pending).map_err(|_| "storage_repair_backup_create_failed".to_string())?;
    if let Err(error) = copy_tree(source, &pending_origin) {
        let _ = fs::remove_dir_all(&pending);
        return Err(error);
    }
    let (files, total_bytes, tree_sha256) = snapshot_records(&pending_origin)?;
    let manifest = BackupManifest {
        version: 1,
        database_name: DATABASE_NAME.to_string(),
        origin: origin.to_string(),
        backup_id: backup_id.to_string(),
        created_at_ms,
        total_bytes,
        tree_sha256,
        files,
    };
    write_json_create_new(&pending.join(MANIFEST_NAME), &manifest)?;
    fs::rename(&pending, &final_path)
        .map_err(|_| "storage_repair_backup_finalize_failed".to_string())?;
    verify_backup(&final_path, origin, Some(backup_id))?;
    Ok(manifest)
}

fn verify_backup(
    backup_root: &Path,
    origin: &str,
    expected_id: Option<&str>,
) -> Result<BackupManifest, String> {
    let manifest: BackupManifest =
        read_bounded_json(&backup_root.join(MANIFEST_NAME), MAX_MANIFEST_BYTES)?;
    if manifest.version != 1
        || manifest.database_name != DATABASE_NAME
        || manifest.origin != origin
        || expected_id.is_some_and(|id| manifest.backup_id != id)
        || !valid_backup_id(&manifest.backup_id)
    {
        return Err("storage_repair_backup_manifest_invalid".to_string());
    }
    let (records, total, tree) = snapshot_records(&backup_root.join("origin-indexeddb"))?;
    if records != manifest.files || total != manifest.total_bytes || tree != manifest.tree_sha256 {
        return Err("storage_repair_backup_verification_failed".to_string());
    }
    Ok(manifest)
}

fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "storage_repair_record_invalid".to_string())?;
    let temporary = path.with_file_name(format!(".{file_name}.pending"));
    if temporary.exists() {
        fs::remove_file(&temporary).map_err(|_| "storage_repair_record_busy".to_string())?;
    }
    write_json_create_new(&temporary, value)?;
    if path.exists() {
        fs::remove_file(path).map_err(|_| "storage_repair_record_busy".to_string())?;
    }
    fs::rename(temporary, path).map_err(|_| "storage_repair_record_finalize_failed".to_string())
}

fn restore_backup(
    root: &Path,
    request: &RepairRequest,
    now_ms: u64,
    origin_store: &Path,
    backups: &Path,
) -> Result<PreWebviewRepairOutcome, String> {
    let backup_id = request
        .backup_id
        .as_deref()
        .ok_or_else(|| "storage_restore_backup_invalid".to_string())?;
    let selected = backups.join(backup_id);
    let selected_manifest = verify_backup(&selected, &request.origin, Some(backup_id))?;
    let pre_restore_backup_id = format!("pre-restore-{now_ms}-{}", request.confirmation_token);
    create_backup(
        origin_store,
        backups,
        &pre_restore_backup_id,
        &request.origin,
        now_ms,
    )?;

    let indexed_db_root = origin_store
        .parent()
        .ok_or_else(|| "storage_repair_target_invalid".to_string())?;
    let staged = indexed_db_root.join(format!(".vibespace-restore-{}", request.confirmation_token));
    let rollback = indexed_db_root.join(format!(
        ".vibespace-rollback-{}",
        request.confirmation_token
    ));
    if staged.exists() || rollback.exists() {
        return Err("storage_restore_staging_exists".to_string());
    }
    copy_tree(&selected.join("origin-indexeddb"), &staged)?;
    let (records, total, tree) = snapshot_records(&staged)?;
    if records != selected_manifest.files
        || total != selected_manifest.total_bytes
        || tree != selected_manifest.tree_sha256
    {
        let _ = fs::remove_dir_all(&staged);
        return Err("storage_restore_staging_verification_failed".to_string());
    }
    fs::rename(origin_store, &rollback)
        .map_err(|_| "storage_restore_original_move_failed".to_string())?;
    if let Err(_error) = fs::rename(&staged, origin_store) {
        let _ = fs::rename(&rollback, origin_store);
        return Err("storage_restore_apply_failed".to_string());
    }
    let _ = fs::remove_dir_all(&rollback);
    let receipt = serde_json::json!({
        "version": 1,
        "operation": "restore",
        "databaseName": DATABASE_NAME,
        "origin": request.origin,
        "backupId": backup_id,
        "preRestoreBackupId": pre_restore_backup_id,
        "completedAtMs": now_ms,
    });
    atomic_write_json(&root.join("doctor").join(RESTORE_RECEIPT_NAME), &receipt)?;
    let _ = fs::remove_file(root.join("doctor").join(FAILURE_NAME));
    fs::remove_file(root.join("doctor").join(REQUEST_NAME))
        .map_err(|_| "storage_repair_request_finalize_failed".to_string())?;
    Ok(PreWebviewRepairOutcome::RestoreApplied {
        backup_id: backup_id.to_string(),
        pre_restore_backup_id,
    })
}

fn process_pending_inner(root: &Path, now_ms: u64) -> Result<PreWebviewRepairOutcome, String> {
    let doctor = root.join("doctor");
    let request_path = doctor.join(REQUEST_NAME);
    if !request_path.exists() {
        return Ok(PreWebviewRepairOutcome::NoRequest);
    }
    let request: RepairRequest = read_bounded_json(&request_path, MAX_MARKER_BYTES)?;
    validate_request(&request)?;
    let origin_store = root
        .join("EBWebView")
        .join("Default")
        .join("IndexedDB")
        .join(origin_directory_name(&request.origin)?);
    let metadata = fs::symlink_metadata(&origin_store)
        .map_err(|_| "storage_repair_origin_store_missing".to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("storage_repair_target_invalid".to_string());
    }
    let backups = doctor.join("backups");
    if request.operation == RepairOperation::Restore {
        return restore_backup(root, &request, now_ms, &origin_store, &backups);
    }

    let backup_id = format!("{}-{}", request.requested_at_ms, request.confirmation_token);
    let manifest = create_backup(
        &origin_store,
        &backups,
        &backup_id,
        &request.origin,
        request.requested_at_ms,
    )?;
    let receipt = RepairReceipt {
        version: 1,
        operation: "repair".to_string(),
        database_name: DATABASE_NAME.to_string(),
        origin: request.origin,
        backup_id: backup_id.clone(),
        backup_bytes: manifest.total_bytes,
        backup_sha256: manifest.tree_sha256.clone(),
        completed_at_ms: now_ms,
    };
    atomic_write_json(&doctor.join(RECEIPT_NAME), &receipt)?;
    let _ = fs::remove_file(doctor.join(FAILURE_NAME));
    fs::remove_file(request_path)
        .map_err(|_| "storage_repair_request_finalize_failed".to_string())?;
    Ok(PreWebviewRepairOutcome::RepairReady {
        backup_id,
        backup_bytes: manifest.total_bytes,
        backup_sha256: manifest.tree_sha256,
    })
}

pub fn process_pending_at_root(
    root: &Path,
    now_ms: u64,
) -> Result<PreWebviewRepairOutcome, String> {
    let result = process_pending_inner(root, now_ms);
    if let Err(diagnostic_code) = &result {
        let doctor = root.join("doctor");
        if doctor.join(REQUEST_NAME).is_file() {
            let failure = serde_json::json!({
                "version": 1,
                "diagnosticCode": diagnostic_code,
                "failedAtMs": now_ms,
            });
            let _ = atomic_write_json(&doctor.join(FAILURE_NAME), &failure);
        }
    }
    result
}

#[cfg(target_os = "windows")]
fn resolved_local_app_data_root() -> Result<PathBuf, String> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_LocalAppData, SHGetKnownFolderPath, KF_FLAG_DEFAULT};

    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .map_err(|_| "storage_repair_app_identity_invalid".to_string())?;
    let identifier = config
        .get("identifier")
        .and_then(serde_json::Value::as_str)
        .filter(|value| *value == "ai.jarvis.desktop")
        .ok_or_else(|| "storage_repair_app_identity_invalid".to_string())?;
    let raw = unsafe { SHGetKnownFolderPath(&FOLDERID_LocalAppData, KF_FLAG_DEFAULT, None) }
        .map_err(|_| "storage_repair_local_data_unavailable".to_string())?;
    let result = unsafe { raw.to_string() }
        .map(PathBuf::from)
        .map_err(|_| "storage_repair_local_data_unavailable".to_string());
    unsafe {
        CoTaskMemFree(Some(raw.0.cast()));
    }
    let path = result?.join(identifier);
    if !path.is_absolute() {
        return Err("storage_repair_local_data_unavailable".to_string());
    }
    Ok(path)
}

#[cfg(not(target_os = "windows"))]
fn resolved_local_app_data_root() -> Result<PathBuf, String> {
    Err("storage_repair_platform_unsupported".to_string())
}

pub fn process_pending_before_webview() -> Result<PreWebviewRepairOutcome, String> {
    let root = resolved_local_app_data_root()?;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "storage_repair_clock_invalid".to_string())?
        .as_millis()
        .try_into()
        .map_err(|_| "storage_repair_clock_invalid".to_string())?;
    process_pending_at_root(&root, now_ms)
}
