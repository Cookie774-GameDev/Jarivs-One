use crate::cli_bridge::CliBridgeState;
use crate::harness::managed_cli_manifest::{embedded_managed_release, ManagedCliKind};
use crate::harness::managed_cli_runtime::{inspect_managed_runtime, ManagedCliReadiness};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

const EVENT_NAME: &str = "vibespace://managed-codex-install-state";

#[derive(Default)]
pub struct ManagedCodexInstallState {
    active: Mutex<Option<Arc<AtomicBool>>>,
}

struct InstallLease<'a> {
    state: &'a ManagedCodexInstallState,
    cancellation: Arc<AtomicBool>,
}

impl ManagedCodexInstallState {
    fn begin(&self) -> Result<InstallLease<'_>, &'static str> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "Managed Codex installer state is unavailable.")?;
        if active.is_some() {
            return Err("Managed Codex installation is already running.");
        }
        let cancellation = Arc::new(AtomicBool::new(false));
        *active = Some(cancellation.clone());
        Ok(InstallLease {
            state: self,
            cancellation,
        })
    }

    fn cancel(&self) -> Result<bool, &'static str> {
        let active = self
            .active
            .lock()
            .map_err(|_| "Managed Codex installer state is unavailable.")?;
        if let Some(cancellation) = active.as_ref() {
            cancellation.store(true, Ordering::Release);
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

impl Drop for InstallLease<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.state.active.lock() {
            if active
                .as_ref()
                .is_some_and(|value| Arc::ptr_eq(value, &self.cancellation))
            {
                *active = None;
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ManagedCodexRuntimeDetection {
    Missing,
    Incomplete {
        reason: &'static str,
    },
    Ready {
        codex_version: String,
        open_codex_version: String,
        executable_id: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum InstallComponent {
    Codex,
    OpenCodex,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum InstallEvent {
    Installing {
        component: InstallComponent,
        progress: f64,
    },
    Ready {
        codex_version: String,
        open_codex_version: String,
        executable_id: String,
    },
    Failed {
        recoverable: bool,
        message: &'static str,
    },
}

fn managed_base(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir()
        .map_err(|_| "VibeSpace managed runtime storage is unavailable.".to_string())?;
    crate::harness::managed_codex_storage::storage_root(&app_data)
        .map(|root| root.join("managed-runtime"))
}

fn inspect_and_register(
    managed_base: &Path,
    cli: &CliBridgeState,
) -> Result<ManagedCodexRuntimeDetection, String> {
    let codex_release = embedded_managed_release(ManagedCliKind::Codex, "windows", "x86_64")
        .map_err(|_| "Managed Codex release authority is unavailable.".to_string())?;
    let opencodex_release =
        embedded_managed_release(ManagedCliKind::OpenCodex, "windows", "x86_64")
            .map_err(|_| "Managed OpenCodex release authority is unavailable.".to_string())?;
    let codex = inspect_managed_runtime(&managed_base.join("codex"), &codex_release);
    let opencodex = inspect_managed_runtime(&managed_base.join("opencodex"), &opencodex_release);
    let codex_launch = match codex {
        ManagedCliReadiness::Ready { launch } => launch,
        ManagedCliReadiness::Missing => return Ok(ManagedCodexRuntimeDetection::Missing),
        ManagedCliReadiness::Incomplete { reason } => {
            return Ok(ManagedCodexRuntimeDetection::Incomplete { reason })
        }
        ManagedCliReadiness::ProbeRequired { .. } => {
            return Ok(ManagedCodexRuntimeDetection::Incomplete {
                reason: "Managed Codex requires unsupported probing.",
            })
        }
    };
    match opencodex {
        ManagedCliReadiness::ProbeRequired { .. } | ManagedCliReadiness::Ready { .. } => {}
        ManagedCliReadiness::Missing => return Ok(ManagedCodexRuntimeDetection::Missing),
        ManagedCliReadiness::Incomplete { reason } => {
            return Ok(ManagedCodexRuntimeDetection::Incomplete { reason })
        }
    }
    let canonical = std::fs::canonicalize(codex_launch.executable)
        .map_err(|_| "Verified managed Codex executable is unavailable.".to_string())?;
    let executable = cli.register_trusted_executable(canonical, Some("codex".to_string()))?;
    Ok(ManagedCodexRuntimeDetection::Ready {
        codex_version: codex_release.version,
        open_codex_version: opencodex_release.version,
        executable_id: executable.executable_id,
    })
}

fn emit(app: &AppHandle, event: InstallEvent) {
    let _ = app.emit(EVENT_NAME, event);
}

#[tauri::command]
pub async fn managed_codex_runtime_detect(
    app: AppHandle,
) -> Result<ManagedCodexRuntimeDetection, String> {
    let worker_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let cli = worker_app.state::<CliBridgeState>();
        inspect_and_register(&managed_base(&worker_app)?, &cli)
    })
    .await
    .map_err(|_| "Managed Codex detection worker failed.".to_string())?
}

#[tauri::command]
pub async fn managed_codex_runtime_install(
    app: AppHandle,
    install_state: State<'_, ManagedCodexInstallState>,
    cli: State<'_, CliBridgeState>,
) -> Result<ManagedCodexRuntimeDetection, String> {
    let lease = install_state.begin().map_err(str::to_string)?;
    let cancellation = lease.cancellation.clone();
    let base = managed_base(&app)?;
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        emit(
            &worker_app,
            InstallEvent::Installing {
                component: InstallComponent::Codex,
                progress: 0.0,
            },
        );
        crate::harness::managed_codex_materializer::download_and_install_embedded_codex(
            &base,
            &cancellation,
            |progress| {
                emit(
                    &worker_app,
                    InstallEvent::Installing {
                        component: InstallComponent::Codex,
                        progress: progress.clamp(0.0, 1.0),
                    },
                )
            },
        )
        .map_err(|failure| failure.message)?;
        emit(
            &worker_app,
            InstallEvent::Installing {
                component: InstallComponent::OpenCodex,
                progress: 0.0,
            },
        );
        crate::harness::managed_opencodex_materializer::download_and_install_embedded_opencodex(
            &base,
            &cancellation,
            |progress| {
                emit(
                    &worker_app,
                    InstallEvent::Installing {
                        component: InstallComponent::OpenCodex,
                        progress: progress.clamp(0.0, 1.0),
                    },
                )
            },
        )
        .map_err(|failure| failure.message)?;
        Ok::<(), &'static str>(())
    })
    .await
    .map_err(|_| "Managed Codex installer worker failed.".to_string())?;
    drop(lease);
    if let Err(message) = result {
        emit(
            &app,
            InstallEvent::Failed {
                recoverable: true,
                message,
            },
        );
        return Err(message.to_string());
    }
    let detection = inspect_and_register(&managed_base(&app)?, &cli)?;
    let ManagedCodexRuntimeDetection::Ready {
        codex_version,
        open_codex_version,
        executable_id,
    } = &detection
    else {
        let message = "Installed Codex tools did not pass managed runtime verification.";
        emit(
            &app,
            InstallEvent::Failed {
                recoverable: true,
                message,
            },
        );
        return Err(message.to_string());
    };
    emit(
        &app,
        InstallEvent::Ready {
            codex_version: codex_version.clone(),
            open_codex_version: open_codex_version.clone(),
            executable_id: executable_id.clone(),
        },
    );
    Ok(detection)
}

#[tauri::command]
pub fn managed_codex_runtime_install_cancel(
    state: State<'_, ManagedCodexInstallState>,
) -> Result<bool, String> {
    state.cancel().map_err(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::{
        InstallComponent, InstallEvent, ManagedCodexInstallState, ManagedCodexRuntimeDetection,
    };
    use std::sync::atomic::Ordering;

    #[test]
    fn managed_detection_yields_the_ipc_handler_while_probing() {
        let source = include_str!("managed_codex_install.rs");
        let tests_start = source.find("#[cfg(test)]").expect("tests are bounded");
        let production = &source[..tests_start];
        let detect_start = production
            .find("pub async fn managed_codex_runtime_detect")
            .or_else(|| production.find("pub fn managed_codex_runtime_detect"))
            .expect("managed detection command exists");
        let install_start = production
            .find("pub async fn managed_codex_runtime_install")
            .expect("managed install command exists");
        let command = &production[detect_start..install_start];

        assert!(command.contains("pub async fn managed_codex_runtime_detect"));
        assert!(command.contains("tauri::async_runtime::spawn_blocking"));
    }

    #[test]
    fn install_state_is_single_flight_and_cancellable() {
        let state = ManagedCodexInstallState::default();
        let lease = state.begin().expect("first install");
        assert_eq!(
            state.begin().err(),
            Some("Managed Codex installation is already running.")
        );
        assert_eq!(state.cancel(), Ok(true));
        assert!(lease.cancellation.load(Ordering::Acquire));
        drop(lease);
        assert_eq!(state.cancel(), Ok(false));
        assert!(state.begin().is_ok());
    }

    #[test]
    fn renderer_contract_is_camel_case_and_contains_no_paths() {
        let ready = serde_json::to_value(ManagedCodexRuntimeDetection::Ready {
            codex_version: "0.151.0".to_string(),
            open_codex_version: "5.0.0".to_string(),
            executable_id: "cli-executable-test".to_string(),
        })
        .expect("serialize readiness");
        assert_eq!(ready["status"], "ready");
        assert_eq!(ready["codexVersion"], "0.151.0");
        assert_eq!(ready["openCodexVersion"], "5.0.0");
        assert_eq!(ready["executableId"], "cli-executable-test");
        assert!(ready.get("executablePath").is_none());

        let progress = serde_json::to_value(InstallEvent::Installing {
            component: InstallComponent::OpenCodex,
            progress: 0.5,
        })
        .expect("serialize progress");
        assert_eq!(progress["component"], "opencodex");
        assert_eq!(progress["progress"], 0.5);
    }
}
