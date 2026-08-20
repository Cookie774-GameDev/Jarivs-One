//! Managed native runtime state. The checked-in build cannot prepare or attach a process because
//! both the feature gate and packaged-payload readiness are false.

use super::client::{HttpSiyuanTransport, RuntimeStatus};
use super::lifecycle::{RuntimeEvent, RuntimeLifecycle, RuntimeState};
use super::manifest::{runtime_availability, RuntimeAvailability};
use super::resource::{RuntimeResourceError, VerifiedRuntimeResources};
use super::security::{
    project_workspace, require_publish_mode_disabled, reserve_loopback_port, PathAllowlist,
    RuntimeToken, SecurityError, LOOPBACK_HOST,
};
use std::ffi::OsString;
use std::fmt;
use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(120);
const STARTUP_POLL_INTERVAL: Duration = Duration::from_millis(200);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SupervisorError {
    FeatureDisabled,
    PayloadUnavailable,
    RuntimeNotReady,
    ProjectUnauthorized,
    WorkspaceUnavailable,
    ResourceUnavailable,
    StateUnavailable,
    LifecycleInvalid,
    ProcessUnavailable,
    StartupTimeout,
}

impl SupervisorError {
    pub fn public_code(self) -> &'static str {
        match self {
            Self::FeatureDisabled => "siyuan_feature_disabled",
            Self::PayloadUnavailable => "siyuan_payload_unavailable",
            Self::RuntimeNotReady => "siyuan_runtime_not_ready",
            Self::ProjectUnauthorized => "siyuan_project_unauthorized",
            Self::WorkspaceUnavailable => "siyuan_workspace_unavailable",
            Self::ResourceUnavailable => "siyuan_resource_unavailable",
            Self::StateUnavailable => "siyuan_state_unavailable",
            Self::LifecycleInvalid => "siyuan_lifecycle_invalid",
            Self::ProcessUnavailable => "siyuan_process_unavailable",
            Self::StartupTimeout => "siyuan_startup_timeout",
        }
    }
}

impl From<RuntimeResourceError> for SupervisorError {
    fn from(_: RuntimeResourceError) -> Self {
        Self::ResourceUnavailable
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
    fn pid(&self) -> Option<u32> {
        None
    }
    fn has_exited(&mut self) -> Result<bool, SupervisorError>;
    fn terminate(&mut self) -> Result<(), SupervisorError>;
    fn supports_graceful_shutdown(&self) -> bool {
        true
    }
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
    fn pid(&self) -> Option<u32> {
        Some(self.child.id())
    }

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
        if self
            .child
            .try_wait()
            .map_err(|_| SupervisorError::ProcessUnavailable)?
            .is_some()
        {
            self.terminated = true;
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
    resources: VerifiedRuntimeResources,
    project_id: String,
    workspace: PathBuf,
    runtime_home: PathBuf,
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

    fn spawn(&mut self) -> Result<ChildRuntimeProcess, SupervisorError> {
        self.release_port_reservation();
        let mut command = Command::new(self.resources.executable());
        command
            .args(self.command_arguments())
            .env(
                "SIYUAN_ACCESS_AUTH_CODE",
                self.token.expose_to_native_broker(),
            )
            .env("HOME", &self.runtime_home)
            .env("USERPROFILE", &self.runtime_home)
            .env("APPDATA", self.runtime_home.join("AppData/Roaming"))
            .env("LOCALAPPDATA", self.runtime_home.join("AppData/Local"))
            .current_dir(self.resources.root())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        command
            .spawn()
            .map(ChildRuntimeProcess::new)
            .map_err(|_| SupervisorError::ProcessUnavailable)
    }

    fn command_arguments(&self) -> Vec<OsString> {
        [
            "serve".to_owned(),
            format!("--workspace={}", self.workspace.display()),
            format!("--wd={}", self.resources.root().display()),
            format!("--port={}", self.port),
            "--readonly=false".to_owned(),
            "--lang=en".to_owned(),
            "--mode=prod".to_owned(),
            "--ssl=false".to_owned(),
            "--attach-ui=false".to_owned(),
            "--safe-mode=true".to_owned(),
            "--enable-pprof=false".to_owned(),
        ]
        .into_iter()
        .map(OsString::from)
        .collect()
    }
}

impl fmt::Debug for RuntimeLaunchPlan {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RuntimeLaunchPlan")
            .field("host", &LOOPBACK_HOST)
            .field("port", &self.port)
            .field("project_id", &self.project_id)
            .field("resource_root", &self.resources.root())
            .field("workspace", &self.workspace)
            .field("runtime_home", &self.runtime_home)
            .field("token", &"[REDACTED]")
            .finish()
    }
}

struct RunningRuntime {
    project_id: String,
    workspace: PathBuf,
    executable: PathBuf,
    arguments: Vec<OsString>,
    port: u16,
    token: RuntimeToken,
    process: Box<dyn RuntimeProcess>,
}

impl RunningRuntime {
    fn stop_gracefully(&mut self) -> Result<bool, SupervisorError> {
        if !self.process.supports_graceful_shutdown() {
            self.process.terminate()?;
            return Ok(false);
        }
        if !self.process.has_exited()? {
            if let Ok(transport) =
                HttpSiyuanTransport::new(self.port, self.token.expose_to_native_broker().to_owned())
            {
                let _ = transport.request_shutdown();
            }
            let deadline = Instant::now() + SHUTDOWN_TIMEOUT;
            while Instant::now() < deadline {
                if self.process.has_exited()? {
                    return Ok(true);
                }
                thread::sleep(STARTUP_POLL_INTERVAL);
            }
        }
        self.process.terminate()?;
        Ok(false)
    }
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
    resources: Option<VerifiedRuntimeResources>,
    running: Option<RunningRuntime>,
    last_stop_graceful: bool,
}

impl SupervisorInner {
    fn new(availability: RuntimeAvailability) -> Self {
        Self {
            availability,
            lifecycle: RuntimeLifecycle::new(availability.feature_enabled),
            workspace_base: None,
            resources: None,
            running: None,
            last_stop_graceful: false,
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
        fs::create_dir_all(&workspace).map_err(|_| SupervisorError::WorkspaceUnavailable)?;
        let runtime_home = workspace
            .parent()
            .ok_or(SupervisorError::WorkspaceUnavailable)?
            .join("runtime-home");
        fs::create_dir_all(runtime_home.join("AppData/Roaming"))
            .map_err(|_| SupervisorError::WorkspaceUnavailable)?;
        fs::create_dir_all(runtime_home.join("AppData/Local"))
            .map_err(|_| SupervisorError::WorkspaceUnavailable)?;
        let resources = self
            .resources
            .clone()
            .ok_or(SupervisorError::ResourceUnavailable)?;
        let (reservation, port) = reserve_loopback_port()?;
        let token = RuntimeToken::generate()?;
        self.lifecycle
            .apply(RuntimeEvent::StartRequested)
            .map_err(|_| SupervisorError::LifecycleInvalid)?;
        Ok(RuntimeLaunchPlan {
            reservation: Some(reservation),
            resources,
            project_id: project_id.to_owned(),
            workspace,
            runtime_home,
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
        let executable = plan.resources.executable().to_path_buf();
        let arguments = plan.command_arguments();
        self.running = Some(RunningRuntime {
            project_id: plan.project_id,
            workspace: plan.workspace,
            executable,
            arguments,
            port: plan.port,
            token: plan.token,
            process,
        });
        Ok(())
    }

    fn start(&mut self, project_id: &str) -> Result<RuntimeStatus, SupervisorError> {
        let mut plan = self.prepare_launch(project_id)?;
        let transport = match HttpSiyuanTransport::new(
            plan.port(),
            plan.token_for_native_broker().to_owned(),
        ) {
            Ok(transport) => transport,
            Err(_) => {
                self.lifecycle
                    .apply(RuntimeEvent::CrashDetected)
                    .map_err(|_| SupervisorError::LifecycleInvalid)?;
                return Err(SupervisorError::ProcessUnavailable);
            }
        };
        let mut process = match plan.spawn() {
            Ok(process) => Box::new(process),
            Err(error) => {
                self.lifecycle
                    .apply(RuntimeEvent::CrashDetected)
                    .map_err(|_| SupervisorError::LifecycleInvalid)?;
                return Err(error);
            }
        };
        let deadline = Instant::now() + STARTUP_TIMEOUT;
        loop {
            if process.has_exited()? {
                self.lifecycle
                    .apply(RuntimeEvent::CrashDetected)
                    .map_err(|_| SupervisorError::LifecycleInvalid)?;
                return Err(SupervisorError::ProcessUnavailable);
            }
            match transport.boot_progress() {
                Ok(100) => match transport.verify_ready_session() {
                    Ok(()) => {
                        self.attach_running(plan, process)?;
                        return self.status();
                    }
                    Err(_) if Instant::now() < deadline => {}
                    Err(_) => {
                        let _ = process.terminate();
                        self.lifecycle
                            .apply(RuntimeEvent::CrashDetected)
                            .map_err(|_| SupervisorError::LifecycleInvalid)?;
                        return Err(SupervisorError::StartupTimeout);
                    }
                },
                Ok(_) | Err(_) if Instant::now() < deadline => {}
                Ok(_) | Err(_) => {
                    let _ = process.terminate();
                    self.lifecycle
                        .apply(RuntimeEvent::CrashDetected)
                        .map_err(|_| SupervisorError::LifecycleInvalid)?;
                    return Err(SupervisorError::StartupTimeout);
                }
            }
            thread::sleep(STARTUP_POLL_INTERVAL);
        }
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
            if let Some(running) = self.running.as_mut() {
                self.last_stop_graceful = running.stop_gracefully().unwrap_or(false);
            }
            self.running.take();
            self.lifecycle
                .apply(RuntimeEvent::ProcessExited)
                .map_err(|_| SupervisorError::LifecycleInvalid)?;
        } else {
            self.lifecycle.force_stopped();
        }
        Ok(())
    }

    fn stop_project(&mut self, project_id: &str) -> Result<RuntimeStatus, SupervisorError> {
        self.ensure_payload_ready()?;
        self.poll_crash()?;
        if let Some(running) = self.running.as_ref() {
            if running.project_id != project_id {
                return Err(SupervisorError::ProjectUnauthorized);
            }
        }
        self.stop()?;
        self.status()
    }
}

#[derive(Clone)]
pub struct SiyuanRuntimeState {
    inner: Arc<Mutex<SupervisorInner>>,
}

impl Default for SiyuanRuntimeState {
    fn default() -> Self {
        let availability = runtime_availability().unwrap_or(RuntimeAvailability {
            feature_enabled: false,
            payload_included: false,
            runtime_bundled: false,
        });
        Self {
            inner: Arc::new(Mutex::new(SupervisorInner::new(availability))),
        }
    }
}

impl SiyuanRuntimeState {
    #[cfg(test)]
    fn with_availability(availability: RuntimeAvailability) -> Self {
        let resource_root = std::env::temp_dir().join("vibespace-siyuan-contract-resources");
        let mut inner = SupervisorInner::new(availability);
        inner.resources = Some(VerifiedRuntimeResources::for_contract_tests(resource_root));
        Self {
            inner: Arc::new(Mutex::new(inner)),
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

    pub fn configure_resource_root(&self, root: PathBuf) -> Result<(), SupervisorError> {
        let resources = VerifiedRuntimeResources::discover(&root)?;
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| SupervisorError::StateUnavailable)?;
        inner.resources = Some(resources);
        Ok(())
    }

    pub fn status(&self) -> Result<RuntimeStatus, SupervisorError> {
        self.inner
            .lock()
            .map_err(|_| SupervisorError::StateUnavailable)?
            .status()
    }

    pub fn start(&self, project_id: &str) -> Result<RuntimeStatus, SupervisorError> {
        self.inner
            .lock()
            .map_err(|_| SupervisorError::StateUnavailable)?
            .start(project_id)
    }

    pub fn stop_project(&self, project_id: &str) -> Result<RuntimeStatus, SupervisorError> {
        self.inner
            .lock()
            .map_err(|_| SupervisorError::StateUnavailable)?
            .stop_project(project_id)
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
        if Arc::strong_count(&self.inner) == 1 {
            self.shutdown();
        }
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

        fn supports_graceful_shutdown(&self) -> bool {
            false
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
    fn checked_in_state_is_truthfully_disabled_and_build_materialized() {
        let state = SiyuanRuntimeState::default();
        assert_eq!(
            state.status().unwrap(),
            RuntimeStatus {
                feature_enabled: false,
                runtime_bundled: true,
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

    #[test]
    #[ignore = "requires the pinned Windows runtime and an explicitly owned D-drive fixture"]
    fn real_pinned_kernel_boots_authenticates_and_shuts_down_inside_owned_fixture() {
        let started_at = Instant::now();
        let resource_root = PathBuf::from(
            std::env::var_os("VIBESPACE_SIYUAN_REAL_RUNTIME_ROOT")
                .expect("explicit real runtime root"),
        );
        let workspace_base = PathBuf::from(
            std::env::var_os("VIBESPACE_SIYUAN_REAL_WORKSPACE_BASE")
                .expect("explicit real workspace base"),
        );
        let allowed = Path::new(r"D:\VibeSpace-Testing");
        assert!(resource_root.starts_with(allowed));
        assert!(workspace_base.starts_with(allowed));

        let state = SiyuanRuntimeState::with_availability(ready_availability());
        state
            .configure_resource_root(resource_root.clone())
            .unwrap();
        state
            .configure_workspace_base(workspace_base.clone())
            .unwrap();
        let ready = state.start("native-runtime-evidence").unwrap();
        assert_eq!(ready.state, "ready");
        assert!(ready.feature_enabled);
        assert!(ready.runtime_bundled);
        let (pid, port, workspace, executable, arguments) = {
            let inner = state.inner.lock().unwrap();
            let running = inner.running.as_ref().expect("running kernel");
            let pid = running.process.pid().expect("owned child pid");
            let arguments = running
                .arguments
                .iter()
                .map(|argument| argument.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            assert!(!arguments
                .iter()
                .any(|argument| argument.contains(running.token.expose_to_native_broker())));
            (
                pid,
                running.port,
                running.workspace.clone(),
                running.executable.clone(),
                arguments,
            )
        };
        let canonical_workspace_base = fs::canonicalize(&workspace_base).unwrap();
        let canonical_resource_root = fs::canonicalize(&resource_root).unwrap();
        assert!(fs::canonicalize(&workspace)
            .unwrap()
            .starts_with(&canonical_workspace_base));
        assert!(executable.starts_with(&canonical_resource_root));
        assert_eq!(arguments.first().map(String::as_str), Some("serve"));
        assert!(arguments
            .iter()
            .any(|argument| argument == &format!("--port={port}")));
        assert!(arguments.iter().any(|argument| argument == "--mode=prod"));
        assert!(arguments
            .iter()
            .any(|argument| argument == "--enable-pprof=false"));
        let stopped = state.stop_project("native-runtime-evidence").unwrap();
        assert_eq!(stopped.state, "stopped");
        let inner = state.inner.lock().unwrap();
        assert!(inner.last_stop_graceful);
        assert!(inner.running.is_none());
        drop(inner);
        let process_probe = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .output()
            .expect("tasklist process-exit probe");
        let process_probe = String::from_utf8_lossy(&process_probe.stdout);
        assert!(!process_probe.contains("SiYuan-Kernel.exe"));
        eprintln!(
            "SIYUAN_REAL_EVIDENCE version=3.8.1 health=100 session_cookie=established pid={pid} port={port} workspace={} executable={} launch_args={:?} graceful_shutdown=true process_exited=true elapsed_ms={}",
            workspace.display(),
            executable.display(),
            arguments,
            started_at.elapsed().as_millis(),
        );
    }
}
