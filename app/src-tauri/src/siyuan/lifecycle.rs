//! Pure lifecycle state machine. It owns no process and performs no I/O.

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeState {
    Disabled,
    Stopped,
    Starting,
    Ready,
    Failed,
    Stopping,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeEvent {
    StartRequested,
    HealthCheckPassed,
    StopRequested,
    ProcessExited,
    CrashDetected,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LifecycleError {
    FeatureDisabled,
    InvalidTransition {
        state: RuntimeState,
        event: RuntimeEvent,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RuntimeLifecycle {
    state: RuntimeState,
}

impl RuntimeLifecycle {
    pub fn new(feature_enabled: bool) -> Self {
        Self {
            state: if feature_enabled {
                RuntimeState::Stopped
            } else {
                RuntimeState::Disabled
            },
        }
    }

    pub fn state(&self) -> RuntimeState {
        self.state
    }

    pub fn apply(&mut self, event: RuntimeEvent) -> Result<RuntimeState, LifecycleError> {
        if self.state == RuntimeState::Disabled {
            return Err(LifecycleError::FeatureDisabled);
        }
        let next = match (self.state, event) {
            (RuntimeState::Stopped, RuntimeEvent::StartRequested) => RuntimeState::Starting,
            (RuntimeState::Starting, RuntimeEvent::HealthCheckPassed) => RuntimeState::Ready,
            (
                RuntimeState::Starting | RuntimeState::Ready | RuntimeState::Failed,
                RuntimeEvent::StopRequested,
            ) => RuntimeState::Stopping,
            (RuntimeState::Stopping, RuntimeEvent::ProcessExited) => RuntimeState::Stopped,
            (RuntimeState::Starting | RuntimeState::Ready, RuntimeEvent::CrashDetected) => {
                RuntimeState::Failed
            }
            (state, event) => return Err(LifecycleError::InvalidTransition { state, event }),
        };
        self.state = next;
        Ok(next)
    }

    pub fn force_stopped(&mut self) -> RuntimeState {
        self.state = if self.state == RuntimeState::Disabled {
            RuntimeState::Disabled
        } else {
            RuntimeState::Stopped
        };
        self.state
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checked_in_feature_gate_cannot_start() {
        let mut lifecycle = RuntimeLifecycle::new(false);
        assert_eq!(lifecycle.state(), RuntimeState::Disabled);
        assert_eq!(
            lifecycle.apply(RuntimeEvent::StartRequested),
            Err(LifecycleError::FeatureDisabled)
        );
    }

    #[test]
    fn models_a_future_successful_start_and_stop_without_spawning() {
        let mut lifecycle = RuntimeLifecycle::new(true);
        assert_eq!(
            lifecycle.apply(RuntimeEvent::StartRequested),
            Ok(RuntimeState::Starting)
        );
        assert_eq!(
            lifecycle.apply(RuntimeEvent::HealthCheckPassed),
            Ok(RuntimeState::Ready)
        );
        assert_eq!(
            lifecycle.apply(RuntimeEvent::StopRequested),
            Ok(RuntimeState::Stopping)
        );
        assert_eq!(
            lifecycle.apply(RuntimeEvent::ProcessExited),
            Ok(RuntimeState::Stopped)
        );
    }

    #[test]
    fn rejects_out_of_order_health_and_exit_events() {
        let mut lifecycle = RuntimeLifecycle::new(true);
        assert!(matches!(
            lifecycle.apply(RuntimeEvent::HealthCheckPassed),
            Err(LifecycleError::InvalidTransition { .. })
        ));
        assert_eq!(lifecycle.state(), RuntimeState::Stopped);
    }

    #[test]
    fn crash_and_shutdown_transitions_are_explicit() {
        let mut lifecycle = RuntimeLifecycle::new(true);
        lifecycle.apply(RuntimeEvent::StartRequested).unwrap();
        lifecycle.apply(RuntimeEvent::HealthCheckPassed).unwrap();
        assert_eq!(
            lifecycle.apply(RuntimeEvent::CrashDetected),
            Ok(RuntimeState::Failed)
        );
        assert_eq!(lifecycle.force_stopped(), RuntimeState::Stopped);
    }
}
