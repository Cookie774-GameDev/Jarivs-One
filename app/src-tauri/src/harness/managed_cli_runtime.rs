use crate::harness::managed_cli_manifest::{ManagedCliKind, ManagedCliRelease};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

const RUNTIME_RECEIPT_SCHEMA_VERSION: u32 = 1;
const OPENCODEX_REQUIRED_FILES: &[&str] = &[
    "package/src/cli/index.ts",
    "package/node_modules/.package-lock.json",
    "package/node_modules/bun/package.json",
    "package/node_modules/bun/bin/bun.exe",
    "package/node_modules/@bufbuild/protobuf/package.json",
    "package/node_modules/@modelcontextprotocol/sdk/package.json",
    "package/node_modules/@napi-rs/keyring/package.json",
    "package/node_modules/@napi-rs/keyring-win32-x64-msvc/package.json",
    "package/node_modules/@napi-rs/keyring-win32-x64-msvc/keyring.win32-x64-msvc.node",
    "package/node_modules/@oven/bun-windows-x64/package.json",
    "package/node_modules/zod/package.json",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedCliLaunch {
    pub executable: PathBuf,
    pub arguments: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManagedCliReadiness {
    Missing,
    Incomplete {
        reason: &'static str,
    },
    ProbeRequired {
        launch: ManagedCliLaunch,
        dependency_lock_sha256: String,
    },
    Ready {
        launch: ManagedCliLaunch,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedCliProbe {
    pub kind: ManagedCliKind,
    pub version: String,
    pub exit_code: i32,
    pub ready: bool,
    pub loopback: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedRuntimeReceipt {
    schema_version: u32,
    kind: ManagedCliKind,
    version: String,
    artifact_sha256: String,
    entrypoint: String,
    entrypoint_sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    dependency_lock_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    runtime_executable_sha256: Option<String>,
}

impl ManagedRuntimeReceipt {
    pub fn codex(release: &ManagedCliRelease, entrypoint_sha256: &str) -> Self {
        Self::new(release, entrypoint_sha256, None, None)
    }

    pub fn opencodex(
        release: &ManagedCliRelease,
        entrypoint_sha256: &str,
        dependency_lock_sha256: &str,
        runtime_executable_sha256: &str,
    ) -> Self {
        Self::new(
            release,
            entrypoint_sha256,
            Some(dependency_lock_sha256.to_string()),
            Some(runtime_executable_sha256.to_string()),
        )
    }

    fn new(
        release: &ManagedCliRelease,
        entrypoint_sha256: &str,
        dependency_lock_sha256: Option<String>,
        runtime_executable_sha256: Option<String>,
    ) -> Self {
        Self {
            schema_version: RUNTIME_RECEIPT_SCHEMA_VERSION,
            kind: release.kind,
            version: release.version.clone(),
            artifact_sha256: release.sha256.clone(),
            entrypoint: release.entrypoint.clone(),
            entrypoint_sha256: entrypoint_sha256.to_string(),
            dependency_lock_sha256,
            runtime_executable_sha256,
        }
    }

    fn matches_release(&self, release: &ManagedCliRelease) -> bool {
        self.schema_version == RUNTIME_RECEIPT_SCHEMA_VERSION
            && self.kind == release.kind
            && self.version == release.version
            && self.artifact_sha256 == release.sha256
            && self.entrypoint == release.entrypoint
            && is_sha256(&self.entrypoint_sha256)
            && match release.kind {
                ManagedCliKind::Codex => {
                    self.dependency_lock_sha256.is_none()
                        && self.runtime_executable_sha256.is_none()
                }
                ManagedCliKind::OpenCodex => {
                    self.dependency_lock_sha256
                        .as_deref()
                        .map(is_sha256)
                        .unwrap_or(false)
                        && self
                            .runtime_executable_sha256
                            .as_deref()
                            .map(is_sha256)
                            .unwrap_or(false)
                }
            }
    }
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn regular_file_within(version_root: &Path, relative_path: &str) -> Option<PathBuf> {
    let canonical_root = fs::canonicalize(version_root).ok()?;
    let candidate = version_root.join(relative_path);
    let metadata = fs::symlink_metadata(&candidate).ok()?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return None;
    }
    let canonical_candidate = fs::canonicalize(&candidate).ok()?;
    canonical_candidate
        .starts_with(&canonical_root)
        .then_some(candidate)
}

fn file_sha256(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    Some(format!("{:x}", Sha256::digest(bytes)))
}

fn package_version(version_root: &Path, relative_path: &str) -> Option<String> {
    let path = regular_file_within(version_root, relative_path)?;
    let value: serde_json::Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    value.get("version")?.as_str().map(str::to_string)
}

fn inspect_opencodex_closure(
    version_root: &Path,
    release: &ManagedCliRelease,
    receipt: &ManagedRuntimeReceipt,
) -> Result<(), &'static str> {
    if package_version(version_root, "package/package.json").as_deref()
        != Some(release.version.as_str())
    {
        return Err("OpenCodex package identity is missing or mismatched.");
    }
    for required in OPENCODEX_REQUIRED_FILES {
        if regular_file_within(version_root, required).is_none() {
            return Err("OpenCodex dependency closure is incomplete.");
        }
    }
    for (path, version) in [
        ("package/node_modules/bun/package.json", "1.4.0"),
        (
            "package/node_modules/@oven/bun-windows-x64/package.json",
            "1.4.0",
        ),
        (
            "package/node_modules/@napi-rs/keyring/package.json",
            "1.3.0",
        ),
        (
            "package/node_modules/@napi-rs/keyring-win32-x64-msvc/package.json",
            "1.3.0",
        ),
        ("package/node_modules/zod/package.json", "4.4.3"),
    ] {
        if package_version(version_root, path).as_deref() != Some(version) {
            return Err("OpenCodex direct dependency identity is mismatched.");
        }
    }
    let lock_path = regular_file_within(version_root, "package/node_modules/.package-lock.json")
        .ok_or("OpenCodex dependency lock is missing.")?;
    if file_sha256(&lock_path).as_deref() != receipt.dependency_lock_sha256.as_deref() {
        return Err("OpenCodex dependency closure checksum is mismatched.");
    }
    let runtime_executable =
        regular_file_within(version_root, "package/node_modules/bun/bin/bun.exe")
            .ok_or("OpenCodex managed Bun runtime is missing.")?;
    if file_sha256(&runtime_executable).as_deref() != receipt.runtime_executable_sha256.as_deref() {
        return Err("OpenCodex managed Bun runtime checksum is mismatched.");
    }
    Ok(())
}

pub fn confirm_managed_runtime_probe(
    readiness: ManagedCliReadiness,
    release: &ManagedCliRelease,
    probe: &ManagedCliProbe,
) -> ManagedCliReadiness {
    let ManagedCliReadiness::ProbeRequired {
        launch,
        dependency_lock_sha256,
    } = readiness
    else {
        return ManagedCliReadiness::Incomplete {
            reason: "Managed CLI runtime was not awaiting a probe.",
        };
    };
    if release.kind != ManagedCliKind::OpenCodex
        || probe.kind != release.kind
        || probe.version != release.version
        || probe.exit_code != 0
        || !probe.ready
        || !probe.loopback
    {
        return ManagedCliReadiness::Incomplete {
            reason: "OpenCodex bounded readiness probe did not prove the pinned loopback runtime.",
        };
    }
    if !is_sha256(&dependency_lock_sha256) {
        return ManagedCliReadiness::Incomplete {
            reason: "OpenCodex dependency lock proof is invalid.",
        };
    }
    ManagedCliReadiness::Ready { launch }
}

pub fn inspect_managed_runtime(
    managed_root: &Path,
    release: &ManagedCliRelease,
) -> ManagedCliReadiness {
    let version_root = managed_root.join("versions").join(&release.version);
    if !version_root.exists() {
        return ManagedCliReadiness::Missing;
    }
    let version_metadata = match fs::symlink_metadata(&version_root) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => metadata,
        _ => {
            return ManagedCliReadiness::Incomplete {
                reason: "Managed CLI version root is unsafe.",
            }
        }
    };
    drop(version_metadata);

    let receipt_path = version_root.join("vibespace-runtime.json");
    let receipt = fs::read(&receipt_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<ManagedRuntimeReceipt>(&bytes).ok());
    let Some(receipt) = receipt else {
        return ManagedCliReadiness::Incomplete {
            reason: "Managed CLI receipt is missing or invalid.",
        };
    };
    if !receipt.matches_release(release) {
        return ManagedCliReadiness::Incomplete {
            reason: "Managed CLI receipt does not match the pinned release.",
        };
    }

    let Some(entrypoint) = regular_file_within(&version_root, &release.entrypoint) else {
        return ManagedCliReadiness::Incomplete {
            reason: "Managed CLI entrypoint is missing or unsafe.",
        };
    };
    if file_sha256(&entrypoint).as_deref() != Some(receipt.entrypoint_sha256.as_str()) {
        return ManagedCliReadiness::Incomplete {
            reason: "Managed CLI entrypoint checksum is mismatched.",
        };
    }
    if release.kind == ManagedCliKind::OpenCodex {
        if let Err(reason) = inspect_opencodex_closure(&version_root, release, &receipt) {
            return ManagedCliReadiness::Incomplete { reason };
        }
    }

    match release.kind {
        ManagedCliKind::Codex => ManagedCliReadiness::Ready {
            launch: ManagedCliLaunch {
                executable: entrypoint,
                arguments: Vec::new(),
            },
        },
        ManagedCliKind::OpenCodex => {
            let dependency_lock_sha256 = receipt
                .dependency_lock_sha256
                .expect("validated OpenCodex dependency lock hash");
            ManagedCliReadiness::ProbeRequired {
                launch: ManagedCliLaunch {
                    executable: version_root.join("package/node_modules/bun/bin/bun.exe"),
                    arguments: vec![
                        version_root
                            .join("package/src/cli/index.ts")
                            .to_string_lossy()
                            .into_owned(),
                        "ready".to_string(),
                        "--json".to_string(),
                    ],
                },
                dependency_lock_sha256,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        confirm_managed_runtime_probe, inspect_managed_runtime, ManagedCliProbe,
        ManagedCliReadiness, ManagedRuntimeReceipt,
    };
    use crate::harness::managed_cli_manifest::{embedded_managed_release, ManagedCliKind};
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "vibespace-managed-cli-{name}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("test root");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write_file(path: impl AsRef<Path>, bytes: &[u8]) {
        let path = path.as_ref();
        fs::create_dir_all(path.parent().expect("parent")).expect("create parent");
        fs::write(path, bytes).expect("write fixture");
    }

    fn sha256(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn codex_is_ready_only_when_receipt_and_native_entrypoint_match() {
        let root = TestRoot::new("codex");
        let release =
            embedded_managed_release(ManagedCliKind::Codex, "windows", "x86_64").expect("release");

        assert_eq!(
            inspect_managed_runtime(root.path(), &release),
            ManagedCliReadiness::Missing
        );

        let version_root = root.path().join("versions").join(&release.version);
        write_file(version_root.join(&release.entrypoint), b"MZfixture");
        write_file(
            version_root.join("vibespace-runtime.json"),
            serde_json::to_string(&ManagedRuntimeReceipt::codex(
                &release,
                &sha256(b"MZfixture"),
            ))
            .unwrap()
            .as_bytes(),
        );

        assert_eq!(
            inspect_managed_runtime(root.path(), &release),
            ManagedCliReadiness::Ready {
                launch: super::ManagedCliLaunch {
                    executable: version_root.join(&release.entrypoint),
                    arguments: vec![]
                }
            }
        );

        write_file(version_root.join(&release.entrypoint), b"MZreplaced");
        assert!(matches!(
            inspect_managed_runtime(root.path(), &release),
            ManagedCliReadiness::Incomplete { .. }
        ));

        write_file(
            version_root.join("vibespace-runtime.json"),
            br#"{"schemaVersion":1,"kind":"codex","version":"9.9.9","artifactSha256":"9044e64402bf6a92774fe35a8cb86010d254c0d3390d5a7ee9047024588d7355","entrypoint":"package/vendor/x86_64-pc-windows-msvc/bin/codex.exe","entrypointSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}"#,
        );
        assert!(matches!(
            inspect_managed_runtime(root.path(), &release),
            ManagedCliReadiness::Incomplete { .. }
        ));
    }

    #[test]
    fn raw_opencodex_tarball_is_not_misreported_as_runnable() {
        let root = TestRoot::new("opencodex-raw");
        let release = embedded_managed_release(ManagedCliKind::OpenCodex, "windows", "x86_64")
            .expect("release");
        let version_root = root.path().join("versions").join(&release.version);
        write_file(
            version_root.join(&release.entrypoint),
            b"#!/usr/bin/env node",
        );
        write_file(
            version_root.join("package/package.json"),
            br#"{"version":"2.36.0"}"#,
        );
        write_file(
            version_root.join("vibespace-runtime.json"),
            serde_json::to_string(&ManagedRuntimeReceipt::opencodex(
                &release,
                &sha256(b"#!/usr/bin/env node"),
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            ))
            .unwrap()
            .as_bytes(),
        );

        assert!(matches!(
            inspect_managed_runtime(root.path(), &release),
            ManagedCliReadiness::Incomplete { .. }
        ));
    }

    #[test]
    fn opencodex_requires_a_pinned_dependency_closure_and_real_probe() {
        let root = TestRoot::new("opencodex-complete");
        let release = embedded_managed_release(ManagedCliKind::OpenCodex, "windows", "x86_64")
            .expect("release");
        let version_root = root.path().join("versions").join(&release.version);
        for (path, bytes) in [
            (&release.entrypoint[..], &b"#!/usr/bin/env node"[..]),
            ("package/src/cli/index.ts", &b"console.log('fixture')"[..]),
            ("package/package.json", &b"{\"version\":\"2.36.0\"}"[..]),
            ("package/node_modules/.package-lock.json", &b"{}"[..]),
            (
                "package/node_modules/bun/package.json",
                &b"{\"version\":\"1.4.0\"}"[..],
            ),
            ("package/node_modules/bun/bin/bun.exe", &b"MZfixture"[..]),
            (
                "package/node_modules/@bufbuild/protobuf/package.json",
                &b"{}"[..],
            ),
            (
                "package/node_modules/@modelcontextprotocol/sdk/package.json",
                &b"{}"[..],
            ),
            (
                "package/node_modules/@napi-rs/keyring/package.json",
                &b"{\"version\":\"1.3.0\"}"[..],
            ),
            (
                "package/node_modules/@napi-rs/keyring-win32-x64-msvc/package.json",
                &b"{\"version\":\"1.3.0\"}"[..],
            ),
            (
                "package/node_modules/@napi-rs/keyring-win32-x64-msvc/keyring.win32-x64-msvc.node",
                &b"MZfixture"[..],
            ),
            (
                "package/node_modules/@oven/bun-windows-x64/package.json",
                &b"{\"version\":\"1.4.0\"}"[..],
            ),
            (
                "package/node_modules/zod/package.json",
                &b"{\"version\":\"4.4.3\"}"[..],
            ),
        ] {
            write_file(version_root.join(path), bytes);
        }
        write_file(
            version_root.join("vibespace-runtime.json"),
            serde_json::to_string(&ManagedRuntimeReceipt::opencodex(
                &release,
                &sha256(b"#!/usr/bin/env node"),
                &sha256(b"{}"),
                &sha256(b"MZfixture"),
            ))
            .unwrap()
            .as_bytes(),
        );

        let candidate = inspect_managed_runtime(root.path(), &release);
        let ManagedCliReadiness::ProbeRequired { launch, .. } = &candidate else {
            panic!("OpenCodex must require a real bounded probe");
        };
        assert!(launch
            .executable
            .ends_with("package/node_modules/bun/bin/bun.exe"));
        assert_eq!(launch.arguments.last().map(String::as_str), Some("--json"));
        assert!(!launch
            .arguments
            .iter()
            .any(|argument| argument.ends_with("ocx.mjs")));

        assert!(matches!(
            confirm_managed_runtime_probe(
                candidate.clone(),
                &release,
                &ManagedCliProbe {
                    kind: ManagedCliKind::OpenCodex,
                    version: release.version.clone(),
                    exit_code: 1,
                    ready: false,
                    loopback: true,
                }
            ),
            ManagedCliReadiness::Incomplete { .. }
        ));
        assert!(matches!(
            confirm_managed_runtime_probe(
                candidate,
                &release,
                &ManagedCliProbe {
                    kind: ManagedCliKind::OpenCodex,
                    version: release.version.clone(),
                    exit_code: 0,
                    ready: true,
                    loopback: true,
                }
            ),
            ManagedCliReadiness::Ready { .. }
        ));

        fs::remove_file(version_root.join("package/node_modules/bun/bin/bun.exe")).unwrap();
        assert!(matches!(
            inspect_managed_runtime(root.path(), &release),
            ManagedCliReadiness::Incomplete { .. }
        ));
    }

    #[test]
    fn malformed_or_unpinned_closure_receipts_fail_closed() {
        let root = TestRoot::new("invalid-receipt");
        let release = embedded_managed_release(ManagedCliKind::OpenCodex, "windows", "x86_64")
            .expect("release");
        let version_root = root.path().join("versions").join(&release.version);
        write_file(version_root.join(&release.entrypoint), b"launcher");
        for invalid in [
            b"not json".as_slice(),
            br#"{"schemaVersion":2}"#.as_slice(),
            br#"{"schemaVersion":1,"kind":"opencodex","version":"2.36.0","artifactSha256":"95f2bab63125a94b5b53d5cc912a225812aed0a17b926cf556d6fc37651be915","entrypoint":"package/bin/ocx.mjs","dependencyLockSha256":"../../escape"}"#.as_slice(),
        ] {
            write_file(version_root.join("vibespace-runtime.json"), invalid);
            assert!(matches!(
                inspect_managed_runtime(root.path(), &release),
                ManagedCliReadiness::Incomplete { .. }
            ));
        }
    }
}
