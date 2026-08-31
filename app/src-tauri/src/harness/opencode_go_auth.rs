use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_AUTH_STORE_BYTES: u64 = 256 * 1024;
const MIN_API_KEY_BYTES: usize = 8;
const MAX_API_KEY_BYTES: usize = 16 * 1024;
const OPENCODE_GO_PROVIDER: &str = "opencode-go";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenCodeGoAuthError {
    ProfileUnavailable,
    Missing,
    UnsafeFile,
    Oversized,
    Malformed,
    MissingCredential,
    InvalidCredential,
}

/// Native-only credential container. Deliberately has no `Debug`, `Display`,
/// serialization, or renderer-facing representation.
pub struct OpenCodeGoCredential {
    api_key: String,
}

impl OpenCodeGoCredential {
    pub(crate) fn expose_to_child_environment(&self) -> &str {
        &self.api_key
    }
}

pub fn default_auth_store_path() -> Result<PathBuf, OpenCodeGoAuthError> {
    let profile = std::env::var_os("USERPROFILE")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .ok_or(OpenCodeGoAuthError::ProfileUnavailable)?;
    Ok(profile.join(".local/share/opencode/auth.json"))
}

pub fn read_opencode_go_credential(
    path: &Path,
) -> Result<OpenCodeGoCredential, OpenCodeGoAuthError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            OpenCodeGoAuthError::Missing
        } else {
            OpenCodeGoAuthError::UnsafeFile
        }
    })?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(OpenCodeGoAuthError::UnsafeFile);
    }
    if metadata.len() == 0 || metadata.len() > MAX_AUTH_STORE_BYTES {
        return Err(OpenCodeGoAuthError::Oversized);
    }

    let bytes = fs::read(path).map_err(|_| OpenCodeGoAuthError::UnsafeFile)?;
    if bytes.len() as u64 != metadata.len() || bytes.len() as u64 > MAX_AUTH_STORE_BYTES {
        return Err(OpenCodeGoAuthError::UnsafeFile);
    }
    let root: Value = serde_json::from_slice(&bytes).map_err(|_| OpenCodeGoAuthError::Malformed)?;
    let provider = root
        .as_object()
        .and_then(|object| object.get(OPENCODE_GO_PROVIDER))
        .and_then(Value::as_object)
        .ok_or(OpenCodeGoAuthError::MissingCredential)?;
    if provider.get("type").and_then(Value::as_str) != Some("api") {
        return Err(OpenCodeGoAuthError::InvalidCredential);
    }
    let key = provider
        .get("key")
        .and_then(Value::as_str)
        .ok_or(OpenCodeGoAuthError::InvalidCredential)?;
    if key.len() < MIN_API_KEY_BYTES
        || key.len() > MAX_API_KEY_BYTES
        || key.trim() != key
        || key.chars().any(char::is_control)
    {
        return Err(OpenCodeGoAuthError::InvalidCredential);
    }
    Ok(OpenCodeGoCredential {
        api_key: key.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempFile {
        root: PathBuf,
        path: PathBuf,
    }

    impl TempFile {
        fn new(bytes: &[u8]) -> Self {
            let root = std::env::temp_dir().join(format!(
                "vibespace-opencode-go-auth-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .expect("clock")
                    .as_nanos()
            ));
            fs::create_dir(&root).expect("temp root");
            let path = root.join("auth.json");
            fs::write(&path, bytes).expect("auth fixture");
            Self { root, path }
        }
    }

    impl Drop for TempFile {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn reads_only_the_exact_opencode_go_api_credential() {
        let fixture = TempFile::new(
            br#"{"other":{"type":"api","key":"do-not-use"},"opencode-go":{"type":"api","key":"secret-for-child-only"}}"#,
        );
        let credential = read_opencode_go_credential(&fixture.path).expect("credential");
        assert_eq!(
            credential.expose_to_child_environment(),
            "secret-for-child-only"
        );
    }

    #[test]
    fn rejects_missing_malformed_or_wrongly_typed_credentials() {
        for body in [
            br#"{}"#.as_slice(),
            br#"{"opencode-go":{"type":"oauth","key":"abcdefgh"}}"#.as_slice(),
            br#"{"opencode-go":{"type":"api","key":" short "}}"#.as_slice(),
            br#"{"opencode-go":{"type":"api","key":"abc\ndefgh"}}"#.as_slice(),
            br#"{"opencode-go""#.as_slice(),
        ] {
            let fixture = TempFile::new(body);
            assert!(read_opencode_go_credential(&fixture.path).is_err());
        }
    }

    #[test]
    fn rejects_directories_empty_files_and_oversized_stores() {
        let empty = TempFile::new(b"");
        assert_eq!(
            read_opencode_go_credential(&empty.path).err(),
            Some(OpenCodeGoAuthError::Oversized)
        );
        assert_eq!(
            read_opencode_go_credential(&empty.root).err(),
            Some(OpenCodeGoAuthError::UnsafeFile)
        );
        let oversized = TempFile::new(&vec![b'x'; MAX_AUTH_STORE_BYTES as usize + 1]);
        assert_eq!(
            read_opencode_go_credential(&oversized.path).err(),
            Some(OpenCodeGoAuthError::Oversized)
        );
    }
}
