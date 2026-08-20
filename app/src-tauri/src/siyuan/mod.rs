//! Isolated SiYuan runtime contracts.
//!
//! Commands are registered only on the ordinary Tauri builder. The supervisor remains
//! fail-closed while the feature is disabled and no verified runtime payload is bundled.

pub mod client;
pub mod commands;
pub mod lifecycle;
pub mod manifest;
pub mod security;
pub mod supervisor;

pub use supervisor::SiyuanRuntimeState;

pub fn shutdown_runtime(app: &tauri::AppHandle) {
    use tauri::Manager;
    app.state::<SiyuanRuntimeState>().shutdown();
}

#[cfg(test)]
mod tests {
    use super::manifest::{runtime_manifest_json, verify_disabled_manifest_contract};

    #[test]
    fn embedded_manifest_is_present_and_disabled() {
        assert!(runtime_manifest_json().contains("\"tag\": \"v3.8.1\""));
        verify_disabled_manifest_contract().expect("checked-in manifest must remain fail-closed");
    }
}
