//! Authenticated, one-shot native evidence producer for the isolated
//! MonoChrome visual-test runtime.
//!
//! This command is registered only by the minimal visual-test builder. It is
//! deliberately fail closed: authority and product evidence are validated
//! before any environment value is read, secrets never enter responses or
//! errors, and the final evidence file is published once by an atomic rename.

use crate::runtime_profile::{
    DeniedEffectCounters, DeniedEffectSnapshot, RuntimeProfile, RuntimeStartupContext,
    DENIED_EFFECT_MANIFEST_HASH, MONOCHROME_CAPABILITY_IDENTIFIER, MONOCHROME_VISUAL_TEST,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::ffi::OsStr;
use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub const EVIDENCE_SCHEMA_VERSION: &str = "vibespace.monochrome.native-evidence.v1";
const EVIDENCE_TOKEN_ENV: &str = "VIBESPACE_MONOCHROME_EVIDENCE_TOKEN";
const EVIDENCE_PATH_ENV: &str = "VIBESPACE_MONOCHROME_EVIDENCE_PATH";
const SESSION_NONCE_HASH_ENV: &str = "VIBESPACE_MONOCHROME_SESSION_NONCE_HASH";
const EVIDENCE_DIRECTORY_NAME: &str = "evidence";
const EVIDENCE_FILE_NAME: &str = "native-evidence.json";
const SESSION_OWNER_FILE_NAME: &str = "session-owner.json";
const SESSION_MANIFEST_FILE_NAME: &str = "session-manifest.json";
const PROFILE_ENVIRONMENT_NAMES: [&str; 7] = [
    "APPDATA",
    "LOCALAPPDATA",
    "USERPROFILE",
    "HOME",
    "WEBVIEW2_USER_DATA_FOLDER",
    "TEMP",
    "TMP",
];
const REPARSE_POINT_ATTRIBUTE: u32 = 0x400;
const MAX_VALIDATED_PATH_COMPONENTS: usize = 128;
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
#[cfg(test)]
static TEST_BEFORE_RENAME_BARRIER: std::sync::Mutex<
    Option<(PathBuf, std::sync::Arc<std::sync::Barrier>)>,
> = std::sync::Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Handshake {
    pub profile: String,
    pub app_identifier: String,
    pub capability_identifier: String,
    pub session_nonce_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Readiness {
    pub status: String,
    pub application: String,
    pub fixture_smoke: String,
    pub surface: String,
    pub theme: String,
    pub font: String,
    pub fallback: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceErrors {
    pub page: Vec<String>,
    pub native: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitRequest {
    pub native_handshake: Handshake,
    pub frontend_handshake: Handshake,
    pub readiness: Readiness,
    pub errors: EvidenceErrors,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProducerEvidence {
    pub pid: u32,
    pub creation_time_utc: String,
    pub creation_time_hash: String,
    pub executable_hash: String,
    pub command_hash: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceDocument {
    schema_version: &'static str,
    authentication_hash: String,
    session_nonce_hash: String,
    producer: ProducerEvidence,
    native_handshake: Handshake,
    frontend_handshake: Handshake,
    readiness: Readiness,
    denied_effects: DeniedEffectSnapshot,
    errors: EvidenceErrors,
}

impl EvidenceDocument {
    fn new(
        authentication_hash: String,
        session_nonce_hash: String,
        producer: ProducerEvidence,
        request: CommitRequest,
        denied_effects: DeniedEffectSnapshot,
    ) -> Self {
        Self {
            schema_version: EVIDENCE_SCHEMA_VERSION,
            authentication_hash,
            session_nonce_hash,
            producer,
            native_handshake: request.native_handshake,
            frontend_handshake: request.frontend_handshake,
            readiness: request.readiness,
            denied_effects,
            errors: request.errors,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitReceipt {
    status: &'static str,
    schema_version: &'static str,
    session_nonce_hash: String,
    producer: ProducerEvidence,
}

impl CommitReceipt {
    fn new(session_nonce_hash: String, producer: ProducerEvidence) -> Self {
        Self {
            status: "COMMITTED",
            schema_version: EVIDENCE_SCHEMA_VERSION,
            session_nonce_hash,
            producer,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CommitFailure {
    Unavailable,
    Unsupported,
    RequestRejected,
    EnvironmentRejected,
    PathRejected,
    IdentityRejected,
    EvidenceExists,
    CommitFailed,
}

impl CommitFailure {
    fn public_message(self) -> &'static str {
        match self {
            Self::Unavailable => "monochrome evidence command unavailable",
            Self::Unsupported => "monochrome evidence platform unsupported",
            Self::RequestRejected => "monochrome evidence request rejected",
            Self::EnvironmentRejected => "monochrome evidence environment rejected",
            Self::PathRejected => "monochrome evidence path rejected",
            Self::IdentityRejected => "monochrome evidence identity rejected",
            Self::EvidenceExists => "monochrome evidence already committed",
            Self::CommitFailed => "monochrome evidence commit failed",
        }
    }
}

struct SecretBytes(Vec<u8>);

impl SecretBytes {
    fn new(bytes: Vec<u8>) -> Self {
        Self(bytes)
    }

    fn as_slice(&self) -> &[u8] {
        &self.0
    }
}

impl Drop for SecretBytes {
    fn drop(&mut self) {
        self.0.fill(0);
    }
}

trait CommitDependencies {
    fn ensure_supported(&mut self) -> Result<(), CommitFailure> {
        Ok(())
    }

    fn denied_effects(
        &mut self,
        context: &RuntimeStartupContext,
    ) -> Result<DeniedEffectSnapshot, CommitFailure>;
    fn read_nonce_hash(&mut self) -> Result<String, CommitFailure>;
    fn read_evidence_path(&mut self) -> Result<PathBuf, CommitFailure>;
    fn read_token(&mut self) -> Result<SecretBytes, CommitFailure>;
    fn process_identity(&mut self) -> Result<ProducerEvidence, CommitFailure>;
    fn validate_path(&mut self, path: &Path) -> Result<(), CommitFailure>;
    fn commit(&mut self, path: &Path, document: &EvidenceDocument) -> Result<(), CommitFailure>;
}

fn is_lower_hex_64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn handshake_matches(context: &RuntimeStartupContext, handshake: &Handshake) -> bool {
    handshake.profile == MONOCHROME_VISUAL_TEST
        && handshake.app_identifier == context.app_identifier
        && context.capability_identifier.as_deref()
            == Some(handshake.capability_identifier.as_str())
        && handshake.capability_identifier == MONOCHROME_CAPABILITY_IDENTIFIER
        && context.session_nonce_hash.as_deref() == Some(handshake.session_nonce_hash.as_str())
        && is_lower_hex_64(&handshake.session_nonce_hash)
}

fn validate_authority(context: &RuntimeStartupContext) -> Result<&str, CommitFailure> {
    if context.profile != RuntimeProfile::MonochromeVisualTest
        || context.capability_identifier.as_deref() != Some(MONOCHROME_CAPABILITY_IDENTIFIER)
    {
        return Err(CommitFailure::Unavailable);
    }
    let nonce_hash = context
        .session_nonce_hash
        .as_deref()
        .filter(|value| is_lower_hex_64(value))
        .ok_or(CommitFailure::Unavailable)?;
    if !context
        .app_identifier
        .starts_with("ai.vibespace.monochrome.test")
    {
        return Err(CommitFailure::Unavailable);
    }
    Ok(nonce_hash)
}

fn validate_request(
    context: &RuntimeStartupContext,
    request: &CommitRequest,
) -> Result<(), CommitFailure> {
    validate_authority(context)?;
    if !handshake_matches(context, &request.native_handshake)
        || !handshake_matches(context, &request.frontend_handshake)
        || request.native_handshake != request.frontend_handshake
        || request.readiness.status != "PASS"
        || request.readiness.application != "READY"
        || request.readiness.fixture_smoke != "PASS"
        || request.readiness.surface != "route:chat"
        || request.readiness.theme != "monochrome"
        || request.readiness.font != "READY"
        || request.readiness.fallback != "NOT_USED"
        || !request.errors.page.is_empty()
        || !request.errors.native.is_empty()
    {
        return Err(CommitFailure::RequestRejected);
    }
    Ok(())
}

fn denied_effect_counters_are_all_zero(counters: &DeniedEffectCounters) -> bool {
    counters.notification == 0
        && counters.process_relaunch == 0
        && counters.updater == 0
        && counters.shell_open == 0
        && counters.external_http == 0
        && counters.keychain == 0
        && counters.registry == 0
        && counters.launcher == 0
        && counters.tray == 0
        && counters.single_instance == 0
        && counters.global_shortcut == 0
        && counters.deep_link == 0
        && counters.autostart == 0
}

fn validate_denied_effects(snapshot: &DeniedEffectSnapshot) -> Result<(), CommitFailure> {
    if snapshot.status != "PASS"
        || snapshot.manifest_hash != DENIED_EFFECT_MANIFEST_HASH
        || !denied_effect_counters_are_all_zero(&snapshot.counters)
    {
        return Err(CommitFailure::RequestRejected);
    }
    Ok(())
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn authentication_hash(session_nonce_hash: &str, token: &SecretBytes) -> String {
    let mut digest = Sha256::new();
    digest.update(session_nonce_hash.as_bytes());
    digest.update(b"\n");
    digest.update(token.as_slice());
    format!("{:x}", digest.finalize())
}

fn commit_with_dependencies(
    context: &RuntimeStartupContext,
    request: CommitRequest,
    dependencies: &mut impl CommitDependencies,
) -> Result<CommitReceipt, CommitFailure> {
    let managed_nonce_hash = validate_authority(context)?.to_string();
    validate_request(context, &request)?;
    let denied_effects = dependencies.denied_effects(context)?;
    validate_denied_effects(&denied_effects)?;
    dependencies.ensure_supported()?;

    let environment_nonce_hash = dependencies.read_nonce_hash()?;
    if environment_nonce_hash != managed_nonce_hash {
        return Err(CommitFailure::EnvironmentRejected);
    }
    drop(environment_nonce_hash);

    let evidence_path = dependencies.read_evidence_path()?;
    dependencies.validate_path(&evidence_path)?;
    let producer = dependencies.process_identity()?;
    let token = dependencies.read_token()?;
    if token.as_slice().is_empty() {
        return Err(CommitFailure::EnvironmentRejected);
    }
    let document = EvidenceDocument::new(
        authentication_hash(&managed_nonce_hash, &token),
        managed_nonce_hash.clone(),
        producer.clone(),
        request,
        denied_effects,
    );
    drop(token);
    dependencies.commit(&evidence_path, &document)?;
    Ok(CommitReceipt::new(managed_nonce_hash, producer))
}

struct SystemDependencies;

impl CommitDependencies for SystemDependencies {
    fn ensure_supported(&mut self) -> Result<(), CommitFailure> {
        #[cfg(windows)]
        {
            Ok(())
        }
        #[cfg(not(windows))]
        {
            Err(CommitFailure::Unsupported)
        }
    }

    fn denied_effects(
        &mut self,
        context: &RuntimeStartupContext,
    ) -> Result<DeniedEffectSnapshot, CommitFailure> {
        crate::runtime_profile::build_evidence(context)
            .map_err(|_| CommitFailure::Unavailable)?
            .denied_effects
            .ok_or(CommitFailure::Unavailable)
    }

    fn read_nonce_hash(&mut self) -> Result<String, CommitFailure> {
        read_required_unicode_environment(SESSION_NONCE_HASH_ENV)
    }

    fn read_evidence_path(&mut self) -> Result<PathBuf, CommitFailure> {
        let value =
            std::env::var_os(EVIDENCE_PATH_ENV).ok_or(CommitFailure::EnvironmentRejected)?;
        if value.is_empty() {
            return Err(CommitFailure::EnvironmentRejected);
        }
        Ok(PathBuf::from(value))
    }

    fn read_token(&mut self) -> Result<SecretBytes, CommitFailure> {
        let value =
            std::env::var_os(EVIDENCE_TOKEN_ENV).ok_or(CommitFailure::EnvironmentRejected)?;
        let value = value
            .into_string()
            .map_err(|_| CommitFailure::EnvironmentRejected)?;
        if value.is_empty() {
            return Err(CommitFailure::EnvironmentRejected);
        }
        Ok(SecretBytes::new(value.into_bytes()))
    }

    fn process_identity(&mut self) -> Result<ProducerEvidence, CommitFailure> {
        process_identity()
    }

    fn validate_path(&mut self, path: &Path) -> Result<(), CommitFailure> {
        validate_evidence_target(path)
    }

    fn commit(&mut self, path: &Path, document: &EvidenceDocument) -> Result<(), CommitFailure> {
        validate_and_commit_file(path, document)
    }
}

fn read_required_unicode_environment(name: &str) -> Result<String, CommitFailure> {
    let value = std::env::var_os(name).ok_or(CommitFailure::EnvironmentRejected)?;
    let value = value
        .into_string()
        .map_err(|_| CommitFailure::EnvironmentRejected)?;
    if value.is_empty() {
        return Err(CommitFailure::EnvironmentRejected);
    }
    Ok(value)
}

#[tauri::command]
pub(crate) fn monochrome_evidence_commit(
    context: tauri::State<'_, RuntimeStartupContext>,
    native_handshake: Handshake,
    frontend_handshake: Handshake,
    readiness: Readiness,
    errors: EvidenceErrors,
) -> Result<CommitReceipt, String> {
    let request = CommitRequest {
        native_handshake,
        frontend_handshake,
        readiness,
        errors,
    };
    commit_with_dependencies(&context, request, &mut SystemDependencies)
        .map_err(|failure| failure.public_message().to_string())
}

fn absolute_normal_path(path: &Path) -> bool {
    path.is_absolute()
        && path
            .components()
            .all(|component| !matches!(component, Component::CurDir | Component::ParentDir))
}

fn evidence_session_root(path: &Path) -> Result<&Path, CommitFailure> {
    if !absolute_normal_path(path) || path.file_name() != Some(OsStr::new(EVIDENCE_FILE_NAME)) {
        return Err(CommitFailure::PathRejected);
    }
    let evidence_directory = path.parent().ok_or(CommitFailure::PathRejected)?;
    if evidence_directory.file_name() != Some(OsStr::new(EVIDENCE_DIRECTORY_NAME)) {
        return Err(CommitFailure::PathRejected);
    }
    evidence_directory
        .parent()
        .filter(|root| root.parent().is_some())
        .ok_or(CommitFailure::PathRejected)
}

#[cfg(windows)]
fn has_reparse_point(path: &Path) -> Result<bool, CommitFailure> {
    use std::os::windows::fs::MetadataExt;
    let metadata = std::fs::symlink_metadata(path).map_err(|_| CommitFailure::PathRejected)?;
    Ok(metadata.file_attributes() & REPARSE_POINT_ATTRIBUTE != 0)
}

#[cfg(not(windows))]
fn has_reparse_point(_path: &Path) -> Result<bool, CommitFailure> {
    Err(CommitFailure::Unsupported)
}

fn require_regular_file_without_reparse(path: &Path) -> Result<(), CommitFailure> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| CommitFailure::PathRejected)?;
    if !metadata.is_file() || has_reparse_point(path)? {
        return Err(CommitFailure::PathRejected);
    }
    Ok(())
}

fn require_directory_without_reparse(path: &Path) -> Result<(), CommitFailure> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| CommitFailure::PathRejected)?;
    if !metadata.is_dir() || has_reparse_point(path)? {
        return Err(CommitFailure::PathRejected);
    }
    Ok(())
}

fn canonical_without_reparse(path: &Path) -> Result<PathBuf, CommitFailure> {
    if has_reparse_point(path)? {
        return Err(CommitFailure::PathRejected);
    }
    std::fs::canonicalize(path).map_err(|_| CommitFailure::PathRejected)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ComponentInspection {
    Safe,
    Reparse,
    Missing,
}

fn walk_path_components_without_reparse(
    path: &Path,
    allow_missing_final: bool,
    mut inspect: impl FnMut(&Path) -> Result<ComponentInspection, CommitFailure>,
) -> Result<(), CommitFailure> {
    if !absolute_normal_path(path) {
        return Err(CommitFailure::PathRejected);
    }
    let components = path.components().collect::<Vec<_>>();
    if components.len() > MAX_VALIDATED_PATH_COMPONENTS {
        return Err(CommitFailure::PathRejected);
    }

    let mut current = PathBuf::new();
    for (index, component) in components.iter().enumerate() {
        current.push(component.as_os_str());
        // A Windows drive prefix (`C:`) is not inspectable until the root
        // component is appended (`C:\`). UNC/verbatim prefixes behave the
        // same way through `Path::is_absolute`.
        if !current.is_absolute() {
            continue;
        }
        match inspect(&current)? {
            ComponentInspection::Safe => {}
            ComponentInspection::Reparse => return Err(CommitFailure::PathRejected),
            ComponentInspection::Missing
                if allow_missing_final && index + 1 == components.len() => {}
            ComponentInspection::Missing => return Err(CommitFailure::PathRejected),
        }
    }
    Ok(())
}

fn require_path_components_without_reparse(
    path: &Path,
    allow_missing_final: bool,
) -> Result<(), CommitFailure> {
    walk_path_components_without_reparse(path, allow_missing_final, |component| {
        match std::fs::symlink_metadata(component) {
            Ok(metadata) if metadata_is_reparse_point(&metadata) => {
                Ok(ComponentInspection::Reparse)
            }
            Ok(_) => Ok(ComponentInspection::Safe),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(ComponentInspection::Missing)
            }
            Err(_) => Err(CommitFailure::PathRejected),
        }
    })
}

fn required_profile_environment_paths(
    mut read: impl FnMut(&str) -> Option<OsString>,
) -> Result<Vec<PathBuf>, CommitFailure> {
    let mut paths = Vec::with_capacity(PROFILE_ENVIRONMENT_NAMES.len());
    for name in PROFILE_ENVIRONMENT_NAMES {
        let raw = read(name).ok_or(CommitFailure::EnvironmentRejected)?;
        let value = raw
            .into_string()
            .map_err(|_| CommitFailure::EnvironmentRejected)?;
        if value.is_empty() {
            return Err(CommitFailure::EnvironmentRejected);
        }
        let path = PathBuf::from(value);
        if !absolute_normal_path(&path) {
            return Err(CommitFailure::EnvironmentRejected);
        }
        paths.push(path);
    }
    Ok(paths)
}

fn validate_profile_environment_paths(
    session_root: &Path,
    environment_paths: &[PathBuf],
) -> Result<(), CommitFailure> {
    if environment_paths.len() != PROFILE_ENVIRONMENT_NAMES.len() {
        return Err(CommitFailure::EnvironmentRejected);
    }
    let profile_root = session_root.join("native").join("profile");
    require_path_components_without_reparse(&profile_root, false)?;
    require_directory_without_reparse(&session_root.join("native"))?;
    require_directory_without_reparse(&profile_root)?;
    let canonical_profile_root = canonical_without_reparse(&profile_root)?;
    for path in environment_paths {
        require_path_components_without_reparse(&path, false)
            .map_err(|_| CommitFailure::EnvironmentRejected)?;
        let canonical =
            canonical_without_reparse(&path).map_err(|_| CommitFailure::EnvironmentRejected)?;
        if canonical == canonical_profile_root || !canonical.starts_with(&canonical_profile_root) {
            return Err(CommitFailure::EnvironmentRejected);
        }
    }
    Ok(())
}

fn validate_profile_environment(session_root: &Path) -> Result<(), CommitFailure> {
    let paths = required_profile_environment_paths(|name| std::env::var_os(name))?;
    validate_profile_environment_paths(session_root, &paths)
}

fn ensure_final_absent(path: &Path) -> Result<(), CommitFailure> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata_is_reparse_point(&metadata) {
                Err(CommitFailure::PathRejected)
            } else {
                Err(CommitFailure::EvidenceExists)
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(CommitFailure::PathRejected),
    }
}

#[cfg(windows)]
fn metadata_is_reparse_point(metadata: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & REPARSE_POINT_ATTRIBUTE != 0
}

#[cfg(not(windows))]
fn metadata_is_reparse_point(_metadata: &std::fs::Metadata) -> bool {
    false
}

fn file_sha256(path: &Path) -> Result<String, CommitFailure> {
    let mut file = File::open(path).map_err(|_| CommitFailure::CommitFailed)?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| CommitFailure::CommitFailed)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

struct TemporaryEvidenceFile {
    path: PathBuf,
    armed: bool,
}

impl TemporaryEvidenceFile {
    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TemporaryEvidenceFile {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

fn create_unique_temporary_file(
    parent: &Path,
) -> Result<(TemporaryEvidenceFile, File), CommitFailure> {
    for _ in 0..128 {
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let name = format!(".native-evidence.{}.{}.tmp", std::process::id(), sequence);
        let path = parent.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => {
                if require_path_components_without_reparse(&path, false).is_err() {
                    let _ = std::fs::remove_file(&path);
                    return Err(CommitFailure::PathRejected);
                }
                return Ok((TemporaryEvidenceFile { path, armed: true }, file));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(CommitFailure::CommitFailed),
        }
    }
    Err(CommitFailure::CommitFailed)
}

fn validate_and_commit_file(path: &Path, document: &EvidenceDocument) -> Result<(), CommitFailure> {
    #[cfg(not(windows))]
    {
        let _ = (path, document);
        return Err(CommitFailure::Unsupported);
    }

    #[cfg(windows)]
    {
        validate_evidence_target(path)?;
        commit_document_to_path(path, document)
    }
}

#[cfg(windows)]
fn commit_document_to_path(path: &Path, document: &EvidenceDocument) -> Result<(), CommitFailure> {
    let evidence_directory = path.parent().ok_or(CommitFailure::PathRejected)?;
    let serialized = serde_json::to_vec(document).map_err(|_| CommitFailure::CommitFailed)?;
    let (mut temporary, mut file) = create_unique_temporary_file(evidence_directory)?;
    file.write_all(&serialized)
        .map_err(|_| CommitFailure::CommitFailed)?;
    file.sync_all().map_err(|_| CommitFailure::CommitFailed)?;
    drop(file);

    ensure_final_absent(path)?;
    wait_at_test_before_rename_barrier(path);
    publish_temporary_evidence(&temporary.path, path)?;
    temporary.disarm();
    Ok(())
}

#[cfg(windows)]
fn publish_temporary_evidence(temporary: &Path, destination: &Path) -> Result<(), CommitFailure> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{HRESULT, PCWSTR};
    use windows::Win32::Foundation::{ERROR_ALREADY_EXISTS, ERROR_FILE_EXISTS};
    use windows::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};

    let temporary_wide = temporary
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination_wide = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

    // Omitting MOVEFILE_REPLACE_EXISTING makes publication atomic and
    // non-replacing. MOVEFILE_WRITE_THROUGH makes a successful return the
    // durability boundary, so COMMITTED is never returned before the move has
    // completed on disk.
    unsafe {
        MoveFileExW(
            PCWSTR(temporary_wide.as_ptr()),
            PCWSTR(destination_wide.as_ptr()),
            MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|error| {
        let code = error.code();
        if code == HRESULT::from_win32(ERROR_ALREADY_EXISTS.0)
            || code == HRESULT::from_win32(ERROR_FILE_EXISTS.0)
        {
            CommitFailure::EvidenceExists
        } else {
            CommitFailure::CommitFailed
        }
    })
}

#[cfg(test)]
struct TestBeforeRenameBarrier {
    path: PathBuf,
}

#[cfg(test)]
impl TestBeforeRenameBarrier {
    fn install(path: &Path, parties: usize) -> Self {
        let mut slot = TEST_BEFORE_RENAME_BARRIER
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        assert!(slot.is_none(), "test rename barrier is already installed");
        *slot = Some((
            path.to_path_buf(),
            std::sync::Arc::new(std::sync::Barrier::new(parties)),
        ));
        Self {
            path: path.to_path_buf(),
        }
    }
}

#[cfg(test)]
impl Drop for TestBeforeRenameBarrier {
    fn drop(&mut self) {
        let mut slot = TEST_BEFORE_RENAME_BARRIER
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if slot
            .as_ref()
            .is_some_and(|(path, _barrier)| path == &self.path)
        {
            *slot = None;
        }
    }
}

#[cfg(test)]
fn wait_at_test_before_rename_barrier(path: &Path) {
    let barrier = TEST_BEFORE_RENAME_BARRIER
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .as_ref()
        .filter(|(target, _barrier)| target == path)
        .map(|(_target, barrier)| std::sync::Arc::clone(barrier));
    if let Some(barrier) = barrier {
        barrier.wait();
    }
}

#[cfg(not(test))]
fn wait_at_test_before_rename_barrier(_path: &Path) {}

fn validate_evidence_target(path: &Path) -> Result<(), CommitFailure> {
    #[cfg(not(windows))]
    {
        let _ = path;
        return Err(CommitFailure::Unsupported);
    }

    #[cfg(windows)]
    {
        let session_root = evidence_session_root(path)?;
        require_path_components_without_reparse(session_root, false)?;
        require_directory_without_reparse(session_root)?;
        let evidence_directory = path.parent().ok_or(CommitFailure::PathRejected)?;
        require_path_components_without_reparse(evidence_directory, false)?;
        require_directory_without_reparse(evidence_directory)?;
        require_path_components_without_reparse(path, true)?;
        let canonical_root =
            std::fs::canonicalize(session_root).map_err(|_| CommitFailure::PathRejected)?;
        let canonical_evidence =
            std::fs::canonicalize(evidence_directory).map_err(|_| CommitFailure::PathRejected)?;
        if canonical_evidence.parent() != Some(canonical_root.as_path()) {
            return Err(CommitFailure::PathRejected);
        }

        let owner_path = session_root.join(SESSION_OWNER_FILE_NAME);
        let manifest_path = session_root.join(SESSION_MANIFEST_FILE_NAME);
        require_path_components_without_reparse(&owner_path, false)?;
        require_path_components_without_reparse(&manifest_path, false)?;
        require_regular_file_without_reparse(&owner_path)?;
        require_regular_file_without_reparse(&manifest_path)?;
        validate_profile_environment(session_root)?;
        ensure_final_absent(path)
    }
}

#[cfg(windows)]
fn process_identity() -> Result<ProducerEvidence, CommitFailure> {
    use std::os::windows::ffi::OsStringExt;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{FILETIME, SYSTEMTIME};
    use windows::Win32::System::Environment::GetCommandLineW;
    use windows::Win32::System::Threading::{
        GetCurrentProcess, GetCurrentProcessId, GetProcessTimes, QueryFullProcessImageNameW,
        PROCESS_NAME_WIN32,
    };
    use windows::Win32::System::Time::FileTimeToSystemTime;

    unsafe {
        let process = GetCurrentProcess();
        let pid = GetCurrentProcessId();
        let mut creation = FILETIME::default();
        let mut exit = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        GetProcessTimes(process, &mut creation, &mut exit, &mut kernel, &mut user)
            .map_err(|_| CommitFailure::IdentityRejected)?;

        let mut system_time = SYSTEMTIME::default();
        FileTimeToSystemTime(&creation, &mut system_time)
            .map_err(|_| CommitFailure::IdentityRejected)?;
        let creation_ticks =
            ((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64;
        let fractional_ticks = creation_ticks % 10_000_000;
        let creation_time_utc = format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:07}Z",
            system_time.wYear,
            system_time.wMonth,
            system_time.wDay,
            system_time.wHour,
            system_time.wMinute,
            system_time.wSecond,
            fractional_ticks
        );

        let mut image_buffer = vec![0_u16; 32_768];
        let mut image_length = image_buffer.len() as u32;
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(image_buffer.as_mut_ptr()),
            &mut image_length,
        )
        .map_err(|_| CommitFailure::IdentityRejected)?;
        if image_length == 0 || image_length as usize > image_buffer.len() {
            return Err(CommitFailure::IdentityRejected);
        }
        let executable_path = PathBuf::from(std::ffi::OsString::from_wide(
            &image_buffer[..image_length as usize],
        ));
        let executable_hash =
            file_sha256(&executable_path).map_err(|_| CommitFailure::IdentityRejected)?;

        let command_line = GetCommandLineW();
        if command_line.is_null() {
            return Err(CommitFailure::IdentityRejected);
        }
        let mut command_length = 0_usize;
        while command_length < 32_768 && *command_line.0.add(command_length) != 0 {
            command_length += 1;
        }
        if command_length == 0 || command_length == 32_768 {
            return Err(CommitFailure::IdentityRejected);
        }
        let command_units = std::slice::from_raw_parts(command_line.0, command_length);
        let mut command_bytes = Vec::with_capacity(command_units.len() * 2);
        for unit in command_units {
            command_bytes.extend_from_slice(&unit.to_le_bytes());
        }

        Ok(ProducerEvidence {
            pid,
            creation_time_hash: sha256_bytes(creation_time_utc.as_bytes()),
            creation_time_utc,
            executable_hash,
            command_hash: sha256_bytes(&command_bytes),
        })
    }
}

#[cfg(not(windows))]
fn process_identity() -> Result<ProducerEvidence, CommitFailure> {
    Err(CommitFailure::Unsupported)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime_profile::{
        RuntimeProfile, RuntimeStartupContext, MONOCHROME_CAPABILITY_IDENTIFIER,
        MONOCHROME_VISUAL_TEST,
    };
    use serde_json::json;

    const NONCE_HASH: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const MANIFEST_HASH: &str = DENIED_EFFECT_MANIFEST_HASH;

    fn context() -> RuntimeStartupContext {
        RuntimeStartupContext {
            profile: RuntimeProfile::MonochromeVisualTest,
            app_identifier: "ai.vibespace.monochrome.testabc123".to_string(),
            capability_identifier: Some(MONOCHROME_CAPABILITY_IDENTIFIER.to_string()),
            session_nonce_hash: Some(NONCE_HASH.to_string()),
        }
    }

    fn handshake() -> Handshake {
        Handshake {
            profile: MONOCHROME_VISUAL_TEST.to_string(),
            app_identifier: "ai.vibespace.monochrome.testabc123".to_string(),
            capability_identifier: MONOCHROME_CAPABILITY_IDENTIFIER.to_string(),
            session_nonce_hash: NONCE_HASH.to_string(),
        }
    }

    fn request() -> CommitRequest {
        CommitRequest {
            native_handshake: handshake(),
            frontend_handshake: handshake(),
            readiness: Readiness {
                status: "PASS".to_string(),
                application: "READY".to_string(),
                fixture_smoke: "PASS".to_string(),
                surface: "route:chat".to_string(),
                theme: "monochrome".to_string(),
                font: "READY".to_string(),
                fallback: "NOT_USED".to_string(),
            },
            errors: EvidenceErrors {
                page: Vec::new(),
                native: Vec::new(),
            },
        }
    }

    fn denied_effects() -> DeniedEffectSnapshot {
        DeniedEffectSnapshot {
            status: "PASS",
            manifest_hash: MANIFEST_HASH,
            counters: DeniedEffectCounters {
                notification: 0,
                process_relaunch: 0,
                updater: 0,
                shell_open: 0,
                external_http: 0,
                keychain: 0,
                registry: 0,
                launcher: 0,
                tray: 0,
                single_instance: 0,
                global_shortcut: 0,
                deep_link: 0,
                autostart: 0,
            },
        }
    }

    #[cfg(windows)]
    struct TestSession {
        root: PathBuf,
        evidence_path: PathBuf,
        profile_paths: Vec<PathBuf>,
    }

    #[cfg(windows)]
    impl TestSession {
        fn new() -> Self {
            let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "vibespace-monochrome-evidence-test-{}-{sequence}",
                std::process::id()
            ));
            let evidence_directory = root.join(EVIDENCE_DIRECTORY_NAME);
            let profile_root = root.join("native").join("profile");
            std::fs::create_dir_all(&evidence_directory).expect("create evidence directory");
            std::fs::create_dir_all(&profile_root).expect("create profile root");
            std::fs::write(root.join(SESSION_OWNER_FILE_NAME), b"{}").expect("write session owner");
            let manifest = b"{\"schemaVersion\":\"test\"}";
            std::fs::write(root.join(SESSION_MANIFEST_FILE_NAME), manifest)
                .expect("write session manifest");
            let profile_paths = PROFILE_ENVIRONMENT_NAMES
                .iter()
                .map(|name| {
                    let path = profile_root.join(name.to_ascii_lowercase());
                    std::fs::create_dir(&path).expect("create isolated profile path");
                    path
                })
                .collect();
            Self {
                evidence_path: evidence_directory.join(EVIDENCE_FILE_NAME),
                root,
                profile_paths,
            }
        }
    }

    #[cfg(windows)]
    impl Drop for TestSession {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn exact_request_schema_accepts_only_the_frozen_nested_shape() {
        let value = serde_json::to_value(request()).expect("serialize request");
        assert!(
            value.get("deniedEffects").is_none(),
            "renderer input must not carry native denied-effect authority"
        );
        assert_eq!(
            value,
            json!({
                "nativeHandshake": {
                    "profile": "monochrome-visual-test",
                    "appIdentifier": "ai.vibespace.monochrome.testabc123",
                    "capabilityIdentifier": "monochrome-test",
                    "sessionNonceHash": NONCE_HASH
                },
                "frontendHandshake": {
                    "profile": "monochrome-visual-test",
                    "appIdentifier": "ai.vibespace.monochrome.testabc123",
                    "capabilityIdentifier": "monochrome-test",
                    "sessionNonceHash": NONCE_HASH
                },
                "readiness": {
                    "status": "PASS",
                    "application": "READY",
                    "fixtureSmoke": "PASS",
                    "surface": "route:chat",
                    "theme": "monochrome",
                    "font": "READY",
                    "fallback": "NOT_USED"
                },
                "errors": {"page": [], "native": []}
            })
        );

        let mut with_extra = value;
        with_extra.as_object_mut().expect("object").insert(
            "deniedEffects".to_string(),
            json!({
                "status": "PASS",
                "manifestHash": MANIFEST_HASH,
                "counters": {}
            }),
        );
        assert!(serde_json::from_value::<CommitRequest>(with_extra).is_err());
    }

    #[test]
    fn request_validation_rejects_every_non_pass_readiness_literal() {
        let base = request();
        assert!(validate_request(&context(), &base).is_ok());

        let mutations: Vec<Box<dyn Fn(&mut CommitRequest)>> = vec![
            Box::new(|value| value.readiness.status = "FAIL".to_string()),
            Box::new(|value| value.readiness.application = "LOADING".to_string()),
            Box::new(|value| value.readiness.fixture_smoke = "FAIL".to_string()),
            Box::new(|value| value.readiness.surface = "hidden:readiness".to_string()),
            Box::new(|value| value.readiness.theme = "ordinary".to_string()),
            Box::new(|value| value.readiness.font = "MISSING".to_string()),
            Box::new(|value| value.readiness.fallback = "USED".to_string()),
        ];
        for mutate in mutations {
            let mut candidate = base.clone();
            mutate(&mut candidate);
            assert_eq!(
                validate_request(&context(), &candidate),
                Err(CommitFailure::RequestRejected)
            );
        }
    }

    #[test]
    fn request_validation_binds_both_handshakes_to_managed_context() {
        for native in [true, false] {
            for field in 0..4 {
                let mut candidate = request();
                let target = if native {
                    &mut candidate.native_handshake
                } else {
                    &mut candidate.frontend_handshake
                };
                match field {
                    0 => target.profile.push_str("-other"),
                    1 => target.app_identifier.push_str("-other"),
                    2 => target.capability_identifier.push_str("-other"),
                    _ => target.session_nonce_hash.replace_range(..1, "f"),
                }
                assert_eq!(
                    validate_request(&context(), &candidate),
                    Err(CommitFailure::RequestRejected)
                );
            }
        }
    }

    #[test]
    fn request_validation_rejects_page_and_native_errors() {
        let mut page_error = request();
        page_error.errors.page.push("not ready".to_string());
        assert_eq!(
            validate_request(&context(), &page_error),
            Err(CommitFailure::RequestRejected)
        );

        let mut native_error = request();
        native_error.errors.native.push("not ready".to_string());
        assert_eq!(
            validate_request(&context(), &native_error),
            Err(CommitFailure::RequestRejected)
        );
    }

    #[test]
    fn denied_effect_manifest_hash_is_frozen_to_the_canonical_counter_order() {
        let canonical = br#"["notification","processRelaunch","updater","shellOpen","externalHttp","keychain","registry","launcher","tray","singleInstance","globalShortcut","deepLink","autostart"]"#;
        assert_eq!(sha256_bytes(canonical), DENIED_EFFECT_MANIFEST_HASH);

        let mut reordered = denied_effects();
        reordered.manifest_hash =
            "ea4968e79387ce341bcf996c1e09d3c940d57a15bcde5618d993108367b70363";
        assert_eq!(
            validate_denied_effects(&reordered),
            Err(CommitFailure::RequestRejected)
        );
    }

    #[test]
    fn ordinary_context_is_rejected_before_dependency_access() {
        let context = RuntimeStartupContext {
            profile: RuntimeProfile::Ordinary,
            app_identifier: "ai.jarvis.desktop".to_string(),
            capability_identifier: None,
            session_nonce_hash: None,
        };
        let mut dependencies = RecordingDependencies::default();
        assert_eq!(
            commit_with_dependencies(&context, request(), &mut dependencies),
            Err(CommitFailure::Unavailable)
        );
        assert_eq!(dependencies.calls, Vec::<&'static str>::new());
    }

    #[test]
    fn visual_commit_orders_path_validation_before_identity_and_secret_access() {
        let mut dependencies = SuccessfulDependencies::default();
        let expected_denied_effects = dependencies.live_denied_effects.clone();
        let receipt = commit_with_dependencies(&context(), request(), &mut dependencies)
            .expect("valid evidence commits");
        assert_eq!(
            dependencies.calls,
            vec![
                "denied_effects",
                "nonce",
                "path",
                "validate_path",
                "identity",
                "token",
                "commit"
            ]
        );
        assert_eq!(receipt.status, "COMMITTED");
        let document = dependencies.document.expect("committed document");
        let serialized = serde_json::to_string(&document).expect("serialize captured document");
        assert!(!serialized.contains("runner-only-token"));
        assert_eq!(document.session_nonce_hash, NONCE_HASH);
        assert_eq!(document.denied_effects, expected_denied_effects);
    }

    #[test]
    fn live_denied_effect_attempt_rejects_commit_before_environment_or_publication() {
        let mutations: [fn(&mut DeniedEffectCounters); 13] = [
            |counters| counters.notification = 1,
            |counters| counters.process_relaunch = 1,
            |counters| counters.updater = 1,
            |counters| counters.shell_open = 1,
            |counters| counters.external_http = 1,
            |counters| counters.keychain = 1,
            |counters| counters.registry = 1,
            |counters| counters.launcher = 1,
            |counters| counters.tray = 1,
            |counters| counters.single_instance = 1,
            |counters| counters.global_shortcut = 1,
            |counters| counters.deep_link = 1,
            |counters| counters.autostart = 1,
        ];
        for mutate in mutations {
            let mut dependencies = SuccessfulDependencies::default();
            mutate(&mut dependencies.live_denied_effects.counters);

            assert_eq!(
                commit_with_dependencies(&context(), request(), &mut dependencies),
                Err(CommitFailure::RequestRejected)
            );
            assert_eq!(dependencies.calls, vec!["denied_effects"]);
            assert!(dependencies.document.is_none());
        }
    }

    #[test]
    fn live_denied_effect_snapshot_rejects_status_and_manifest_drift() {
        for mutate in [
            |snapshot: &mut DeniedEffectSnapshot| snapshot.status = "FAIL",
            |snapshot: &mut DeniedEffectSnapshot| {
                snapshot.manifest_hash =
                    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
            },
        ] {
            let mut dependencies = SuccessfulDependencies::default();
            mutate(&mut dependencies.live_denied_effects);

            assert_eq!(
                commit_with_dependencies(&context(), request(), &mut dependencies),
                Err(CommitFailure::RequestRejected)
            );
            assert_eq!(dependencies.calls, vec!["denied_effects"]);
            assert!(dependencies.document.is_none());
        }
    }

    #[test]
    fn live_denied_effect_authority_failure_rejects_before_environment_or_publication() {
        let mut dependencies = RecordingDependencies::default();
        assert_eq!(
            commit_with_dependencies(&context(), request(), &mut dependencies),
            Err(CommitFailure::Unavailable)
        );
        assert_eq!(dependencies.calls, vec!["denied_effects"]);
    }

    #[test]
    fn nonce_mismatch_stops_before_path_identity_token_or_output() {
        let mut dependencies = SuccessfulDependencies {
            nonce_hash: "f".repeat(64),
            ..SuccessfulDependencies::default()
        };
        assert_eq!(
            commit_with_dependencies(&context(), request(), &mut dependencies),
            Err(CommitFailure::EnvironmentRejected)
        );
        assert_eq!(dependencies.calls, vec!["denied_effects", "nonce"]);
        assert!(dependencies.document.is_none());
    }

    #[test]
    fn evidence_layout_requires_absolute_exact_parent_and_basename() {
        #[cfg(windows)]
        {
            let valid = Path::new(r"C:\runner\session-1\evidence\native-evidence.json");
            assert_eq!(
                evidence_session_root(valid).expect("valid layout"),
                Path::new(r"C:\runner\session-1")
            );
            for invalid in [
                Path::new(r"session-1\evidence\native-evidence.json"),
                Path::new(r"C:\runner\session-1\output\native-evidence.json"),
                Path::new(r"C:\runner\session-1\evidence\evidence.json"),
                Path::new(r"C:\runner\session-1\evidence\..\native-evidence.json"),
            ] {
                assert_eq!(
                    evidence_session_root(invalid),
                    Err(CommitFailure::PathRejected)
                );
            }
        }
    }

    #[test]
    fn component_walk_rejects_an_intermediate_reparse_and_stops() {
        #[cfg(windows)]
        {
            let target = Path::new(r"C:\runner\junction\session\evidence");
            let mut inspected = Vec::new();
            let result = walk_path_components_without_reparse(target, false, |component| {
                inspected.push(component.to_path_buf());
                if component.ends_with("junction") {
                    Ok(ComponentInspection::Reparse)
                } else {
                    Ok(ComponentInspection::Safe)
                }
            });
            assert_eq!(result, Err(CommitFailure::PathRejected));
            assert!(inspected.iter().any(|path| path.ends_with("junction")));
            assert!(!inspected.iter().any(|path| path.ends_with("session")));
            assert!(!inspected.iter().any(|path| path.ends_with("evidence")));
        }
    }

    #[test]
    fn component_walk_allows_only_an_explicitly_missing_final_leaf() {
        #[cfg(windows)]
        {
            let target = Path::new(r"C:\runner\session\evidence\native-evidence.json");
            let missing_final = |component: &Path| {
                if component == target {
                    Ok(ComponentInspection::Missing)
                } else {
                    Ok(ComponentInspection::Safe)
                }
            };
            assert!(walk_path_components_without_reparse(target, true, missing_final).is_ok());
            assert_eq!(
                walk_path_components_without_reparse(target, false, missing_final),
                Err(CommitFailure::PathRejected)
            );

            let missing_parent = |component: &Path| {
                if component.ends_with("evidence") {
                    Ok(ComponentInspection::Missing)
                } else {
                    Ok(ComponentInspection::Safe)
                }
            };
            assert_eq!(
                walk_path_components_without_reparse(target, true, missing_parent),
                Err(CommitFailure::PathRejected)
            );
        }
    }

    #[test]
    fn every_profile_environment_variable_is_mandatory() {
        #[cfg(windows)]
        {
            let mut reads = Vec::new();
            let result = required_profile_environment_paths(|name| {
                reads.push(name.to_string());
                if name == "HOME" {
                    None
                } else {
                    Some(OsString::from(format!(r"C:\session\native\profile\{name}")))
                }
            });
            assert_eq!(result, Err(CommitFailure::EnvironmentRejected));
            assert_eq!(reads, PROFILE_ENVIRONMENT_NAMES[..=3]);

            let paths = required_profile_environment_paths(|name| {
                Some(OsString::from(format!(r"C:\session\native\profile\{name}")))
            })
            .expect("all seven required paths");
            assert_eq!(paths.len(), PROFILE_ENVIRONMENT_NAMES.len());
        }
    }

    #[test]
    fn profile_environment_rejects_empty_and_non_unicode_values() {
        assert_eq!(
            required_profile_environment_paths(|_| Some(OsString::new())),
            Err(CommitFailure::EnvironmentRejected)
        );

        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStringExt;
            let invalid = OsString::from_wide(&[0xD800]);
            assert_eq!(
                required_profile_environment_paths(|_| Some(invalid.clone())),
                Err(CommitFailure::EnvironmentRejected)
            );
        }
    }

    #[test]
    fn real_path_validation_and_publish_are_one_shot_and_leave_no_temp_file() {
        #[cfg(windows)]
        {
            let session = TestSession::new();
            validate_profile_environment_paths(&session.root, &session.profile_paths)
                .expect("isolated paths validate");
            require_regular_file_without_reparse(&session.root.join(SESSION_MANIFEST_FILE_NAME))
                .expect("session manifest is regular path authority");
            require_path_components_without_reparse(&session.evidence_path, true)
                .expect("missing final leaf is allowed");

            let producer = ProducerEvidence {
                pid: 42,
                creation_time_utc: "2026-07-30T12:34:56.7890000Z".to_string(),
                creation_time_hash: "1".repeat(64),
                executable_hash: "2".repeat(64),
                command_hash: "3".repeat(64),
            };
            let document = EvidenceDocument::new(
                "4".repeat(64),
                NONCE_HASH.to_string(),
                producer,
                request(),
                denied_effects(),
            );
            commit_document_to_path(&session.evidence_path, &document)
                .expect("first publication succeeds");
            assert_eq!(
                commit_document_to_path(&session.evidence_path, &document),
                Err(CommitFailure::EvidenceExists)
            );

            let persisted: serde_json::Value = serde_json::from_slice(
                &std::fs::read(&session.evidence_path).expect("read evidence"),
            )
            .expect("parse evidence");
            assert_eq!(
                persisted["schemaVersion"],
                json!("vibespace.monochrome.native-evidence.v1")
            );
            let names = std::fs::read_dir(session.evidence_path.parent().expect("parent"))
                .expect("list evidence directory")
                .map(|entry| {
                    entry
                        .expect("directory entry")
                        .file_name()
                        .to_string_lossy()
                        .into_owned()
                })
                .collect::<Vec<_>>();
            assert_eq!(names, vec![EVIDENCE_FILE_NAME.to_string()]);
        }
    }

    #[test]
    fn concurrent_publication_has_one_winner_without_replacing_winning_bytes() {
        #[cfg(windows)]
        {
            let session = TestSession::new();
            let first_producer = ProducerEvidence {
                pid: 41,
                creation_time_utc: "2026-07-30T12:34:56.7890000Z".to_string(),
                creation_time_hash: "1".repeat(64),
                executable_hash: "2".repeat(64),
                command_hash: "3".repeat(64),
            };
            let second_producer = ProducerEvidence {
                pid: 42,
                creation_time_utc: "2026-07-30T12:34:57.7890000Z".to_string(),
                creation_time_hash: "5".repeat(64),
                executable_hash: "6".repeat(64),
                command_hash: "7".repeat(64),
            };
            let first_document = EvidenceDocument::new(
                "a".repeat(64),
                NONCE_HASH.to_string(),
                first_producer,
                request(),
                denied_effects(),
            );
            let second_document = EvidenceDocument::new(
                "b".repeat(64),
                NONCE_HASH.to_string(),
                second_producer,
                request(),
                denied_effects(),
            );
            let first_bytes =
                serde_json::to_vec(&first_document).expect("serialize first evidence");
            let second_bytes =
                serde_json::to_vec(&second_document).expect("serialize second evidence");
            let _barrier = TestBeforeRenameBarrier::install(&session.evidence_path, 2);

            let first_path = session.evidence_path.clone();
            let first =
                std::thread::spawn(move || commit_document_to_path(&first_path, &first_document));
            let second_path = session.evidence_path.clone();
            let second =
                std::thread::spawn(move || commit_document_to_path(&second_path, &second_document));
            let first_result = first.join().expect("first publisher");
            let second_result = second.join().expect("second publisher");

            let (winning_bytes, losing_result) = match (first_result, second_result) {
                (Ok(()), loser) => (first_bytes, loser),
                (loser, Ok(())) => (second_bytes, loser),
                results => panic!("exactly one publisher must win: {results:?}"),
            };
            assert_eq!(losing_result, Err(CommitFailure::EvidenceExists));
            assert_eq!(
                std::fs::read(&session.evidence_path).expect("read winning evidence"),
                winning_bytes,
                "the losing publisher must never replace the winning bytes"
            );
            let names = std::fs::read_dir(session.evidence_path.parent().expect("parent"))
                .expect("list evidence directory")
                .map(|entry| {
                    entry
                        .expect("directory entry")
                        .file_name()
                        .to_string_lossy()
                        .into_owned()
                })
                .collect::<Vec<_>>();
            assert_eq!(names, vec![EVIDENCE_FILE_NAME.to_string()]);
        }
    }

    #[test]
    fn authentication_hash_is_exact_and_does_not_serialize_the_token() {
        let token = SecretBytes::new(b"runner-only-token".to_vec());
        let hash = authentication_hash(NONCE_HASH, &token);
        assert_eq!(
            hash,
            "9f6df98549b9b1641de852d7030e6e5dee1f12c64cccb369d3fc36cb56f9a58e"
        );
        assert!(!hash.contains("runner-only-token"));
    }

    #[test]
    fn windows_process_identity_is_current_and_self_consistent() {
        #[cfg(windows)]
        {
            let producer = process_identity().expect("collect trusted Windows identity");
            assert_eq!(producer.pid, std::process::id());
            assert_eq!(
                producer.executable_hash,
                file_sha256(&std::env::current_exe().expect("current executable"))
                    .expect("hash current executable")
            );
            assert_eq!(
                producer.creation_time_hash,
                sha256_bytes(producer.creation_time_utc.as_bytes())
            );
            assert_eq!(producer.creation_time_utc.len(), 28);
            assert!(producer.creation_time_utc.ends_with('Z'));
            assert!(is_lower_hex_64(&producer.creation_time_hash));
            assert!(is_lower_hex_64(&producer.executable_hash));
            assert!(is_lower_hex_64(&producer.command_hash));
        }
    }

    #[test]
    fn receipt_and_evidence_have_exact_root_fields() {
        let producer = ProducerEvidence {
            pid: 42,
            creation_time_utc: "2026-07-30T12:34:56.789Z".to_string(),
            creation_time_hash: "1".repeat(64),
            executable_hash: "2".repeat(64),
            command_hash: "3".repeat(64),
        };
        let evidence = EvidenceDocument::new(
            "4".repeat(64),
            NONCE_HASH.to_string(),
            producer.clone(),
            request(),
            denied_effects(),
        );
        let object = serde_json::to_value(&evidence)
            .expect("serialize evidence")
            .as_object()
            .expect("object")
            .keys()
            .cloned()
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(
            object,
            [
                "schemaVersion",
                "authenticationHash",
                "sessionNonceHash",
                "producer",
                "nativeHandshake",
                "frontendHandshake",
                "readiness",
                "deniedEffects",
                "errors",
            ]
            .into_iter()
            .map(str::to_string)
            .collect()
        );

        let receipt = CommitReceipt::new(NONCE_HASH.to_string(), producer);
        assert_eq!(
            serde_json::to_value(receipt).expect("serialize receipt"),
            json!({
                "status": "COMMITTED",
                "schemaVersion": "vibespace.monochrome.native-evidence.v1",
                "sessionNonceHash": NONCE_HASH,
                "producer": {
                    "pid": 42,
                    "creationTimeUtc": "2026-07-30T12:34:56.789Z",
                    "creationTimeHash": "1".repeat(64),
                    "executableHash": "2".repeat(64),
                    "commandHash": "3".repeat(64)
                }
            })
        );
    }

    #[derive(Default)]
    struct RecordingDependencies {
        calls: Vec<&'static str>,
    }

    struct SuccessfulDependencies {
        calls: Vec<&'static str>,
        nonce_hash: String,
        live_denied_effects: DeniedEffectSnapshot,
        document: Option<EvidenceDocument>,
    }

    impl Default for SuccessfulDependencies {
        fn default() -> Self {
            Self {
                calls: Vec::new(),
                nonce_hash: NONCE_HASH.to_string(),
                live_denied_effects: denied_effects(),
                document: None,
            }
        }
    }

    impl CommitDependencies for SuccessfulDependencies {
        fn denied_effects(
            &mut self,
            _context: &RuntimeStartupContext,
        ) -> Result<DeniedEffectSnapshot, CommitFailure> {
            self.calls.push("denied_effects");
            Ok(self.live_denied_effects.clone())
        }

        fn read_nonce_hash(&mut self) -> Result<String, CommitFailure> {
            self.calls.push("nonce");
            Ok(self.nonce_hash.clone())
        }

        fn read_evidence_path(&mut self) -> Result<std::path::PathBuf, CommitFailure> {
            self.calls.push("path");
            Ok(PathBuf::from(
                r"C:\runner\session\evidence\native-evidence.json",
            ))
        }

        fn read_token(&mut self) -> Result<SecretBytes, CommitFailure> {
            self.calls.push("token");
            Ok(SecretBytes::new(b"runner-only-token".to_vec()))
        }

        fn process_identity(&mut self) -> Result<ProducerEvidence, CommitFailure> {
            self.calls.push("identity");
            Ok(ProducerEvidence {
                pid: 42,
                creation_time_utc: "2026-07-30T12:34:56.7890000Z".to_string(),
                creation_time_hash: "1".repeat(64),
                executable_hash: "2".repeat(64),
                command_hash: "3".repeat(64),
            })
        }

        fn validate_path(&mut self, _path: &Path) -> Result<(), CommitFailure> {
            self.calls.push("validate_path");
            Ok(())
        }

        fn commit(
            &mut self,
            _path: &Path,
            document: &EvidenceDocument,
        ) -> Result<(), CommitFailure> {
            self.calls.push("commit");
            self.document = Some(document.clone());
            Ok(())
        }
    }

    impl CommitDependencies for RecordingDependencies {
        fn denied_effects(
            &mut self,
            _context: &RuntimeStartupContext,
        ) -> Result<DeniedEffectSnapshot, CommitFailure> {
            self.calls.push("denied_effects");
            Err(CommitFailure::Unavailable)
        }

        fn read_nonce_hash(&mut self) -> Result<String, CommitFailure> {
            self.calls.push("nonce");
            Err(CommitFailure::Unavailable)
        }

        fn read_evidence_path(&mut self) -> Result<std::path::PathBuf, CommitFailure> {
            self.calls.push("path");
            Err(CommitFailure::Unavailable)
        }

        fn read_token(&mut self) -> Result<SecretBytes, CommitFailure> {
            self.calls.push("token");
            Err(CommitFailure::Unavailable)
        }

        fn process_identity(&mut self) -> Result<ProducerEvidence, CommitFailure> {
            self.calls.push("identity");
            Err(CommitFailure::Unavailable)
        }

        fn validate_path(&mut self, _path: &std::path::Path) -> Result<(), CommitFailure> {
            self.calls.push("validate_path");
            Err(CommitFailure::Unavailable)
        }

        fn commit(
            &mut self,
            _path: &std::path::Path,
            _document: &EvidenceDocument,
        ) -> Result<(), CommitFailure> {
            self.calls.push("commit");
            Err(CommitFailure::Unavailable)
        }
    }
}
