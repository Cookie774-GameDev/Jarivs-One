//! Managed native runtime state. The checked-in build cannot prepare or attach a process because
//! both the feature gate and packaged-payload readiness are false.

use super::client::{HttpSiyuanTransport, RuntimeStatus};
use super::lifecycle::{RuntimeEvent, RuntimeLifecycle, RuntimeState};
use super::manifest::{runtime_availability, RuntimeAvailability};
use super::security::{
    project_workspace, require_publish_mode_disabled, reserve_loopback_port, PathAllowlist,
    RuntimeToken, SecurityError, LOOPBACK_HOST,
};
use std::fmt;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SupervisorError {
    FeatureDisabled,
    PayloadUnavailable,
    RuntimeNotReady,
    ProjectUnauthorized,
    WorkspaceUnavailable,
    StateUnavailable,
    LifecycleInvalid,
    ProcessUnavailable,
}

impl SupervisorError {
    pub fn public_code(self) -> &'static str {
        match self {
            Self::FeatureDisabled => "siyuan_feature_disabled",
            Self::PayloadUnavailable => "siyuan_payload_unavailable",
            Self::RuntimeNotReady => "siyuan_runtime_not_ready",
            Self::ProjectUnauthorized => "siyuan_project_unauthorized",
            Self::WorkspaceUnavailable => "siyuan_workspace_unavailable",
            Self::StateUnavailable => "siyuan_state_unavailable",
            Self::LifecycleInvalid => "siyuan_lifecycle_invalid",
            Self::ProcessUnavailable => "siyuan_process_unavailable",
        }
    }
}

impl fmt::Display for SupervisorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.public_code())
    }
}

impl From<SecurityError> for SupervisorError {
    fn from(error: SecurityError) -> Self {
        match error {
            SecurityError::InvalidProjectId | SecurityError::PathOutsideAllowlist => {
                Self::ProjectUnauthorized
            }
            SecurityError::InvalidAllowlistRoot => Self::WorkspaceUnavailable,
            _ => Self::ProcessUnavailable,
        }
    }
}

pub(crate) trait RuntimeProcess: Send {
    fn has_exited(&mut self) -> Result<bool, SupervisorError>;
    fn terminate(&mut self) -> Result<(), SupervisorError>;
}

pub(crate) struct ChildRuntimeProcess {
    child: Child,
    terminated: bool,
}

impl ChildRuntimeProcess {
    #[allow(dead_code)]
    pub(crate) fn new(child: Child) -> Self {
        Self {
            child,
            terminated: false,
        }
    }
}

impl RuntimeProcess for ChildRuntimeProcess {
    fn has_exited(&mut self) -> Result<bool, SupervisorError> {
        self.child
            .try_wait()
            .map(|status| status.is_some())
            .map_err(|_| SupervisorError::ProcessUnavailable)
    }

    fn terminate(&mut self) -> Result<(), SupervisorError> {
        if self.terminated {
            return Ok(());
        }
        self.child
            .kill()
            .map_err(|_| SupervisorError::ProcessUnavailable)?;
        let _ = self.child.wait();
        self.terminated = true;
        Ok(())
    }
}

impl Drop for ChildRuntimeProcess {
    fn drop(&mut self) {
        let _ = self.terminate();
    }
}

pub(crate) struct RuntimeLaunchPlan {
    reservation: Option<TcpListener>,
    project_id: String,
    workspace: PathBuf,
    port: u16,
    token: RuntimeToken,
}

impl RuntimeLaunchPlan {
    pub(crate) fn host(&self) -> &'static str {
        LOOPBACK_HOST
    }

    pub(crate) fn port(&self) -> u16 {
        self.port
    }

    pub(crate) fn workspace(&self) -> &Path {
        &self.workspace
    }

    pub(crate) fn token_for_native_broker(&self) -> &str {
        self.token.expose_to_native_broker()
    }

    /// Release the loopback reservation immediately before a future verified payload spawn.
    #[allow(dead_code)]
    pub(crate) fn release_port_reservation(&mut self) {
        self.reservation.take();
    }
}

impl fmt::Debug for RuntimeLaunchPlan {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RuntimeLaunchPlan")
            .field("host", &LOOPBACK_HOST)
            .field("port", &self.port)
            .field("project_id", &self.project_id)
            .field("workspace", &self.workspace)
            .field("token", &"[REDACTED]")
            .finish()
    }
}

struct RunningRuntime {
    project_id: String,
    workspace: PathBuf,
    port: u16,
    token: RuntimeToken,
    process: Box<dyn RuntimeProcess>,
}

impl Drop for RunningRuntime {
    fn drop(&mut self) {
        let _ = self.process.terminate();
    }
}

struct SupervisorInner {
    availability: RuntimeAvailability,
    lifecycle: RuntimeLifecycle,
    workspace_base: Option<PathBuf>,
    running: Option<RunningRuntime>,
}

impl SupervisorInner {
    fn new(availability: RuntimeAvailability) -> Self {
        Self {
            availability,
            lifecycle: RuntimeLifecycle::new(availability.feature_enabled),
            workspace_base: None,
            running: None,
        }
    }

    fn ensure_payload_ready(&self) -> Result<(), SupervisorError> {
        if !self.availability.feature_enabled {
            return Err(SupervisorError::FeatureDisabled);
        }
        if !self.availability.payload_included || !self.availability.runtime_bundled {
            return Err(SupervisorError::PayloadUnavailable);
        }
        Ok(())
    }

    fn poll_crash(&mut self) -> Result<(), SupervisorError> {
        let crashed = match self.running.as_mut() {
            Some(running) => running.process.has_exited()?,
            None => false,
        };
        if crashed {
            self.running.take();
            self.lifecycle
                .apply(RuntimeEvent::CrashDetected)
                .map_err(|_| SupervisorError::LifecycleInvalid)?;
        }
        Ok(())
    }

    fn status(&mut self) -> Result<RuntimeStatus, SupervisorError> {
        self.poll_crash()?;
        Ok(RuntimeStatus {
            feature_enabled: self.availability.feature_enabled,
            runtime_bundled: self.availability.runtime_bundled,
            state: state_label(self.lifecycle.state()).to_owned(),
        })
    }

    fn prepare_launch(&mut self, project_id: &str) -> Result<RuntimeLaunchPlan, SupervisorError> {
        self.ensure_payload_ready()?;
        require_publish_mode_disabled(false)?;
        if self.running.is_some() || self.lifecycle.state() != RuntimeState::Stopped {
            return Err(SupervisorError::LifecycleInvalid);
        }
        let base = self
            .workspace_base
            .as_ref()
            .ok_or(SupervisorError::WorkspaceUnavailable)?;
        let workspace = project_workspace(base, project_id)?;
        let (reservation, port) = reserve_loopback_port()?;
        let token = RuntimeToken::generate()?;
        self.lifecycle
            .apply(RuntimeEvent::StartRequested)
            .map_err(|_| SupervisorError::LifecycleInvalid)?;
        Ok(RuntimeLaunchPlan {
            reservation: Some(reservation),
            project_id: project_id.to_owned(),
            workspace,
            port,
            token,
        })
    }

    fn attach_running(
        &mut self,
        mut plan: RuntimeLaunchPlan,
        process: Box<dyn RuntimeProcess>,
    ) -> Result<(), SupervisorError> {
        if self.lifecycle.state() != RuntimeState::Starting || self.running.is_some() {
            return Err(SupervisorError::LifecycleInvalid);
        }
        plan.release_port_reservation();
        self.lifecycle
            .apply(RuntimeEvent::HealthCheckPassed)
            .map_err(|_| SupervisorError::LifecycleInvalid)?;
        self.running = Some(RunningRuntime {
            project_id: plan.project_id,
            workspace: plan.workspace,
            port: plan.port,
            token: plan.token,
            process,
        });
        Ok(())
    }

    fn authorize_operation(&mut self, project_id: &str) -> Result<(), SupervisorError> {
        self.ensure_payload_ready()?;
        self.poll_crash()?;
        let base = self
            .workspace_base
            .as_ref()
            .ok_or(SupervisorError::WorkspaceUnavailable)?;
        let expected_workspace = project_workspace(base, project_id)?;
        let running = self
            .running
            .as_ref()
            .ok_or(SupervisorError::RuntimeNotReady)?;
        if self.lifecycle.state() != RuntimeState::Ready
            || running.project_id != project_id
            || running.workspace != expected_workspace
            || running.port == 0
            || running.token.expose_to_native_broker().is_empty()
        {
            return Err(SupervisorError::ProjectUnauthorized);
        }
        Ok(())
    }

    fn runtime_transport(
        &mut self,
        project_id: &str,
    ) -> Result<HttpSiyuanTransport, SupervisorError> {
        self.authorize_operation(project_id)?;
        let running = self
            .running
            .as_ref()
            .ok_or(SupervisorError::RuntimeNotReady)?;
        HttpSiyuanTransport::new(
            running.port,
            running.token.expose_to_native_broker().to_owned(),
        )
        .map_err(|_| SupervisorError::ProcessUnavailable)
    }

    fn stop(&mut self) -> Result<(), SupervisorError> {
        if self.lifecycle.state() == RuntimeState::Disabled {
            self.running.take();
            return Ok(());
        }
        if self.running.is_some() {
            self.lifecycle
                .apply(RuntimeEvent::StopRequested)
                .map_err(|_| SupervisorError::LifecycleInvalid)?;
            self.running.take();
            self.lifecycle
                .apply(RuntimeEvent::ProcessExited)
                .map_err(|_| SupervisorError::LifecycleInvalid)?;
        } else {
            self.lifecycle.force_stopped();
        }
        Ok(())
    }
}

pub struct SiyuanRuntimeState {
    inner: Mutex<SupervisorInner>,
}

impl Default for SiyuanRuntimeState {
    fn default() -> Self {
        let availability = runtime_availability().unwrap_or(RuntimeAvailability {
            feature_enabled: false,
            payload_included: false,
            runtime_bundled: false,
        });
        Self {
            inner: Mutex::new(SupervisorInner::new(availability)),
        }
    }
}

impl SiyuanRuntimeState {
    #[cfg(test)]
    fn with_availability(availability: RuntimeAvailability) -> Self {
        Self {
            inner: Mutex::new(SupervisorInner::new(availability)),
        }
    }

    pub fn configure_workspace_base(&self, base: PathBuf) -> Result<(), SupervisorError> {
        PathAllowlist::new([base.clone()])?;
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| SupervisorError::StateUnavailable)?;
        inner.workspace_base = Some(base);
        Ok(())
    }

    pub fn status(&self) -> Result<RuntimeStatus, SupervisorError> {
        self.inner
            .lock()
            .map_err(|_| SupervisorError::StateUnavailable)?
            .status()
    }

    pub fn authorize_operation(&self, project_id: &str) -> Result<(), SupervisorError> {
        self.inner
            .lock()
            .map_err(|_| SupervisorError::StateUnavailable)?
            .authorize_operation(project_id)
    }

    pub(crate) fn runtime_transport(
        &self,
        project_id: &str,
    ) -> Result<HttpSiyuanTransport, SupervisorError> {
        self.inner
            .lock()
            .map_err(|_| SupervisorError::StateUnavailable)?
            .runtime_transport(project_id)
    }

    pub fn shutdown(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            let _ = inner.stop();
        }
    }
}

impl Drop for SiyuanRuntimeState {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn state_label(state: RuntimeState) -> &'static str {
    match state {
        RuntimeState::Disabled => "disabled",
        RuntimeState::Stopped => "stopped",
        RuntimeState::Starting => "starting",
        RuntimeState::Ready => "ready",
        RuntimeState::Failed => "failed",
        RuntimeState::Stopping => "stopping",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    struct MockProcess {
        exited: Arc<AtomicBool>,
        terminated: Arc<AtomicBool>,
    }

    impl RuntimeProcess for MockProcess {
        fn has_exited(&mut self) -> Result<bool, SupervisorError> {
            Ok(self.exited.load(Ordering::SeqCst))
        }

        fn terminate(&mut self) -> Result<(), SupervisorError> {
            self.terminated.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    fn ready_availability() -> RuntimeAvailability {
        RuntimeAvailability {
            feature_enabled: true,
            payload_included: true,
            runtime_bundled: true,
        }
    }

    #[test]
    fn checked_in_state_is_truthfully_disabled_and_unbundled() {
        let state = SiyuanRuntimeState::default();
        assert_eq!(
            state.status().unwrap(),
            RuntimeStatus {
                feature_enabled: false,
                runtime_bundled: false,
                state: "disabled".to_owned(),
            }
        );
        assert_eq!(
            state.authorize_operation("project-1"),
            Err(SupervisorError::FeatureDisabled)
        );
    }

    #[test]
    fn payload_readiness_is_a_separate_hard_gate() {
        let state = SiyuanRuntimeState::with_availability(RuntimeAvailability {
            feature_enabled: true,
            payload_included: false,
            runtime_bundled: false,
        });
        assert_eq!(
            state.authorize_operation("project-1"),
            Err(SupervisorError::PayloadUnavailable)
        );
    }

    #[test]
    fn launch_plan_uses_loopback_random_port_scoped_workspace_and_redacted_token() {
        let base = std::env::temp_dir().join("vibespace-siyuan-managed-test");
        let state = SiyuanRuntimeState::with_availability(ready_availability());
        state.configure_workspace_base(base.clone()).unwrap();
        let mut inner = state.inner.lock().unwrap();
        let plan = inner.prepare_launch("project-1").unwrap();
        assert_eq!(plan.host(), "127.0.0.1");
        assert_ne!(plan.port(), 0);
        assert_eq!(plan.workspace(), base.join("project-1").join("workspace"));
        assert!(plan.token_for_native_broker().len() >= 32);
        assert!(!format!("{plan:?}").contains(plan.token_for_native_broker()));
    }

    #[test]
    fn stop_terminates_the_owned_process_and_clears_authority() {
        let base = std::env::temp_dir().join("vibespace-siyuan-stop-test");
        let terminated = Arc::new(AtomicBool::new(false));
        let state = SiyuanRuntimeState::with_availability(ready_availability());
        state.configure_workspace_base(base).unwrap();
        let mut inner = state.inner.lock().unwrap();
        let plan = inner.prepare_launch("project-1").unwrap();
        inner
            .attach_running(
                plan,
                Box::new(MockProcess {
                    exited: Arc::new(AtomicBool::new(false)),
                    terminated: terminated.clone(),
                }),
            )
            .unwrap();
        assert!(inner.authorize_operation("project-1").is_ok());
        inner.stop().unwrap();
        assert!(terminated.load(Ordering::SeqCst));
        assert_eq!(inner.lifecycle.state(), RuntimeState::Stopped);
        assert!(inner.running.is_none());
    }

    #[test]
    fn crash_detection_redacts_and_clears_the_runtime_connection() {
        let base = std::env::temp_dir().join("vibespace-siyuan-crash-test");
        let exited = Arc::new(AtomicBool::new(false));
        let terminated = Arc::new(AtomicBool::new(false));
        let state = SiyuanRuntimeState::with_availability(ready_availability());
        state.configure_workspace_base(base).unwrap();
        let mut inner = state.inner.lock().unwrap();
        let plan = inner.prepare_launch("project-1").unwrap();
        inner
            .attach_running(
                plan,
                Box::new(MockProcess {
                    exited: exited.clone(),
                    terminated: terminated.clone(),
                }),
            )
            .unwrap();
        exited.store(true, Ordering::SeqCst);
        assert_eq!(inner.status().unwrap().state, "failed");
        assert!(inner.running.is_none());
        assert!(terminated.load(Ordering::SeqCst));
        assert_eq!(
            SupervisorError::ProcessUnavailable.to_string(),
            "siyuan_process_unavailable"
        );
    }
}
