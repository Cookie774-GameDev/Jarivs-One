//! `fs_read_text` — small, narrowly-scoped command for reading user-
//! authored text files into the WebView.
//!
//! Why a custom command instead of `tauri-plugin-fs`:
//! the plugin is general-purpose and brings its own scope/permission
//! ceremony. We only need a single read path with a hard size cap
//! and a UTF-8 guarantee, so a 30-line command is cleaner than wiring
//! the whole plugin + its capability graph.
//!
//! Surface area:
//!   - Caller passes an absolute path.
//!   - The command rejects relative paths, non-files, files larger
//!     than `MAX_FILE_BYTES`, and non-UTF8 content.
//!   - Returns a `String` on success or a string error code on failure.
//!
//! Used by:
//!   - The "Connected files" pop-out in the terminals page chrome:
//!     when the user pins files to a pane, the AI runtime reads them
//!     here and prepends an excerpt to the agent's system prompt.
//!
//! Invariants (intentional):
//!   - This command is read-only. No write counterpart yet — the AI
//!     workflow doesn't need one and the safest privilege is "only
//!     what's used."
//!   - No globbing — keep the surface tight.
//!   - The size cap (100 MiB) is high enough for large project files,
//!     while prompt callers use `fs_read_text_sample` so huge logs do
//!     not get copied wholesale into the WebView heap.

use base64::Engine;
use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Hard ceiling on a single file. Anything bigger is rejected with
/// `too_large` so callers don't accidentally force a multi-GB read
/// into the WebView heap. Prompt callers should prefer
/// `fs_read_text_sample` and then apply their own token budget.
const MAX_FILE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_WRITE_BYTES: usize = 1024 * 1024;
const MAX_DIR_ENTRIES: usize = 500;
const MAX_SAMPLE_BYTES: u64 = 512 * 1024;
const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub created_ms: Option<u128>,
    pub modified_ms: Option<u128>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsImageData {
    pub data: String,
    pub mime_type: String,
    pub size: u64,
}

fn require_absolute(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err("not_absolute".to_string());
    }
    Ok(p)
}

fn canonical_root(root: Option<&str>) -> Result<Option<PathBuf>, String> {
    let Some(root) = root.filter(|value| !value.trim().is_empty()) else {
        return Ok(None);
    };
    let root_path = require_absolute(root)?;
    let canonical = std::fs::canonicalize(&root_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "root_not_found".to_string()
        } else {
            format!("io: {}", e)
        }
    })?;
    if !canonical.is_dir() {
        return Err("root_not_dir".to_string());
    }
    Ok(Some(canonical))
}

fn ensure_inside_root(path: &Path, root: Option<&PathBuf>) -> Result<(), String> {
    if let Some(root) = root {
        if !path.starts_with(root) {
            return Err("outside_root".to_string());
        }
    }
    Ok(())
}

fn existing_path(path: &str, root: Option<&str>) -> Result<PathBuf, String> {
    let p = require_absolute(path)?;
    let root = canonical_root(root)?;
    let canonical = std::fs::canonicalize(&p).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "not_found".to_string()
        } else {
            format!("io: {}", e)
        }
    })?;
    ensure_inside_root(&canonical, root.as_ref())?;
    Ok(canonical)
}

fn writable_path(path: &str, root: Option<&str>) -> Result<PathBuf, String> {
    let p = require_absolute(path)?;
    let root = canonical_root(root)?;
    if p.exists() {
        let canonical = std::fs::canonicalize(&p).map_err(|e| format!("io: {}", e))?;
        ensure_inside_root(&canonical, root.as_ref())?;
        return Ok(canonical);
    }
    let parent = p.parent().ok_or_else(|| "parent_not_found".to_string())?;
    if !parent.exists() {
        return Err("parent_not_found".to_string());
    }
    let canonical_parent = std::fs::canonicalize(parent).map_err(|e| format!("io: {}", e))?;
    ensure_inside_root(&canonical_parent, root.as_ref())?;
    Ok(p)
}

/// Read a UTF-8 text file in full and return its contents.
///
/// Errors are returned as short stable strings so the JS side can
/// branch on them without parsing English. The list:
///
///   - `not_absolute` — path was relative.
///   - `not_found` — path doesn't exist.
///   - `not_a_file` — path exists but is not a regular file (e.g. directory).
///   - `too_large` — file exceeds `MAX_FILE_BYTES`.
///   - `not_utf8` — bytes are not valid UTF-8.
///   - `io: <message>` — anything else, prefixed for grep-ability.
#[tauri::command]
pub fn fs_read_text(path: String, root: Option<String>) -> Result<String, String> {
    let p = existing_path(&path, root.as_deref())?;
    let meta = match std::fs::metadata(&p) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err("not_found".to_string());
        }
        Err(e) => return Err(format!("io: {}", e)),
    };
    if !meta.is_file() {
        return Err("not_a_file".to_string());
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err("too_large".to_string());
    }
    let bytes = std::fs::read(&p).map_err(|e| format!("io: {}", e))?;
    String::from_utf8(bytes).map_err(|_| "not_utf8".to_string())
}

#[tauri::command]
pub fn fs_read_text_sample(path: String, max_bytes: Option<u64>, root: Option<String>) -> Result<String, String> {
    let p = existing_path(&path, root.as_deref())?;
    let meta = match std::fs::metadata(&p) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err("not_found".to_string());
        }
        Err(e) => return Err(format!("io: {}", e)),
    };
    if !meta.is_file() {
        return Err("not_a_file".to_string());
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err("too_large".to_string());
    }
    let limit = max_bytes.unwrap_or(MAX_SAMPLE_BYTES).clamp(1, MAX_SAMPLE_BYTES);
    let mut file = std::fs::File::open(&p).map_err(|e| format!("io: {}", e))?;
    let mut bytes = Vec::with_capacity(limit as usize);
    file.by_ref()
        .take(limit)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("io: {}", e))?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn image_mime_for_path(path: &std::path::Path) -> Option<&'static str> {
    match path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_ascii_lowercase()) {
        Some(ext) if ext == "png" => Some("image/png"),
        Some(ext) if ext == "jpg" || ext == "jpeg" => Some("image/jpeg"),
        Some(ext) if ext == "webp" => Some("image/webp"),
        Some(ext) if ext == "gif" => Some("image/gif"),
        _ => None,
    }
}

#[tauri::command]
pub fn fs_read_image_base64(path: String, root: Option<String>) -> Result<FsImageData, String> {
    let p = existing_path(&path, root.as_deref())?;
    let mime_type = image_mime_for_path(&p)
        .ok_or_else(|| "unsupported_type".to_string())?
        .to_string();
    let meta = match std::fs::metadata(&p) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err("not_found".to_string());
        }
        Err(e) => return Err(format!("io: {}", e)),
    };
    if !meta.is_file() {
        return Err("not_a_file".to_string());
    }
    if meta.len() > MAX_IMAGE_BYTES {
        return Err("too_large".to_string());
    }
    let bytes = std::fs::read(&p).map_err(|e| format!("io: {}", e))?;
    Ok(FsImageData {
        data: base64::engine::general_purpose::STANDARD.encode(bytes),
        mime_type,
        size: meta.len(),
    })
}

#[tauri::command]
pub fn fs_list_dir(path: String, root: Option<String>) -> Result<Vec<FsEntry>, String> {
    let p = existing_path(&path, root.as_deref())?;
    let meta = match std::fs::metadata(&p) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err("not_found".to_string());
        }
        Err(e) => return Err(format!("io: {}", e)),
    };
    if !meta.is_dir() {
        return Err("not_a_dir".to_string());
    }

    let mut out = Vec::new();
    for entry in std::fs::read_dir(&p).map_err(|e| format!("io: {}", e))? {
        if out.len() >= MAX_DIR_ENTRIES {
            break;
        }
        let entry = entry.map_err(|e| format!("io: {}", e))?;
        let path = entry.path();
        let meta = entry.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let created_ms = meta
            .as_ref()
            .and_then(|m| m.created().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis());
        let modified_ms = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis());
        out.push(FsEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir,
            size: meta.as_ref().filter(|m| m.is_file()).map(|m| m.len()),
            created_ms,
            modified_ms,
        });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
pub fn fs_write_text(path: String, content: String, root: Option<String>) -> Result<(), String> {
    let p = writable_path(&path, root.as_deref())?;
    if content.len() > MAX_WRITE_BYTES {
        return Err("too_large".to_string());
    }
    std::fs::write(&p, content.as_bytes()).map_err(|e| format!("io: {}", e))
}

#[tauri::command]
pub fn fs_create_text_file(path: String, root: Option<String>) -> Result<(), String> {
    let p = writable_path(&path, root.as_deref())?;
    if p.exists() {
        return Err("already_exists".to_string());
    }
    std::fs::write(&p, b"").map_err(|e| format!("io: {}", e))
}

#[tauri::command]
pub fn fs_create_text_with_content(
    path: String,
    content: String,
    root: Option<String>,
) -> Result<(), String> {
    if content.len() > MAX_WRITE_BYTES {
        return Err("too_large".to_string());
    }
    let p = writable_path(&path, root.as_deref())?;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&p)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                "already_exists".to_string()
            } else {
                format!("io: {}", e)
            }
        })?;
    std::io::Write::write_all(&mut file, content.as_bytes())
        .map_err(|e| format!("io: {}", e))
}

#[tauri::command]
pub fn fs_create_dir_all(path: String, root: Option<String>) -> Result<(), String> {
    let p = require_absolute(&path)?;
    let canonical_root = canonical_root(root.as_deref())?;
    if p.exists() {
        let canonical = std::fs::canonicalize(&p).map_err(|e| format!("io: {}", e))?;
        ensure_inside_root(&canonical, canonical_root.as_ref())?;
        return if canonical.is_dir() {
            Ok(())
        } else {
            Err("not_a_dir".to_string())
        };
    }

    let mut existing_ancestor = p.parent().ok_or_else(|| "parent_not_found".to_string())?;
    while !existing_ancestor.exists() {
        existing_ancestor = existing_ancestor
            .parent()
            .ok_or_else(|| "parent_not_found".to_string())?;
    }
    let canonical_ancestor =
        std::fs::canonicalize(existing_ancestor).map_err(|e| format!("io: {}", e))?;
    ensure_inside_root(&canonical_ancestor, canonical_root.as_ref())?;
    std::fs::create_dir_all(&p).map_err(|e| format!("io: {}", e))?;
    let canonical = std::fs::canonicalize(&p).map_err(|e| format!("io: {}", e))?;
    ensure_inside_root(&canonical, canonical_root.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "vibespace-fsread-{}-{}-{}",
            label,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn creates_content_once_and_refuses_overwrite() {
        let root = test_root("create");
        std::fs::create_dir_all(&root).unwrap();
        let file = root.join("dogs.md");
        let root_text = root.to_string_lossy().to_string();
        let file_text = file.to_string_lossy().to_string();
        fs_create_text_with_content(
            file_text.clone(),
            "# Dogs".to_string(),
            Some(root_text.clone()),
        )
        .unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "# Dogs");
        assert_eq!(
            fs_create_text_with_content(file_text, "changed".to_string(), Some(root_text)),
            Err("already_exists".to_string())
        );
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "# Dogs");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn creates_nested_directory_inside_root_and_rejects_file_collision() {
        let root = test_root("dir");
        std::fs::create_dir_all(&root).unwrap();
        let nested = root.join("Projects").join("FarmLife");
        let root_text = root.to_string_lossy().to_string();
        fs_create_dir_all(nested.to_string_lossy().to_string(), Some(root_text.clone())).unwrap();
        assert!(nested.is_dir());
        let collision = root.join("Projects").join("not-a-folder");
        std::fs::write(&collision, b"file").unwrap();
        assert_eq!(
            fs_create_dir_all(collision.to_string_lossy().to_string(), Some(root_text)),
            Err("not_a_dir".to_string())
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
