use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub const MAX_CODEX_CONFIG_BYTES: u64 = 8 * 1024 * 1024;
const MAX_RECEIPT_BYTES: u64 = 64 * 1024;
const SNAPSHOT_SCHEMA_VERSION: u32 = 1;
const SNAPSHOT_RECEIPT: &str = "snapshot.json";
const ARMED_RECEIPT: &str = "restore-armed.json";
const ORIGINAL_CONFIG_BACKUP: &str = "original-config.toml";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodexConfigSnapshotErrorKind {
    UnsafePath,
    Size,
    Unstable,
    Receipt,
    Drift,
    Disk,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexConfigSnapshotError {
    pub kind: CodexConfigSnapshotErrorKind,
    pub message: &'static str,
}

impl fmt::Display for CodexConfigSnapshotError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message)
    }
}

impl std::error::Error for CodexConfigSnapshotError {}

fn failure(kind: CodexConfigSnapshotErrorKind, message: &'static str) -> CodexConfigSnapshotError {
    CodexConfigSnapshotError { kind, message }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum CodexConfigSnapshotOriginal {
    Absent,
    Present { bytes: u64, sha256: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexConfigSnapshot {
    codex_home: PathBuf,
    codex_home_sha256: String,
    backup_root: PathBuf,
    original: CodexConfigSnapshotOriginal,
}

impl CodexConfigSnapshot {
    pub fn original(&self) -> &CodexConfigSnapshotOriginal {
        &self.original
    }

    pub fn original_sha256(&self) -> Option<&str> {
        match &self.original {
            CodexConfigSnapshotOriginal::Absent => None,
            CodexConfigSnapshotOriginal::Present { sha256, .. } => Some(sha256),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArmedCodexConfigRestore {
    snapshot: CodexConfigSnapshot,
    managed_sha256: String,
}

impl ArmedCodexConfigRestore {
    pub fn managed_sha256(&self) -> &str {
        &self.managed_sha256
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodexConfigRestoreOutcome {
    Restored,
    AlreadyRestored,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SnapshotReceipt {
    schema_version: u32,
    codex_home_sha256: String,
    original: CodexConfigSnapshotOriginal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ArmedReceipt {
    schema_version: u32,
    codex_home_sha256: String,
    original: CodexConfigSnapshotOriginal,
    managed_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ConfigState {
    Absent,
    Present(Vec<u8>),
}

impl ConfigState {
    fn original(&self) -> CodexConfigSnapshotOriginal {
        match self {
            Self::Absent => CodexConfigSnapshotOriginal::Absent,
            Self::Present(bytes) => CodexConfigSnapshotOriginal::Present {
                bytes: bytes.len() as u64,
                sha256: bytes_sha256(bytes),
            },
        }
    }
}

struct CleanupDirectory(Option<PathBuf>);

impl CleanupDirectory {
    fn armed(path: PathBuf) -> Self {
        Self(Some(path))
    }

    fn disarm(&mut self) {
        self.0 = None;
    }
}

impl Drop for CleanupDirectory {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = fs::remove_dir_all(path);
        }
    }
}

struct CleanupFile(Option<PathBuf>);

impl CleanupFile {
    fn armed(path: PathBuf) -> Self {
        Self(Some(path))
    }

    fn disarm(&mut self) {
        self.0 = None;
    }
}

impl Drop for CleanupFile {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = fs::remove_file(path);
        }
    }
}

fn bytes_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn canonical_home_sha256(codex_home: &Path) -> Result<String, CodexConfigSnapshotError> {
    let canonical = fs::canonicalize(codex_home).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Codex home could not be resolved safely.",
        )
    })?;
    let mut hasher = Sha256::new();
    hasher.update(b"vibespace-codex-home-v1\0");
    #[cfg(windows)]
    {
        let normalized = canonical
            .to_string_lossy()
            .replace('/', "\\")
            .to_lowercase();
        hasher.update(normalized.as_bytes());
    }
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        hasher.update(canonical.as_os_str().as_bytes());
    }
    #[cfg(not(any(windows, unix)))]
    {
        hasher.update(canonical.to_string_lossy().as_bytes());
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn clean_absolute(path: &Path) -> bool {
    path.is_absolute()
        && path
            .components()
            .all(|component| !matches!(component, Component::CurDir | Component::ParentDir))
}

fn normalized_components(path: &Path) -> Vec<String> {
    path.components()
        .map(|component| {
            let value = component.as_os_str().to_string_lossy();
            if cfg!(windows) {
                value.to_ascii_lowercase()
            } else {
                value.into_owned()
            }
        })
        .collect()
}

fn paths_overlap(left: &Path, right: &Path) -> bool {
    let left = normalized_components(left);
    let right = normalized_components(right);
    left.starts_with(&right) || right.starts_with(&left)
}

fn metadata_is_link(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn reject_symlink_components(path: &Path) -> Result<(), CodexConfigSnapshotError> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        if !current.is_absolute() {
            continue;
        }
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata_is_link(&metadata) => {
                return Err(failure(
                    CodexConfigSnapshotErrorKind::UnsafePath,
                    "Codex config lifecycle paths must not contain symbolic links.",
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {
                return Err(failure(
                    CodexConfigSnapshotErrorKind::Disk,
                    "Codex config lifecycle path could not be inspected.",
                ));
            }
        }
    }
    Ok(())
}

fn require_regular_directory(path: &Path) -> Result<(), CodexConfigSnapshotError> {
    reject_symlink_components(path)?;
    let metadata = fs::symlink_metadata(path).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Codex config lifecycle directory is unavailable.",
        )
    })?;
    if !metadata.is_dir() || metadata_is_link(&metadata) {
        return Err(failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Codex config lifecycle directory is unsafe.",
        ));
    }
    Ok(())
}

fn validate_boundary(
    codex_home: &Path,
    backup_root: &Path,
) -> Result<(), CodexConfigSnapshotError> {
    if !clean_absolute(codex_home)
        || !clean_absolute(backup_root)
        || paths_overlap(codex_home, backup_root)
    {
        return Err(failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Codex home and managed backup root must be separate absolute paths.",
        ));
    }
    require_regular_directory(codex_home)?;
    let backup_parent = backup_root.parent().ok_or_else(|| {
        failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Managed Codex config backup root has no safe parent.",
        )
    })?;
    require_regular_directory(backup_parent)?;
    let codex_canonical = fs::canonicalize(codex_home).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Codex home could not be resolved safely.",
        )
    })?;
    let backup_parent_canonical = fs::canonicalize(backup_parent).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Managed Codex config backup parent could not be resolved safely.",
        )
    })?;
    let backup_name = backup_root.file_name().ok_or_else(|| {
        failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Managed Codex config backup root has no safe name.",
        )
    })?;
    if paths_overlap(&codex_canonical, &backup_parent_canonical.join(backup_name)) {
        return Err(failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Codex home and managed backup root resolve to overlapping paths.",
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn open_guarded_read(path: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows::Win32::Storage::FileSystem::{FILE_SHARE_DELETE, FILE_SHARE_READ};

    OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ.0 | FILE_SHARE_DELETE.0)
        .open(path)
}

#[cfg(not(windows))]
fn open_guarded_read(path: &Path) -> std::io::Result<File> {
    OpenOptions::new().read(true).open(path)
}

fn read_open_bounded(
    file: &mut File,
    maximum_bytes: u64,
    size_kind: CodexConfigSnapshotErrorKind,
) -> Result<Vec<u8>, CodexConfigSnapshotError> {
    let before = file.metadata().map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Disk,
            "Codex config lifecycle file metadata is unavailable.",
        )
    })?;
    if !before.is_file() || before.len() > maximum_bytes {
        return Err(failure(
            size_kind,
            "Codex config lifecycle file exceeds its safe bound.",
        ));
    }
    let mut bytes = Vec::with_capacity(before.len() as usize);
    file.take(maximum_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|_| {
            failure(
                CodexConfigSnapshotErrorKind::Disk,
                "Codex config lifecycle file could not be read.",
            )
        })?;
    let after = file.metadata().map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Disk,
            "Codex config lifecycle file metadata is unavailable after reading.",
        )
    })?;
    if bytes.len() as u64 > maximum_bytes {
        return Err(failure(
            size_kind,
            "Codex config lifecycle file exceeds its safe bound.",
        ));
    }
    if before.len() != after.len() || before.len() != bytes.len() as u64 {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Unstable,
            "Codex config changed while it was being read.",
        ));
    }
    Ok(bytes)
}

fn read_config_once(config: &Path) -> Result<ConfigState, CodexConfigSnapshotError> {
    let metadata = match fs::symlink_metadata(config) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ConfigState::Absent)
        }
        Err(_) => {
            return Err(failure(
                CodexConfigSnapshotErrorKind::Disk,
                "Codex config could not be inspected.",
            ))
        }
    };
    if metadata_is_link(&metadata) || !metadata.is_file() {
        return Err(failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Codex config must be a regular non-symbolic-link file.",
        ));
    }
    if metadata.len() > MAX_CODEX_CONFIG_BYTES {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Size,
            "Codex config exceeds the 8 MiB safety limit.",
        ));
    }
    let mut file = open_guarded_read(config).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Disk,
            "Codex config could not be opened safely.",
        )
    })?;
    read_open_bounded(
        &mut file,
        MAX_CODEX_CONFIG_BYTES,
        CodexConfigSnapshotErrorKind::Size,
    )
    .map(ConfigState::Present)
}

fn read_config_stable_with_hook<F>(
    config: &Path,
    between_reads: F,
) -> Result<ConfigState, CodexConfigSnapshotError>
where
    F: FnOnce(),
{
    let first = read_config_once(config)?;
    between_reads();
    let second = read_config_once(config)?;
    if first != second {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Unstable,
            "Codex config changed while it was being snapshotted.",
        ));
    }
    Ok(second)
}

fn read_config_stable(config: &Path) -> Result<ConfigState, CodexConfigSnapshotError> {
    read_config_stable_with_hook(config, || {})
}

fn read_regular_bounded(
    path: &Path,
    maximum_bytes: u64,
    failure_kind: CodexConfigSnapshotErrorKind,
) -> Result<Vec<u8>, CodexConfigSnapshotError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| {
        failure(
            failure_kind,
            "Managed Codex config lifecycle file is unavailable.",
        )
    })?;
    if metadata_is_link(&metadata) || !metadata.is_file() || metadata.len() > maximum_bytes {
        return Err(failure(
            failure_kind,
            "Managed Codex config lifecycle file is invalid.",
        ));
    }
    let mut file = open_guarded_read(path).map_err(|_| {
        failure(
            failure_kind,
            "Managed Codex config lifecycle file could not be opened.",
        )
    })?;
    read_open_bounded(&mut file, maximum_bytes, failure_kind).map_err(|error| {
        if error.kind == CodexConfigSnapshotErrorKind::Unstable {
            error
        } else {
            failure(
                failure_kind,
                "Managed Codex config lifecycle file could not be verified.",
            )
        }
    })
}

fn write_new_synced(path: &Path, bytes: &[u8]) -> Result<(), CodexConfigSnapshotError> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| {
            failure(
                CodexConfigSnapshotErrorKind::Disk,
                "Managed Codex config lifecycle file could not be created.",
            )
        })?;
    file.write_all(bytes).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Disk,
            "Managed Codex config lifecycle file could not be written.",
        )
    })?;
    file.sync_all().map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Disk,
            "Managed Codex config lifecycle file could not be finalized.",
        )
    })
}

fn serialize_receipt<T: Serialize>(receipt: &T) -> Result<Vec<u8>, CodexConfigSnapshotError> {
    let bytes = serde_json::to_vec_pretty(receipt).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config receipt could not be serialized.",
        )
    })?;
    if bytes.len() as u64 > MAX_RECEIPT_BYTES {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config receipt exceeds its safe bound.",
        ));
    }
    Ok(bytes)
}

fn next_sibling(path: &Path, label: &str) -> Result<PathBuf, CodexConfigSnapshotError> {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let parent = path.parent().ok_or_else(|| {
        failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Managed Codex config path has no safe parent.",
        )
    })?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            failure(
                CodexConfigSnapshotErrorKind::UnsafePath,
                "Managed Codex config path has no safe file name.",
            )
        })?;
    Ok(parent.join(format!(
        ".{file_name}-{label}-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )))
}

fn ensure_snapshot_matches_disk(
    snapshot: &CodexConfigSnapshot,
) -> Result<CodexConfigSnapshot, CodexConfigSnapshotError> {
    let loaded = load_codex_config_snapshot(&snapshot.codex_home, &snapshot.backup_root)?;
    if loaded.original != snapshot.original {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config snapshot no longer matches its receipt.",
        ));
    }
    Ok(loaded)
}

pub fn create_codex_config_snapshot(
    codex_home: &Path,
    backup_root: &Path,
) -> Result<CodexConfigSnapshot, CodexConfigSnapshotError> {
    create_codex_config_snapshot_with_hook(codex_home, backup_root, || {})
}

fn create_codex_config_snapshot_with_hook<F>(
    codex_home: &Path,
    backup_root: &Path,
    between_reads: F,
) -> Result<CodexConfigSnapshot, CodexConfigSnapshotError>
where
    F: FnOnce(),
{
    validate_boundary(codex_home, backup_root)?;
    match fs::symlink_metadata(backup_root) {
        Ok(_) => return load_codex_config_snapshot(codex_home, backup_root),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => {
            return Err(failure(
                CodexConfigSnapshotErrorKind::Disk,
                "Managed Codex config backup root could not be inspected.",
            ))
        }
    }

    let config = codex_home.join("config.toml");
    let state = read_config_stable_with_hook(&config, between_reads)?;
    let original = state.original();
    let codex_home_sha256 = canonical_home_sha256(codex_home)?;
    let receipt = SnapshotReceipt {
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        codex_home_sha256,
        original: original.clone(),
    };
    let staging = next_sibling(backup_root, "staging")?;
    fs::create_dir(&staging).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Disk,
            "Managed Codex config staging directory could not be created.",
        )
    })?;
    let mut cleanup = CleanupDirectory::armed(staging.clone());
    if let ConfigState::Present(bytes) = &state {
        write_new_synced(&staging.join(ORIGINAL_CONFIG_BACKUP), bytes)?;
    }
    write_new_synced(
        &staging.join(SNAPSHOT_RECEIPT),
        &serialize_receipt(&receipt)?,
    )?;

    if read_config_stable(&config)? != state {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Unstable,
            "Codex config changed before its snapshot was committed.",
        ));
    }
    match fs::rename(&staging, backup_root) {
        Ok(()) => cleanup.disarm(),
        Err(_) if backup_root.exists() => {
            return load_codex_config_snapshot(codex_home, backup_root)
        }
        Err(_) => {
            return Err(failure(
                CodexConfigSnapshotErrorKind::Disk,
                "Managed Codex config snapshot could not be promoted.",
            ))
        }
    }
    load_codex_config_snapshot(codex_home, backup_root)
}

pub fn load_codex_config_snapshot(
    codex_home: &Path,
    backup_root: &Path,
) -> Result<CodexConfigSnapshot, CodexConfigSnapshotError> {
    validate_boundary(codex_home, backup_root)?;
    require_regular_directory(backup_root)?;
    let receipt_bytes = read_regular_bounded(
        &backup_root.join(SNAPSHOT_RECEIPT),
        MAX_RECEIPT_BYTES,
        CodexConfigSnapshotErrorKind::Receipt,
    )?;
    let receipt: SnapshotReceipt = serde_json::from_slice(&receipt_bytes).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config snapshot receipt is invalid.",
        )
    })?;
    if receipt.schema_version != SNAPSHOT_SCHEMA_VERSION {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config snapshot schema is unsupported.",
        ));
    }
    let codex_home_sha256 = canonical_home_sha256(codex_home)?;
    if !is_sha256(&receipt.codex_home_sha256) || receipt.codex_home_sha256 != codex_home_sha256 {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config snapshot belongs to a different Codex home.",
        ));
    }

    let backup = backup_root.join(ORIGINAL_CONFIG_BACKUP);
    match &receipt.original {
        CodexConfigSnapshotOriginal::Absent => match fs::symlink_metadata(&backup) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            _ => {
                return Err(failure(
                    CodexConfigSnapshotErrorKind::Receipt,
                    "Absent Codex config snapshot contains unexpected backup bytes.",
                ))
            }
        },
        CodexConfigSnapshotOriginal::Present { bytes, sha256 } => {
            if *bytes > MAX_CODEX_CONFIG_BYTES || !is_sha256(sha256) {
                return Err(failure(
                    CodexConfigSnapshotErrorKind::Receipt,
                    "Managed Codex config snapshot receipt is invalid.",
                ));
            }
            let backup_bytes = read_regular_bounded(
                &backup,
                MAX_CODEX_CONFIG_BYTES,
                CodexConfigSnapshotErrorKind::Receipt,
            )?;
            if backup_bytes.len() as u64 != *bytes || bytes_sha256(&backup_bytes) != *sha256 {
                return Err(failure(
                    CodexConfigSnapshotErrorKind::Receipt,
                    "Managed Codex config backup does not match its receipt.",
                ));
            }
        }
    }
    Ok(CodexConfigSnapshot {
        codex_home: codex_home.to_path_buf(),
        codex_home_sha256,
        backup_root: backup_root.to_path_buf(),
        original: receipt.original,
    })
}

fn read_armed_receipt(
    snapshot: &CodexConfigSnapshot,
) -> Result<Option<ArmedReceipt>, CodexConfigSnapshotError> {
    let path = snapshot.backup_root.join(ARMED_RECEIPT);
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => {
            return Err(failure(
                CodexConfigSnapshotErrorKind::Receipt,
                "Managed Codex config restore receipt could not be inspected.",
            ))
        }
        Ok(_) => {}
    }
    let bytes = read_regular_bounded(
        &path,
        MAX_RECEIPT_BYTES,
        CodexConfigSnapshotErrorKind::Receipt,
    )?;
    let receipt: ArmedReceipt = serde_json::from_slice(&bytes).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config restore receipt is invalid.",
        )
    })?;
    if receipt.schema_version != SNAPSHOT_SCHEMA_VERSION
        || receipt.codex_home_sha256 != snapshot.codex_home_sha256
        || receipt.original != snapshot.original
        || !is_sha256(&receipt.managed_sha256)
    {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config restore receipt does not match its snapshot.",
        ));
    }
    Ok(Some(receipt))
}

pub fn arm_codex_config_restore(
    snapshot: &CodexConfigSnapshot,
    managed_sha256: &str,
) -> Result<ArmedCodexConfigRestore, CodexConfigSnapshotError> {
    let snapshot = ensure_snapshot_matches_disk(snapshot)?;
    if !is_sha256(managed_sha256) {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config SHA-256 is invalid.",
        ));
    }
    if let Some(existing) = read_armed_receipt(&snapshot)? {
        if existing.managed_sha256 != managed_sha256 {
            return Err(failure(
                CodexConfigSnapshotErrorKind::Receipt,
                "Managed Codex config restore is already armed for different bytes.",
            ));
        }
        return Ok(ArmedCodexConfigRestore {
            snapshot,
            managed_sha256: existing.managed_sha256,
        });
    }

    let config = snapshot.codex_home.join("config.toml");
    let current = read_config_stable(&config)?;
    let ConfigState::Present(current_bytes) = current else {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Drift,
            "Managed Codex config is absent before restore can be armed.",
        ));
    };
    if bytes_sha256(&current_bytes) != managed_sha256 {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Drift,
            "Codex config does not match the exact managed mutation.",
        ));
    }

    let receipt = ArmedReceipt {
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        codex_home_sha256: snapshot.codex_home_sha256.clone(),
        original: snapshot.original.clone(),
        managed_sha256: managed_sha256.to_string(),
    };
    let path = snapshot.backup_root.join(ARMED_RECEIPT);
    match write_new_synced(&path, &serialize_receipt(&receipt)?) {
        Ok(()) => {}
        Err(error) if path.exists() => {
            let existing = read_armed_receipt(&snapshot)?;
            if existing.as_ref() != Some(&receipt) {
                return Err(error);
            }
        }
        Err(error) => return Err(error),
    }
    let after = read_config_stable(&config)?;
    if !matches!(after, ConfigState::Present(ref bytes) if bytes_sha256(bytes) == managed_sha256) {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Drift,
            "Codex config changed while restore was being armed.",
        ));
    }
    Ok(ArmedCodexConfigRestore {
        snapshot,
        managed_sha256: managed_sha256.to_string(),
    })
}

fn verified_original_bytes(
    snapshot: &CodexConfigSnapshot,
) -> Result<Option<Vec<u8>>, CodexConfigSnapshotError> {
    match &snapshot.original {
        CodexConfigSnapshotOriginal::Absent => Ok(None),
        CodexConfigSnapshotOriginal::Present { bytes, sha256 } => {
            let backup = read_regular_bounded(
                &snapshot.backup_root.join(ORIGINAL_CONFIG_BACKUP),
                MAX_CODEX_CONFIG_BYTES,
                CodexConfigSnapshotErrorKind::Receipt,
            )?;
            if backup.len() as u64 != *bytes || bytes_sha256(&backup) != *sha256 {
                return Err(failure(
                    CodexConfigSnapshotErrorKind::Receipt,
                    "Managed Codex config backup no longer matches its receipt.",
                ));
            }
            Ok(Some(backup))
        }
    }
}

fn verify_guarded_current(
    config: &Path,
    expected_sha256: &str,
) -> Result<File, CodexConfigSnapshotError> {
    let metadata = fs::symlink_metadata(config).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Drift,
            "Codex config disappeared before restore.",
        )
    })?;
    if metadata_is_link(&metadata) || !metadata.is_file() {
        return Err(failure(
            CodexConfigSnapshotErrorKind::UnsafePath,
            "Codex config is not a regular file at restore time.",
        ));
    }
    let mut file = open_guarded_read(config).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Drift,
            "Codex config could not be guarded for restore.",
        )
    })?;
    let bytes = read_open_bounded(
        &mut file,
        MAX_CODEX_CONFIG_BYTES,
        CodexConfigSnapshotErrorKind::Size,
    )?;
    if bytes_sha256(&bytes) != expected_sha256 {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Drift,
            "Codex config changed before restore could be committed.",
        ));
    }
    Ok(file)
}

#[cfg(windows)]
fn atomic_replace_file(
    temporary: &Path,
    destination: &Path,
) -> Result<(), CodexConfigSnapshotError> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let temporary = temporary
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    unsafe {
        MoveFileExW(
            PCWSTR(temporary.as_ptr()),
            PCWSTR(destination.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Disk,
            "Original Codex config could not be atomically restored.",
        )
    })
}

#[cfg(not(windows))]
fn atomic_replace_file(
    temporary: &Path,
    destination: &Path,
) -> Result<(), CodexConfigSnapshotError> {
    fs::rename(temporary, destination).map_err(|_| {
        failure(
            CodexConfigSnapshotErrorKind::Disk,
            "Original Codex config could not be atomically restored.",
        )
    })
}

pub fn restore_codex_config(
    armed: &ArmedCodexConfigRestore,
) -> Result<CodexConfigRestoreOutcome, CodexConfigSnapshotError> {
    restore_codex_config_with_hook(armed, || {})
}

fn restore_codex_config_with_hook<F>(
    armed: &ArmedCodexConfigRestore,
    before_commit: F,
) -> Result<CodexConfigRestoreOutcome, CodexConfigSnapshotError>
where
    F: FnOnce(),
{
    let mut before_commit = Some(before_commit);
    let snapshot = ensure_snapshot_matches_disk(&armed.snapshot)?;
    let receipt = read_armed_receipt(&snapshot)?.ok_or_else(|| {
        failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config restore has not been armed.",
        )
    })?;
    if receipt.managed_sha256 != armed.managed_sha256 {
        return Err(failure(
            CodexConfigSnapshotErrorKind::Receipt,
            "Managed Codex config restore handle does not match its receipt.",
        ));
    }
    let original_bytes = verified_original_bytes(&snapshot)?;
    let config = snapshot.codex_home.join("config.toml");
    let current = read_config_stable(&config)?;

    match (&snapshot.original, current, original_bytes) {
        (CodexConfigSnapshotOriginal::Absent, ConfigState::Absent, None) => {
            Ok(CodexConfigRestoreOutcome::AlreadyRestored)
        }
        (
            CodexConfigSnapshotOriginal::Present { sha256, .. },
            ConfigState::Present(current),
            Some(_),
        ) if bytes_sha256(&current) == *sha256 => Ok(CodexConfigRestoreOutcome::AlreadyRestored),
        (CodexConfigSnapshotOriginal::Absent, ConfigState::Present(current), None) => {
            if bytes_sha256(&current) != armed.managed_sha256 {
                return Err(failure(
                    CodexConfigSnapshotErrorKind::Drift,
                    "Codex config contains user changes and will not be removed.",
                ));
            }
            if let Some(before_commit) = before_commit.take() {
                before_commit();
            }
            let guard = verify_guarded_current(&config, &armed.managed_sha256)?;
            fs::remove_file(&config).map_err(|_| {
                failure(
                    CodexConfigSnapshotErrorKind::Disk,
                    "Exact managed Codex config could not be removed.",
                )
            })?;
            drop(guard);
            if fs::symlink_metadata(&config).is_ok() {
                return Err(failure(
                    CodexConfigSnapshotErrorKind::Drift,
                    "Codex config reappeared during restore.",
                ));
            }
            Ok(CodexConfigRestoreOutcome::Restored)
        }
        (
            CodexConfigSnapshotOriginal::Present { .. },
            ConfigState::Present(current),
            Some(original),
        ) => {
            if bytes_sha256(&current) != armed.managed_sha256 {
                return Err(failure(
                    CodexConfigSnapshotErrorKind::Drift,
                    "Codex config contains user changes and will not be overwritten.",
                ));
            }
            let temporary = next_sibling(&config, "restore")?;
            write_new_synced(&temporary, &original)?;
            let mut cleanup = CleanupFile::armed(temporary.clone());
            if let Some(before_commit) = before_commit.take() {
                before_commit();
            }
            let guard = verify_guarded_current(&config, &armed.managed_sha256)?;
            drop(guard);
            atomic_replace_file(&temporary, &config)?;
            cleanup.disarm();
            match read_config_stable(&config)? {
                ConfigState::Present(bytes) if bytes == original => {
                    Ok(CodexConfigRestoreOutcome::Restored)
                }
                _ => Err(failure(
                    CodexConfigSnapshotErrorKind::Unstable,
                    "Restored Codex config could not be verified.",
                )),
            }
        }
        _ => Err(failure(
            CodexConfigSnapshotErrorKind::Drift,
            "Codex config state does not match the armed restore.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        arm_codex_config_restore, create_codex_config_snapshot,
        create_codex_config_snapshot_with_hook, load_codex_config_snapshot, restore_codex_config,
        restore_codex_config_with_hook, CodexConfigRestoreOutcome, CodexConfigSnapshotErrorKind,
        CodexConfigSnapshotOriginal, MAX_CODEX_CONFIG_BYTES,
    };
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    struct Fixture {
        root: PathBuf,
        codex_home: PathBuf,
        backup_root: PathBuf,
    }

    impl Fixture {
        fn new(name: &str) -> Self {
            static SEQUENCE: AtomicU64 = AtomicU64::new(0);
            let root = std::env::temp_dir().join(format!(
                "vibespace-codex-config-{name}-{}-{}",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&root).expect("fixture root");
            let codex_home = root.join("codex-home");
            fs::create_dir(&codex_home).expect("Codex home");
            let backup_root = root.join("managed-backup");
            Self {
                root,
                codex_home,
                backup_root,
            }
        }

        fn config(&self) -> PathBuf {
            self.codex_home.join("config.toml")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn sha256(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn present_config_round_trips_durably_and_restore_is_idempotent() {
        let fixture = Fixture::new("present");
        let original = b"model = \"original\"\n";
        let managed = b"model = \"opencodex\"\n";
        fs::write(fixture.config(), original).expect("original config");

        let snapshot = create_codex_config_snapshot(&fixture.codex_home, &fixture.backup_root)
            .expect("snapshot");
        assert_eq!(
            snapshot.original(),
            &CodexConfigSnapshotOriginal::Present {
                bytes: original.len() as u64,
                sha256: sha256(original),
            }
        );
        assert_eq!(snapshot.original_sha256(), Some(sha256(original).as_str()));
        assert_eq!(
            fs::read(fixture.backup_root.join("original-config.toml")).unwrap(),
            original
        );

        fs::write(fixture.config(), managed).expect("managed config");
        let armed = arm_codex_config_restore(&snapshot, &sha256(managed)).expect("arm restore");
        assert_eq!(armed.managed_sha256(), sha256(managed));
        assert_eq!(
            restore_codex_config(&armed).expect("restore"),
            CodexConfigRestoreOutcome::Restored
        );
        assert_eq!(fs::read(fixture.config()).unwrap(), original);

        let reloaded =
            load_codex_config_snapshot(&fixture.codex_home, &fixture.backup_root).expect("reload");
        let rearmed = arm_codex_config_restore(&reloaded, &sha256(managed)).expect("reload arm");
        assert_eq!(
            restore_codex_config(&rearmed).expect("idempotent restore"),
            CodexConfigRestoreOutcome::AlreadyRestored
        );
    }

    #[test]
    fn absent_config_removes_only_the_exact_attested_managed_file() {
        let fixture = Fixture::new("absent");
        let snapshot = create_codex_config_snapshot(&fixture.codex_home, &fixture.backup_root)
            .expect("absent snapshot");
        assert_eq!(snapshot.original(), &CodexConfigSnapshotOriginal::Absent);

        let managed = b"model = \"opencodex\"\n";
        fs::write(fixture.config(), managed).expect("managed config");
        let armed = arm_codex_config_restore(&snapshot, &sha256(managed)).expect("arm restore");
        assert_eq!(
            restore_codex_config(&armed).expect("restore absent"),
            CodexConfigRestoreOutcome::Restored
        );
        assert!(!fixture.config().exists());
        assert_eq!(
            restore_codex_config(&armed).expect("idempotent absent restore"),
            CodexConfigRestoreOutcome::AlreadyRestored
        );
    }

    #[test]
    fn arm_and_restore_fail_closed_on_wrong_hash_or_user_drift() {
        let fixture = Fixture::new("drift");
        fs::write(fixture.config(), b"original").unwrap();
        let snapshot = create_codex_config_snapshot(&fixture.codex_home, &fixture.backup_root)
            .expect("snapshot");

        fs::write(fixture.config(), b"managed").unwrap();
        let error = arm_codex_config_restore(&snapshot, &sha256(b"different"))
            .expect_err("wrong managed hash must fail");
        assert_eq!(error.kind, CodexConfigSnapshotErrorKind::Drift);

        let armed = arm_codex_config_restore(&snapshot, &sha256(b"managed")).expect("arm");
        fs::write(fixture.config(), b"user edit").unwrap();
        let error = restore_codex_config(&armed).expect_err("drift must fail");
        assert_eq!(error.kind, CodexConfigSnapshotErrorKind::Drift);
        assert_eq!(fs::read(fixture.config()).unwrap(), b"user edit");
    }

    #[test]
    fn final_guard_rejects_drift_between_planning_and_atomic_restore() {
        let fixture = Fixture::new("commit-race");
        fs::write(fixture.config(), b"original").unwrap();
        let snapshot = create_codex_config_snapshot(&fixture.codex_home, &fixture.backup_root)
            .expect("snapshot");
        fs::write(fixture.config(), b"managed").unwrap();
        let armed = arm_codex_config_restore(&snapshot, &sha256(b"managed")).expect("arm");
        let config = fixture.config();

        let error = restore_codex_config_with_hook(&armed, || {
            fs::write(&config, b"user edit during restore").unwrap()
        })
        .expect_err("final guarded comparison must reject drift");
        assert_eq!(error.kind, CodexConfigSnapshotErrorKind::Drift);
        assert_eq!(fs::read(config).unwrap(), b"user edit during restore");
    }

    #[test]
    fn tampered_backup_never_replaces_the_current_config() {
        let fixture = Fixture::new("backup-tamper");
        fs::write(fixture.config(), b"original").unwrap();
        let snapshot = create_codex_config_snapshot(&fixture.codex_home, &fixture.backup_root)
            .expect("snapshot");
        fs::write(fixture.config(), b"managed").unwrap();
        let armed = arm_codex_config_restore(&snapshot, &sha256(b"managed")).expect("arm");
        fs::write(
            fixture.backup_root.join("original-config.toml"),
            b"tampered backup",
        )
        .unwrap();

        let error = restore_codex_config(&armed).expect_err("tampered backup must fail");
        assert_eq!(error.kind, CodexConfigSnapshotErrorKind::Receipt);
        assert_eq!(fs::read(fixture.config()).unwrap(), b"managed");

        let receipt_fixture = Fixture::new("receipt-tamper");
        fs::write(receipt_fixture.config(), b"original").unwrap();
        create_codex_config_snapshot(&receipt_fixture.codex_home, &receipt_fixture.backup_root)
            .expect("snapshot");
        fs::write(
            receipt_fixture.backup_root.join("snapshot.json"),
            br#"{"schema_version":1,"original":{"kind":"present","bytes":8,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"unexpected":true}"#,
        )
        .unwrap();
        let error =
            load_codex_config_snapshot(&receipt_fixture.codex_home, &receipt_fixture.backup_root)
                .expect_err("rewritten receipt must fail");
        assert_eq!(error.kind, CodexConfigSnapshotErrorKind::Receipt);
    }

    #[test]
    fn rejects_overlapping_relative_oversize_and_unstable_inputs() {
        let fixture = Fixture::new("unsafe");
        let nested_backup = fixture.codex_home.join("backup");
        let error = create_codex_config_snapshot(&fixture.codex_home, &nested_backup)
            .expect_err("overlap must fail");
        assert_eq!(error.kind, CodexConfigSnapshotErrorKind::UnsafePath);

        let error = create_codex_config_snapshot(Path::new("relative"), &fixture.backup_root)
            .expect_err("relative root must fail");
        assert_eq!(error.kind, CodexConfigSnapshotErrorKind::UnsafePath);

        fs::write(
            fixture.config(),
            vec![b'x'; MAX_CODEX_CONFIG_BYTES as usize + 1],
        )
        .unwrap();
        let error = create_codex_config_snapshot(
            &fixture.codex_home,
            &fixture.root.join("oversize-backup"),
        )
        .expect_err("oversize must fail");
        assert_eq!(error.kind, CodexConfigSnapshotErrorKind::Size);

        fs::write(fixture.config(), b"first").unwrap();
        let config = fixture.config();
        let error = create_codex_config_snapshot_with_hook(
            &fixture.codex_home,
            &fixture.root.join("unstable-backup"),
            || fs::write(&config, b"second").unwrap(),
        )
        .expect_err("unstable read must fail");
        assert_eq!(error.kind, CodexConfigSnapshotErrorKind::Unstable);
    }

    #[test]
    fn durable_snapshot_cannot_be_reused_for_a_different_codex_home() {
        let fixture = Fixture::new("cross-home");
        fs::write(fixture.config(), b"first-home").unwrap();
        create_codex_config_snapshot(&fixture.codex_home, &fixture.backup_root)
            .expect("first home snapshot");

        let other_home = fixture.root.join("other-codex-home");
        fs::create_dir(&other_home).unwrap();
        fs::write(other_home.join("config.toml"), b"second-home").unwrap();
        let error = load_codex_config_snapshot(&other_home, &fixture.backup_root)
            .expect_err("cross-home receipt replay must fail");
        assert_eq!(error.kind, CodexConfigSnapshotErrorKind::Receipt);
        assert_eq!(
            fs::read(other_home.join("config.toml")).unwrap(),
            b"second-home"
        );
    }

    #[test]
    fn rejects_config_symlinks_where_supported() {
        let fixture = Fixture::new("symlink");
        let target = fixture.root.join("target.toml");
        fs::write(&target, b"outside").unwrap();

        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_file(&target, fixture.config()).is_ok();
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink(&target, fixture.config()).is_ok();
        #[cfg(not(any(windows, unix)))]
        let linked = false;

        if linked {
            let error = create_codex_config_snapshot(&fixture.codex_home, &fixture.backup_root)
                .expect_err("symlink must fail");
            assert_eq!(error.kind, CodexConfigSnapshotErrorKind::UnsafePath);
            assert_eq!(fs::read(target).unwrap(), b"outside");
        }
    }
}
