#[path = "../src/storage_doctor.rs"]
mod storage_doctor;

use std::{fs, path::Path};
use storage_doctor::{process_pending_at_root, PreWebviewRepairOutcome};

fn sandbox(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "vibespace-storage-doctor-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    root
}

fn request(root: &Path, operation: &str, backup_id: Option<&str>) {
    let doctor = root.join("doctor");
    fs::create_dir_all(&doctor).unwrap();
    let backup = backup_id
        .map(|value| format!(r#",\"backupId\":\"{value}\""#).replace("\\\"", "\""))
        .unwrap_or_default();
    fs::write(
        doctor.join("storage-repair-request-v1.json"),
        format!(
            r#"{{"version":1,"operation":"{operation}","databaseName":"jarvis-v1","origin":"http://localhost:5173","requestedAtMs":1777000000000,"confirmationToken":"00000000-0000-4000-8000-000000000000"{backup}}}"#
        ),
    )
    .unwrap();
}

fn origin_store(root: &Path) -> std::path::PathBuf {
    root.join("EBWebView")
        .join("Default")
        .join("IndexedDB")
        .join("http_localhost_5173.indexeddb.leveldb")
}

#[test]
fn repair_backs_up_before_issuing_a_renderer_receipt() {
    let root = sandbox("backup");
    let origin = origin_store(&root);
    fs::create_dir_all(&origin).unwrap();
    fs::write(origin.join("000005.ldb"), b"saved chat bytes").unwrap();
    request(&root, "repair", None);

    let outcome = process_pending_at_root(&root, 1_777_000_000_100).unwrap();
    let PreWebviewRepairOutcome::RepairReady { backup_id, .. } = outcome else {
        panic!("repair receipt not produced");
    };

    assert_eq!(
        fs::read(origin.join("000005.ldb")).unwrap(),
        b"saved chat bytes"
    );
    assert_eq!(
        fs::read(
            root.join("doctor")
                .join("backups")
                .join(&backup_id)
                .join("origin-indexeddb")
                .join("000005.ldb")
        )
        .unwrap(),
        b"saved chat bytes"
    );
    assert!(root
        .join("doctor")
        .join("storage-repair-ready-v1.json")
        .is_file());
    assert!(!root
        .join("doctor")
        .join("storage-repair-request-v1.json")
        .exists());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn failed_backup_preserves_the_original_and_request() {
    let root = sandbox("preserve");
    let origin = origin_store(&root);
    fs::create_dir_all(&origin).unwrap();
    fs::write(origin.join("CURRENT"), b"original").unwrap();
    request(&root, "repair", None);
    fs::create_dir_all(root.join("doctor").join("backups")).unwrap();
    fs::write(
        root.join("doctor")
            .join("backups")
            .join("1777000000000-00000000-0000-4000-8000-000000000000"),
        b"collision",
    )
    .unwrap();

    assert!(process_pending_at_root(&root, 1_777_000_000_100).is_err());
    assert_eq!(fs::read(origin.join("CURRENT")).unwrap(), b"original");
    assert!(root
        .join("doctor")
        .join("storage-repair-request-v1.json")
        .is_file());
    assert!(!root
        .join("doctor")
        .join("storage-repair-ready-v1.json")
        .exists());
    let failure =
        fs::read_to_string(root.join("doctor").join("storage-repair-failed-v1.json")).unwrap();
    assert!(failure.contains("storage_repair_backup_exists"));
    assert!(!failure.contains("original"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn restore_validates_the_backup_and_preserves_a_pre_restore_copy() {
    let root = sandbox("restore");
    let origin = origin_store(&root);
    fs::create_dir_all(&origin).unwrap();
    fs::write(origin.join("CURRENT"), b"before repair").unwrap();
    request(&root, "repair", None);
    let first = process_pending_at_root(&root, 1_777_000_000_100).unwrap();
    let PreWebviewRepairOutcome::RepairReady { backup_id, .. } = first else {
        panic!("repair receipt not produced");
    };
    fs::remove_file(root.join("doctor").join("storage-repair-ready-v1.json")).unwrap();
    fs::write(origin.join("CURRENT"), b"after repair").unwrap();
    request(&root, "restore", Some(&backup_id));

    let restored = process_pending_at_root(&root, 1_777_000_000_200).unwrap();
    assert!(matches!(
        restored,
        PreWebviewRepairOutcome::RestoreApplied { .. }
    ));
    assert_eq!(fs::read(origin.join("CURRENT")).unwrap(), b"before repair");
    let backups = root.join("doctor").join("backups");
    assert!(fs::read_dir(backups)
        .unwrap()
        .filter_map(Result::ok)
        .any(|entry| entry
            .file_name()
            .to_string_lossy()
            .starts_with("pre-restore-")));
    let _ = fs::remove_dir_all(root);
}
