use crate::harness::managed_cli_manifest::{ManagedCliKind, ManagedCliRelease};
use crate::harness::managed_cli_runtime::{ManagedCliLaunch, ManagedCliReadiness};
use sha2::{Digest, Sha256};
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};

const OPENCODEX_SOURCE_SUFFIX: &str = "node_modules/@bitkyc08/opencodex/src/cli/index.ts";
const OPENCODEX_BUN_SUFFIX: &str = "node_modules/@oven/bun-windows-x64/bin/bun.exe";
const OLLAMA_PORT: u16 = 11_434;
const READINESS_TIMEOUT_MS: u64 = 30_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodexConfigBackupProof {
    Absent,
    Sha256(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedOpenCodexConfigAttestation {
    sha256: String,
}

/// Validates the exact isolated OpenCodex config bytes that the process owner must re-hash
/// immediately before spawn. Provider details are intentionally not retained by this contract.
pub fn attest_managed_opencodex_config(
    config_json: &[u8],
) -> Result<ManagedOpenCodexConfigAttestation, ManagedOpenCodexStartError> {
    let value: serde_json::Value = serde_json::from_slice(config_json)
        .map_err(|_| ManagedOpenCodexStartError::InvalidConfigBoundary)?;
    let object = value
        .as_object()
        .ok_or(ManagedOpenCodexStartError::InvalidConfigBoundary)?;
    if object
        .get("hostname")
        .map(|hostname| hostname.as_str() != Some("127.0.0.1"))
        .unwrap_or(false)
        || object.contains_key("unauthenticatedLoopbackListener")
    {
        return Err(ManagedOpenCodexStartError::InvalidConfigBoundary);
    }
    let integrations = object
        .get("clientIntegrations")
        .and_then(serde_json::Value::as_object)
        .ok_or(ManagedOpenCodexStartError::InvalidConfigBoundary)?;
    if integrations
        .get("codex")
        .and_then(serde_json::Value::as_bool)
        == Some(false)
        || integrations
            .get("grok")
            .and_then(serde_json::Value::as_bool)
            != Some(false)
        || integrations
            .get("claude-desktop")
            .and_then(serde_json::Value::as_bool)
            != Some(false)
        || object
            .get("claudeCode")
            .and_then(serde_json::Value::as_object)
            .and_then(|claude| claude.get("enabled"))
            .and_then(serde_json::Value::as_bool)
            != Some(false)
    {
        return Err(ManagedOpenCodexStartError::InvalidConfigBoundary);
    }
    Ok(ManagedOpenCodexConfigAttestation {
        sha256: format!("{:x}", Sha256::digest(config_json)),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedOpenCodexRuntimeContext {
    pub opencodex_home: PathBuf,
    pub codex_home: PathBuf,
    pub config_attestation: ManagedOpenCodexConfigAttestation,
    pub bind_host: Ipv4Addr,
    pub port: u16,
    pub config_review_approved: bool,
    pub backup_proof: CodexConfigBackupProof,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedProcessStdio {
    Null,
    Piped,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedProcessInvocation {
    pub executable: PathBuf,
    pub arguments: Vec<String>,
    pub environment: Vec<(String, String)>,
    pub stdin: ManagedProcessStdio,
    pub stdout: ManagedProcessStdio,
    pub stderr: ManagedProcessStdio,
    pub kill_on_drop: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedOpenCodexStartPlan {
    pub start: ManagedProcessInvocation,
    pub readiness_probe: ManagedProcessInvocation,
    pub bind_host: Ipv4Addr,
    pub port: u16,
    pub readiness_timeout_ms: u64,
    pub maximum_log_bytes: usize,
    pub backup_proof: CodexConfigBackupProof,
    pub required_config_sha256: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedOpenCodexStartError {
    WrongBackend,
    RuntimeNotAwaitingProbe,
    InvalidProbeLaunch,
    UserReviewRequired,
    InvalidConfigBoundary,
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn root_before_suffix(path: &Path, suffix: &Path) -> Option<PathBuf> {
    if !path.ends_with(suffix) {
        return None;
    }
    let mut root = path;
    for _ in suffix.components() {
        root = root.parent()?;
    }
    Some(root.to_path_buf())
}

fn same_path_ignoring_windows_case(left: &Path, right: &Path) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

fn paths_overlap_ignoring_windows_case(left: &Path, right: &Path) -> bool {
    let normalize = |path: &Path| {
        path.to_string_lossy()
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_ascii_lowercase()
    };
    let left = normalize(left);
    let right = normalize(right);
    left == right || left.starts_with(&(right.clone() + "\\")) || right.starts_with(&(left + "\\"))
}

fn invocation(
    executable: PathBuf,
    arguments: Vec<String>,
    environment: &[(String, String)],
) -> ManagedProcessInvocation {
    ManagedProcessInvocation {
        executable,
        arguments,
        environment: environment.to_vec(),
        stdin: ManagedProcessStdio::Null,
        stdout: ManagedProcessStdio::Piped,
        stderr: ManagedProcessStdio::Piped,
        kill_on_drop: true,
    }
}

/// Builds the on-demand OpenCodex child and its readiness probe without starting either.
/// The caller must durably preserve/approve the effective Codex config before constructing the
/// context and must terminate only the child it spawned. Service, shim, init, update, global npm,
/// and arbitrary port-reclaim commands are intentionally absent.
pub fn managed_opencodex_start_plan(
    release: &ManagedCliRelease,
    readiness: ManagedCliReadiness,
    context: ManagedOpenCodexRuntimeContext,
) -> Result<ManagedOpenCodexStartPlan, ManagedOpenCodexStartError> {
    if release.kind != ManagedCliKind::OpenCodex {
        return Err(ManagedOpenCodexStartError::WrongBackend);
    }
    if !context.config_review_approved {
        return Err(ManagedOpenCodexStartError::UserReviewRequired);
    }
    let backup_valid = match &context.backup_proof {
        CodexConfigBackupProof::Absent => true,
        CodexConfigBackupProof::Sha256(sha256) => is_sha256(sha256),
    };
    if !backup_valid
        || !context.opencodex_home.is_absolute()
        || !context.codex_home.is_absolute()
        || paths_overlap_ignoring_windows_case(&context.opencodex_home, &context.codex_home)
        || context.bind_host != Ipv4Addr::LOCALHOST
        || context.port < 1024
        || context.port == OLLAMA_PORT
    {
        return Err(ManagedOpenCodexStartError::InvalidConfigBoundary);
    }

    let ManagedCliReadiness::ProbeRequired {
        launch: ManagedCliLaunch {
            executable,
            arguments,
        },
        dependency_lock_sha256,
    } = readiness
    else {
        return Err(ManagedOpenCodexStartError::RuntimeNotAwaitingProbe);
    };
    if !is_sha256(&dependency_lock_sha256) || arguments.len() != 3 {
        return Err(ManagedOpenCodexStartError::InvalidProbeLaunch);
    }
    let source = PathBuf::from(&arguments[0]);
    let bun_root = root_before_suffix(&executable, Path::new(OPENCODEX_BUN_SUFFIX));
    let source_root = root_before_suffix(&source, Path::new(OPENCODEX_SOURCE_SUFFIX));
    let roots_match = match (bun_root, source_root) {
        (Some(bun_root), Some(source_root)) => {
            same_path_ignoring_windows_case(&bun_root, &source_root)
                && bun_root
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name == release.version)
                    .unwrap_or(false)
        }
        _ => false,
    };
    if !executable.is_absolute()
        || !source.is_absolute()
        || !roots_match
        || arguments[1] != "ready"
        || arguments[2] != "--json"
    {
        return Err(ManagedOpenCodexStartError::InvalidProbeLaunch);
    }

    let environment = vec![
        (
            "OPENCODEX_HOME".to_string(),
            context.opencodex_home.to_string_lossy().into_owned(),
        ),
        (
            "CODEX_HOME".to_string(),
            context.codex_home.to_string_lossy().into_owned(),
        ),
        ("NO_COLOR".to_string(), "1".to_string()),
    ];
    let start = invocation(
        executable.clone(),
        vec![
            source.to_string_lossy().into_owned(),
            "start".to_string(),
            "--port".to_string(),
            context.port.to_string(),
        ],
        &environment,
    );
    let readiness_probe = invocation(executable, arguments, &environment);

    Ok(ManagedOpenCodexStartPlan {
        start,
        readiness_probe,
        bind_host: context.bind_host,
        port: context.port,
        readiness_timeout_ms: READINESS_TIMEOUT_MS,
        maximum_log_bytes: 1_048_576,
        backup_proof: context.backup_proof,
        required_config_sha256: context.config_attestation.sha256,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        attest_managed_opencodex_config, managed_opencodex_start_plan, CodexConfigBackupProof,
        ManagedOpenCodexRuntimeContext, ManagedProcessStdio,
    };
    use crate::harness::managed_cli_manifest::{embedded_managed_release, ManagedCliKind};
    use crate::harness::managed_cli_runtime::{ManagedCliLaunch, ManagedCliReadiness};
    use std::net::Ipv4Addr;
    use std::path::PathBuf;

    fn candidate() -> (
        crate::harness::managed_cli_manifest::ManagedCliRelease,
        ManagedCliReadiness,
    ) {
        let release = embedded_managed_release(ManagedCliKind::OpenCodex, "windows", "x86_64")
            .expect("embedded OpenCodex release");
        let root = PathBuf::from(r"C:\VibeSpace\managed\opencodex\versions\2.36.0");
        let source = root.join("node_modules/@bitkyc08/opencodex/src/cli/index.ts");
        let readiness = ManagedCliReadiness::ProbeRequired {
            launch: ManagedCliLaunch {
                executable: root.join("node_modules/@oven/bun-windows-x64/bin/bun.exe"),
                arguments: vec![
                    source.to_string_lossy().into_owned(),
                    "ready".to_string(),
                    "--json".to_string(),
                ],
            },
            dependency_lock_sha256:
                "6a3e0bed984743fbe76ae63d23296a72ec1f87ab6df56ee6bd0c66d5529ac2d5".to_string(),
        };
        (release, readiness)
    }

    fn context() -> ManagedOpenCodexRuntimeContext {
        ManagedOpenCodexRuntimeContext {
            opencodex_home: PathBuf::from(r"C:\VibeSpace\app-data\managed\opencodex-home"),
            codex_home: PathBuf::from(r"C:\Users\fixture\.codex"),
            config_attestation: attest_managed_opencodex_config(
                br#"{"hostname":"127.0.0.1","clientIntegrations":{"codex":true,"grok":false,"claude-desktop":false},"claudeCode":{"enabled":false}}"#,
            )
            .expect("isolated config attestation"),
            bind_host: Ipv4Addr::LOCALHOST,
            port: 10_100,
            config_review_approved: true,
            backup_proof: CodexConfigBackupProof::Sha256("b".repeat(64)),
        }
    }

    #[test]
    fn plans_one_owned_noninteractive_loopback_start_and_bounded_probe() {
        let (release, readiness) = candidate();
        let plan = managed_opencodex_start_plan(&release, readiness, context())
            .expect("OpenCodex start plan");

        assert_eq!(plan.start.arguments[1..], ["start", "--port", "10100"]);
        assert_eq!(plan.start.stdin, ManagedProcessStdio::Null);
        assert_eq!(plan.start.stdout, ManagedProcessStdio::Piped);
        assert_eq!(plan.start.stderr, ManagedProcessStdio::Piped);
        assert!(plan.start.kill_on_drop);
        assert_eq!(plan.readiness_probe.arguments[1..], ["ready", "--json"]);
        assert_eq!(plan.readiness_timeout_ms, 30_000);
        assert_eq!(plan.bind_host, Ipv4Addr::LOCALHOST);
        assert_eq!(plan.port, 10_100);
        assert_eq!(plan.required_config_sha256.len(), 64);
        assert_eq!(
            plan.start.environment,
            [
                (
                    "OPENCODEX_HOME".to_string(),
                    r"C:\VibeSpace\app-data\managed\opencodex-home".to_string()
                ),
                (
                    "CODEX_HOME".to_string(),
                    r"C:\Users\fixture\.codex".to_string()
                ),
                ("NO_COLOR".to_string(), "1".to_string()),
            ]
        );
        for invocation in [&plan.start, &plan.readiness_probe] {
            assert!(invocation.arguments.iter().all(|argument| {
                !argument.to_ascii_lowercase().contains("api_key")
                    && !argument.to_ascii_lowercase().contains("token")
                    && !argument.to_ascii_lowercase().contains("provider")
                    && !argument.to_ascii_lowercase().contains("model")
            }));
        }

        let (release, readiness) = candidate();
        let mut first_run = context();
        first_run.backup_proof = CodexConfigBackupProof::Absent;
        assert!(managed_opencodex_start_plan(&release, readiness, first_run).is_ok());
    }

    #[test]
    fn rejects_unapproved_unsafe_or_ollama_contexts() {
        let (release, _) = candidate();
        let mut cases = Vec::new();
        let mut unapproved = context();
        unapproved.config_review_approved = false;
        cases.push(unapproved);
        let mut no_backup = context();
        no_backup.backup_proof = CodexConfigBackupProof::Sha256("bad".to_string());
        cases.push(no_backup);
        let mut relative_home = context();
        relative_home.opencodex_home = PathBuf::from("relative");
        cases.push(relative_home);
        let mut same_home = context();
        same_home.opencodex_home = same_home.codex_home.clone();
        cases.push(same_home);
        let mut nested_home = context();
        nested_home.opencodex_home = nested_home.codex_home.join("opencodex");
        cases.push(nested_home);
        let mut non_loopback = context();
        non_loopback.bind_host = Ipv4Addr::UNSPECIFIED;
        cases.push(non_loopback);
        let mut ollama_port = context();
        ollama_port.port = 11_434;
        cases.push(ollama_port);
        let mut privileged_port = context();
        privileged_port.port = 443;
        cases.push(privileged_port);

        for invalid in cases {
            let (_, readiness) = candidate();
            assert!(managed_opencodex_start_plan(&release, readiness, invalid).is_err());
        }
    }

    #[test]
    fn config_attestation_requires_loopback_and_disables_unrelated_integrations() {
        assert!(attest_managed_opencodex_config(
            br#"{"hostname":"127.0.0.1","clientIntegrations":{"codex":true,"grok":false,"claude-desktop":false},"claudeCode":{"enabled":false}}"#
        )
        .is_ok());
        for invalid in [
            br#"not-json"#.as_slice(),
            br#"{"hostname":"0.0.0.0","clientIntegrations":{"grok":false,"claude-desktop":false},"claudeCode":{"enabled":false}}"#.as_slice(),
            br#"{"clientIntegrations":{"codex":false,"grok":false,"claude-desktop":false},"claudeCode":{"enabled":false}}"#.as_slice(),
            br#"{"clientIntegrations":{"grok":true,"claude-desktop":false},"claudeCode":{"enabled":false}}"#.as_slice(),
            br#"{"clientIntegrations":{"grok":false,"claude-desktop":true},"claudeCode":{"enabled":false}}"#.as_slice(),
            br#"{"clientIntegrations":{"grok":false,"claude-desktop":false},"claudeCode":{"enabled":true}}"#.as_slice(),
            br#"{"clientIntegrations":{"grok":false,"claude-desktop":false},"claudeCode":{"enabled":false},"unauthenticatedLoopbackListener":{"enabled":true,"port":10101}}"#.as_slice(),
        ] {
            assert!(attest_managed_opencodex_config(invalid).is_err());
        }
    }

    #[test]
    fn rejects_wrong_backend_ready_state_and_tampered_probe_shape() {
        let (release, probe_candidate) = candidate();
        let codex = embedded_managed_release(ManagedCliKind::Codex, "windows", "x86_64")
            .expect("embedded Codex release");
        assert!(managed_opencodex_start_plan(&codex, probe_candidate, context()).is_err());
        assert!(managed_opencodex_start_plan(
            &release,
            ManagedCliReadiness::Ready {
                launch: ManagedCliLaunch {
                    executable: PathBuf::from(r"C:\fixture\bun.exe"),
                    arguments: Vec::new(),
                },
            },
            context()
        )
        .is_err());

        let (_, candidate) = candidate();
        let ManagedCliReadiness::ProbeRequired {
            launch,
            dependency_lock_sha256,
        } = candidate
        else {
            unreachable!()
        };
        for bad_launch in [
            ManagedCliLaunch {
                executable: PathBuf::from(r"C:\fixture\bun.exe"),
                arguments: launch.arguments.clone(),
            },
            ManagedCliLaunch {
                executable: launch.executable.clone(),
                arguments: vec![
                    "start".to_string(),
                    "--port".to_string(),
                    "9999".to_string(),
                ],
            },
        ] {
            assert!(managed_opencodex_start_plan(
                &release,
                ManagedCliReadiness::ProbeRequired {
                    launch: bad_launch,
                    dependency_lock_sha256: dependency_lock_sha256.clone(),
                },
                context()
            )
            .is_err());
        }
    }
}
