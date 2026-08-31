use serde::{Deserialize, Serialize};
use std::path::{Component, Path};
use url::Url;

const BUN_MANIFEST: &str = include_str!("../../resources/bun-runtime-manifest.json");
const MANIFEST_SCHEMA_VERSION: u32 = 1;
const MAX_COMPRESSED_BYTES: u64 = 268_435_456;
const MAX_EXPANDED_BYTES: u64 = 536_870_912;
const MAX_ARCHIVE_ENTRIES: usize = 64;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManagedBunManifest {
    schema_version: u32,
    releases: Vec<ManagedBunRelease>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedBunRelease {
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
    !value.is_empty()
        && value.len() <= 256
        && Path::new(value)
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

fn validate_release(release: &ManagedBunRelease) -> Result<(), String> {
    if !is_numeric_version(&release.version) {
        return Err("Managed Bun release version is invalid.".to_string());
    }
    if release.platform != "windows" || release.architecture != "x86_64" {
        return Err("Managed Bun platform is unsupported.".to_string());
    }
    if !is_safe_relative_path(&release.asset) || !release.asset.ends_with(".tgz") {
        return Err("Managed Bun asset name is unsafe.".to_string());
    }
    if !is_safe_relative_path(&release.entrypoint) {
        return Err("Managed Bun entrypoint is unsafe.".to_string());
    }
    if !is_sha256(&release.sha256) || !is_sha512_integrity(&release.npm_integrity) {
        return Err("Managed Bun artifact integrity is invalid.".to_string());
    }
    if release.compressed_bytes == 0 || release.compressed_bytes > MAX_COMPRESSED_BYTES {
        return Err("Managed Bun compressed size is invalid.".to_string());
    }
    if release.maximum_expanded_bytes < release.compressed_bytes
        || release.maximum_expanded_bytes > MAX_EXPANDED_BYTES
    {
        return Err("Managed Bun expanded size is invalid.".to_string());
    }
    if release.maximum_entries == 0 || release.maximum_entries > MAX_ARCHIVE_ENTRIES {
        return Err("Managed Bun entry limit is invalid.".to_string());
    }

    let asset = format!("bun-windows-x64-{}.tgz", release.version);
    let url = format!("https://registry.npmjs.org/@oven/bun-windows-x64/-/{asset}");
    if release.package != "@oven/bun-windows-x64"
        || release.asset != asset
        || release.url != url
        || release.entrypoint != "package/bin/bun.exe"
        || release.license != "MIT"
    {
        return Err("Managed Bun artifact identity is invalid.".to_string());
    }

    let parsed =
        Url::parse(&release.url).map_err(|_| "Managed Bun release URL is invalid.".to_string())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("registry.npmjs.org")
        || parsed.username() != ""
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("Managed Bun release URL is not an approved official source.".to_string());
    }

    Ok(())
}

pub fn parse_managed_bun_manifest(
    json: &str,
    platform: &str,
    architecture: &str,
) -> Result<ManagedBunRelease, String> {
    let manifest: ManagedBunManifest = serde_json::from_str(json)
        .map_err(|_| "Managed Bun runtime manifest is invalid.".to_string())?;
    if manifest.schema_version != MANIFEST_SCHEMA_VERSION {
        return Err("Managed Bun runtime manifest schema is unsupported.".to_string());
    }

    let matching = manifest
        .releases
        .into_iter()
        .filter(|release| release.platform == platform && release.architecture == architecture)
        .collect::<Vec<_>>();
    if matching.len() != 1 {
        return Err("Managed Bun runtime manifest has no unique release.".to_string());
    }
    let release = matching.into_iter().next().expect("one matching release");
    validate_release(&release)?;
    Ok(release)
}

pub fn embedded_managed_bun_release(
    platform: &str,
    architecture: &str,
) -> Result<ManagedBunRelease, String> {
    parse_managed_bun_manifest(BUN_MANIFEST, platform, architecture)
}

#[cfg(test)]
mod tests {
    use super::{embedded_managed_bun_release, parse_managed_bun_manifest};
    use serde_json::{json, Value};

    fn valid_manifest() -> Value {
        json!({
            "schemaVersion": 1,
            "releases": [{
                "platform": "windows",
                "architecture": "x86_64",
                "version": "1.4.0",
                "package": "@oven/bun-windows-x64",
                "asset": "bun-windows-x64-1.4.0.tgz",
                "url": "https://registry.npmjs.org/@oven/bun-windows-x64/-/bun-windows-x64-1.4.0.tgz",
                "compressedBytes": 40723290,
                "sha256": "70ecb8e56cadf21f4280ef8bccca2d7ab6ddd4357325e2bf1530e02fd585c27b",
                "npmIntegrity": "sha512-jRKv1NPLznMSZY5BEWciMF7zv0Tiyo2pQSxAJ3w+YWJ6y3VWNJQQQdLlV5Jx8lbOFDrJdrc9dD3GV17k3BP41A==",
                "entrypoint": "package/bin/bun.exe",
                "license": "MIT",
                "maximumExpandedBytes": 134217728,
                "maximumEntries": 16
            }]
        })
    }

    #[test]
    fn embedded_manifest_pins_the_audited_bun_artifact() {
        let release = embedded_managed_bun_release("windows", "x86_64").expect("Bun release");
        assert_eq!(release.version, "1.4.0");
        assert_eq!(release.compressed_bytes, 40_723_290);
        assert_eq!(
            release.sha256,
            "70ecb8e56cadf21f4280ef8bccca2d7ab6ddd4357325e2bf1530e02fd585c27b"
        );
        assert_eq!(release.entrypoint, "package/bin/bun.exe");
    }

    #[test]
    fn rejects_wrong_identity_source_integrity_and_unsafe_entrypoint() {
        for (field, value) in [
            ("package", json!("@attacker/bun")),
            ("url", json!("https://example.com/bun.tgz")),
            ("entrypoint", json!("../bun.exe")),
            ("npmIntegrity", json!("sha512-invalid")),
            ("sha256", json!("ABC123")),
        ] {
            let mut manifest = valid_manifest();
            manifest["releases"][0][field] = value;
            assert!(
                parse_managed_bun_manifest(&manifest.to_string(), "windows", "x86_64").is_err(),
                "accepted invalid {field}"
            );
        }
    }

    #[test]
    fn rejects_schema_platform_limits_duplicates_and_unknown_fields() {
        let mut schema = valid_manifest();
        schema["schemaVersion"] = json!(2);
        assert!(parse_managed_bun_manifest(&schema.to_string(), "windows", "x86_64").is_err());

        assert!(
            parse_managed_bun_manifest(&valid_manifest().to_string(), "linux", "x86_64").is_err()
        );

        for (field, value) in [
            ("compressedBytes", json!(0)),
            ("maximumExpandedBytes", json!(1)),
            ("maximumEntries", json!(0)),
        ] {
            let mut manifest = valid_manifest();
            manifest["releases"][0][field] = value;
            assert!(
                parse_managed_bun_manifest(&manifest.to_string(), "windows", "x86_64").is_err()
            );
        }

        let mut duplicate = valid_manifest();
        let cloned = duplicate["releases"][0].clone();
        duplicate["releases"].as_array_mut().unwrap().push(cloned);
        assert!(parse_managed_bun_manifest(&duplicate.to_string(), "windows", "x86_64").is_err());

        let mut unknown = valid_manifest();
        unknown["releases"][0]["fallbackUrl"] = json!("https://example.com/fallback");
        assert!(parse_managed_bun_manifest(&unknown.to_string(), "windows", "x86_64").is_err());
    }
}
