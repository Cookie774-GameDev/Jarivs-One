use crate::harness::managed_bun_manifest::ManagedBunRelease;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use zip::ZipArchive;

const RECEIPT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedBunFailureKind {
    Cancelled,
    Disk,
    Hash,
    Archive,
    Existing,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedBunFailure {
    pub kind: ManagedBunFailureKind,
    pub message: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedBunInstall {
    pub version: String,
    pub executable: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManagedBunReadiness {
    Missing,
    Incomplete(&'static str),
    Ready(ManagedBunInstall),
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManagedBunReceipt {
    schema_version: u32,
    release: ManagedBunRelease,
    executable_sha256: String,
}

#[derive(Debug)]
struct ValidatedEntry {
    index: usize,
    relative_path: PathBuf,
    is_directory: bool,
    expanded_bytes: u64,
}

struct CleanupPath {
    path: PathBuf,
    armed: bool,
}

impl CleanupPath {
    fn armed(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for CleanupPath {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

fn failure(kind: ManagedBunFailureKind, message: &'static str) -> ManagedBunFailure {
    ManagedBunFailure { kind, message }
}

fn is_safe_version(value: &str) -> bool {
    let parts = value.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
}

fn file_sha256(path: &Path) -> Result<String, ManagedBunFailure> {
    let mut input = File::open(path).map_err(|_| {
        failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun file could not be opened.",
        )
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer).map_err(|_| {
            failure(
                ManagedBunFailureKind::Disk,
                "Managed Bun file could not be read.",
            )
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn version_root(
    managed_root: &Path,
    release: &ManagedBunRelease,
) -> Result<PathBuf, ManagedBunFailure> {
    if !is_safe_version(&release.version) {
        return Err(failure(
            ManagedBunFailureKind::Archive,
            "Managed Bun version is unsafe.",
        ));
    }
    Ok(managed_root.join(&release.version))
}

fn regular_file_within(root: &Path, relative_path: &str) -> Option<PathBuf> {
    let canonical_root = fs::canonicalize(root).ok()?;
    let candidate = root.join(relative_path);
    let metadata = fs::symlink_metadata(&candidate).ok()?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return None;
    }
    fs::canonicalize(&candidate)
        .ok()?
        .starts_with(&canonical_root)
        .then_some(candidate)
}

pub fn inspect_managed_bun(
    managed_root: &Path,
    release: &ManagedBunRelease,
) -> ManagedBunReadiness {
    let Ok(root) = version_root(managed_root, release) else {
        return ManagedBunReadiness::Incomplete("Managed Bun version is unsafe.");
    };
    let metadata = match fs::symlink_metadata(&root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return ManagedBunReadiness::Missing;
        }
        Err(_) => {
            return ManagedBunReadiness::Incomplete(
                "Managed Bun installation could not be inspected.",
            );
        }
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return ManagedBunReadiness::Incomplete(
            "Managed Bun installation root is not a regular directory.",
        );
    }

    let receipt = match fs::read(root.join("receipt.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<ManagedBunReceipt>(&bytes).ok())
    {
        Some(receipt) => receipt,
        None => {
            return ManagedBunReadiness::Incomplete("Managed Bun receipt is unavailable.");
        }
    };
    if receipt.schema_version != RECEIPT_SCHEMA_VERSION || receipt.release != *release {
        return ManagedBunReadiness::Incomplete("Managed Bun receipt does not match.");
    }

    let Some(executable) = regular_file_within(&root, &release.entrypoint) else {
        return ManagedBunReadiness::Incomplete("Managed Bun executable is unavailable.");
    };
    if file_sha256(&executable).ok().as_deref() != Some(receipt.executable_sha256.as_str()) {
        return ManagedBunReadiness::Incomplete("Managed Bun executable integrity failed.");
    }

    ManagedBunReadiness::Ready(ManagedBunInstall {
        version: release.version.clone(),
        executable,
    })
}

fn verify_archive(
    archive_path: &Path,
    release: &ManagedBunRelease,
    cancellation: &AtomicBool,
) -> Result<(), ManagedBunFailure> {
    if cancellation.load(Ordering::Acquire) {
        return Err(failure(
            ManagedBunFailureKind::Cancelled,
            "Managed Bun installation was cancelled.",
        ));
    }
    let metadata = fs::symlink_metadata(archive_path).map_err(|_| {
        failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun archive could not be inspected.",
        )
    })?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() != release.compressed_bytes
    {
        return Err(failure(
            ManagedBunFailureKind::Hash,
            "Managed Bun archive size did not match.",
        ));
    }
    if file_sha256(archive_path)? != release.sha256 {
        return Err(failure(
            ManagedBunFailureKind::Hash,
            "Managed Bun archive integrity failed.",
        ));
    }
    Ok(())
}

fn validate_entries(
    archive: &mut ZipArchive<File>,
    release: &ManagedBunRelease,
    cancellation: &AtomicBool,
) -> Result<Vec<ValidatedEntry>, ManagedBunFailure> {
    if archive.len() == 0 || archive.len() > release.maximum_entries {
        return Err(failure(
            ManagedBunFailureKind::Archive,
            "Managed Bun archive entry count is invalid.",
        ));
    }

    let mut validated = Vec::with_capacity(archive.len());
    let mut seen = BTreeSet::new();
    let mut total_expanded = 0_u64;
    let mut executable_count = 0_usize;
    for index in 0..archive.len() {
        if cancellation.load(Ordering::Acquire) {
            return Err(failure(
                ManagedBunFailureKind::Cancelled,
                "Managed Bun installation was cancelled.",
            ));
        }
        let entry = archive.by_index(index).map_err(|_| {
            failure(
                ManagedBunFailureKind::Archive,
                "Managed Bun archive could not be inspected.",
            )
        })?;
        let entry_name = entry.name();
        if entry_name.contains('\\')
            || entry_name.contains(':')
            || entry_name
                .split('/')
                .any(|component| component.ends_with(['.', ' ']))
        {
            return Err(failure(
                ManagedBunFailureKind::Archive,
                "Managed Bun archive contains an unsafe Windows path.",
            ));
        }
        let relative_path = entry.enclosed_name().ok_or_else(|| {
            failure(
                ManagedBunFailureKind::Archive,
                "Managed Bun archive contains an unsafe path.",
            )
        })?;
        let comparison_path = relative_path
            .to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase();
        if relative_path.as_os_str().is_empty() || !seen.insert(comparison_path) {
            return Err(failure(
                ManagedBunFailureKind::Archive,
                "Managed Bun archive contains a duplicate or empty path.",
            ));
        }

        let is_directory = entry.is_dir();
        if !is_directory && !entry.is_file() {
            return Err(failure(
                ManagedBunFailureKind::Archive,
                "Managed Bun archive contains an unsupported entry.",
            ));
        }
        if let Some(mode) = entry.unix_mode() {
            let file_type = mode & 0o170000;
            let accepted = if is_directory { 0o040000 } else { 0o100000 };
            if file_type != 0 && file_type != accepted {
                return Err(failure(
                    ManagedBunFailureKind::Archive,
                    "Managed Bun archive contains a non-regular entry.",
                ));
            }
        }

        let expanded_bytes = if is_directory { 0 } else { entry.size() };
        total_expanded = total_expanded.checked_add(expanded_bytes).ok_or_else(|| {
            failure(
                ManagedBunFailureKind::Archive,
                "Managed Bun archive expanded size overflowed.",
            )
        })?;
        if total_expanded > release.maximum_expanded_bytes {
            return Err(failure(
                ManagedBunFailureKind::Archive,
                "Managed Bun archive exceeds the expanded size limit.",
            ));
        }
        if !is_directory && relative_path == Path::new(&release.entrypoint) {
            executable_count += 1;
        }
        validated.push(ValidatedEntry {
            index,
            relative_path,
            is_directory,
            expanded_bytes,
        });
    }
    if executable_count != 1 {
        return Err(failure(
            ManagedBunFailureKind::Archive,
            "Managed Bun archive does not contain the expected executable.",
        ));
    }
    Ok(validated)
}

fn extract_archive(
    archive_path: &Path,
    destination: &Path,
    release: &ManagedBunRelease,
    cancellation: &AtomicBool,
) -> Result<(), ManagedBunFailure> {
    let archive_file = File::open(archive_path).map_err(|_| {
        failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun archive could not be opened.",
        )
    })?;
    let mut archive = ZipArchive::new(archive_file).map_err(|_| {
        failure(
            ManagedBunFailureKind::Archive,
            "Managed Bun archive format is invalid.",
        )
    })?;
    let entries = validate_entries(&mut archive, release, cancellation)?;
    for validated in entries {
        if cancellation.load(Ordering::Acquire) {
            return Err(failure(
                ManagedBunFailureKind::Cancelled,
                "Managed Bun installation was cancelled.",
            ));
        }
        let output_path = destination.join(&validated.relative_path);
        if validated.is_directory {
            if let Err(error) = fs::create_dir(&output_path) {
                let existing_is_safe_directory = error.kind() == std::io::ErrorKind::AlreadyExists
                    && fs::symlink_metadata(&output_path)
                        .map(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
                        .unwrap_or(false);
                if !existing_is_safe_directory {
                    return Err(failure(
                        ManagedBunFailureKind::Disk,
                        "Managed Bun archive directory could not be created.",
                    ));
                }
            }
            continue;
        }
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|_| {
                failure(
                    ManagedBunFailureKind::Disk,
                    "Managed Bun archive directory could not be created.",
                )
            })?;
        }
        let entry = archive.by_index(validated.index).map_err(|_| {
            failure(
                ManagedBunFailureKind::Archive,
                "Managed Bun archive entry could not be reopened.",
            )
        })?;
        let mut bounded = entry.take(validated.expanded_bytes.saturating_add(1));
        let mut output = File::options()
            .write(true)
            .create_new(true)
            .open(&output_path)
            .map_err(|_| {
                failure(
                    ManagedBunFailureKind::Disk,
                    "Managed Bun archive file could not be created.",
                )
            })?;
        let written = std::io::copy(&mut bounded, &mut output).map_err(|_| {
            failure(
                ManagedBunFailureKind::Disk,
                "Managed Bun archive file could not be written.",
            )
        })?;
        if written != validated.expanded_bytes {
            return Err(failure(
                ManagedBunFailureKind::Archive,
                "Managed Bun archive entry size changed during extraction.",
            ));
        }
        output.sync_all().map_err(|_| {
            failure(
                ManagedBunFailureKind::Disk,
                "Managed Bun archive file could not be finalized.",
            )
        })?;
    }
    Ok(())
}

pub fn install_verified_bun_archive(
    managed_root: &Path,
    archive_path: &Path,
    release: &ManagedBunRelease,
    cancellation: &AtomicBool,
) -> Result<ManagedBunInstall, ManagedBunFailure> {
    verify_archive(archive_path, release, cancellation)?;
    match inspect_managed_bun(managed_root, release) {
        ManagedBunReadiness::Ready(installed) => return Ok(installed),
        ManagedBunReadiness::Incomplete(_) => {
            return Err(failure(
                ManagedBunFailureKind::Existing,
                "Existing managed Bun installation is incomplete.",
            ));
        }
        ManagedBunReadiness::Missing => {}
    }

    fs::create_dir_all(managed_root).map_err(|_| {
        failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun directory could not be created.",
        )
    })?;
    let root_metadata = fs::symlink_metadata(managed_root).map_err(|_| {
        failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun directory could not be inspected.",
        )
    })?;
    if !root_metadata.is_dir() || root_metadata.file_type().is_symlink() {
        return Err(failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun directory is not a regular directory.",
        ));
    }

    let destination = version_root(managed_root, release)?;
    let staging = managed_root.join(format!(".staging-{}", nanoid::nanoid!(20)));
    fs::create_dir(&staging).map_err(|_| {
        failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun staging directory could not be created.",
        )
    })?;
    let mut cleanup = CleanupPath::armed(staging.clone());
    extract_archive(archive_path, &staging, release, cancellation)?;
    if cancellation.load(Ordering::Acquire) {
        return Err(failure(
            ManagedBunFailureKind::Cancelled,
            "Managed Bun installation was cancelled.",
        ));
    }

    let executable = regular_file_within(&staging, &release.entrypoint).ok_or_else(|| {
        failure(
            ManagedBunFailureKind::Archive,
            "Managed Bun executable is unavailable after extraction.",
        )
    })?;
    let receipt = ManagedBunReceipt {
        schema_version: RECEIPT_SCHEMA_VERSION,
        release: release.clone(),
        executable_sha256: file_sha256(&executable)?,
    };
    let receipt_bytes = serde_json::to_vec_pretty(&receipt).map_err(|_| {
        failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun receipt could not be serialized.",
        )
    })?;
    let mut receipt_file = File::options()
        .write(true)
        .create_new(true)
        .open(staging.join("receipt.json"))
        .map_err(|_| {
            failure(
                ManagedBunFailureKind::Disk,
                "Managed Bun receipt could not be created.",
            )
        })?;
    receipt_file.write_all(&receipt_bytes).map_err(|_| {
        failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun receipt could not be written.",
        )
    })?;
    receipt_file.sync_all().map_err(|_| {
        failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun receipt could not be finalized.",
        )
    })?;
    drop(receipt_file);

    fs::rename(&staging, &destination).map_err(|_| {
        failure(
            ManagedBunFailureKind::Disk,
            "Managed Bun version could not be promoted.",
        )
    })?;
    cleanup.disarm();
    match inspect_managed_bun(managed_root, release) {
        ManagedBunReadiness::Ready(installed) => Ok(installed),
        _ => Err(failure(
            ManagedBunFailureKind::Archive,
            "Managed Bun verification failed after installation.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{inspect_managed_bun, install_verified_bun_archive, ManagedBunReadiness};
    use crate::harness::managed_bun_manifest::{embedded_managed_bun_release, ManagedBunRelease};
    use sha2::{Digest, Sha256};
    use std::fs::{self, File};
    use std::io::Write;
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::atomic::AtomicBool;
    use std::sync::atomic::AtomicU64;
    use std::sync::atomic::Ordering;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn temp_dir(name: &str) -> PathBuf {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        std::env::temp_dir().join(format!(
            "vibespace-managed-bun-{name}-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ))
    }

    fn fixture_archive(root: &std::path::Path, entrypoint: &str) -> (PathBuf, Vec<u8>) {
        fs::create_dir_all(root).unwrap();
        let archive_path = root.join("bun.zip");
        let executable = b"MZ-bun-fixture".to_vec();
        let file = File::create(&archive_path).unwrap();
        let mut zip = ZipWriter::new(file);
        zip.add_directory("bun-windows-x64/", SimpleFileOptions::default())
            .unwrap();
        zip.start_file(entrypoint, SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&executable).unwrap();
        zip.finish().unwrap();
        (archive_path, executable)
    }

    fn fixture_release(archive_path: &std::path::Path) -> ManagedBunRelease {
        let bytes = fs::read(archive_path).unwrap();
        ManagedBunRelease {
            platform: "windows".into(),
            architecture: "x86_64".into(),
            version: "1.4.0".into(),
            asset: "bun-windows-x64.zip".into(),
            url: "https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/bun-windows-x64.zip"
                .into(),
            compressed_bytes: bytes.len() as u64,
            sha256: format!("{:x}", Sha256::digest(&bytes)),
            entrypoint: "bun-windows-x64/bun.exe".into(),
            license: "MIT".into(),
            maximum_expanded_bytes: 1024,
            maximum_entries: 4,
        }
    }

    #[test]
    fn verified_archive_is_atomically_installed_and_tampering_fails_closed() {
        let fixture = temp_dir("install");
        let managed_root = fixture.join("managed");
        let (archive, executable_bytes) = fixture_archive(&fixture, "bun-windows-x64/bun.exe");
        let release = fixture_release(&archive);
        let cancellation = AtomicBool::new(false);

        let installed =
            install_verified_bun_archive(&managed_root, &archive, &release, &cancellation)
                .expect("install");
        assert_eq!(fs::read(&installed.executable).unwrap(), executable_bytes);
        assert!(matches!(
            inspect_managed_bun(&managed_root, &release),
            ManagedBunReadiness::Ready(_)
        ));

        fs::write(&installed.executable, b"tampered").unwrap();
        assert!(matches!(
            inspect_managed_bun(&managed_root, &release),
            ManagedBunReadiness::Incomplete(_)
        ));

        fs::remove_dir_all(fixture).unwrap();
    }

    #[test]
    fn wrong_hash_missing_entrypoint_and_cancellation_never_promote() {
        let fixture = temp_dir("reject");
        let managed_root = fixture.join("managed");
        let (archive, _) = fixture_archive(&fixture, "bun-windows-x64/not-bun.exe");
        let mut release = fixture_release(&archive);
        let cancellation = AtomicBool::new(false);
        assert!(
            install_verified_bun_archive(&managed_root, &archive, &release, &cancellation,)
                .is_err()
        );
        assert!(!managed_root.join("1.4.0").exists());

        release.sha256 = "0".repeat(64);
        assert!(
            install_verified_bun_archive(&managed_root, &archive, &release, &cancellation,)
                .is_err()
        );
        assert!(!managed_root.join("1.4.0").exists());

        cancellation.store(true, Ordering::Release);
        assert!(install_verified_bun_archive(
            &managed_root,
            &archive,
            &fixture_release(&archive),
            &cancellation,
        )
        .is_err());
        assert!(!managed_root.join("1.4.0").exists());

        fs::remove_dir_all(fixture).unwrap();
    }

    #[test]
    #[ignore = "requires VIBESPACE_MANAGED_BUN_ARCHIVE to name the audited official ZIP"]
    fn audited_official_archive_materializes_and_executes() {
        let archive = PathBuf::from(
            std::env::var("VIBESPACE_MANAGED_BUN_ARCHIVE").expect("audited archive path"),
        );
        let release = embedded_managed_bun_release("windows", "x86_64").expect("embedded release");
        let fixture = temp_dir("official");
        let installed =
            install_verified_bun_archive(&fixture, &archive, &release, &AtomicBool::new(false))
                .expect("official archive install");
        let output = Command::new(&installed.executable)
            .arg("--version")
            .output()
            .expect("managed Bun launch");
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "1.4.0");
        fs::remove_dir_all(fixture).unwrap();
    }
}
