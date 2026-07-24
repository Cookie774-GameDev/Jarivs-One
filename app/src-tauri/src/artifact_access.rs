use std::path::PathBuf;

fn validated_artifact_path(value: &str) -> Result<PathBuf, String> {
    if value.is_empty()
        || value.trim() != value
        || value
            .chars()
            .any(|character| character == '\0' || character == '\r' || character == '\n')
    {
        return Err("Artifact path is malformed.".to_string());
    }

    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err("Artifact path must be absolute.".to_string());
    }

    let metadata =
        std::fs::metadata(&path).map_err(|_| "Artifact path is unavailable.".to_string())?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("Artifact path is not openable.".to_string());
    }

    Ok(path)
}

#[tauri::command]
pub fn open_jarvis_artifact_path(path: String) -> Result<(), String> {
    let path = validated_artifact_path(&path)?;
    open::that_detached(path).map_err(|_| "Artifact could not be opened.".to_string())
}

#[cfg(test)]
mod tests {
    use super::validated_artifact_path;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn accepts_only_existing_absolute_paths() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should follow unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("vibespace-artifact-{unique}.txt"));
        fs::write(&path, b"verified output").expect("fixture should be writable");

        assert_eq!(
            validated_artifact_path(path.to_string_lossy().as_ref())
                .expect("absolute existing path should pass"),
            path
        );

        fs::remove_file(path).expect("fixture should be removable");
    }

    #[test]
    fn rejects_relative_missing_and_control_character_paths() {
        let missing = std::env::temp_dir().join("vibespace-output-that-does-not-exist.md");
        assert!(validated_artifact_path("relative/output.md").is_err());
        assert!(validated_artifact_path(missing.to_string_lossy().as_ref()).is_err());
        assert!(validated_artifact_path("C:\\output\r\nforged.md").is_err());
    }
}
