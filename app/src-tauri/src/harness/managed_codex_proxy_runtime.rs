use crate::harness::managed_cli_manifest::{embedded_managed_release, ManagedCliKind};
use crate::harness::managed_cli_runtime::{inspect_managed_runtime, ManagedCliReadiness};
use crate::harness::managed_codex_proxy_profile::ManagedCodexProxyProfile;
use std::fs;
use std::path::{Path, PathBuf};

const REVIEWED_OPENCODEX_VERSION: &str = "2.36.0";
const SOURCE_ENTRYPOINT: &str = "node_modules/@bitkyc08/opencodex/src/cli/index.ts";
const BUN_ENTRYPOINT: &str = "node_modules/@oven/bun-windows-x64/bin/bun.exe";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewedOpenCodexRuntime {
    pub bun_executable: PathBuf,
    pub source_entrypoint: PathBuf,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IsolatedCodexProxyPaths {
    pub root: PathBuf,
    pub opencodex_home: PathBuf,
    pub codex_home: PathBuf,
    pub opencodex_config: PathBuf,
    pub codex_config: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedCodexProxyRuntimeError {
    UnsafeRoot,
    RuntimeUnavailable,
    RuntimeUnreviewed,
    ProfileContainsSecret,
    Disk,
}

fn runtime_from_attested_readiness(
    readiness: ManagedCliReadiness,
) -> Result<ReviewedOpenCodexRuntime, ManagedCodexProxyRuntimeError> {
    match readiness {
        ManagedCliReadiness::Missing => Err(ManagedCodexProxyRuntimeError::RuntimeUnavailable),
        ManagedCliReadiness::Incomplete { .. } | ManagedCliReadiness::Ready { .. } => {
            Err(ManagedCodexProxyRuntimeError::RuntimeUnreviewed)
        }
        ManagedCliReadiness::ProbeRequired { launch, .. } => {
            if launch.arguments.len() != 3
                || launch.arguments[1] != "ready"
                || launch.arguments[2] != "--json"
                || !launch.executable.ends_with(BUN_ENTRYPOINT)
            {
                return Err(ManagedCodexProxyRuntimeError::RuntimeUnreviewed);
            }
            let source_entrypoint = PathBuf::from(&launch.arguments[0]);
            if !source_entrypoint.ends_with(SOURCE_ENTRYPOINT) {
                return Err(ManagedCodexProxyRuntimeError::RuntimeUnreviewed);
            }
            Ok(ReviewedOpenCodexRuntime {
                bun_executable: launch.executable,
                source_entrypoint,
                version: REVIEWED_OPENCODEX_VERSION.to_string(),
            })
        }
    }
}

pub fn resolve_reviewed_opencodex_runtime(
    managed_base: &Path,
    _roaming_app_data: Option<&Path>,
) -> Result<ReviewedOpenCodexRuntime, ManagedCodexProxyRuntimeError> {
    let release = embedded_managed_release(ManagedCliKind::OpenCodex, "windows", "x86_64")
        .map_err(|_| ManagedCodexProxyRuntimeError::RuntimeUnreviewed)?;
    if release.version != REVIEWED_OPENCODEX_VERSION {
        return Err(ManagedCodexProxyRuntimeError::RuntimeUnreviewed);
    }
    runtime_from_attested_readiness(inspect_managed_runtime(
        &managed_base.join("opencodex"),
        &release,
    ))
}

fn ensure_owned_directory(path: &Path) -> Result<(), ManagedCodexProxyRuntimeError> {
    fs::create_dir_all(path).map_err(|_| ManagedCodexProxyRuntimeError::Disk)?;
    let metadata = fs::symlink_metadata(path).map_err(|_| ManagedCodexProxyRuntimeError::Disk)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(ManagedCodexProxyRuntimeError::UnsafeRoot);
    }
    Ok(())
}

fn replace_owned_file(path: &Path, bytes: &[u8]) -> Result<(), ManagedCodexProxyRuntimeError> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(ManagedCodexProxyRuntimeError::UnsafeRoot);
        }
    }
    let parent = path
        .parent()
        .ok_or(ManagedCodexProxyRuntimeError::UnsafeRoot)?;
    let temporary = parent.join(format!(".vibespace-profile-{}.tmp", nanoid::nanoid!(16)));
    fs::write(&temporary, bytes).map_err(|_| ManagedCodexProxyRuntimeError::Disk)?;
    if path.exists() {
        fs::remove_file(path).map_err(|_| ManagedCodexProxyRuntimeError::Disk)?;
    }
    fs::rename(&temporary, path).map_err(|_| ManagedCodexProxyRuntimeError::Disk)
}

pub fn materialize_isolated_profile(
    app_data_root: &Path,
    profile: &ManagedCodexProxyProfile,
) -> Result<IsolatedCodexProxyPaths, ManagedCodexProxyRuntimeError> {
    if !app_data_root.is_absolute()
        || profile
            .opencodex_config_json
            .windows(b"VIBESPACE_OPENCODE_GO_API_KEY=".len())
            .any(|window| window == b"VIBESPACE_OPENCODE_GO_API_KEY=")
    {
        return Err(if app_data_root.is_absolute() {
            ManagedCodexProxyRuntimeError::ProfileContainsSecret
        } else {
            ManagedCodexProxyRuntimeError::UnsafeRoot
        });
    }
    let root = app_data_root.join("managed/codex-opencodex");
    let opencodex_home = root.join("opencodex-home");
    let codex_home = root.join("codex-home");
    ensure_owned_directory(&opencodex_home)?;
    ensure_owned_directory(&codex_home)?;
    let opencodex_config = opencodex_home.join("config.json");
    let codex_config = codex_home.join("config.toml");
    replace_owned_file(&opencodex_config, &profile.opencodex_config_json)?;
    replace_owned_file(&codex_config, &profile.codex_config_toml)?;
    Ok(IsolatedCodexProxyPaths {
        root,
        opencodex_home,
        codex_home,
        opencodex_config,
        codex_config,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::managed_codex_proxy_profile::build_managed_codex_proxy_profile;
    use std::net::Ipv4Addr;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn temp_root(name: &str) -> PathBuf {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        std::env::temp_dir().join(format!(
            "vibespace-proxy-runtime-{name}-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ))
    }

    fn metadata_only_runtime(root: &Path, version: &str) {
        fs::create_dir_all(root.join(SOURCE_ENTRYPOINT).parent().unwrap()).unwrap();
        fs::create_dir_all(root.join("node_modules/@oven/bun-windows-x64/bin")).unwrap();
        fs::write(
            root.join("node_modules/@bitkyc08/opencodex/package.json"),
            format!(r#"{{"name":"@bitkyc08/opencodex","version":"{version}"}}"#),
        )
        .unwrap();
        fs::write(root.join(SOURCE_ENTRYPOINT), b"source").unwrap();
        fs::write(root.join(BUN_ENTRYPOINT), b"bun").unwrap();
    }

    #[test]
    fn metadata_only_or_byte_mutated_managed_runtime_fails_closed() {
        let fixture = temp_root("resolve");
        let managed = fixture
            .join("managed/opencodex/versions")
            .join(REVIEWED_OPENCODEX_VERSION);
        metadata_only_runtime(&managed, REVIEWED_OPENCODEX_VERSION);
        assert_eq!(
            resolve_reviewed_opencodex_runtime(&fixture.join("managed"), None).err(),
            Some(ManagedCodexProxyRuntimeError::RuntimeUnreviewed)
        );
        fs::write(managed.join(BUN_ENTRYPOINT), b"mutated bun").unwrap();
        assert_eq!(
            resolve_reviewed_opencodex_runtime(&fixture.join("managed"), None).err(),
            Some(ManagedCodexProxyRuntimeError::RuntimeUnreviewed)
        );
        fs::write(managed.join(BUN_ENTRYPOINT), b"bun").unwrap();
        fs::write(managed.join(SOURCE_ENTRYPOINT), b"mutated source").unwrap();
        assert_eq!(
            resolve_reviewed_opencodex_runtime(&fixture.join("managed"), None).err(),
            Some(ManagedCodexProxyRuntimeError::RuntimeUnreviewed)
        );
        fs::remove_dir_all(fixture).unwrap();
    }

    #[test]
    fn roaming_package_metadata_never_attests_a_runtime() {
        let fixture = temp_root("roaming-metadata");
        let roaming = fixture.join("roaming/npm/node_modules/@bitkyc08/opencodex");
        metadata_only_runtime(&roaming, REVIEWED_OPENCODEX_VERSION);

        assert_eq!(
            resolve_reviewed_opencodex_runtime(
                &fixture.join("managed"),
                Some(&fixture.join("roaming")),
            )
            .err(),
            Some(ManagedCodexProxyRuntimeError::RuntimeUnavailable)
        );
        fs::remove_dir_all(fixture).unwrap();
    }

    #[test]
    fn installer_attested_probe_plan_maps_to_the_reviewed_runtime() {
        let root = temp_root("attested-plan");
        let bun = root.join(BUN_ENTRYPOINT);
        let source = root.join(SOURCE_ENTRYPOINT);
        let runtime = runtime_from_attested_readiness(ManagedCliReadiness::ProbeRequired {
            launch: crate::harness::managed_cli_runtime::ManagedCliLaunch {
                executable: bun.clone(),
                arguments: vec![
                    source.to_string_lossy().into_owned(),
                    "ready".to_string(),
                    "--json".to_string(),
                ],
            },
            dependency_lock_sha256: "a".repeat(64),
        })
        .expect("attested runtime projection");

        assert_eq!(runtime.bun_executable, bun);
        assert_eq!(runtime.source_entrypoint, source);
        assert_eq!(runtime.version, REVIEWED_OPENCODEX_VERSION);
    }

    #[test]
    fn profile_materialization_is_isolated_secret_free_and_idempotent() {
        let fixture = temp_root("profile");
        fs::create_dir(&fixture).unwrap();
        let profile = build_managed_codex_proxy_profile(
            Ipv4Addr::LOCALHOST,
            10_101,
            "opencode-go/deepseek-v4-flash-vision-exp",
        )
        .unwrap();
        let first = materialize_isolated_profile(&fixture, &profile).expect("first");
        let second = materialize_isolated_profile(&fixture, &profile).expect("second");
        assert_eq!(first, second);
        assert_eq!(
            fs::read(first.opencodex_config).unwrap(),
            profile.opencodex_config_json
        );
        assert_eq!(
            fs::read(first.codex_config).unwrap(),
            profile.codex_config_toml
        );
        fs::remove_dir_all(fixture).unwrap();
    }

    #[test]
    fn relative_roots_and_non_files_fail_closed() {
        let profile = build_managed_codex_proxy_profile(
            Ipv4Addr::LOCALHOST,
            10_101,
            "opencode-go/deepseek-v4-flash-vision-exp",
        )
        .unwrap();
        assert_eq!(
            materialize_isolated_profile(Path::new("relative"), &profile).err(),
            Some(ManagedCodexProxyRuntimeError::UnsafeRoot)
        );
        let fixture = temp_root("unsafe");
        fs::create_dir_all(fixture.join("managed/codex-opencodex/opencodex-home/config.json"))
            .unwrap();
        assert!(materialize_isolated_profile(&fixture, &profile).is_err());
        fs::remove_dir_all(fixture).unwrap();
    }
}
