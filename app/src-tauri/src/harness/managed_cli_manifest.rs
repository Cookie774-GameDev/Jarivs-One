use serde::{Deserialize, Serialize};
use std::path::{Component, Path};
use url::Url;

const CODEX_MANIFEST: &str = include_str!("../../resources/codex-runtime-manifest.json");
const OPENCODEX_MANIFEST: &str = include_str!("../../resources/opencodex-runtime-manifest.json");
const MANIFEST_SCHEMA_VERSION: u32 = 1;
const MAX_COMPRESSED_BYTES: u64 = 1_073_741_824;
const MAX_EXPANDED_BYTES: u64 = 2_147_483_648;
const MAX_ARCHIVE_ENTRIES: usize = 8_192;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ManagedCliKind {
    Codex,
    OpenCodex,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManagedCliManifest {
    schema_version: u32,
    releases: Vec<ManagedCliRelease>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedCliRelease {
    pub kind: ManagedCliKind,
    pub platform: String,
    pub architecture: String,
    pub version: String,
    pub package: String,
    pub asset: String,
    pub url: String,
    pub compressed_bytes: u64,
    pub sha256: String,
    pub npm_integrity: String,
    pub entrypoint: String,
    pub license: String,
    pub maximum_expanded_bytes: u64,
    pub maximum_entries: usize,
}

fn is_numeric_version(value: &str) -> bool {
    let parts = value.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
}

fn is_safe_relative_path(value: &str) -> bool {
    if value.is_empty() || value.len() > 256 {
        return false;
    }
    Path::new(value)
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn is_sha512_integrity(value: &str) -> bool {
    let Some(encoded) = value.strip_prefix("sha512-") else {
        return false;
    };
    encoded.len() >= 88
        && encoded
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'='))
}

fn expected_identity(
    release: &ManagedCliRelease,
) -> (&'static str, String, String, &'static str, &'static str) {
    match release.kind {
        ManagedCliKind::Codex => {
            let asset = format!("codex-{}-win32-x64.tgz", release.version);
            let url = format!("https://registry.npmjs.org/@openai/codex/-/{asset}");
            (
                "@openai/codex",
                asset,
                url,
                "package/vendor/x86_64-pc-windows-msvc/bin/codex.exe",
                "Apache-2.0",
            )
        }
        ManagedCliKind::OpenCodex => {
            let asset = format!("opencodex-{}.tgz", release.version);
            let url = format!("https://registry.npmjs.org/@bitkyc08/opencodex/-/{asset}");
            (
                "@bitkyc08/opencodex",
                asset,
                url,
                "package/bin/ocx.mjs",
                "MIT",
            )
        }
    }
}

fn validate_release(release: &ManagedCliRelease) -> Result<(), String> {
    if !is_numeric_version(&release.version) {
        return Err("Managed CLI release version is invalid.".to_string());
    }
    if release.platform != "windows" || release.architecture != "x86_64" {
        return Err("Managed CLI platform is unsupported.".to_string());
    }
    if !is_safe_relative_path(&release.asset) || !release.asset.ends_with(".tgz") {
        return Err("Managed CLI asset name is unsafe.".to_string());
    }
    if !is_safe_relative_path(&release.entrypoint) {
        return Err("Managed CLI entrypoint is unsafe.".to_string());
    }
    if !is_sha256(&release.sha256) || !is_sha512_integrity(&release.npm_integrity) {
        return Err("Managed CLI artifact integrity is invalid.".to_string());
    }
    if release.compressed_bytes == 0 || release.compressed_bytes > MAX_COMPRESSED_BYTES {
        return Err("Managed CLI compressed size is invalid.".to_string());
    }
    if release.maximum_expanded_bytes < release.compressed_bytes
        || release.maximum_expanded_bytes > MAX_EXPANDED_BYTES
    {
        return Err("Managed CLI expanded size is invalid.".to_string());
    }
    if release.maximum_entries == 0 || release.maximum_entries > MAX_ARCHIVE_ENTRIES {
        return Err("Managed CLI entry limit is invalid.".to_string());
    }

    let (package, asset, url, entrypoint, license) = expected_identity(release);
    if release.package != package
        || release.asset != asset
        || release.url != url
        || release.entrypoint != entrypoint
        || release.license != license
    {
        return Err("Managed CLI artifact identity is invalid.".to_string());
    }

    let parsed =
        Url::parse(&release.url).map_err(|_| "Managed CLI release URL is invalid.".to_string())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("registry.npmjs.org")
        || parsed.username() != ""
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("Managed CLI release URL is not an approved official source.".to_string());
    }

    Ok(())
}

pub fn parse_managed_release_manifest(
    json: &str,
    kind: ManagedCliKind,
    platform: &str,
    architecture: &str,
) -> Result<ManagedCliRelease, String> {
    let manifest: ManagedCliManifest = serde_json::from_str(json)
        .map_err(|_| "Managed CLI runtime manifest is invalid.".to_string())?;
    if manifest.schema_version != MANIFEST_SCHEMA_VERSION {
        return Err("Managed CLI runtime manifest schema is unsupported.".to_string());
    }

    let matching = manifest
        .releases
        .into_iter()
        .filter(|release| {
            release.kind == kind
                && release.platform == platform
                && release.architecture == architecture
        })
        .collect::<Vec<_>>();
    if matching.len() != 1 {
        return Err("Managed CLI runtime manifest has no unique release.".to_string());
    }
    let release = matching.into_iter().next().expect("one matching release");
    validate_release(&release)?;
    Ok(release)
}

pub fn embedded_managed_release(
    kind: ManagedCliKind,
    platform: &str,
    architecture: &str,
) -> Result<ManagedCliRelease, String> {
    let json = match kind {
        ManagedCliKind::Codex => CODEX_MANIFEST,
        ManagedCliKind::OpenCodex => OPENCODEX_MANIFEST,
    };
    parse_managed_release_manifest(json, kind, platform, architecture)
}

#[cfg(test)]
mod tests {
    use super::{embedded_managed_release, parse_managed_release_manifest, ManagedCliKind};
    use serde_json::{json, Value};

    fn valid_codex_manifest() -> Value {
        json!({
            "schemaVersion": 1,
            "releases": [{
                "kind": "codex",
                "platform": "windows",
                "architecture": "x86_64",
                "version": "0.151.0",
                "package": "@openai/codex",
                "asset": "codex-0.151.0-win32-x64.tgz",
                "url": "https://registry.npmjs.org/@openai/codex/-/codex-0.151.0-win32-x64.tgz",
                "compressedBytes": 147584554,
                "sha256": "9044e64402bf6a92774fe35a8cb86010d254c0d3390d5a7ee9047024588d7355",
                "npmIntegrity": "sha512-sLT7xvID3jhU6tkzcwRPnMEclKRwUPbpo0mtfxIF9KpdZH3VJV7sM2/kXWXyvUM7Zt/YeyOaeATTEysbRz8Yog==",
                "entrypoint": "package/vendor/x86_64-pc-windows-msvc/bin/codex.exe",
                "license": "Apache-2.0",
                "maximumExpandedBytes": 536870912,
                "maximumEntries": 128
            }]
        })
    }

    #[test]
    fn embedded_manifests_pin_the_audited_artifacts() {
        let codex = embedded_managed_release(ManagedCliKind::Codex, "windows", "x86_64")
            .expect("Codex release");
        assert_eq!(codex.version, "0.151.0");
        assert_eq!(codex.compressed_bytes, 147_584_554);
        assert_eq!(
            codex.sha256,
            "9044e64402bf6a92774fe35a8cb86010d254c0d3390d5a7ee9047024588d7355"
        );

        let opencodex = embedded_managed_release(ManagedCliKind::OpenCodex, "windows", "x86_64")
            .expect("OpenCodex release");
        assert_eq!(opencodex.version, "2.36.0");
        assert_eq!(opencodex.compressed_bytes, 9_520_432);
        assert_eq!(
            opencodex.sha256,
            "95f2bab63125a94b5b53d5cc912a225812aed0a17b926cf556d6fc37651be915"
        );
    }

    #[test]
    fn rejects_wrong_source_package_entrypoint_integrity_and_hash() {
        let mutations = [
            ("package", json!("@attacker/codex")),
            ("url", json!("https://example.com/codex.tgz")),
            ("entrypoint", json!("../codex.exe")),
            ("npmIntegrity", json!("sha512-invalid")),
            ("sha256", json!("ABC123")),
        ];

        for (field, value) in mutations {
            let mut manifest = valid_codex_manifest();
            manifest["releases"][0][field] = value;
            assert!(
                parse_managed_release_manifest(
                    &manifest.to_string(),
                    ManagedCliKind::Codex,
                    "windows",
                    "x86_64",
                )
                .is_err(),
                "accepted invalid {field}"
            );
        }
    }

    #[test]
    fn rejects_unknown_schema_kind_platform_limits_and_fields() {
        let mut schema = valid_codex_manifest();
        schema["schemaVersion"] = json!(2);
        assert!(parse_managed_release_manifest(
            &schema.to_string(),
            ManagedCliKind::Codex,
            "windows",
            "x86_64",
        )
        .is_err());

        assert!(parse_managed_release_manifest(
            &valid_codex_manifest().to_string(),
            ManagedCliKind::OpenCodex,
            "windows",
            "x86_64",
        )
        .is_err());
        assert!(parse_managed_release_manifest(
            &valid_codex_manifest().to_string(),
            ManagedCliKind::Codex,
            "linux",
            "x86_64",
        )
        .is_err());

        for (field, value) in [
            ("compressedBytes", json!(0)),
            ("maximumExpandedBytes", json!(1)),
            ("maximumEntries", json!(0)),
        ] {
            let mut manifest = valid_codex_manifest();
            manifest["releases"][0][field] = value;
            assert!(parse_managed_release_manifest(
                &manifest.to_string(),
                ManagedCliKind::Codex,
                "windows",
                "x86_64",
            )
            .is_err());
        }

        let mut unknown = valid_codex_manifest();
        unknown["releases"][0]["fallbackUrl"] = json!("https://example.com/fallback");
        assert!(parse_managed_release_manifest(
            &unknown.to_string(),
            ManagedCliKind::Codex,
            "windows",
            "x86_64",
        )
        .is_err());
    }
}
