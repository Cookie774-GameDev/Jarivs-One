//! Isolated SiYuan runtime contracts.
//!
//! Commands are registered only on the ordinary Tauri builder. The supervisor remains
//! fail-closed unless the bundled runtime passes marker, hash, loopback, auth, and version checks.

pub mod client;
pub mod commands;
pub mod lifecycle;
pub mod manifest;
pub mod resource;
pub mod security;
pub mod supervisor;
pub mod surface;

pub use supervisor::SiyuanRuntimeState;

pub fn shutdown_runtime(app: &tauri::AppHandle) {
    use tauri::Manager;
    surface::shutdown_surface(app);
    app.state::<SiyuanRuntimeState>().shutdown();
}

#[cfg(test)]
mod tests {
    use super::manifest::{runtime_manifest_json, verify_enabled_manifest_contract};

    #[test]
    fn embedded_manifest_is_present_and_enabled() {
        assert!(runtime_manifest_json().contains("\"tag\": \"v3.8.1\""));
        verify_enabled_manifest_contract()
            .expect("checked-in manifest must bind verified enablement");
    }
}
