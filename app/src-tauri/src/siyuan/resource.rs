//! Validation for the build-materialized SiYuan runtime resource root.

use super::manifest::{
    SIYUAN_RUNTIME_FILE_COUNT, SIYUAN_RUNTIME_FINGERPRINT, SIYUAN_RUNTIME_UNCOMPRESSED_BYTES,
    SIYUAN_UPSTREAM_COMMIT, SIYUAN_UPSTREAM_TAG,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

pub const KERNEL_RELATIVE_PATH: &str = "kernel/SiYuan-Kernel.exe";
pub const KERNEL_BYTES: u64 = 106_248_136;
pub const KERNEL_SHA256: &str = "583794c497a87c0cb2aed46a64d1a7b790793ffa91173998e0e36cc0e9bfb29b";
const READY_MARKER: &str = "VIBESPACE_SIYUAN_READY.json";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeResourceError {
    RootUnavailable,
    RootOutsideAuthority,
    ReadyMarkerInvalid,
    ExecutableUnavailable,
    ExecutableInvalid,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedRuntimeResources {
    root: PathBuf,
    executable: PathBuf,
}

impl VerifiedRuntimeResources {
    pub fn discover(root: &Path) -> Result<Self, RuntimeResourceError> {
        discover_with(root, &ResourceExpectation::pinned())
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn executable(&self) -> &Path {
        &self.executable
    }

    #[cfg(test)]
    pub(crate) fn for_contract_tests(root: PathBuf) -> Self {
        Self {
            executable: root.join(KERNEL_RELATIVE_PATH),
            root,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadyMarker {
    schema_version: u32,
    tag: String,
    commit_sha: String,
    fingerprint: String,
    uncompressed_bytes: u64,
    file_count: u64,
}

struct ResourceExpectation {
    tag: String,
    commit: String,
    fingerprint: String,
    uncompressed_bytes: u64,
    file_count: u64,
    executable_bytes: u64,
    executable_sha256: String,
}

impl ResourceExpectation {
    fn pinned() -> Self {
        Self {
            tag: SIYUAN_UPSTREAM_TAG.to_owned(),
            commit: SIYUAN_UPSTREAM_COMMIT.to_owned(),
            fingerprint: SIYUAN_RUNTIME_FINGERPRINT.to_owned(),
            uncompressed_bytes: SIYUAN_RUNTIME_UNCOMPRESSED_BYTES,
            file_count: SIYUAN_RUNTIME_FILE_COUNT,
            executable_bytes: KERNEL_BYTES,
            executable_sha256: KERNEL_SHA256.to_owned(),
        }
    }
}

fn discover_with(
    root: &Path,
    expected: &ResourceExpectation,
) -> Result<VerifiedRuntimeResources, RuntimeResourceError> {
    if !root.is_absolute() {
        return Err(RuntimeResourceError::RootUnavailable);
    }
    let root = fs::canonicalize(root).map_err(|_| RuntimeResourceError::RootUnavailable)?;
    if !root.is_dir() {
        return Err(RuntimeResourceError::RootUnavailable);
    }

    let marker_path = root.join(READY_MARKER);
    let marker_file =
        File::open(&marker_path).map_err(|_| RuntimeResourceError::ReadyMarkerInvalid)?;
    let marker: ReadyMarker = serde_json::from_reader(marker_file)
        .map_err(|_| RuntimeResourceError::ReadyMarkerInvalid)?;
    if marker.schema_version != 1
        || marker.tag != expected.tag
        || marker.commit_sha != expected.commit
        || marker.fingerprint != expected.fingerprint
        || marker.uncompressed_bytes != expected.uncompressed_bytes
        || marker.file_count != expected.file_count
    {
        return Err(RuntimeResourceError::ReadyMarkerInvalid);
    }

    let executable = fs::canonicalize(root.join(KERNEL_RELATIVE_PATH))
        .map_err(|_| RuntimeResourceError::ExecutableUnavailable)?;
    if !executable.starts_with(&root) {
        return Err(RuntimeResourceError::RootOutsideAuthority);
    }
    let metadata =
        fs::metadata(&executable).map_err(|_| RuntimeResourceError::ExecutableUnavailable)?;
    if !metadata.is_file() || metadata.len() != expected.executable_bytes {
        return Err(RuntimeResourceError::ExecutableInvalid);
    }
    if sha256_file(&executable)? != expected.executable_sha256 {
        return Err(RuntimeResourceError::ExecutableInvalid);
    }
    Ok(VerifiedRuntimeResources { root, executable })
}

fn sha256_file(path: &Path) -> Result<String, RuntimeResourceError> {
    let mut file = File::open(path).map_err(|_| RuntimeResourceError::ExecutableUnavailable)?;
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| RuntimeResourceError::ExecutableInvalid)?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn make_fixture() -> (TestDirectory, ResourceExpectation) {
        let root =
            std::env::temp_dir().join(format!("vibespace-siyuan-resource-{}", nanoid::nanoid!()));
        fs::create_dir_all(root.join("kernel")).unwrap();
        let executable = root.join(KERNEL_RELATIVE_PATH);
        File::create(&executable)
            .unwrap()
            .write_all(b"kernel")
            .unwrap();
        fs::write(
            root.join(READY_MARKER),
            r#"{"schemaVersion":1,"tag":"v3.8.1","commitSha":"commit","fingerprint":"fingerprint","uncompressedBytes":6,"fileCount":1}"#,
        )
        .unwrap();
        let executable_sha256 = sha256_file(&executable).unwrap();
        (
            TestDirectory(root),
            ResourceExpectation {
                tag: "v3.8.1".to_owned(),
                commit: "commit".to_owned(),
                fingerprint: "fingerprint".to_owned(),
                uncompressed_bytes: 6,
                file_count: 1,
                executable_bytes: 6,
                executable_sha256,
            },
        )
    }

    #[test]
    fn validates_marker_executable_and_canonical_authority() {
        let (fixture, expectation) = make_fixture();
        let resources = discover_with(fixture.path(), &expectation).unwrap();
        assert!(resources.root().is_absolute());
        assert!(resources.executable().starts_with(resources.root()));
        assert!(resources.executable().ends_with(KERNEL_RELATIVE_PATH));
    }

    #[test]
    fn rejects_marker_or_executable_drift() {
        let (fixture, expectation) = make_fixture();
        fs::write(fixture.path().join(READY_MARKER), "{}").unwrap();
        assert_eq!(
            discover_with(fixture.path(), &expectation),
            Err(RuntimeResourceError::ReadyMarkerInvalid)
        );

        let (fixture, expectation) = make_fixture();
        fs::write(fixture.path().join(KERNEL_RELATIVE_PATH), b"changed").unwrap();
        assert_eq!(
            discover_with(fixture.path(), &expectation),
            Err(RuntimeResourceError::ExecutableInvalid)
        );
    }
}
