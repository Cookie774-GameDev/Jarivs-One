//! Compile-time binding to the reviewed, disabled SiYuan runtime manifest.

pub const SIYUAN_CONTEXT_VAULT_ENABLED: bool = false;
pub const SIYUAN_UPSTREAM_TAG: &str = "v3.8.1";
pub const SIYUAN_UPSTREAM_COMMIT: &str = "afa823b6b4e4f183511e0bc0a3be93caa94c7c97";
pub const SIYUAN_WINDOWS_X64_SHA256: &str =
    "50df27aa899491323035aee59b2b9b55df174e13b8dc3694f7c46d7f82770787";
pub const SIYUAN_WINDOWS_X64_BYTES: u64 = 204_769_168;
pub const SIYUAN_RUNTIME_FINGERPRINT: &str =
    "59ce62549b891a1e0fb8fce530442ec95882e240b3349795ed517ca8761d603c";
pub const SIYUAN_RUNTIME_UNCOMPRESSED_BYTES: u64 = 445_983_251;
pub const SIYUAN_RUNTIME_FILE_COUNT: u64 = 1_153;

const RUNTIME_MANIFEST: &str = include_str!("../../resources/siyuan-runtime-manifest.json");

pub fn runtime_manifest_json() -> &'static str {
    RUNTIME_MANIFEST
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RuntimeAvailability {
    pub feature_enabled: bool,
    pub payload_included: bool,
    pub runtime_bundled: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmbeddedManifest {
    feature_enabled: bool,
    runtime_closure: EmbeddedClosure,
    packaging: EmbeddedPackaging,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmbeddedClosure {
    payload_included: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmbeddedPackaging {
    runtime_bundled: bool,
}

pub fn runtime_availability() -> Result<RuntimeAvailability, &'static str> {
    let manifest: EmbeddedManifest =
        serde_json::from_str(RUNTIME_MANIFEST).map_err(|_| "siyuan_runtime_manifest_invalid")?;
    Ok(RuntimeAvailability {
        feature_enabled: manifest.feature_enabled,
        payload_included: manifest.runtime_closure.payload_included,
        runtime_bundled: manifest.packaging.runtime_bundled,
    })
}

/// A dependency-free tripwire for native builds. The strict structural verifier lives in
/// `scripts/verify-siyuan-runtime-manifest.mjs`; this check prevents an isolated native module
/// from silently compiling against an enabled or differently pinned manifest.
pub fn verify_disabled_manifest_contract() -> Result<(), &'static str> {
    let required = [
        "\"featureEnabled\": false",
        "\"runtimeBundled\": true",
        "\"payloadIncluded\": true",
        "\"status\": \"build-materialized\"",
        "\"bindHost\": \"127.0.0.1\"",
        "\"randomPortRequired\": true",
        "\"runtimeTokenRequired\": true",
        SIYUAN_UPSTREAM_TAG,
        SIYUAN_UPSTREAM_COMMIT,
        SIYUAN_WINDOWS_X64_SHA256,
        SIYUAN_RUNTIME_FINGERPRINT,
    ];
    if required
        .iter()
        .any(|needle| !RUNTIME_MANIFEST.contains(needle))
    {
        return Err("siyuan_runtime_manifest_contract_invalid");
    }
    if RUNTIME_MANIFEST.contains("\"featureEnabled\": true") {
        return Err("siyuan_runtime_manifest_premature_enablement");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pins_the_reviewed_upstream_release() {
        assert!(!SIYUAN_CONTEXT_VAULT_ENABLED);
        assert_eq!(SIYUAN_UPSTREAM_TAG, "v3.8.1");
        assert_eq!(
            SIYUAN_UPSTREAM_COMMIT,
            "afa823b6b4e4f183511e0bc0a3be93caa94c7c97"
        );
        assert_eq!(SIYUAN_WINDOWS_X64_BYTES, 204_769_168);
        assert!(verify_disabled_manifest_contract().is_ok());
        assert_eq!(
            runtime_availability().unwrap(),
            RuntimeAvailability {
                feature_enabled: false,
                payload_included: true,
                runtime_bundled: true,
            }
        );
    }
}
