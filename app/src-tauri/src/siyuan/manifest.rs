//! Compile-time binding to the reviewed, disabled SiYuan runtime manifest.

pub const SIYUAN_CONTEXT_VAULT_ENABLED: bool = false;
pub const SIYUAN_UPSTREAM_TAG: &str = "v3.8.1";
pub const SIYUAN_UPSTREAM_COMMIT: &str = "afa823b6b4e4f183511e0bc0a3be93caa94c7c97";
pub const SIYUAN_WINDOWS_X64_SHA256: &str =
    "50df27aa899491323035aee59b2b9b55df174e13b8dc3694f7c46d7f82770787";
pub const SIYUAN_WINDOWS_X64_BYTES: u64 = 204_769_168;

const RUNTIME_MANIFEST: &str = include_str!("../../resources/siyuan-runtime-manifest.json");

pub fn runtime_manifest_json() -> &'static str {
    RUNTIME_MANIFEST
}

/// A dependency-free tripwire for native builds. The strict structural verifier lives in
/// `scripts/verify-siyuan-runtime-manifest.mjs`; this check prevents an isolated native module
/// from silently compiling against an enabled or differently pinned manifest.
pub fn verify_disabled_manifest_contract() -> Result<(), &'static str> {
    let required = [
        "\"featureEnabled\": false",
        "\"runtimeBundled\": false",
        "\"payloadIncluded\": false",
        "\"status\": \"not-derived\"",
        "\"bindHost\": \"127.0.0.1\"",
        "\"randomPortRequired\": true",
        "\"runtimeTokenRequired\": true",
        SIYUAN_UPSTREAM_TAG,
        SIYUAN_UPSTREAM_COMMIT,
        SIYUAN_WINDOWS_X64_SHA256,
    ];
    if required
        .iter()
        .any(|needle| !RUNTIME_MANIFEST.contains(needle))
    {
        return Err("siyuan_runtime_manifest_contract_invalid");
    }
    if RUNTIME_MANIFEST.contains("\"featureEnabled\": true")
        || RUNTIME_MANIFEST.contains("\"runtimeBundled\": true")
        || RUNTIME_MANIFEST.contains("\"payloadIncluded\": true")
    {
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
    }
}
