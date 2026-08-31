use crate::harness::managed_cli_manifest::{ManagedCliKind, ManagedCliRelease};
use crate::harness::managed_cli_runtime::{ManagedCliLaunch, ManagedCliReadiness};
use std::path::PathBuf;

/// Codex app-server v2 begins with a request followed by the initialized notification.
pub const CODEX_APP_SERVER_INITIALIZE: &str = "initialize";
pub const CODEX_APP_SERVER_INITIALIZED: &str = "initialized";

/// Raw reasoning text is private chain-of-thought and must never enter the Chat ledger.
/// Public progress may use `item/reasoning/summaryTextDelta` instead.
pub const CODEX_APP_SERVER_PRIVATE_REASONING_METHODS: &[&str] = &["item/reasoning/textDelta"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppServerStdio {
    Piped,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedCodexAppServerLaunch {
    pub executable: PathBuf,
    pub arguments: Vec<String>,
    pub stdin: AppServerStdio,
    pub stdout: AppServerStdio,
    pub stderr: AppServerStdio,
    pub kill_on_drop: bool,
    /// Preserve the user's existing Codex authentication/config environment. Secrets and
    /// provider/model/prompt selections are intentionally absent from the command line.
    pub inherit_environment: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedCodexAppServerLaunchError {
    WrongBackend,
    RuntimeNotReady,
    InvalidVerifiedLaunch,
}

/// Converts a checksum-verified managed Codex runtime into the one supported structured
/// transport. This function is deliberately a pure launch plan: process ownership, JSON-RPC,
/// permissions, and Chat projection remain with their existing authorities.
pub fn managed_codex_app_server_launch(
    release: &ManagedCliRelease,
    readiness: ManagedCliReadiness,
) -> Result<ManagedCodexAppServerLaunch, ManagedCodexAppServerLaunchError> {
    if release.kind != ManagedCliKind::Codex {
        return Err(ManagedCodexAppServerLaunchError::WrongBackend);
    }
    let ManagedCliReadiness::Ready {
        launch: ManagedCliLaunch {
            executable,
            arguments,
        },
    } = readiness
    else {
        return Err(ManagedCodexAppServerLaunchError::RuntimeNotReady);
    };

    let version_parent_matches = executable
        .parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
        == Some(release.version.as_str());
    if !executable.is_absolute()
        || !executable.ends_with(&release.entrypoint)
        || !version_parent_matches
        || !arguments.is_empty()
    {
        return Err(ManagedCodexAppServerLaunchError::InvalidVerifiedLaunch);
    }

    Ok(ManagedCodexAppServerLaunch {
        executable,
        arguments: vec!["app-server".to_string(), "--stdio".to_string()],
        stdin: AppServerStdio::Piped,
        stdout: AppServerStdio::Piped,
        stderr: AppServerStdio::Piped,
        kill_on_drop: true,
        inherit_environment: true,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        managed_codex_app_server_launch, AppServerStdio, CODEX_APP_SERVER_INITIALIZE,
        CODEX_APP_SERVER_INITIALIZED, CODEX_APP_SERVER_PRIVATE_REASONING_METHODS,
    };
    use crate::harness::managed_cli_manifest::{embedded_managed_release, ManagedCliKind};
    use crate::harness::managed_cli_runtime::{ManagedCliLaunch, ManagedCliReadiness};
    use std::path::PathBuf;

    fn codex_ready() -> (
        crate::harness::managed_cli_manifest::ManagedCliRelease,
        ManagedCliReadiness,
    ) {
        let release = embedded_managed_release(ManagedCliKind::Codex, "windows", "x86_64")
            .expect("embedded Codex release");
        let executable =
            PathBuf::from(r"C:\VibeSpace\managed\codex\versions\0.151.0").join(&release.entrypoint);
        let readiness = ManagedCliReadiness::Ready {
            launch: ManagedCliLaunch {
                executable,
                arguments: Vec::new(),
            },
        };
        (release, readiness)
    }

    #[test]
    fn codex_app_server_uses_verified_native_stdio_without_payload_arguments() {
        let (release, readiness) = codex_ready();
        let plan = managed_codex_app_server_launch(&release, readiness).expect("launch plan");

        assert!(plan.executable.is_absolute());
        assert!(plan.executable.ends_with(&release.entrypoint));
        assert_eq!(plan.arguments, ["app-server", "--stdio"]);
        assert_eq!(plan.stdin, AppServerStdio::Piped);
        assert_eq!(plan.stdout, AppServerStdio::Piped);
        assert_eq!(plan.stderr, AppServerStdio::Piped);
        assert!(plan.kill_on_drop);
        assert!(plan.inherit_environment);
        assert!(plan.arguments.iter().all(|argument| {
            !argument.contains("key")
                && !argument.contains("token")
                && !argument.contains("model")
                && !argument.contains("provider")
                && !argument.contains("prompt")
        }));
        assert_eq!(CODEX_APP_SERVER_INITIALIZE, "initialize");
        assert_eq!(CODEX_APP_SERVER_INITIALIZED, "initialized");
        assert_eq!(
            CODEX_APP_SERVER_PRIVATE_REASONING_METHODS,
            &["item/reasoning/textDelta"]
        );
    }

    #[test]
    fn app_server_rejects_unverified_or_wrong_backend_launches() {
        let (codex, ready) = codex_ready();
        for readiness in [
            ManagedCliReadiness::Missing,
            ManagedCliReadiness::Incomplete { reason: "fixture" },
            ManagedCliReadiness::ProbeRequired {
                launch: ManagedCliLaunch {
                    executable: PathBuf::from(r"C:\fixture\bun.exe"),
                    arguments: vec!["ready".to_string(), "--json".to_string()],
                },
                dependency_lock_sha256: "a".repeat(64),
            },
        ] {
            assert!(managed_codex_app_server_launch(&codex, readiness).is_err());
        }

        let opencodex = embedded_managed_release(ManagedCliKind::OpenCodex, "windows", "x86_64")
            .expect("embedded OpenCodex release");
        assert!(managed_codex_app_server_launch(&opencodex, ready).is_err());
    }

    #[test]
    fn app_server_rejects_tampered_ready_launch_shapes() {
        let (release, _) = codex_ready();
        for launch in [
            ManagedCliLaunch {
                executable: PathBuf::from(&release.entrypoint),
                arguments: Vec::new(),
            },
            ManagedCliLaunch {
                executable: PathBuf::from(r"C:\VibeSpace\managed\codex\versions\0.151.0\other.exe"),
                arguments: Vec::new(),
            },
            ManagedCliLaunch {
                executable: PathBuf::from(r"C:\VibeSpace\managed\codex\versions\0.151.0")
                    .join(&release.entrypoint),
                arguments: vec!["exec".to_string(), "secret".to_string()],
            },
        ] {
            assert!(managed_codex_app_server_launch(
                &release,
                ManagedCliReadiness::Ready { launch }
            )
            .is_err());
        }
    }
}
