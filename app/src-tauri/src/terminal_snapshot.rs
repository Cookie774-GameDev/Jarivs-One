use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const SNAPSHOT_SCHEMA_VERSION: u8 = 1;
const SNAPSHOT_DIR: &str = "terminal-snapshots/v1";
const MAX_ID_CHARS: usize = 128;
const MAX_COMMAND_CHARS: usize = 4_096;

#[derive(Clone, Copy)]
struct RetentionLimits {
    max_snapshot_bytes: usize,
    generations_per_pane: usize,
    panes_per_project: usize,
    panes_global: usize,
    total_bytes: u64,
    max_age_ms: u64,
}

impl Default for RetentionLimits {
    fn default() -> Self {
        Self {
            max_snapshot_bytes: 512 * 1024,
            generations_per_pane: 2,
            panes_per_project: 10,
            panes_global: 50,
            total_bytes: 20 * 1024 * 1024,
            max_age_ms: 30 * 24 * 60 * 60 * 1_000,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSnapshot {
    pub schema_version: u8,
    pub project_id: Option<String>,
    pub pane_id: String,
    pub text: String,
    pub rows: u16,
    pub cols: u16,
    pub updated_at: u64,
    pub command: Option<String>,
    pub interactive: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredSnapshot {
    snapshot: TerminalSnapshot,
    checksum: String,
}

#[derive(Clone)]
struct Generation {
    path: PathBuf,
    snapshot: TerminalSnapshot,
    size: u64,
}

struct SnapshotStore {
    root: PathBuf,
    limits: RetentionLimits,
}

impl SnapshotStore {
    fn new(root: PathBuf) -> Self {
        Self {
            root,
            limits: RetentionLimits::default(),
        }
    }

    #[cfg(test)]
    fn with_limits(root: PathBuf, limits: RetentionLimits) -> Self {
        Self { root, limits }
    }

    fn validate(&self, snapshot: &TerminalSnapshot) -> Result<(), String> {
        if snapshot.schema_version != SNAPSHOT_SCHEMA_VERSION {
            return Err("unsupported_schema".into());
        }
        if snapshot.pane_id.is_empty() || snapshot.pane_id.chars().count() > MAX_ID_CHARS {
            return Err("invalid_pane_id".into());
        }
        if snapshot
            .project_id
            .as_ref()
            .is_some_and(|id| id.chars().count() > MAX_ID_CHARS)
        {
            return Err("invalid_project_id".into());
        }
        if snapshot.text.len() > self.limits.max_snapshot_bytes {
            return Err("snapshot_too_large".into());
        }
        if snapshot.command.as_ref().is_some_and(|command| {
            command.chars().count() > MAX_COMMAND_CHARS || command.chars().any(|ch| ch.is_control())
        }) {
            return Err("invalid_command".into());
        }
        if snapshot.rows == 0
            || snapshot.cols == 0
            || snapshot.rows > 1_000
            || snapshot.cols > 1_000
        {
            return Err("invalid_geometry".into());
        }
        if snapshot
            .text
            .chars()
            .any(|ch| ch == '\u{1b}' || (ch.is_control() && ch != '\n' && ch != '\t'))
        {
            return Err("invalid_text".into());
        }
        Ok(())
    }

    fn save(&self, snapshot: TerminalSnapshot) -> Result<(), String> {
        self.save_at(snapshot, now_ms())
    }

    fn save_at(&self, snapshot: TerminalSnapshot, now: u64) -> Result<(), String> {
        self.validate(&snapshot)?;
        fs::create_dir_all(&self.root).map_err(|_| "snapshot_io".to_string())?;

        let stored = StoredSnapshot {
            checksum: snapshot_checksum(&snapshot)?,
            snapshot: snapshot.clone(),
        };
        let bytes = serde_json::to_vec(&stored).map_err(|_| "snapshot_encode".to_string())?;
        let nonce = nanoid::nanoid!(10);
        let temp_path = self.root.join(format!(".tmp-{nonce}"));
        let final_path = self.root.join(format!(
            "terminal-{}-{}-{:020}-{nonce}.json",
            project_digest(snapshot.project_id.as_deref()),
            identity_digest(snapshot.project_id.as_deref(), &snapshot.pane_id),
            snapshot.updated_at,
        ));

        let write_result = (|| -> Result<(), String> {
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temp_path)
                .map_err(|_| "snapshot_io".to_string())?;
            file.write_all(&bytes)
                .map_err(|_| "snapshot_io".to_string())?;
            file.sync_all().map_err(|_| "snapshot_io".to_string())?;
            fs::rename(&temp_path, &final_path).map_err(|_| "snapshot_io".to_string())?;
            Ok(())
        })();
        if write_result.is_err() {
            let _ = fs::remove_file(&temp_path);
            return write_result;
        }
        self.prune_at(now)
    }

    fn load(
        &self,
        project_id: Option<&str>,
        pane_id: &str,
    ) -> Result<Option<TerminalSnapshot>, String> {
        validate_identity(project_id, pane_id)?;
        let mut generations = self
            .generation_paths(project_id, pane_id)?
            .into_iter()
            .filter_map(|path| read_generation(&path))
            .collect::<Vec<_>>();
        generations.sort_by(|a, b| b.snapshot.updated_at.cmp(&a.snapshot.updated_at));
        Ok(generations.into_iter().find_map(|generation| {
            (generation.snapshot.project_id.as_deref() == project_id
                && generation.snapshot.pane_id == pane_id
                && self.validate(&generation.snapshot).is_ok())
            .then_some(generation.snapshot)
        }))
    }

    fn delete(&self, project_id: Option<&str>, pane_id: &str) -> Result<(), String> {
        validate_identity(project_id, pane_id)?;
        let prefix = format!(
            "terminal-{}-{}-",
            project_digest(project_id),
            identity_digest(project_id, pane_id)
        );
        self.remove_matching(&prefix)
    }

    fn delete_project(&self, project_id: Option<&str>) -> Result<(), String> {
        if project_id.is_some_and(|id| id.chars().count() > MAX_ID_CHARS) {
            return Err("invalid_project_id".into());
        }
        let prefix = format!("terminal-{}-", project_digest(project_id));
        self.remove_matching(&prefix)
    }

    fn remove_matching(&self, prefix: &str) -> Result<(), String> {
        if !self.root.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(&self.root).map_err(|_| "snapshot_io".to_string())? {
            let entry = entry.map_err(|_| "snapshot_io".to_string())?;
            let name = entry.file_name();
            if name.to_string_lossy().starts_with(prefix) {
                remove_file(&entry.path())?;
            }
        }
        Ok(())
    }

    fn generation_paths(
        &self,
        project_id: Option<&str>,
        pane_id: &str,
    ) -> Result<Vec<PathBuf>, String> {
        validate_identity(project_id, pane_id)?;
        if !self.root.exists() {
            return Ok(Vec::new());
        }
        let prefix = format!(
            "terminal-{}-{}-",
            project_digest(project_id),
            identity_digest(project_id, pane_id)
        );
        let mut paths = fs::read_dir(&self.root)
            .map_err(|_| "snapshot_io".to_string())?
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                (name.starts_with(&prefix) && name.ends_with(".json")).then_some(entry.path())
            })
            .collect::<Vec<_>>();
        paths.sort();
        Ok(paths)
    }

    fn prune_at(&self, now: u64) -> Result<(), String> {
        if !self.root.exists() {
            return Ok(());
        }
        let mut generations = Vec::new();
        for entry in fs::read_dir(&self.root).map_err(|_| "snapshot_io".to_string())? {
            let entry = entry.map_err(|_| "snapshot_io".to_string())?;
            let path = entry.path();
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with(".tmp-") {
                remove_file(&path)?;
                continue;
            }
            if !name.starts_with("terminal-") || !name.ends_with(".json") {
                continue;
            }
            match read_generation(&path) {
                Some(generation) => {
                    if now.saturating_sub(generation.snapshot.updated_at) > self.limits.max_age_ms {
                        remove_file(&path)?;
                    } else {
                        generations.push(generation);
                    }
                }
                None => remove_file(&path)?,
            }
        }

        let mut by_pane: HashMap<String, Vec<Generation>> = HashMap::new();
        for generation in generations {
            by_pane
                .entry(identity_digest(
                    generation.snapshot.project_id.as_deref(),
                    &generation.snapshot.pane_id,
                ))
                .or_default()
                .push(generation);
        }
        for pane_generations in by_pane.values_mut() {
            pane_generations.sort_by(|a, b| b.snapshot.updated_at.cmp(&a.snapshot.updated_at));
            for old in pane_generations
                .drain(self.limits.generations_per_pane.min(pane_generations.len())..)
            {
                remove_file(&old.path)?;
            }
        }

        let mut pane_latest = by_pane
            .iter()
            .filter_map(|(identity, items)| {
                items.first().map(|item| {
                    (
                        identity.clone(),
                        project_digest(item.snapshot.project_id.as_deref()),
                        item.snapshot.updated_at,
                    )
                })
            })
            .collect::<Vec<_>>();

        let mut retained = HashSet::new();
        let mut by_project: HashMap<String, Vec<(String, u64)>> = HashMap::new();
        for (identity, project, updated_at) in pane_latest.drain(..) {
            by_project
                .entry(project)
                .or_default()
                .push((identity, updated_at));
        }
        for panes in by_project.values_mut() {
            panes.sort_by(|a, b| b.1.cmp(&a.1));
            retained.extend(
                panes
                    .iter()
                    .take(self.limits.panes_per_project)
                    .map(|(identity, _)| identity.clone()),
            );
        }

        let mut globally_ranked = retained
            .iter()
            .filter_map(|identity| {
                by_pane
                    .get(identity)
                    .and_then(|items| items.first())
                    .map(|item| (identity.clone(), item.snapshot.updated_at))
            })
            .collect::<Vec<_>>();
        globally_ranked.sort_by(|a, b| b.1.cmp(&a.1));
        let globally_retained = globally_ranked
            .into_iter()
            .take(self.limits.panes_global)
            .map(|(identity, _)| identity)
            .collect::<HashSet<_>>();

        let mut remaining = Vec::new();
        for (identity, items) in by_pane {
            if globally_retained.contains(&identity) {
                remaining.extend(items);
            } else {
                for item in items {
                    remove_file(&item.path)?;
                }
            }
        }

        remaining.sort_by(|a, b| a.snapshot.updated_at.cmp(&b.snapshot.updated_at));
        let mut total = remaining.iter().map(|item| item.size).sum::<u64>();
        for item in remaining {
            if total <= self.limits.total_bytes {
                break;
            }
            remove_file(&item.path)?;
            total = total.saturating_sub(item.size);
        }
        Ok(())
    }
}

fn validate_identity(project_id: Option<&str>, pane_id: &str) -> Result<(), String> {
    if pane_id.is_empty() || pane_id.chars().count() > MAX_ID_CHARS {
        return Err("invalid_pane_id".into());
    }
    if project_id.is_some_and(|id| id.chars().count() > MAX_ID_CHARS) {
        return Err("invalid_project_id".into());
    }
    Ok(())
}

fn digest(value: &[u8]) -> String {
    let hash = Sha256::digest(value);
    hash.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn project_digest(project_id: Option<&str>) -> String {
    digest(project_id.unwrap_or("__no_project__").as_bytes())
}

fn identity_digest(project_id: Option<&str>, pane_id: &str) -> String {
    digest(format!("{}\0{pane_id}", project_id.unwrap_or("__no_project__")).as_bytes())
}

fn snapshot_checksum(snapshot: &TerminalSnapshot) -> Result<String, String> {
    serde_json::to_vec(snapshot)
        .map(|bytes| digest(&bytes))
        .map_err(|_| "snapshot_encode".to_string())
}

fn read_generation(path: &Path) -> Option<Generation> {
    let bytes = fs::read(path).ok()?;
    let stored = serde_json::from_slice::<StoredSnapshot>(&bytes).ok()?;
    if snapshot_checksum(&stored.snapshot).ok()? != stored.checksum {
        return None;
    }
    Some(Generation {
        path: path.to_path_buf(),
        snapshot: stored.snapshot,
        size: bytes.len() as u64,
    })
}

fn remove_file(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("snapshot_io".into()),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn snapshot_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(SNAPSHOT_DIR))
        .map_err(|_| "snapshot_path".to_string())
}

#[tauri::command]
pub async fn terminal_snapshot_save(
    app: AppHandle,
    snapshot: TerminalSnapshot,
) -> Result<(), String> {
    let store = SnapshotStore::new(snapshot_root(&app)?);
    tauri::async_runtime::spawn_blocking(move || store.save(snapshot))
        .await
        .map_err(|_| "snapshot_task".to_string())?
}

#[tauri::command]
pub async fn terminal_snapshot_load(
    app: AppHandle,
    project_id: Option<String>,
    pane_id: String,
) -> Result<Option<TerminalSnapshot>, String> {
    let store = SnapshotStore::new(snapshot_root(&app)?);
    tauri::async_runtime::spawn_blocking(move || store.load(project_id.as_deref(), &pane_id))
        .await
        .map_err(|_| "snapshot_task".to_string())?
}

#[tauri::command]
pub async fn terminal_snapshot_delete(
    app: AppHandle,
    project_id: Option<String>,
    pane_id: String,
) -> Result<(), String> {
    let store = SnapshotStore::new(snapshot_root(&app)?);
    tauri::async_runtime::spawn_blocking(move || store.delete(project_id.as_deref(), &pane_id))
        .await
        .map_err(|_| "snapshot_task".to_string())?
}

#[tauri::command]
pub async fn terminal_snapshot_delete_project(
    app: AppHandle,
    project_id: Option<String>,
) -> Result<(), String> {
    let store = SnapshotStore::new(snapshot_root(&app)?);
    tauri::async_runtime::spawn_blocking(move || store.delete_project(project_id.as_deref()))
        .await
        .map_err(|_| "snapshot_task".to_string())?
}

#[derive(Default)]
pub struct PersistenceFlushState {
    pending: AtomicBool,
    completed: AtomicBool,
}

impl PersistenceFlushState {
    pub fn begin(&self) {
        self.completed.store(false, Ordering::Release);
        self.pending.store(true, Ordering::Release);
    }

    pub fn is_pending(&self) -> bool {
        self.pending.load(Ordering::Acquire) && !self.is_completed()
    }

    pub fn is_completed(&self) -> bool {
        self.completed.load(Ordering::Acquire)
    }

    pub fn complete(&self) {
        self.completed.store(true, Ordering::Release);
        self.pending.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub fn persistence_flush_complete(state: State<'_, PersistenceFlushState>) {
    state.complete();
}

#[cfg(test)]
mod tests {
    use super::{PersistenceFlushState, RetentionLimits, SnapshotStore, TerminalSnapshot};
    use std::{fs, path::PathBuf};

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "vibespace-terminal-snapshot-{name}-{}",
            nanoid::nanoid!(10)
        ));
        fs::create_dir_all(&root).expect("create temp root");
        root
    }

    fn snapshot(project: &str, pane: &str, text: &str, updated_at: u64) -> TerminalSnapshot {
        TerminalSnapshot {
            schema_version: 1,
            project_id: Some(project.to_string()),
            pane_id: pane.to_string(),
            text: text.to_string(),
            rows: 30,
            cols: 100,
            updated_at,
            command: Some("pwsh.exe".to_string()),
            interactive: false,
        }
    }

    #[test]
    fn flush_state_coalesces_pending_exit_and_can_complete() {
        let state = PersistenceFlushState::default();
        assert!(!state.is_pending());
        assert!(!state.is_completed());
        state.begin();
        assert!(state.is_pending());
        assert!(!state.is_completed());
        state.complete();
        assert!(!state.is_pending());
        assert!(state.is_completed());
    }

    fn test_limits() -> RetentionLimits {
        RetentionLimits {
            max_snapshot_bytes: 1_024,
            generations_per_pane: 2,
            panes_per_project: 2,
            panes_global: 3,
            total_bytes: 16 * 1_024,
            max_age_ms: 1_000,
        }
    }

    #[test]
    fn validates_bounds_and_control_sequences() {
        let root = temp_root("validation");
        let store = SnapshotStore::with_limits(root.clone(), test_limits());
        let mut invalid = snapshot("project", "pane", "ok\x1b[31m", 10_000);
        assert_eq!(
            store.save_at(invalid.clone(), 10_000),
            Err("invalid_text".into())
        );
        invalid.text = "x".repeat(1_025);
        assert_eq!(
            store.save_at(invalid, 10_000),
            Err("snapshot_too_large".into())
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn saves_with_hashed_names_and_loads_without_exposing_identifiers() {
        let root = temp_root("hashed");
        let store = SnapshotStore::with_limits(root.clone(), test_limits());
        store
            .save_at(
                snapshot("../private-project", "..\\pane", "saved", 10_000),
                10_000,
            )
            .expect("save");
        let loaded = store
            .load(Some("../private-project"), "..\\pane")
            .expect("load")
            .expect("snapshot");
        assert_eq!(loaded.text, "saved");
        let names = fs::read_dir(&root)
            .expect("read root")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();
        assert!(names
            .iter()
            .all(|name| !name.contains("private-project") && !name.contains("pane")));
        assert!(fs::canonicalize(&root)
            .expect("canonical root")
            .starts_with(fs::canonicalize(std::env::temp_dir()).expect("canonical temp")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn falls_back_when_the_newest_generation_is_corrupt() {
        let root = temp_root("fallback");
        let store = SnapshotStore::with_limits(root.clone(), test_limits());
        store
            .save_at(snapshot("p", "a", "old", 10_000), 10_000)
            .expect("old");
        store
            .save_at(snapshot("p", "a", "new", 10_001), 10_001)
            .expect("new");
        let newest = store
            .generation_paths(Some("p"), "a")
            .expect("paths")
            .into_iter()
            .max()
            .expect("newest");
        fs::write(newest, b"{corrupt").expect("corrupt newest");
        assert_eq!(
            store
                .load(Some("p"), "a")
                .expect("load")
                .expect("fallback")
                .text,
            "old"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn retains_two_generations_per_pane() {
        let root = temp_root("generations");
        let store = SnapshotStore::with_limits(root.clone(), test_limits());
        for generation in 0..4 {
            store
                .save_at(
                    snapshot("p", "a", &format!("v{generation}"), 10_000 + generation),
                    10_000 + generation,
                )
                .expect("save generation");
        }
        assert_eq!(
            store.generation_paths(Some("p"), "a").expect("paths").len(),
            2
        );
        assert_eq!(
            store
                .load(Some("p"), "a")
                .expect("load")
                .expect("latest")
                .text,
            "v3"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn prunes_old_and_excess_panes() {
        let root = temp_root("retention");
        let store = SnapshotStore::with_limits(root.clone(), test_limits());
        store
            .save_at(snapshot("p", "old", "old", 8_000), 10_000)
            .expect("old");
        store
            .save_at(snapshot("p", "a", "a", 10_000), 10_000)
            .expect("a");
        store
            .save_at(snapshot("p", "b", "b", 10_001), 10_001)
            .expect("b");
        store
            .save_at(snapshot("p", "c", "c", 10_002), 10_002)
            .expect("c");
        assert!(store.load(Some("p"), "old").expect("load old").is_none());
        assert!(store.load(Some("p"), "a").expect("load a").is_none());
        assert!(store.load(Some("p"), "b").expect("load b").is_some());
        assert!(store.load(Some("p"), "c").expect("load c").is_some());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn deletes_one_pane_or_an_entire_project() {
        let root = temp_root("delete");
        let store = SnapshotStore::with_limits(root.clone(), test_limits());
        store
            .save_at(snapshot("p1", "a", "a", 10_000), 10_000)
            .expect("a");
        store
            .save_at(snapshot("p1", "b", "b", 10_001), 10_001)
            .expect("b");
        store
            .save_at(snapshot("p2", "c", "c", 10_002), 10_002)
            .expect("c");
        store.delete(Some("p1"), "a").expect("delete pane");
        assert!(store.load(Some("p1"), "a").expect("load a").is_none());
        assert!(store.load(Some("p1"), "b").expect("load b").is_some());
        store.delete_project(Some("p1")).expect("delete project");
        assert!(store.load(Some("p1"), "b").expect("load p1").is_none());
        assert!(store.load(Some("p2"), "c").expect("load p2").is_some());
        let _ = fs::remove_dir_all(root);
    }
}
