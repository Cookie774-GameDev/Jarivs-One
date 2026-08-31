use crate::harness::managed_bun_materializer::download_and_install_embedded_bun;
use crate::harness::managed_cli_lock::{
    embedded_opencodex_install_files, managed_bun_install_arguments,
};
use crate::harness::managed_cli_manifest::{embedded_managed_release, ManagedCliKind};
use crate::harness::managed_cli_runtime::{
    inspect_managed_runtime, ManagedCliReadiness, ManagedRuntimeReceipt,
};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

const INSTALL_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const OPENCODEX_ENTRYPOINT: &str = "node_modules/@bitkyc08/opencodex/bin/ocx.mjs";
const OPENCODEX_BUN_EXECUTABLE: &str = "node_modules/@oven/bun-windows-x64/bin/bun.exe";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedOpenCodexFailureKind {
    Cancelled,
    Bootstrap,
    Disk,
    Process,
    Integrity,
    Existing,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedOpenCodexFailure {
    pub kind: ManagedOpenCodexFailureKind,
    pub message: &'static str,
}

struct CleanupPath(PathBuf);

impl CleanupPath {
    fn disarm(mut self) {
        self.0 = PathBuf::new();
    }
}

impl Drop for CleanupPath {
    fn drop(&mut self) {
        if !self.0.as_os_str().is_empty() {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}

fn failure(kind: ManagedOpenCodexFailureKind, message: &'static str) -> ManagedOpenCodexFailure {
    ManagedOpenCodexFailure { kind, message }
}

fn ensure_regular_directory(path: &Path) -> Result<(), ManagedOpenCodexFailure> {
    fs::create_dir_all(path).map_err(|_| {
        failure(
            ManagedOpenCodexFailureKind::Disk,
            "Managed OpenCodex directory could not be created.",
        )
    })?;
    let metadata = fs::symlink_metadata(path).map_err(|_| {
        failure(
            ManagedOpenCodexFailureKind::Disk,
            "Managed OpenCodex directory could not be inspected.",
        )
    })?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(failure(
            ManagedOpenCodexFailureKind::Disk,
            "Managed OpenCodex directory is not a regular directory.",
        ));
    }
    Ok(())
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), ManagedOpenCodexFailure> {
    let mut output = File::options()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| {
            failure(
                ManagedOpenCodexFailureKind::Disk,
                "Managed OpenCodex install file could not be created.",
            )
        })?;
    output.write_all(bytes).map_err(|_| {
        failure(
            ManagedOpenCodexFailureKind::Disk,
            "Managed OpenCodex install file could not be written.",
        )
    })?;
    output.sync_all().map_err(|_| {
        failure(
            ManagedOpenCodexFailureKind::Disk,
            "Managed OpenCodex install file could not be finalized.",
        )
    })?;
    Ok(())
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

fn file_sha256(path: &Path) -> Result<String, ManagedOpenCodexFailure> {
    let bytes = fs::read(path).map_err(|_| {
        failure(
            ManagedOpenCodexFailureKind::Disk,
            "Managed OpenCodex installed file could not be read.",
        )
    })?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn run_frozen_install(
    bun_executable: &Path,
    staging: &Path,
    cancellation: &AtomicBool,
) -> Result<(), ManagedOpenCodexFailure> {
    let cache = staging.join(".bun-cache");
    let mut child = Command::new(bun_executable)
        .args(managed_bun_install_arguments(staging))
        .current_dir(staging)
        .env("BUN_INSTALL_CACHE_DIR", &cache)
        .env("NO_UPDATE_NOTIFIER", "1")
        .env_remove("BUN_CONFIG_REGISTRY")
        .env_remove("NPM_CONFIG_USERCONFIG")
        .env_remove("npm_config_userconfig")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| {
            failure(
                ManagedOpenCodexFailureKind::Process,
                "Managed OpenCodex frozen install could not start.",
            )
        })?;
    let started = Instant::now();
    let status = loop {
        if cancellation.load(Ordering::Acquire) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(failure(
                ManagedOpenCodexFailureKind::Cancelled,
                "Managed OpenCodex installation was cancelled.",
            ));
        }
        if started.elapsed() >= INSTALL_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err(failure(
                ManagedOpenCodexFailureKind::Process,
                "Managed OpenCodex frozen install timed out.",
            ));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(failure(
                    ManagedOpenCodexFailureKind::Process,
                    "Managed OpenCodex frozen install could not be observed.",
                ));
            }
        }
    };
    if !status.success() {
        return Err(failure(
            ManagedOpenCodexFailureKind::Process,
            "Managed OpenCodex frozen install failed.",
        ));
    }
    if cache.exists() {
        fs::remove_dir_all(&cache).map_err(|_| {
            failure(
                ManagedOpenCodexFailureKind::Disk,
                "Managed OpenCodex staging cache could not be removed.",
            )
        })?;
    }
    Ok(())
}

pub fn download_and_install_embedded_opencodex<F>(
    managed_base: &Path,
    cancellation: &AtomicBool,
    mut on_progress: F,
) -> Result<ManagedCliReadiness, ManagedOpenCodexFailure>
where
    F: FnMut(f64),
{
    if cancellation.load(Ordering::Acquire) {
        return Err(failure(
            ManagedOpenCodexFailureKind::Cancelled,
            "Managed OpenCodex installation was cancelled.",
        ));
    }
    let release = embedded_managed_release(ManagedCliKind::OpenCodex, "windows", "x86_64")
        .map_err(|_| {
            failure(
                ManagedOpenCodexFailureKind::Integrity,
                "Managed OpenCodex release manifest is unavailable.",
            )
        })?;
    let files = embedded_opencodex_install_files().map_err(|_| {
        failure(
            ManagedOpenCodexFailureKind::Integrity,
            "Managed OpenCodex dependency authority is unavailable.",
        )
    })?;
    if files.dependency_lock.opencodex_version != release.version
        || files.dependency_lock.bun_version != "1.4.0"
        || files.dependency_lock.runs_dependency_scripts
    {
        return Err(failure(
            ManagedOpenCodexFailureKind::Integrity,
            "Managed OpenCodex release and dependency authority do not match.",
        ));
    }

    let opencodex_root = managed_base.join("opencodex");
    match inspect_managed_runtime(&opencodex_root, &release) {
        ready @ ManagedCliReadiness::Ready { .. }
        | ready @ ManagedCliReadiness::ProbeRequired { .. } => return Ok(ready),
        ManagedCliReadiness::Incomplete { .. } => {
            return Err(failure(
                ManagedOpenCodexFailureKind::Existing,
                "Existing managed OpenCodex installation is incomplete.",
            ));
        }
        ManagedCliReadiness::Missing => {}
    }

    on_progress(0.0);
    let bun =
        download_and_install_embedded_bun(&managed_base.join("bun"), cancellation, |progress| {
            on_progress(progress * 0.45)
        })
        .map_err(|_| {
            failure(
                ManagedOpenCodexFailureKind::Bootstrap,
                "Managed OpenCodex Bun bootstrap failed.",
            )
        })?;
    if bun.version != files.dependency_lock.bun_version {
        return Err(failure(
            ManagedOpenCodexFailureKind::Integrity,
            "Managed OpenCodex Bun bootstrap version does not match.",
        ));
    }
    on_progress(0.5);

    let versions_root = opencodex_root.join("versions");
    ensure_regular_directory(&versions_root)?;
    let destination = versions_root.join(&release.version);
    if destination.exists() {
        return Err(failure(
            ManagedOpenCodexFailureKind::Existing,
            "Existing managed OpenCodex installation is incomplete.",
        ));
    }
    let staging = versions_root.join(format!(".staging-{}", nanoid::nanoid!(20)));
    fs::create_dir(&staging).map_err(|_| {
        failure(
            ManagedOpenCodexFailureKind::Disk,
            "Managed OpenCodex staging directory could not be created.",
        )
    })?;
    let cleanup = CleanupPath(staging.clone());
    write_new_file(&staging.join("package.json"), files.package_json.as_bytes())?;
    write_new_file(&staging.join("bun.lock"), files.bun_lock.as_bytes())?;
    write_new_file(&staging.join("bunfig.toml"), files.bunfig.as_bytes())?;
    run_frozen_install(&bun.executable, &staging, cancellation)?;
    on_progress(0.9);

    let entrypoint = regular_file_within(&staging, OPENCODEX_ENTRYPOINT).ok_or_else(|| {
        failure(
            ManagedOpenCodexFailureKind::Integrity,
            "Managed OpenCodex entrypoint is unavailable after install.",
        )
    })?;
    let runtime_executable =
        regular_file_within(&staging, OPENCODEX_BUN_EXECUTABLE).ok_or_else(|| {
            failure(
                ManagedOpenCodexFailureKind::Integrity,
                "Managed OpenCodex Bun runtime is unavailable after install.",
            )
        })?;
    let lock_path = regular_file_within(&staging, "bun.lock").ok_or_else(|| {
        failure(
            ManagedOpenCodexFailureKind::Integrity,
            "Managed OpenCodex lock is unavailable after install.",
        )
    })?;
    let receipt = ManagedRuntimeReceipt::opencodex(
        &release,
        &file_sha256(&entrypoint)?,
        &file_sha256(&lock_path)?,
        &file_sha256(&runtime_executable)?,
    );
    let receipt_bytes = serde_json::to_vec_pretty(&receipt).map_err(|_| {
        failure(
            ManagedOpenCodexFailureKind::Disk,
            "Managed OpenCodex receipt could not be serialized.",
        )
    })?;
    write_new_file(&staging.join("vibespace-runtime.json"), &receipt_bytes)?;
    if cancellation.load(Ordering::Acquire) {
        return Err(failure(
            ManagedOpenCodexFailureKind::Cancelled,
            "Managed OpenCodex installation was cancelled.",
        ));
    }
    fs::rename(&staging, &destination).map_err(|_| {
        failure(
            ManagedOpenCodexFailureKind::Disk,
            "Managed OpenCodex version could not be promoted.",
        )
    })?;
    cleanup.disarm();
    on_progress(1.0);
    match inspect_managed_runtime(&opencodex_root, &release) {
        readiness @ ManagedCliReadiness::ProbeRequired { .. } => Ok(readiness),
        _ => Err(failure(
            ManagedOpenCodexFailureKind::Integrity,
            "Managed OpenCodex verification failed after installation.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::download_and_install_embedded_opencodex;
    use crate::harness::managed_cli_runtime::ManagedCliReadiness;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::atomic::AtomicU64;
    use std::sync::atomic::{AtomicBool, Ordering};

    fn temp_dir(name: &str) -> PathBuf {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        std::env::temp_dir().join(format!(
            "vibespace-managed-opencodex-{name}-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn cancellation_before_bootstrap_never_creates_a_version() {
        let fixture = temp_dir("cancelled");
        let cancellation = AtomicBool::new(true);
        assert!(download_and_install_embedded_opencodex(&fixture, &cancellation, |_| {}).is_err());
        assert!(!fixture.join("opencodex/versions/2.36.0").exists());
    }

    #[test]
    #[ignore = "downloads and installs the exact pinned Bun/OpenCodex closure"]
    fn audited_official_closure_materializes_to_probe_required() {
        let fixture = temp_dir("official");
        let readiness =
            download_and_install_embedded_opencodex(&fixture, &AtomicBool::new(false), |_| {})
                .expect("managed OpenCodex install");
        let ManagedCliReadiness::ProbeRequired { launch, .. } = readiness else {
            panic!("managed OpenCodex must require its bounded loopback probe");
        };
        assert!(launch
            .executable
            .ends_with("node_modules/@oven/bun-windows-x64/bin/bun.exe"));
        assert_eq!(launch.arguments.last().map(String::as_str), Some("--json"));
        let output = Command::new(&launch.executable)
            .args(&launch.arguments)
            .output()
            .expect("bounded ready probe launch");
        assert_eq!(output.status.code(), Some(1));
        let status: serde_json::Value = serde_json::from_slice(&output.stdout).expect("ready JSON");
        assert_eq!(
            status.get("ready").and_then(|value| value.as_bool()),
            Some(false)
        );
        assert_eq!(
            status.get("status").and_then(|value| value.as_str()),
            Some("unreachable")
        );
        fs::remove_dir_all(fixture).unwrap();
    }
}
