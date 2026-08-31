use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::Path;

const PACKAGE_JSON: &str = include_str!("../../resources/opencodex-managed-runtime/package.json");
const BUN_LOCK: &str = include_str!("../../resources/opencodex-managed-runtime/bun.lock");
const BUNFIG: &str = include_str!("../../resources/opencodex-managed-runtime/bunfig.toml");
const EXPECTED_LOCK_SHA256: &str =
    "6a3e0bed984743fbe76ae63d23296a72ec1f87ab6df56ee6bd0c66d5529ac2d5";
const OPENCODEX_INTEGRITY: &str =
    "sha512-lnWaGRuxSl1OODq+rUz8kc3HnHs7hZKH9q5HOeUmXyv6CXzNwbSQnptNMS+aIc6aWWOUxhvG2o4f2udtVPS2Kw==";
const BUN_WINDOWS_INTEGRITY: &str =
    "sha512-jRKv1NPLznMSZY5BEWciMF7zv0Tiyo2pQSxAJ3w+YWJ6y3VWNJQQQdLlV5Jx8lbOFDrJdrc9dD3GV17k3BP41A==";
const KEYRING_WINDOWS_INTEGRITY: &str =
    "sha512-4DnCWXwDc0HRKwyRlG5y0VhKZW2tNRQfKKfyj6IX/KWfDNyq9hn4n+GL1auyDcOO/v8PwnhmYo2+rOOqCkvvOg==";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManagedPackageDescriptor {
    name: String,
    version: String,
    private: bool,
    dependencies: BTreeMap<String, String>,
    trusted_dependencies: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedOpenCodexDependencyLock {
    pub opencodex_version: &'static str,
    pub bun_version: &'static str,
    pub lock_sha256: String,
    pub platform: &'static str,
    pub architecture: &'static str,
    pub runs_dependency_scripts: bool,
}

fn sha256(value: &str) -> String {
    let normalized = value.replace("\r\n", "\n");
    format!("{:x}", Sha256::digest(normalized.as_bytes()))
}

fn has_forbidden_source(lock: &str) -> bool {
    ["file:", "git+", "workspace:", "link:", "http://"]
        .iter()
        .any(|source| lock.contains(source))
}

pub fn validate_opencodex_dependency_lock(
    package_json: &str,
    bun_lock: &str,
    bunfig: &str,
) -> Result<ManagedOpenCodexDependencyLock, String> {
    let package: ManagedPackageDescriptor = serde_json::from_str(package_json)
        .map_err(|_| "Managed OpenCodex package descriptor is invalid.".to_string())?;
    if package.name != "vibespace-managed-opencodex-runtime"
        || package.version != "0.0.0-private"
        || !package.private
        || package.dependencies.len() != 1
        || package
            .dependencies
            .get("@bitkyc08/opencodex")
            .map(String::as_str)
            != Some("2.36.0")
        || !package.trusted_dependencies.is_empty()
    {
        return Err("Managed OpenCodex package authority is invalid.".to_string());
    }

    let normalized_bunfig = bunfig.replace("\r\n", "\n");
    if normalized_bunfig.trim()
        != "[install]\nregistry = \"https://registry.npmjs.org\"\nsaveTextLockfile = true"
    {
        return Err("Managed OpenCodex registry configuration is invalid.".to_string());
    }
    if sha256(bun_lock) != EXPECTED_LOCK_SHA256
        || has_forbidden_source(bun_lock)
        || !bun_lock.contains("\"lockfileVersion\": 2")
        || !bun_lock.contains("\"@bitkyc08/opencodex\": \"2.36.0\"")
        || !bun_lock.contains("\"@bitkyc08/opencodex@2.36.0\"")
        || !bun_lock.contains(OPENCODEX_INTEGRITY)
        || !bun_lock.contains("\"@oven/bun-windows-x64@1.4.0\"")
        || !bun_lock.contains(BUN_WINDOWS_INTEGRITY)
        || !bun_lock.contains("\"@napi-rs/keyring-win32-x64-msvc@1.3.0\"")
        || !bun_lock.contains(KEYRING_WINDOWS_INTEGRITY)
    {
        return Err("Managed OpenCodex Bun lock is untrusted or has drifted.".to_string());
    }

    Ok(ManagedOpenCodexDependencyLock {
        opencodex_version: "2.36.0",
        bun_version: "1.4.0",
        lock_sha256: EXPECTED_LOCK_SHA256.to_string(),
        platform: "windows",
        architecture: "x86_64",
        runs_dependency_scripts: false,
    })
}

pub fn embedded_opencodex_dependency_lock() -> Result<ManagedOpenCodexDependencyLock, String> {
    validate_opencodex_dependency_lock(PACKAGE_JSON, BUN_LOCK, BUNFIG)
}

pub fn managed_bun_install_arguments(root: &Path) -> Vec<String> {
    let root = root.to_string_lossy().into_owned();
    let config = Path::new(&root)
        .join("bunfig.toml")
        .to_string_lossy()
        .into_owned();
    vec![
        "install".to_string(),
        format!("--cwd={root}"),
        format!("--config={config}"),
        "--frozen-lockfile".to_string(),
        "--ignore-scripts".to_string(),
        "--production".to_string(),
        "--os=win32".to_string(),
        "--cpu=x64".to_string(),
        "--backend=copyfile".to_string(),
        "--registry=https://registry.npmjs.org".to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::{
        embedded_opencodex_dependency_lock, managed_bun_install_arguments,
        validate_opencodex_dependency_lock,
    };
    use std::path::Path;

    const PACKAGE_JSON: &str =
        include_str!("../../resources/opencodex-managed-runtime/package.json");
    const BUN_LOCK: &str = include_str!("../../resources/opencodex-managed-runtime/bun.lock");
    const BUNFIG: &str = include_str!("../../resources/opencodex-managed-runtime/bunfig.toml");

    #[test]
    fn embedded_lock_pins_the_every_user_windows_runtime() {
        let lock = embedded_opencodex_dependency_lock().expect("embedded lock");
        assert_eq!(lock.opencodex_version, "2.36.0");
        assert_eq!(lock.bun_version, "1.4.0");
        assert_eq!(
            lock.lock_sha256,
            "6a3e0bed984743fbe76ae63d23296a72ec1f87ab6df56ee6bd0c66d5529ac2d5"
        );
        assert_eq!(lock.platform, "windows");
        assert_eq!(lock.architecture, "x86_64");
        assert!(!lock.runs_dependency_scripts);
        assert!(validate_opencodex_dependency_lock(
            PACKAGE_JSON,
            &BUN_LOCK.replace('\n', "\r\n"),
            BUNFIG,
        )
        .is_ok());
    }

    #[test]
    fn rejects_package_lock_registry_and_native_dependency_drift() {
        let mutations = [
            (
                PACKAGE_JSON.replace("2.36.0", "2.36.1"),
                BUN_LOCK.to_string(),
                BUNFIG.to_string(),
            ),
            (
                PACKAGE_JSON.to_string(),
                BUN_LOCK.replace("@oven/bun-windows-x64@1.4.0", "@oven/bun-windows-x64@9.9.9"),
                BUNFIG.to_string(),
            ),
            (
                PACKAGE_JSON.to_string(),
                BUN_LOCK.to_string(),
                BUNFIG.replace("https://registry.npmjs.org", "http://example.invalid"),
            ),
        ];

        for (package_json, bun_lock, bunfig) in mutations {
            assert!(
                validate_opencodex_dependency_lock(&package_json, &bun_lock, &bunfig,).is_err()
            );
        }
    }

    #[test]
    fn lock_rejects_local_git_workspace_and_untrusted_script_sources() {
        for source in [
            "file:../escape",
            "git+https://example.invalid/repo",
            "workspace:*",
            "http://example.invalid/pkg.tgz",
        ] {
            let mutated = BUN_LOCK.replacen("@bufbuild/protobuf@2.14.0", source, 1);
            assert!(validate_opencodex_dependency_lock(PACKAGE_JSON, &mutated, BUNFIG,).is_err());
        }

        let trusted = PACKAGE_JSON.replace(
            "\"trustedDependencies\": []",
            "\"trustedDependencies\": [\"bun\"]",
        );
        assert!(validate_opencodex_dependency_lock(&trusted, BUN_LOCK, BUNFIG).is_err());
    }

    #[test]
    fn install_plan_is_frozen_official_scriptless_and_platform_bound() {
        let root = Path::new("C:/managed/opencodex/2.36.0");
        let arguments = managed_bun_install_arguments(root);
        assert_eq!(arguments.first().map(String::as_str), Some("install"));
        for required in [
            "--frozen-lockfile",
            "--ignore-scripts",
            "--production",
            "--os=win32",
            "--cpu=x64",
            "--backend=copyfile",
            "--registry=https://registry.npmjs.org",
        ] {
            assert!(arguments.iter().any(|argument| argument == required));
        }
        assert!(arguments
            .iter()
            .any(|argument| argument == "--cwd=C:/managed/opencodex/2.36.0"));
        assert!(!arguments.iter().any(|argument| {
            matches!(
                argument.to_ascii_lowercase().as_str(),
                "npm" | "npm.cmd" | "node" | "node.exe" | "cmd" | "cmd.exe" | "powershell"
            )
        }));
    }
}
