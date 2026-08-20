//! Isolated SiYuan runtime contracts.
//!
//! This module is intentionally not registered with the Tauri command surface yet. Phase 0/1
//! keeps the feature disabled while the packaging closure and native integration are unfinished.

pub mod client;
pub mod lifecycle;
pub mod manifest;
pub mod security;

#[cfg(test)]
mod tests {
    use super::manifest::{runtime_manifest_json, verify_disabled_manifest_contract};

    #[test]
    fn embedded_manifest_is_present_and_disabled() {
        assert!(runtime_manifest_json().contains("\"tag\": \"v3.8.1\""));
        verify_disabled_manifest_contract().expect("checked-in manifest must remain fail-closed");
    }
}
