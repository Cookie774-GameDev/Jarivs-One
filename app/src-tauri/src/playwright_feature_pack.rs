use base64::Engine;
use cap_fs_ext::{DirExt, FollowSymlinks, MetadataExt, OpenOptionsFollowExt};
use cap_std::fs::{Dir, OpenOptions};
use minisign_verify::{PublicKey, Signature};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashSet};
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const PLAYWRIGHT_VERSION: &str = "1.61.1";
const MAX_FILE_BYTES: u64 = 768 * 1024 * 1024;
pub(crate) const MAX_TOTAL_BYTES: u64 = 1_500_000_000;
const MAX_FILES: usize = 20_000;
const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const MAX_SIGNATURE_BYTES: u64 = 16 * 1024;
const MAX_STATE_BYTES: u64 = 64 * 1024;
const FEATURE_ROOT_NAME: &str = "playwright-acceptance-runtime";
const VERSIONS_NAME: &str = "versions";
const MANIFEST_NAME: &str = "feature-pack.json";
const SIGNATURE_NAME: &str = "feature-pack.json.sig";
const INSTALLED_MANIFEST_NAME: &str = ".vibespace-feature-pack.json";
const INSTALLED_SIGNATURE_NAME: &str = ".vibespace-feature-pack.json.sig";
const RECEIPT_NAME: &str = ".vibespace-acceptance-runtime-receipt.json";
const STATE_NAME: &str = "acceptance-runtime-state.json";
const STATE_JOURNAL_PREFIX: &str = ".acceptance-runtime-state-";
const COPY_BUFFER_BYTES: usize = 1024 * 1024;
static NEXT_INSTALLATION: AtomicU64 = AtomicU64::new(0);
static LIFECYCLE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FeaturePackError {
    pub(crate) code: &'static str,
}

impl FeaturePackError {
    pub(crate) fn new(code: &'static str) -> Self {
        Self { code }
    }
}

fn fail<T>(code: &'static str) -> Result<T> {
    Err(FeaturePackError::new(code))
}

type Result<T> = std::result::Result<T, FeaturePackError>;

#[derive(Debug, Clone)]
pub(crate) struct FeaturePackTrustPolicy {
    pub(crate) public_key_sha256: String,
    pub(crate) expected_key_id: String,
    pub(crate) target_platform: String,
    pub(crate) allowed_manifest_sha256: Vec<String>,
    pub(crate) allowed_browser_revisions: Vec<String>,
    pub(crate) maximum_total_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct VerifiedManifestSignature {
    pub(crate) key_id: String,
}

pub(crate) trait ManifestSignatureVerifier: Send + Sync {
    fn public_key_sha256(&self) -> &str;

    fn verify_hashed_manifest(
        &self,
        manifest_bytes: &[u8],
        signature_bytes: &[u8],
    ) -> Result<VerifiedManifestSignature>;
}

pub(crate) struct MinisignManifestVerifier {
    public_key: PublicKey,
    public_key_sha256: String,
    key_id: String,
}

impl MinisignManifestVerifier {
    pub(crate) fn from_tauri_public_key(encoded_public_key: &str) -> Result<Self> {
        let decoded = decode_canonical_base64(encoded_public_key, 16 * 1024)?;
        let public_key_record = std::str::from_utf8(&decoded)
            .map_err(|_| FeaturePackError::new("production_trust_not_configured"))?;
        let lines = public_key_record.lines().collect::<Vec<_>>();
        if lines.len() != 2
            || !lines[0].starts_with("untrusted comment: ")
            || lines[0].bytes().any(|byte| byte.is_ascii_control())
        {
            return fail("production_trust_not_configured");
        }
        let raw_key = decode_canonical_base64(lines[1], 42)?;
        if raw_key.len() != 42 || &raw_key[..2] != b"Ed" {
            return fail("production_trust_not_configured");
        }
        let public_key = PublicKey::decode(public_key_record)
            .map_err(|_| FeaturePackError::new("production_trust_not_configured"))?;
        let key_id = raw_key[2..10]
            .iter()
            .rev()
            .map(|byte| format!("{byte:02X}"))
            .collect::<String>();
        Ok(Self {
            public_key,
            public_key_sha256: sha256(&raw_key),
            key_id,
        })
    }

    pub(crate) fn key_id(&self) -> &str {
        &self.key_id
    }
}

impl ManifestSignatureVerifier for MinisignManifestVerifier {
    fn public_key_sha256(&self) -> &str {
        &self.public_key_sha256
    }

    fn verify_hashed_manifest(
        &self,
        manifest_bytes: &[u8],
        signature_bytes: &[u8],
    ) -> Result<VerifiedManifestSignature> {
        let encoded_signature = std::str::from_utf8(signature_bytes)
            .map_err(|_| FeaturePackError::new("signature_invalid"))?;
        let decoded = decode_canonical_base64(encoded_signature, MAX_SIGNATURE_BYTES as usize)
            .map_err(|_| FeaturePackError::new("signature_invalid"))?;
        let signature_record = std::str::from_utf8(&decoded)
            .map_err(|_| FeaturePackError::new("signature_invalid"))?;
        if signature_record.lines().count() != 4 {
            return fail("signature_invalid");
        }
        let signature = Signature::decode(signature_record)
            .map_err(|_| FeaturePackError::new("signature_invalid"))?;
        self.public_key
            .verify(manifest_bytes, &signature, false)
            .map_err(|_| FeaturePackError::new("signature_invalid"))?;
        Ok(VerifiedManifestSignature {
            key_id: self.key_id.clone(),
        })
    }
}

fn decode_canonical_base64(value: &str, maximum_decoded_bytes: usize) -> Result<Vec<u8>> {
    if value.is_empty()
        || value.trim() != value
        || value.len() > maximum_decoded_bytes.saturating_mul(2)
    {
        return fail("production_trust_not_configured");
    }
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|_| FeaturePackError::new("production_trust_not_configured"))?;
    if decoded.is_empty()
        || decoded.len() > maximum_decoded_bytes
        || base64::engine::general_purpose::STANDARD.encode(&decoded) != value
    {
        return fail("production_trust_not_configured");
    }
    Ok(decoded)
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FeaturePackManifest {
    schema_version: u8,
    id: String,
    artifact_version: String,
    playwright_version: String,
    target_platform: String,
    browser: FeaturePackBrowser,
    files: Vec<FeaturePackFile>,
    total_bytes: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FeaturePackBrowser {
    name: String,
    revision: String,
    executable_path: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FeaturePackFile {
    path: String,
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InstallationRecord {
    installation_id: String,
    key_id: String,
    manifest_sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LifecycleState {
    schema_version: u8,
    active: Option<InstallationRecord>,
    rollback: Option<InstallationRecord>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InstallationReceipt {
    schema_version: u8,
    installation_id: String,
    manifest_sha256: String,
    key_id: String,
}

struct PreparedArtifact {
    payload: Dir,
    manifest: FeaturePackManifest,
    manifest_bytes: Vec<u8>,
    signature_bytes: Vec<u8>,
    manifest_sha256: String,
    key_id: String,
}

struct InstalledInspection {
    installation_id: String,
    manifest_sha256: String,
    playwright_version: String,
    browser_revision: String,
    measured_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileIdentity {
    dev: u64,
    ino: u64,
    links: u64,
    len: u64,
    modified_ns: Option<u128>,
}

fn metadata_identity(metadata: &cap_std::fs::Metadata) -> FileIdentity {
    FileIdentity {
        dev: metadata.dev(),
        ino: metadata.ino(),
        links: metadata.nlink(),
        len: metadata.len(),
        modified_ns: metadata.modified().ok().and_then(|time| {
            time.into_std()
                .duration_since(UNIX_EPOCH)
                .ok()
                .map(|duration| duration.as_nanos())
        }),
    }
}

fn is_lower_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn is_upper_key_id(value: &str) -> bool {
    value.len() == 16
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'A'..=b'F').contains(&byte))
}

fn safe_identifier(value: &str, minimum: usize, maximum: usize) -> bool {
    value.len() >= minimum
        && value.len() <= maximum
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        && !value.starts_with('.')
        && value != "."
        && value != ".."
}

fn safe_semver(value: &str) -> bool {
    if !safe_identifier(value, 5, 80) {
        return false;
    }
    let core = value.split_once('-').map_or(value, |(core, _)| core);
    let pieces = core.split('.').collect::<Vec<_>>();
    pieces.len() == 3
        && pieces.iter().all(|piece| {
            !piece.is_empty()
                && piece.bytes().all(|byte| byte.is_ascii_digit())
                && (piece == &"0" || !piece.starts_with('0'))
        })
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn absolute_anchor_and_components(path: &Path) -> Result<(PathBuf, Vec<OsString>)> {
    if !path.is_absolute() {
        return fail("local_path_not_absolute");
    }
    let mut anchor = PathBuf::new();
    let mut relative = Vec::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => {
                #[cfg(windows)]
                if !matches!(prefix.kind(), std::path::Prefix::Disk(_)) {
                    return fail("local_path_unsupported");
                }
                anchor.push(component.as_os_str());
            }
            Component::RootDir => anchor.push(component.as_os_str()),
            Component::Normal(value) => relative.push(value.to_os_string()),
            Component::CurDir | Component::ParentDir => return fail("local_path_unsafe"),
        }
    }
    if anchor.as_os_str().is_empty() {
        return fail("local_path_not_absolute");
    }
    Ok((anchor, relative))
}

fn entry_is_link(dir: &Dir, path: &Path) -> bool {
    dir.symlink_metadata(path)
        .map(|metadata| metadata.is_symlink())
        .unwrap_or(false)
}

fn open_absolute_dir(path: &Path, code: &'static str) -> Result<Dir> {
    let (anchor, components) = absolute_anchor_and_components(path).map_err(|_| {
        FeaturePackError::new(if code == "app_data_unsafe" {
            "app_data_unsafe"
        } else {
            "artifact_root_invalid"
        })
    })?;
    let mut dir = Dir::open_ambient_dir(anchor, cap_fs_ext::ambient_authority())
        .map_err(|_| FeaturePackError::new(code))?;
    for component in components {
        let component_path = Path::new(&component);
        let metadata = dir
            .symlink_metadata(component_path)
            .map_err(|_| FeaturePackError::new(code))?;
        if metadata.is_symlink() || !metadata.is_dir() {
            return fail(code);
        }
        dir = dir
            .open_dir_nofollow(component_path)
            .map_err(|_| FeaturePackError::new(code))?;
    }
    Ok(dir)
}

fn open_child_dir(parent: &Dir, name: &Path, code: &'static str) -> Result<Option<Dir>> {
    match parent.symlink_metadata(name) {
        Ok(metadata) if metadata.is_symlink() || !metadata.is_dir() => fail(code),
        Ok(_) => parent
            .open_dir_nofollow(name)
            .map(Some)
            .map_err(|_| FeaturePackError::new(code)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => fail(code),
    }
}

fn ensure_child_dir(parent: &Dir, name: &Path, code: &'static str) -> Result<Dir> {
    if name.components().count() != 1
        || !matches!(name.components().next(), Some(Component::Normal(_)))
    {
        return fail(code);
    }
    if let Some(dir) = open_child_dir(parent, name, code)? {
        return Ok(dir);
    }
    parent
        .create_dir(name)
        .map_err(|_| FeaturePackError::new(code))?;
    parent
        .open_dir_nofollow(name)
        .map_err(|_| FeaturePackError::new(code))
}

fn open_relative_dir(root: &Dir, relative: &Path, code: &'static str) -> Result<Dir> {
    let mut dir = Dir::reopen_dir(root).map_err(|_| FeaturePackError::new(code))?;
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return fail(code);
        };
        let name = Path::new(name);
        if entry_is_link(&dir, name) {
            return fail(code);
        }
        dir = dir
            .open_dir_nofollow(name)
            .map_err(|_| FeaturePackError::new(code))?;
    }
    Ok(dir)
}

fn ensure_relative_dir(root: &Dir, relative: &Path, code: &'static str) -> Result<Dir> {
    let mut dir = Dir::reopen_dir(root).map_err(|_| FeaturePackError::new(code))?;
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return fail(code);
        };
        dir = ensure_child_dir(&dir, Path::new(name), code)?;
    }
    Ok(dir)
}

struct OpenRegularFile {
    file: cap_std::fs::File,
    parent: Dir,
    name: OsString,
    identity: FileIdentity,
}

fn open_regular_file(
    root: &Dir,
    relative: &Path,
    maximum_bytes: u64,
    code: &'static str,
) -> Result<OpenRegularFile> {
    let name = relative
        .file_name()
        .ok_or_else(|| FeaturePackError::new(code))?
        .to_os_string();
    let parent = open_relative_dir(
        root,
        relative.parent().unwrap_or_else(|| Path::new("")),
        code,
    )?;
    let name_path = Path::new(&name);
    let path_metadata = parent
        .symlink_metadata(name_path)
        .map_err(|_| FeaturePackError::new(code))?;
    if path_metadata.is_symlink()
        || !path_metadata.is_file()
        || path_metadata.nlink() != 1
        || path_metadata.len() > maximum_bytes
    {
        return fail(code);
    }
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    let file = parent
        .open_with(name_path, &options)
        .map_err(|_| FeaturePackError::new(code))?;
    let opened = file.metadata().map_err(|_| FeaturePackError::new(code))?;
    let identity = metadata_identity(&opened);
    if identity != metadata_identity(&path_metadata) || !opened.is_file() || identity.links != 1 {
        return fail(code);
    }
    Ok(OpenRegularFile {
        file,
        parent,
        name,
        identity,
    })
}

fn revalidate_open_file(binding: &OpenRegularFile, code: &'static str) -> Result<()> {
    let opened = binding
        .file
        .metadata()
        .map_err(|_| FeaturePackError::new(code))?;
    let path_metadata = binding
        .parent
        .symlink_metadata(Path::new(&binding.name))
        .map_err(|_| FeaturePackError::new(code))?;
    if binding.identity != metadata_identity(&opened)
        || binding.identity != metadata_identity(&path_metadata)
    {
        return fail(code);
    }
    Ok(())
}

fn read_regular_file(
    root: &Dir,
    relative: &Path,
    maximum_bytes: u64,
    code: &'static str,
) -> Result<Vec<u8>> {
    let mut binding = open_regular_file(root, relative, maximum_bytes, code)?;
    let mut bytes = Vec::with_capacity(binding.identity.len as usize);
    binding
        .file
        .read_to_end(&mut bytes)
        .map_err(|_| FeaturePackError::new(code))?;
    if bytes.len() as u64 != binding.identity.len {
        return fail(code);
    }
    revalidate_open_file(&binding, code)?;
    Ok(bytes)
}

fn write_new_file(root: &Dir, relative: &Path, bytes: &[u8], code: &'static str) -> Result<()> {
    let parent = ensure_relative_dir(
        root,
        relative.parent().unwrap_or_else(|| Path::new("")),
        code,
    )?;
    let name = relative
        .file_name()
        .ok_or_else(|| FeaturePackError::new(code))?;
    let mut options = OpenOptions::new();
    options
        .write(true)
        .create_new(true)
        .follow(FollowSymlinks::No);
    let mut file = parent
        .open_with(name, &options)
        .map_err(|_| FeaturePackError::new(code))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| FeaturePackError::new(code))
}

fn collect_regular_tree(
    root: &Dir,
    prefix: &Path,
    output: &mut BTreeSet<String>,
    code: &'static str,
) -> Result<()> {
    let directory = open_relative_dir(root, prefix, code)?;
    let entries = directory
        .entries()
        .map_err(|_| FeaturePackError::new(code))?;
    for entry in entries {
        let entry = entry.map_err(|_| FeaturePackError::new(code))?;
        let name = entry.file_name();
        if name == "." || name == ".." {
            return fail(code);
        }
        let child = prefix.join(&name);
        let metadata = directory
            .symlink_metadata(Path::new(&name))
            .map_err(|_| FeaturePackError::new(code))?;
        if metadata.is_symlink() {
            return fail(code);
        }
        if metadata.is_dir() {
            directory
                .open_dir_nofollow(Path::new(&name))
                .map_err(|_| FeaturePackError::new(code))?;
            collect_regular_tree(root, &child, output, code)?;
        } else if metadata.is_file() {
            if metadata.nlink() != 1 {
                return fail(code);
            }
            let normalized = child.to_string_lossy().replace('\\', "/");
            output.insert(normalized);
            if output.len() > MAX_FILES + 3 {
                return fail(code);
            }
        } else {
            return fail(code);
        }
    }
    Ok(())
}

fn validate_payload_path(value: &str) -> Result<PathBuf> {
    if value.is_empty()
        || value.len() > 420
        || value.contains('\\')
        || value.contains("//")
        || value.starts_with('/')
        || value.ends_with('/')
    {
        return fail("manifest_invalid_path");
    }
    let path = PathBuf::from(value);
    let mut components = path.components();
    let Some(Component::Normal(first)) = components.next() else {
        return fail("manifest_invalid_path");
    };
    if first != "playwright-core" && first != "browser" && first != "licenses" {
        return fail("manifest_invalid_path");
    }
    if components
        .any(|component| !matches!(component, Component::Normal(value) if !value.is_empty()))
    {
        return fail("manifest_invalid_path");
    }
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'/'))
    {
        return fail("manifest_invalid_path");
    }
    Ok(path)
}

pub(crate) fn validate_trust_policy<V: ManifestSignatureVerifier>(
    trust: &FeaturePackTrustPolicy,
    verifier: &V,
) -> Result<()> {
    if trust.allowed_manifest_sha256.is_empty()
        || trust.allowed_browser_revisions.is_empty()
        || !is_lower_sha256(&trust.public_key_sha256)
        || !is_upper_key_id(&trust.expected_key_id)
        || trust.maximum_total_bytes == 0
        || trust.maximum_total_bytes > MAX_TOTAL_BYTES
    {
        return fail("production_trust_not_configured");
    }
    if trust
        .allowed_manifest_sha256
        .iter()
        .any(|value| !is_lower_sha256(value))
        || trust
            .allowed_browser_revisions
            .iter()
            .any(|value| !safe_identifier(value, 1, 64))
        || !matches!(
            trust.target_platform.as_str(),
            "win32-x64"
                | "win32-arm64"
                | "darwin-x64"
                | "darwin-arm64"
                | "linux-x64"
                | "linux-arm64"
        )
    {
        return fail("production_trust_not_configured");
    }
    if verifier.public_key_sha256() != trust.public_key_sha256 {
        return fail("trusted_public_key_mismatch");
    }
    Ok(())
}

fn validate_manifest<'a>(
    manifest: &'a FeaturePackManifest,
    trust: &FeaturePackTrustPolicy,
) -> Result<Vec<(PathBuf, &'a FeaturePackFile)>> {
    if manifest.schema_version != 1
        || manifest.id != "vibespace-playwright-acceptance-runtime"
        || !safe_semver(&manifest.artifact_version)
        || manifest.playwright_version != PLAYWRIGHT_VERSION
    {
        return fail("manifest_invalid");
    }
    if manifest.target_platform != trust.target_platform
        || manifest.target_platform != current_target_platform()
    {
        return fail("unsupported_platform");
    }
    if manifest.browser.name != "chromium" || !safe_identifier(&manifest.browser.revision, 1, 64) {
        return fail("manifest_invalid");
    }
    if !trust
        .allowed_browser_revisions
        .iter()
        .any(|revision| revision == &manifest.browser.revision)
    {
        return fail("untrusted_browser_revision");
    }
    if manifest.files.is_empty() || manifest.files.len() > MAX_FILES {
        return fail("manifest_invalid");
    }
    let executable_path = validate_payload_path(&manifest.browser.executable_path)?;
    if !manifest.browser.executable_path.starts_with("browser/") {
        return fail("manifest_invalid_path");
    }
    let mut seen = HashSet::new();
    let mut total = 0_u64;
    let mut validated = Vec::with_capacity(manifest.files.len());
    let mut has_package = false;
    let mut has_executable = false;
    for file in &manifest.files {
        if file.bytes > MAX_FILE_BYTES || !is_lower_sha256(&file.sha256) {
            return fail("manifest_invalid");
        }
        let path = validate_payload_path(&file.path)?;
        if !seen.insert(file.path.clone()) {
            return fail("manifest_invalid");
        }
        total = total
            .checked_add(file.bytes)
            .ok_or_else(|| FeaturePackError::new("manifest_invalid"))?;
        if total > trust.maximum_total_bytes || total > MAX_TOTAL_BYTES {
            return fail("manifest_invalid");
        }
        if file.path == "playwright-core/package.json" {
            has_package = file.bytes > 0;
        }
        if path == executable_path {
            has_executable = file.bytes > 0;
        }
        validated.push((path, file));
    }
    if total != manifest.total_bytes || !has_package || !has_executable {
        return fail("manifest_invalid");
    }
    Ok(validated)
}

fn verify_playwright_package_version(payload: &Dir) -> Result<()> {
    let bytes = read_regular_file(
        payload,
        Path::new("playwright-core/package.json"),
        MAX_FILE_BYTES,
        "artifact_changed_during_verification",
    )?;
    let package: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| FeaturePackError::new("manifest_invalid"))?;
    if package.get("version").and_then(|value| value.as_str()) != Some(PLAYWRIGHT_VERSION) {
        return fail("playwright_version_mismatch");
    }
    Ok(())
}

fn inspect_payload(
    payload: &Dir,
    manifest: &FeaturePackManifest,
    copy_root: Option<&Dir>,
    unsafe_code: &'static str,
) -> Result<u64> {
    let validated = validate_manifest_payload_only(manifest)?;
    let mut observed = BTreeSet::new();
    collect_regular_tree(payload, Path::new(""), &mut observed, unsafe_code)?;
    let expected = validated
        .iter()
        .map(|(_, file)| file.path.clone())
        .collect::<BTreeSet<_>>();
    if observed != expected {
        return fail(if unsafe_code == "artifact_unsafe_link" {
            "artifact_inventory_invalid"
        } else {
            unsafe_code
        });
    }
    for (path, file) in validated {
        hash_or_copy_file(payload, &path, file, copy_root, unsafe_code)?;
    }
    verify_playwright_package_version(payload)?;
    Ok(manifest.total_bytes)
}

fn validate_manifest_payload_only(
    manifest: &FeaturePackManifest,
) -> Result<Vec<(PathBuf, &FeaturePackFile)>> {
    let mut validated = Vec::with_capacity(manifest.files.len());
    for file in &manifest.files {
        validated.push((validate_payload_path(&file.path)?, file));
    }
    Ok(validated)
}

fn hash_or_copy_file(
    source_root: &Dir,
    relative: &Path,
    expected: &FeaturePackFile,
    copy_root: Option<&Dir>,
    unsafe_code: &'static str,
) -> Result<()> {
    let mut binding = open_regular_file(source_root, relative, MAX_FILE_BYTES, unsafe_code)?;
    if binding.identity.len != expected.bytes {
        return fail(unsafe_code);
    }
    let mut destination = if let Some(root) = copy_root {
        let parent = ensure_relative_dir(
            root,
            relative.parent().unwrap_or_else(|| Path::new("")),
            "installation_staging_failed",
        )?;
        let name = relative
            .file_name()
            .ok_or_else(|| FeaturePackError::new("installation_staging_failed"))?;
        let mut options = OpenOptions::new();
        options
            .write(true)
            .create_new(true)
            .follow(FollowSymlinks::No);
        Some(
            parent
                .open_with(name, &options)
                .map_err(|_| FeaturePackError::new("installation_staging_failed"))?,
        )
    } else {
        None
    };
    let mut digest = Sha256::new();
    let mut bytes = 0_u64;
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    loop {
        let count = binding
            .file
            .read(&mut buffer)
            .map_err(|_| FeaturePackError::new(unsafe_code))?;
        if count == 0 {
            break;
        }
        bytes = bytes
            .checked_add(count as u64)
            .ok_or_else(|| FeaturePackError::new(unsafe_code))?;
        if bytes > expected.bytes || bytes > MAX_FILE_BYTES {
            return fail(unsafe_code);
        }
        digest.update(&buffer[..count]);
        if let Some(file) = destination.as_mut() {
            file.write_all(&buffer[..count])
                .map_err(|_| FeaturePackError::new("installation_staging_failed"))?;
        }
    }
    if let Some(file) = destination.as_mut() {
        file.sync_all()
            .map_err(|_| FeaturePackError::new("installation_staging_failed"))?;
    }
    revalidate_open_file(&binding, unsafe_code)?;
    if bytes != expected.bytes || format!("{:x}", digest.finalize()) != expected.sha256 {
        return fail(unsafe_code);
    }
    Ok(())
}

fn empty_state() -> LifecycleState {
    LifecycleState {
        schema_version: 1,
        active: None,
        rollback: None,
    }
}

fn validate_installation_record(record: &InstallationRecord) -> Result<()> {
    if !safe_identifier(&record.installation_id, 8, 160)
        || !is_upper_key_id(&record.key_id)
        || !is_lower_sha256(&record.manifest_sha256)
    {
        return fail("state_invalid");
    }
    Ok(())
}

fn state_journal_present(root: &Dir) -> Result<bool> {
    for entry in root
        .entries()
        .map_err(|_| FeaturePackError::new("state_invalid"))?
    {
        let name = entry
            .map_err(|_| FeaturePackError::new("state_invalid"))?
            .file_name();
        if name.to_string_lossy().starts_with(STATE_JOURNAL_PREFIX) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn read_state(root: &Dir) -> Result<LifecycleState> {
    if state_journal_present(root)? {
        return fail("activation_interrupted");
    }
    match root.symlink_metadata(STATE_NAME) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(empty_state()),
        Err(_) => return fail("state_invalid"),
        Ok(metadata) if metadata.is_symlink() || !metadata.is_file() => {
            return fail("state_invalid")
        }
        Ok(_) => {}
    }
    let bytes = read_regular_file(
        root,
        Path::new(STATE_NAME),
        MAX_STATE_BYTES,
        "state_invalid",
    )?;
    let state: LifecycleState =
        serde_json::from_slice(&bytes).map_err(|_| FeaturePackError::new("state_invalid"))?;
    if state.schema_version != 1 {
        return fail("state_invalid");
    }
    if let Some(active) = &state.active {
        validate_installation_record(active)?;
    }
    if let Some(rollback) = &state.rollback {
        validate_installation_record(rollback)?;
    }
    if state
        .active
        .as_ref()
        .zip(state.rollback.as_ref())
        .is_some_and(|(active, rollback)| active.installation_id == rollback.installation_id)
    {
        return fail("state_invalid");
    }
    Ok(state)
}

fn unique_token() -> String {
    let counter = NEXT_INSTALLATION.fetch_add(1, Ordering::Relaxed);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}-{now:x}-{counter:x}", std::process::id())
}

fn write_state(root: &Dir, state: &LifecycleState) -> Result<()> {
    let bytes =
        serde_json::to_vec_pretty(state).map_err(|_| FeaturePackError::new("activation_failed"))?;
    if bytes.len() as u64 > MAX_STATE_BYTES {
        return fail("activation_failed");
    }
    let token = unique_token();
    let next_name = format!("{STATE_JOURNAL_PREFIX}next-{token}");
    let backup_name = format!("{STATE_JOURNAL_PREFIX}backup-{token}");
    write_new_file(root, Path::new(&next_name), &bytes, "activation_failed")?;
    let has_current = match root.symlink_metadata(STATE_NAME) {
        Ok(metadata) if metadata.is_symlink() || !metadata.is_file() => {
            let _ = root.remove_file(&next_name);
            return fail("activation_failed");
        }
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => {
            let _ = root.remove_file(&next_name);
            return fail("activation_failed");
        }
    };
    if has_current
        && root
            .rename(STATE_NAME, root, &backup_name)
            .map_err(|_| FeaturePackError::new("activation_failed"))
            .is_err()
    {
        let _ = root.remove_file(&next_name);
        return fail("activation_failed");
    }
    if root.rename(&next_name, root, STATE_NAME).is_err() {
        if has_current {
            let _ = root.rename(&backup_name, root, STATE_NAME);
        }
        let _ = root.remove_file(&next_name);
        return fail("activation_failed");
    }
    if has_current {
        root.remove_file(&backup_name)
            .map_err(|_| FeaturePackError::new("activation_failed"))?;
    }
    Ok(())
}

fn prepare_artifact<V: ManifestSignatureVerifier>(
    artifact_root: &Path,
    trust: &FeaturePackTrustPolicy,
    verifier: &V,
) -> Result<PreparedArtifact> {
    validate_trust_policy(trust, verifier)?;
    let root = open_absolute_dir(artifact_root, "artifact_root_invalid")?;
    let manifest_bytes = read_regular_file(
        &root,
        Path::new(MANIFEST_NAME),
        MAX_MANIFEST_BYTES,
        "signature_invalid",
    )?;
    let signature_bytes = read_regular_file(
        &root,
        Path::new(SIGNATURE_NAME),
        MAX_SIGNATURE_BYTES,
        "signature_invalid",
    )?;
    let manifest_sha256 = sha256(&manifest_bytes);
    if !trust
        .allowed_manifest_sha256
        .iter()
        .any(|expected| expected == &manifest_sha256)
    {
        return fail("untrusted_manifest");
    }
    let signature = verifier.verify_hashed_manifest(&manifest_bytes, &signature_bytes)?;
    if signature.key_id != trust.expected_key_id {
        return fail("signature_key_mismatch");
    }
    let manifest: FeaturePackManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| FeaturePackError::new("manifest_invalid"))?;
    validate_manifest(&manifest, trust)?;
    let payload = open_child_dir(&root, Path::new("payload"), "artifact_unsafe_link")?
        .ok_or_else(|| FeaturePackError::new("artifact_unsafe_link"))?;
    inspect_payload(&payload, &manifest, None, "artifact_unsafe_link")?;
    Ok(PreparedArtifact {
        payload,
        manifest,
        manifest_bytes,
        signature_bytes,
        manifest_sha256,
        key_id: signature.key_id,
    })
}

fn open_feature_root(app_data_dir: &Path, create: bool) -> Result<Option<Dir>> {
    let app_data = open_absolute_dir(app_data_dir, "app_data_unsafe")?;
    if create {
        return ensure_child_dir(
            &app_data,
            Path::new(FEATURE_ROOT_NAME),
            "install_root_unsafe",
        )
        .map(Some);
    }
    open_child_dir(
        &app_data,
        Path::new(FEATURE_ROOT_NAME),
        "install_root_unsafe",
    )
}

fn open_versions_root(feature_root: &Dir, create: bool) -> Result<Option<Dir>> {
    if create {
        return ensure_child_dir(
            feature_root,
            Path::new(VERSIONS_NAME),
            "install_root_unsafe",
        )
        .map(Some);
    }
    open_child_dir(
        feature_root,
        Path::new(VERSIONS_NAME),
        "install_root_unsafe",
    )
}

fn manifest_from_installed<V: ManifestSignatureVerifier>(
    version_root: &Dir,
    record: &InstallationRecord,
    trust: &FeaturePackTrustPolicy,
    verifier: &V,
) -> Result<FeaturePackManifest> {
    validate_installation_record(record)?;
    let receipt_bytes = read_regular_file(
        version_root,
        Path::new(RECEIPT_NAME),
        MAX_STATE_BYTES,
        "installed_runtime_corrupt",
    )?;
    let receipt: InstallationReceipt = serde_json::from_slice(&receipt_bytes)
        .map_err(|_| FeaturePackError::new("installed_runtime_corrupt"))?;
    if receipt.schema_version != 1
        || receipt.installation_id != record.installation_id
        || receipt.manifest_sha256 != record.manifest_sha256
        || receipt.key_id != record.key_id
    {
        return fail("installed_runtime_corrupt");
    }
    let manifest_bytes = read_regular_file(
        version_root,
        Path::new(INSTALLED_MANIFEST_NAME),
        MAX_MANIFEST_BYTES,
        "installed_runtime_corrupt",
    )?;
    let signature_bytes = read_regular_file(
        version_root,
        Path::new(INSTALLED_SIGNATURE_NAME),
        MAX_SIGNATURE_BYTES,
        "installed_runtime_corrupt",
    )?;
    let manifest_sha256 = sha256(&manifest_bytes);
    if manifest_sha256 != record.manifest_sha256
        || !trust
            .allowed_manifest_sha256
            .iter()
            .any(|expected| expected == &manifest_sha256)
    {
        return fail("installed_runtime_corrupt");
    }
    let verified = verifier
        .verify_hashed_manifest(&manifest_bytes, &signature_bytes)
        .map_err(|_| FeaturePackError::new("installed_runtime_corrupt"))?;
    if verified.key_id != record.key_id || verified.key_id != trust.expected_key_id {
        return fail("installed_runtime_corrupt");
    }
    let manifest: FeaturePackManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| FeaturePackError::new("installed_runtime_corrupt"))?;
    validate_manifest(&manifest, trust).map_err(|error| {
        FeaturePackError::new(if error.code == "unsupported_platform" {
            "unsupported_platform"
        } else {
            "installed_runtime_corrupt"
        })
    })?;
    Ok(manifest)
}

fn expected_installed_inventory(manifest: &FeaturePackManifest) -> BTreeSet<String> {
    let mut expected = manifest
        .files
        .iter()
        .map(|file| file.path.clone())
        .collect::<BTreeSet<_>>();
    expected.insert(INSTALLED_MANIFEST_NAME.to_string());
    expected.insert(INSTALLED_SIGNATURE_NAME.to_string());
    expected.insert(RECEIPT_NAME.to_string());
    expected
}

fn inspect_installed<V: ManifestSignatureVerifier>(
    feature_root: &Dir,
    record: &InstallationRecord,
    trust: &FeaturePackTrustPolicy,
    verifier: &V,
    verify_payload_hashes: bool,
) -> Result<InstalledInspection> {
    let versions = open_versions_root(feature_root, false)?
        .ok_or_else(|| FeaturePackError::new("installed_runtime_corrupt"))?;
    let version_root = open_child_dir(
        &versions,
        Path::new(&record.installation_id),
        "installed_runtime_corrupt",
    )?
    .ok_or_else(|| FeaturePackError::new("installed_runtime_corrupt"))?;
    let manifest = manifest_from_installed(&version_root, record, trust, verifier)?;
    let mut observed = BTreeSet::new();
    collect_regular_tree(
        &version_root,
        Path::new(""),
        &mut observed,
        "installed_runtime_corrupt",
    )?;
    if observed != expected_installed_inventory(&manifest) {
        return fail("installed_runtime_corrupt");
    }
    if verify_payload_hashes {
        for (path, file) in validate_manifest_payload_only(&manifest)? {
            hash_or_copy_file(
                &version_root,
                &path,
                file,
                None,
                "installed_runtime_corrupt",
            )?;
        }
        verify_playwright_package_version(&version_root)
            .map_err(|_| FeaturePackError::new("installed_runtime_corrupt"))?;
    }
    Ok(InstalledInspection {
        installation_id: record.installation_id.clone(),
        manifest_sha256: record.manifest_sha256.clone(),
        playwright_version: manifest.playwright_version,
        browser_revision: manifest.browser.revision,
        measured_bytes: manifest.total_bytes,
    })
}

fn installation_record(prepared: &PreparedArtifact) -> InstallationRecord {
    let version = prepared
        .manifest
        .artifact_version
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-') {
                byte as char
            } else {
                '-'
            }
        })
        .collect::<String>();
    InstallationRecord {
        installation_id: format!(
            "{version}-{}-{}-{}",
            prepared.manifest.target_platform,
            &prepared.manifest_sha256[..12],
            unique_token()
        ),
        key_id: prepared.key_id.clone(),
        manifest_sha256: prepared.manifest_sha256.clone(),
    }
}

fn remove_version(feature_root: &Dir, record: &InstallationRecord) -> Result<bool> {
    validate_installation_record(record)?;
    let Some(versions) = open_versions_root(feature_root, false)? else {
        return Ok(false);
    };
    let Some(version_root) = open_child_dir(
        &versions,
        Path::new(&record.installation_id),
        "installed_runtime_corrupt",
    )?
    else {
        return Ok(false);
    };
    let mut observed = BTreeSet::new();
    collect_regular_tree(
        &version_root,
        Path::new(""),
        &mut observed,
        "installed_runtime_corrupt",
    )?;
    version_root
        .remove_open_dir_all()
        .map_err(|_| FeaturePackError::new("uninstall_cleanup_failed"))?;
    Ok(true)
}

fn cleanup_named_directory(parent: &Dir, name: &str) {
    if let Ok(Some(directory)) = open_child_dir(parent, Path::new(name), "install_root_unsafe") {
        let _ = directory.remove_open_dir_all();
    }
}

fn materialize_installation(
    feature_root: &Dir,
    prepared: &PreparedArtifact,
) -> Result<InstallationRecord> {
    let versions = open_versions_root(feature_root, true)?
        .ok_or_else(|| FeaturePackError::new("installation_staging_failed"))?;
    let record = installation_record(prepared);
    validate_installation_record(&record)?;
    let staging_name = format!(".staging-{}", unique_token());
    let staging = ensure_child_dir(
        &versions,
        Path::new(&staging_name),
        "installation_staging_failed",
    )?;
    let result = (|| {
        inspect_payload(
            &prepared.payload,
            &prepared.manifest,
            Some(&staging),
            "artifact_changed_during_copy",
        )?;
        write_new_file(
            &staging,
            Path::new(INSTALLED_MANIFEST_NAME),
            &prepared.manifest_bytes,
            "installation_staging_failed",
        )?;
        write_new_file(
            &staging,
            Path::new(INSTALLED_SIGNATURE_NAME),
            &prepared.signature_bytes,
            "installation_staging_failed",
        )?;
        let receipt = InstallationReceipt {
            schema_version: 1,
            installation_id: record.installation_id.clone(),
            manifest_sha256: record.manifest_sha256.clone(),
            key_id: record.key_id.clone(),
        };
        let receipt_bytes = serde_json::to_vec_pretty(&receipt)
            .map_err(|_| FeaturePackError::new("installation_staging_failed"))?;
        write_new_file(
            &staging,
            Path::new(RECEIPT_NAME),
            &receipt_bytes,
            "installation_staging_failed",
        )?;
        drop(staging);
        versions
            .rename(
                Path::new(&staging_name),
                &versions,
                Path::new(&record.installation_id),
            )
            .map_err(|_| FeaturePackError::new("installation_staging_failed"))?;
        Ok(record.clone())
    })();
    if result.is_err() {
        cleanup_named_directory(&versions, &staging_name);
    }
    result
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum FeaturePackDiagnosisStatus {
    Absent,
    Healthy,
    Corrupt,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FeaturePackDiagnosis {
    pub(crate) status: FeaturePackDiagnosisStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reason: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) installation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) manifest_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) playwright_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) browser_revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) measured_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FeaturePackMutationReceipt {
    pub(crate) action: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) installation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) manifest_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) measured_bytes: Option<u64>,
    pub(crate) cleanup_pending: bool,
    pub(crate) removed_installations: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FeaturePackMeasurement {
    pub(crate) installation_id: String,
    pub(crate) measured_bytes: u64,
    pub(crate) manifest_sha256: String,
}

pub(crate) struct PlaywrightFeaturePackLifecycle<'a, V: ManifestSignatureVerifier> {
    app_data_dir: PathBuf,
    trust: FeaturePackTrustPolicy,
    verifier: &'a V,
}

impl<'a, V: ManifestSignatureVerifier> PlaywrightFeaturePackLifecycle<'a, V> {
    pub(crate) fn new(
        app_data_dir: PathBuf,
        trust: FeaturePackTrustPolicy,
        verifier: &'a V,
    ) -> Self {
        Self {
            app_data_dir,
            trust,
            verifier,
        }
    }

    pub(crate) fn diagnose(&self) -> Result<FeaturePackDiagnosis> {
        let _guard = LIFECYCLE_LOCK
            .lock()
            .map_err(|_| FeaturePackError::new("lifecycle_lock_failed"))?;
        Ok(self.diagnose_locked())
    }

    pub(crate) fn install(&self, artifact_root: &Path) -> Result<FeaturePackMutationReceipt> {
        let _guard = LIFECYCLE_LOCK
            .lock()
            .map_err(|_| FeaturePackError::new("lifecycle_lock_failed"))?;
        let prepared = prepare_artifact(artifact_root, &self.trust, self.verifier)?;
        let feature_root = open_feature_root(&self.app_data_dir, true)?
            .ok_or_else(|| FeaturePackError::new("install_root_unsafe"))?;
        open_versions_root(&feature_root, true)?;
        let state = read_state(&feature_root)?;
        if let Some(active) = &state.active {
            inspect_installed(&feature_root, active, &self.trust, self.verifier, true)
                .map_err(|_| FeaturePackError::new("existing_runtime_requires_repair"))?;
            if active.manifest_sha256 == prepared.manifest_sha256 {
                return Ok(FeaturePackMutationReceipt {
                    action: "already-installed",
                    installation_id: Some(active.installation_id.clone()),
                    manifest_sha256: Some(active.manifest_sha256.clone()),
                    measured_bytes: Some(prepared.manifest.total_bytes),
                    cleanup_pending: false,
                    removed_installations: 0,
                });
            }
        }
        let record = materialize_installation(&feature_root, &prepared)?;
        let next_state = LifecycleState {
            schema_version: 1,
            active: Some(record.clone()),
            rollback: state.active.clone(),
        };
        if write_state(&feature_root, &next_state).is_err() {
            let _ = remove_version(&feature_root, &record);
            return fail("activation_failed");
        }
        let cleanup_pending = state
            .rollback
            .as_ref()
            .is_some_and(|old| remove_version(&feature_root, old).is_err());
        Ok(FeaturePackMutationReceipt {
            action: if state.active.is_some() {
                "updated"
            } else {
                "installed"
            },
            installation_id: Some(record.installation_id),
            manifest_sha256: Some(record.manifest_sha256),
            measured_bytes: Some(prepared.manifest.total_bytes),
            cleanup_pending,
            removed_installations: 0,
        })
    }

    pub(crate) fn repair(&self, artifact_root: &Path) -> Result<FeaturePackMutationReceipt> {
        let _guard = LIFECYCLE_LOCK
            .lock()
            .map_err(|_| FeaturePackError::new("lifecycle_lock_failed"))?;
        let prepared = prepare_artifact(artifact_root, &self.trust, self.verifier)?;
        let feature_root = open_feature_root(&self.app_data_dir, false)?
            .ok_or_else(|| FeaturePackError::new("repair_requires_installed_runtime"))?;
        let state = read_state(&feature_root)?;
        let active = state
            .active
            .as_ref()
            .ok_or_else(|| FeaturePackError::new("repair_requires_installed_runtime"))?;
        if active.manifest_sha256 != prepared.manifest_sha256 {
            return fail("repair_unsupported_manifest_change");
        }
        if inspect_installed(&feature_root, active, &self.trust, self.verifier, true).is_ok() {
            return Ok(FeaturePackMutationReceipt {
                action: "already-healthy",
                installation_id: Some(active.installation_id.clone()),
                manifest_sha256: Some(active.manifest_sha256.clone()),
                measured_bytes: Some(prepared.manifest.total_bytes),
                cleanup_pending: false,
                removed_installations: 0,
            });
        }
        let record = materialize_installation(&feature_root, &prepared)?;
        let next_state = LifecycleState {
            schema_version: 1,
            active: Some(record.clone()),
            rollback: state.rollback.clone(),
        };
        if write_state(&feature_root, &next_state).is_err() {
            let _ = remove_version(&feature_root, &record);
            return fail("activation_failed");
        }
        let cleanup_pending = remove_version(&feature_root, active).is_err();
        Ok(FeaturePackMutationReceipt {
            action: "repaired",
            installation_id: Some(record.installation_id),
            manifest_sha256: Some(record.manifest_sha256),
            measured_bytes: Some(prepared.manifest.total_bytes),
            cleanup_pending,
            removed_installations: 0,
        })
    }

    pub(crate) fn rollback(&self) -> Result<FeaturePackMutationReceipt> {
        let _guard = LIFECYCLE_LOCK
            .lock()
            .map_err(|_| FeaturePackError::new("lifecycle_lock_failed"))?;
        validate_trust_policy(&self.trust, self.verifier)?;
        let feature_root = open_feature_root(&self.app_data_dir, false)?
            .ok_or_else(|| FeaturePackError::new("rollback_unavailable"))?;
        let state = read_state(&feature_root)?;
        let active = state
            .active
            .as_ref()
            .ok_or_else(|| FeaturePackError::new("rollback_unavailable"))?;
        let rollback = state
            .rollback
            .as_ref()
            .ok_or_else(|| FeaturePackError::new("rollback_unavailable"))?;
        let inspection =
            inspect_installed(&feature_root, rollback, &self.trust, self.verifier, true)
                .map_err(|_| FeaturePackError::new("rollback_target_invalid"))?;
        write_state(
            &feature_root,
            &LifecycleState {
                schema_version: 1,
                active: Some(rollback.clone()),
                rollback: Some(active.clone()),
            },
        )
        .map_err(|_| FeaturePackError::new("activation_failed"))?;
        Ok(FeaturePackMutationReceipt {
            action: "rolled-back",
            installation_id: Some(inspection.installation_id),
            manifest_sha256: Some(inspection.manifest_sha256),
            measured_bytes: Some(inspection.measured_bytes),
            cleanup_pending: false,
            removed_installations: 0,
        })
    }

    pub(crate) fn measure(&self) -> Result<FeaturePackMeasurement> {
        let _guard = LIFECYCLE_LOCK
            .lock()
            .map_err(|_| FeaturePackError::new("lifecycle_lock_failed"))?;
        validate_trust_policy(&self.trust, self.verifier)?;
        let feature_root = open_feature_root(&self.app_data_dir, false)?
            .ok_or_else(|| FeaturePackError::new("measurement_unavailable"))?;
        let state = read_state(&feature_root)?;
        let active = state
            .active
            .as_ref()
            .ok_or_else(|| FeaturePackError::new("measurement_unavailable"))?;
        let inspection =
            inspect_installed(&feature_root, active, &self.trust, self.verifier, true)?;
        Ok(FeaturePackMeasurement {
            installation_id: inspection.installation_id,
            measured_bytes: inspection.measured_bytes,
            manifest_sha256: inspection.manifest_sha256,
        })
    }

    pub(crate) fn uninstall(&self) -> Result<FeaturePackMutationReceipt> {
        let _guard = LIFECYCLE_LOCK
            .lock()
            .map_err(|_| FeaturePackError::new("lifecycle_lock_failed"))?;
        validate_trust_policy(&self.trust, self.verifier)?;
        let Some(feature_root) = open_feature_root(&self.app_data_dir, false)? else {
            return Ok(FeaturePackMutationReceipt {
                action: "already-absent",
                installation_id: None,
                manifest_sha256: None,
                measured_bytes: None,
                cleanup_pending: false,
                removed_installations: 0,
            });
        };
        let state = read_state(&feature_root)?;
        let records = [state.active.as_ref(), state.rollback.as_ref()]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        for record in &records {
            inspect_installed(&feature_root, record, &self.trust, self.verifier, false)
                .map_err(|_| FeaturePackError::new("uninstall_target_invalid"))?;
        }
        write_state(&feature_root, &empty_state())
            .map_err(|_| FeaturePackError::new("activation_failed"))?;
        let mut removed_installations = 0_u8;
        let mut cleanup_pending = false;
        for record in records {
            match remove_version(&feature_root, record) {
                Ok(true) => removed_installations += 1,
                Ok(false) | Err(_) => cleanup_pending = true,
            }
        }
        Ok(FeaturePackMutationReceipt {
            action: "uninstalled",
            installation_id: None,
            manifest_sha256: None,
            measured_bytes: None,
            cleanup_pending,
            removed_installations,
        })
    }

    fn diagnose_locked(&self) -> FeaturePackDiagnosis {
        if let Err(error) = validate_trust_policy(&self.trust, self.verifier) {
            return FeaturePackDiagnosis {
                status: FeaturePackDiagnosisStatus::Unsupported,
                reason: Some(error.code),
                installation_id: None,
                manifest_sha256: None,
                playwright_version: None,
                browser_revision: None,
                measured_bytes: None,
            };
        }
        let feature_root = match open_feature_root(&self.app_data_dir, false) {
            Ok(Some(root)) => root,
            Ok(None) => return absent_diagnosis(),
            Err(error) => return corrupt_diagnosis(error.code),
        };
        let state = match read_state(&feature_root) {
            Ok(state) => state,
            Err(error) => return corrupt_diagnosis(error.code),
        };
        let Some(active) = state.active.as_ref() else {
            return absent_diagnosis();
        };
        match inspect_installed(&feature_root, active, &self.trust, self.verifier, true) {
            Ok(inspection) => FeaturePackDiagnosis {
                status: FeaturePackDiagnosisStatus::Healthy,
                reason: None,
                installation_id: Some(inspection.installation_id),
                manifest_sha256: Some(inspection.manifest_sha256),
                playwright_version: Some(inspection.playwright_version),
                browser_revision: Some(inspection.browser_revision),
                measured_bytes: Some(inspection.measured_bytes),
            },
            Err(error) if error.code == "unsupported_platform" => FeaturePackDiagnosis {
                status: FeaturePackDiagnosisStatus::Unsupported,
                reason: Some(error.code),
                installation_id: None,
                manifest_sha256: None,
                playwright_version: None,
                browser_revision: None,
                measured_bytes: None,
            },
            Err(error) => corrupt_diagnosis(error.code),
        }
    }
}

fn absent_diagnosis() -> FeaturePackDiagnosis {
    FeaturePackDiagnosis {
        status: FeaturePackDiagnosisStatus::Absent,
        reason: None,
        installation_id: None,
        manifest_sha256: None,
        playwright_version: None,
        browser_revision: None,
        measured_bytes: None,
    }
}

fn corrupt_diagnosis(reason: &'static str) -> FeaturePackDiagnosis {
    FeaturePackDiagnosis {
        status: FeaturePackDiagnosisStatus::Corrupt,
        reason: Some(reason),
        installation_id: None,
        manifest_sha256: None,
        playwright_version: None,
        browser_revision: None,
        measured_bytes: None,
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn current_target_platform() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "win32-arm64"
    } else {
        "win32-x64"
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn current_target_platform() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "darwin-arm64"
    } else {
        "darwin-x64"
    }
}

#[cfg(target_os = "linux")]
pub(crate) fn current_target_platform() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "linux-arm64"
    } else {
        "linux-x64"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use serde_json::{json, Value};
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    const TEST_PUBLIC_KEY_SHA256: &str =
        "3e8ad8b485328d5707a9558a089d401fedd8c0b00698227c159d000582338d54";
    const TEST_KEY_ID: &str = "D3DA96B5B101C53B";
    const TEST_SECRET: &[u8] = b"test-only-verifier-secret";
    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

    #[derive(Debug)]
    struct TestVerifier;

    impl ManifestSignatureVerifier for TestVerifier {
        fn public_key_sha256(&self) -> &str {
            TEST_PUBLIC_KEY_SHA256
        }

        fn verify_hashed_manifest(
            &self,
            manifest_bytes: &[u8],
            signature_bytes: &[u8],
        ) -> Result<VerifiedManifestSignature> {
            let mut digest = Sha256::new();
            digest.update(TEST_SECRET);
            digest.update(manifest_bytes);
            let expected = format!("{:x}", digest.finalize());
            if signature_bytes != expected.as_bytes() {
                return Err(FeaturePackError::new("signature_invalid"));
            }
            Ok(VerifiedManifestSignature {
                key_id: TEST_KEY_ID.to_string(),
            })
        }
    }

    struct TestEnvironment {
        root: PathBuf,
        app_data: PathBuf,
    }

    impl TestEnvironment {
        fn new(label: &str) -> Self {
            let nonce = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "vibespace-playwright-native-{label}-{}-{timestamp}-{nonce}",
                std::process::id()
            ));
            let app_data = root.join("app-data");
            fs::create_dir_all(&app_data).expect("create app data fixture");
            Self { root, app_data }
        }
    }

    impl Drop for TestEnvironment {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[derive(Debug)]
    struct TestArtifact {
        root: PathBuf,
        manifest: Value,
        manifest_sha256: String,
    }

    fn sha256(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    fn write_artifact(
        environment: &TestEnvironment,
        name: &str,
        artifact_version: &str,
        browser_revision: &str,
        browser_bytes: &[u8],
        transform: impl FnOnce(&mut Value),
    ) -> TestArtifact {
        let root = environment.root.join(name);
        let payload = root.join("payload");
        let files = [
            (
                "playwright-core/package.json",
                format!("{{\"version\":\"{PLAYWRIGHT_VERSION}\"}}\n").into_bytes(),
            ),
            ("browser/browser.bin", browser_bytes.to_vec()),
            (
                "licenses/NOTICE.txt",
                b"Playwright Apache-2.0 fixture\n".to_vec(),
            ),
        ];
        for (relative, bytes) in &files {
            let destination = payload.join(relative);
            fs::create_dir_all(destination.parent().expect("payload parent"))
                .expect("create payload parent");
            fs::write(destination, bytes).expect("write payload fixture");
        }
        let mut manifest = json!({
            "schemaVersion": 1,
            "id": "vibespace-playwright-acceptance-runtime",
            "artifactVersion": artifact_version,
            "playwrightVersion": PLAYWRIGHT_VERSION,
            "targetPlatform": current_target_platform(),
            "browser": {
                "name": "chromium",
                "revision": browser_revision,
                "executablePath": "browser/browser.bin"
            },
            "files": files.iter().map(|(path, bytes)| json!({
                "path": path,
                "bytes": bytes.len(),
                "sha256": sha256(bytes),
            })).collect::<Vec<_>>(),
            "totalBytes": files.iter().map(|(_, bytes)| bytes.len()).sum::<usize>()
        });
        transform(&mut manifest);
        fs::create_dir_all(&root).expect("create artifact root");
        let mut manifest_bytes = serde_json::to_vec_pretty(&manifest).expect("serialize manifest");
        manifest_bytes.push(b'\n');
        let manifest_sha256 = sha256(&manifest_bytes);
        let mut signature = Sha256::new();
        signature.update(TEST_SECRET);
        signature.update(&manifest_bytes);
        fs::write(root.join("feature-pack.json"), &manifest_bytes).expect("write manifest");
        fs::write(
            root.join("feature-pack.json.sig"),
            format!("{:x}", signature.finalize()),
        )
        .expect("write signature");
        TestArtifact {
            root,
            manifest,
            manifest_sha256,
        }
    }

    fn artifact(
        environment: &TestEnvironment,
        name: &str,
        version: &str,
        revision: &str,
    ) -> TestArtifact {
        write_artifact(
            environment,
            name,
            version,
            revision,
            version.as_bytes(),
            |_| {},
        )
    }

    fn policy(manifests: &[&TestArtifact]) -> FeaturePackTrustPolicy {
        FeaturePackTrustPolicy {
            public_key_sha256: TEST_PUBLIC_KEY_SHA256.to_string(),
            expected_key_id: TEST_KEY_ID.to_string(),
            target_platform: current_target_platform().to_string(),
            allowed_manifest_sha256: manifests
                .iter()
                .map(|artifact| artifact.manifest_sha256.clone())
                .collect(),
            allowed_browser_revisions: manifests
                .iter()
                .map(|artifact| {
                    artifact.manifest["browser"]["revision"]
                        .as_str()
                        .expect("revision")
                        .to_string()
                })
                .collect(),
            maximum_total_bytes: MAX_TOTAL_BYTES,
        }
    }

    fn lifecycle<'a>(
        environment: &TestEnvironment,
        trust: FeaturePackTrustPolicy,
        verifier: &'a TestVerifier,
    ) -> PlaywrightFeaturePackLifecycle<'a, TestVerifier> {
        PlaywrightFeaturePackLifecycle::new(environment.app_data.clone(), trust, verifier)
    }

    #[cfg(windows)]
    fn create_directory_link(original: &Path, link: &Path) -> std::io::Result<()> {
        std::os::windows::fs::symlink_dir(original, link)
    }

    #[cfg(unix)]
    fn create_directory_link(original: &Path, link: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(original, link)
    }

    #[test]
    fn installs_diagnoses_and_measures_one_pinned_local_artifact() {
        let environment = TestEnvironment::new("install");
        let artifact = artifact(&environment, "artifact-v1", "1.0.0", "1234");
        let verifier = TestVerifier;
        let lifecycle = lifecycle(&environment, policy(&[&artifact]), &verifier);

        let installed = lifecycle.install(&artifact.root).expect("install");
        let diagnosis = lifecycle.diagnose().expect("diagnose");
        let measurement = lifecycle.measure().expect("measure");

        assert_eq!(installed.action, "installed");
        assert_eq!(diagnosis.status, FeaturePackDiagnosisStatus::Healthy);
        assert_eq!(
            diagnosis.playwright_version.as_deref(),
            Some(PLAYWRIGHT_VERSION)
        );
        assert_eq!(diagnosis.browser_revision.as_deref(), Some("1234"));
        assert_eq!(
            measurement.installation_id,
            installed.installation_id.unwrap()
        );
        assert_eq!(
            measurement.measured_bytes,
            diagnosis.measured_bytes.unwrap()
        );
    }

    #[test]
    fn rejects_missing_or_mismatched_pinned_trust_before_installation() {
        let environment = TestEnvironment::new("trust");
        let artifact = artifact(&environment, "artifact-v1", "1.0.0", "1234");
        let verifier = TestVerifier;
        let mut trust = policy(&[&artifact]);
        trust.allowed_manifest_sha256.clear();
        assert_eq!(
            lifecycle(&environment, trust, &verifier)
                .install(&artifact.root)
                .unwrap_err()
                .code,
            "production_trust_not_configured"
        );

        let mut trust = policy(&[&artifact]);
        trust.public_key_sha256 = "0".repeat(64);
        assert_eq!(
            lifecycle(&environment, trust, &verifier)
                .install(&artifact.root)
                .unwrap_err()
                .code,
            "trusted_public_key_mismatch"
        );
    }

    #[test]
    fn rejects_signature_manifest_platform_and_revision_tampering() {
        let environment = TestEnvironment::new("tamper");
        let signed_artifact = artifact(&environment, "artifact-v1", "1.0.0", "1234");
        let verifier = TestVerifier;
        fs::write(
            signed_artifact.root.join("feature-pack.json.sig"),
            b"invalid",
        )
        .expect("tamper signature");
        assert_eq!(
            lifecycle(&environment, policy(&[&signed_artifact]), &verifier)
                .install(&signed_artifact.root)
                .unwrap_err()
                .code,
            "signature_invalid"
        );

        let wrong_platform = write_artifact(
            &environment,
            "wrong-platform",
            "1.0.1",
            "1235",
            b"browser",
            |manifest| manifest["targetPlatform"] = json!("unsupported-x64"),
        );
        assert_eq!(
            lifecycle(&environment, policy(&[&wrong_platform]), &verifier)
                .install(&wrong_platform.root)
                .unwrap_err()
                .code,
            "unsupported_platform"
        );

        let other = artifact(&environment, "other", "1.0.2", "9999");
        let mut trust = policy(&[&other]);
        trust.allowed_browser_revisions = vec!["1234".to_string()];
        assert_eq!(
            lifecycle(&environment, trust, &verifier)
                .install(&other.root)
                .unwrap_err()
                .code,
            "untrusted_browser_revision"
        );
    }

    #[test]
    fn rejects_traversal_extra_files_hardlinks_and_linked_directories() {
        let environment = TestEnvironment::new("links");
        let traversal = write_artifact(
            &environment,
            "traversal",
            "1.0.0",
            "1234",
            b"browser",
            |manifest| manifest["files"][0]["path"] = json!("../outside.js"),
        );
        let verifier = TestVerifier;
        assert_eq!(
            lifecycle(&environment, policy(&[&traversal]), &verifier)
                .install(&traversal.root)
                .unwrap_err()
                .code,
            "manifest_invalid_path"
        );

        let extra = artifact(&environment, "extra", "1.0.1", "1235");
        fs::write(extra.root.join("payload/browser/extra.bin"), b"extra")
            .expect("write extra payload file");
        assert_eq!(
            lifecycle(&environment, policy(&[&extra]), &verifier)
                .install(&extra.root)
                .unwrap_err()
                .code,
            "artifact_inventory_invalid"
        );

        let hardlink = artifact(&environment, "hardlink", "1.0.2", "1236");
        let source = hardlink.root.join("payload/browser/browser.bin");
        fs::hard_link(&source, environment.root.join("linked-browser.bin"))
            .expect("create payload hardlink");
        assert_eq!(
            lifecycle(&environment, policy(&[&hardlink]), &verifier)
                .install(&hardlink.root)
                .unwrap_err()
                .code,
            "artifact_unsafe_link"
        );
    }

    #[test]
    fn rejects_reparse_or_symlink_backed_artifact_and_app_data_directories() {
        let environment = TestEnvironment::new("reparse-roots");
        let linked_artifact = artifact(&environment, "artifact-v1", "1.0.0", "1234");
        let browser_root = linked_artifact.root.join("payload/browser");
        let external_browser = environment.root.join("external-browser");
        fs::rename(&browser_root, &external_browser).expect("move browser fixture");
        if create_directory_link(&external_browser, &browser_root).is_err() {
            return;
        }
        let verifier = TestVerifier;
        assert_eq!(
            lifecycle(&environment, policy(&[&linked_artifact]), &verifier)
                .install(&linked_artifact.root)
                .unwrap_err()
                .code,
            "artifact_unsafe_link"
        );

        let clean_artifact = artifact(&environment, "artifact-v2", "1.0.1", "1235");
        let linked_app_data = environment.root.join("linked-app-data");
        if create_directory_link(&environment.app_data, &linked_app_data).is_err() {
            return;
        }
        assert_eq!(
            PlaywrightFeaturePackLifecycle::new(
                linked_app_data,
                policy(&[&clean_artifact]),
                &verifier,
            )
            .install(&clean_artifact.root)
            .unwrap_err()
            .code,
            "app_data_unsafe"
        );
    }

    #[test]
    fn updates_and_rolls_back_only_to_a_verified_prior_installation() {
        let environment = TestEnvironment::new("rollback");
        let first = artifact(&environment, "artifact-v1", "1.0.0", "1234");
        let second = artifact(&environment, "artifact-v2", "1.0.1", "5678");
        let verifier = TestVerifier;
        let lifecycle = lifecycle(&environment, policy(&[&first, &second]), &verifier);

        let initial = lifecycle.install(&first.root).expect("initial install");
        assert_eq!(
            lifecycle.install(&second.root).expect("update").action,
            "updated"
        );
        assert_eq!(
            lifecycle
                .diagnose()
                .expect("updated diagnosis")
                .browser_revision
                .as_deref(),
            Some("5678")
        );
        assert_eq!(
            lifecycle.rollback().expect("rollback").installation_id,
            initial.installation_id
        );
        assert_eq!(
            lifecycle
                .diagnose()
                .expect("rolled back diagnosis")
                .browser_revision
                .as_deref(),
            Some("1234")
        );
    }

    #[test]
    fn repairs_corruption_only_from_the_same_pinned_manifest() {
        let environment = TestEnvironment::new("repair");
        let first = artifact(&environment, "artifact-v1", "1.0.0", "1234");
        let second = artifact(&environment, "artifact-v2", "1.0.1", "5678");
        let verifier = TestVerifier;
        let lifecycle = lifecycle(&environment, policy(&[&first, &second]), &verifier);
        let installed = lifecycle.install(&first.root).expect("install");
        let browser = environment
            .app_data
            .join("playwright-acceptance-runtime/versions")
            .join(
                installed
                    .installation_id
                    .as_deref()
                    .expect("installation id"),
            )
            .join("browser/browser.bin");
        fs::write(browser, b"corrupt").expect("corrupt browser payload");

        assert_eq!(
            lifecycle.diagnose().expect("corrupt diagnosis").status,
            FeaturePackDiagnosisStatus::Corrupt
        );
        assert_eq!(
            lifecycle.repair(&second.root).unwrap_err().code,
            "repair_unsupported_manifest_change"
        );
        assert_eq!(
            lifecycle.repair(&first.root).expect("repair").action,
            "repaired"
        );
        assert_eq!(
            lifecycle.diagnose().expect("healthy diagnosis").status,
            FeaturePackDiagnosisStatus::Healthy
        );
    }

    #[test]
    fn uninstall_uses_verified_state_identity_and_never_removes_unrelated_versions() {
        let environment = TestEnvironment::new("uninstall");
        let artifact = artifact(&environment, "artifact-v1", "1.0.0", "1234");
        let verifier = TestVerifier;
        let lifecycle = lifecycle(&environment, policy(&[&artifact]), &verifier);
        lifecycle.install(&artifact.root).expect("install");
        let feature_root = environment.app_data.join("playwright-acceptance-runtime");
        let unrelated = feature_root.join("versions/unrelated-runtime-1234");
        fs::create_dir_all(&unrelated).expect("create unrelated version");
        let sentinel = unrelated.join("sentinel.txt");
        fs::write(&sentinel, b"preserve me").expect("write unrelated sentinel");
        let state_path = feature_root.join("acceptance-runtime-state.json");
        let mut state: Value = serde_json::from_slice(&fs::read(&state_path).expect("read state"))
            .expect("parse state");
        state["active"]["installationId"] = json!("unrelated-runtime-1234");
        state["rollback"] = Value::Null;
        fs::write(
            &state_path,
            serde_json::to_vec_pretty(&state).expect("serialize tampered state"),
        )
        .expect("write tampered state");

        assert_eq!(
            lifecycle.uninstall().unwrap_err().code,
            "uninstall_target_invalid"
        );
        assert_eq!(fs::read(sentinel).expect("read sentinel"), b"preserve me");
    }

    #[test]
    fn uninstall_accepts_payload_corruption_after_signed_identity_is_proven() {
        let environment = TestEnvironment::new("uninstall-corrupt");
        let artifact = artifact(&environment, "artifact-v1", "1.0.0", "1234");
        let verifier = TestVerifier;
        let lifecycle = lifecycle(&environment, policy(&[&artifact]), &verifier);
        let installed = lifecycle.install(&artifact.root).expect("install");
        let version_root = environment
            .app_data
            .join("playwright-acceptance-runtime/versions")
            .join(
                installed
                    .installation_id
                    .as_deref()
                    .expect("installation id"),
            );
        fs::write(version_root.join("browser/browser.bin"), b"corrupt").expect("corrupt payload");

        let removed = lifecycle.uninstall().expect("uninstall corrupt payload");
        assert_eq!(removed.action, "uninstalled");
        assert_eq!(removed.removed_installations, 1);
        assert_eq!(
            lifecycle.diagnose().expect("absent diagnosis").status,
            FeaturePackDiagnosisStatus::Absent
        );
    }

    #[test]
    fn uninstall_rejects_tampered_installed_identity_metadata() {
        let environment = TestEnvironment::new("uninstall-identity");
        let artifact = artifact(&environment, "artifact-v1", "1.0.0", "1234");
        let verifier = TestVerifier;
        let lifecycle = lifecycle(&environment, policy(&[&artifact]), &verifier);
        let installed = lifecycle.install(&artifact.root).expect("install");
        let version_root = environment
            .app_data
            .join("playwright-acceptance-runtime/versions")
            .join(
                installed
                    .installation_id
                    .as_deref()
                    .expect("installation id"),
            );
        let receipt_path = version_root.join(RECEIPT_NAME);
        let mut receipt: Value =
            serde_json::from_slice(&fs::read(&receipt_path).expect("read receipt"))
                .expect("parse receipt");
        receipt["keyId"] = json!("0000000000000000");
        fs::write(
            &receipt_path,
            serde_json::to_vec_pretty(&receipt).expect("serialize receipt"),
        )
        .expect("tamper receipt");

        assert_eq!(
            lifecycle.uninstall().unwrap_err().code,
            "uninstall_target_invalid"
        );
        assert!(version_root.exists());
    }

    #[test]
    fn interrupted_state_journal_fails_closed_without_deleting_versions() {
        let environment = TestEnvironment::new("state-journal");
        let artifact = artifact(&environment, "artifact-v1", "1.0.0", "1234");
        let verifier = TestVerifier;
        let lifecycle = lifecycle(&environment, policy(&[&artifact]), &verifier);
        let installed = lifecycle.install(&artifact.root).expect("install");
        let feature_root = environment.app_data.join("playwright-acceptance-runtime");
        fs::write(
            feature_root.join(format!("{STATE_JOURNAL_PREFIX}next-crash")),
            b"interrupted",
        )
        .expect("write interrupted journal");

        let diagnosis = lifecycle.diagnose().expect("diagnose interrupted state");
        assert_eq!(diagnosis.status, FeaturePackDiagnosisStatus::Corrupt);
        assert_eq!(diagnosis.reason, Some("activation_interrupted"));
        assert_eq!(
            lifecycle.uninstall().unwrap_err().code,
            "activation_interrupted"
        );
        assert!(feature_root
            .join("versions")
            .join(installed.installation_id.expect("installation id"))
            .exists());
    }

    #[test]
    fn source_contains_no_network_browser_launch_or_download_authority() {
        let source = include_str!("playwright_feature_pack.rs");
        let production = source
            .split("#[cfg(test)]")
            .next()
            .expect("production source section");
        for forbidden in [
            "reqwest",
            "std::process::Command",
            "Command::new",
            "http://",
            "https://",
            ".launch(",
            "playwright install",
        ] {
            assert!(
                !production.contains(forbidden),
                "forbidden authority: {forbidden}"
            );
        }
    }

    #[test]
    fn policy_ceilings_remain_bounded_to_the_released_contract() {
        assert_eq!(PLAYWRIGHT_VERSION, "1.61.1");
        assert_eq!(MAX_FILE_BYTES, 768 * 1024 * 1024);
        assert_eq!(MAX_TOTAL_BYTES, 1_500_000_000);
        assert_eq!(MAX_FILES, 20_000);
    }

    #[test]
    fn direct_minisign_verifier_accepts_only_prehashed_tauri_wrapped_signatures() {
        const PUBLIC_KEY_RECORD: &str = "untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
        const PREHASHED_SIGNATURE: &str = "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1556193335\tfile:test\ny/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==";
        const LEGACY_SIGNATURE: &str = "untrusted comment: signature from minisign secret key\nRWQf6LRCGA9i59SLOFxz6NxvASXDJeRtuZykwQepbDEGt87ig1BNpWaVWuNrm73YiIiJbq71Wi+dP9eKL8OC351vwIasSSbXxwA=\ntrusted comment: timestamp:1555779966\tfile:test\nQtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==";

        let encoded_key = base64::engine::general_purpose::STANDARD.encode(PUBLIC_KEY_RECORD);
        let verifier = MinisignManifestVerifier::from_tauri_public_key(&encoded_key)
            .expect("known public key");
        assert_eq!(verifier.key_id(), "E7620F1842B4E81F");

        let signature = base64::engine::general_purpose::STANDARD.encode(PREHASHED_SIGNATURE);
        assert_eq!(
            verifier
                .verify_hashed_manifest(b"test", signature.as_bytes())
                .expect("known prehashed signature")
                .key_id,
            "E7620F1842B4E81F"
        );
        assert_eq!(
            verifier
                .verify_hashed_manifest(b"tampered", signature.as_bytes())
                .unwrap_err()
                .code,
            "signature_invalid"
        );

        let legacy = base64::engine::general_purpose::STANDARD.encode(LEGACY_SIGNATURE);
        assert_eq!(
            verifier
                .verify_hashed_manifest(b"test", legacy.as_bytes())
                .unwrap_err()
                .code,
            "signature_invalid"
        );
    }
}
