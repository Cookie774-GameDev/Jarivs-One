//! Isolated Chromium/Edge process for Vibe Browser (CDP on loopback only).
//! Never attaches to the user's everyday Chrome/Edge profile.

use std::fs;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::Manager;

use crate::static_server::CommandError;

type CmdResult<T> = Result<T, CommandError>;

#[derive(Debug, Clone, Serialize)]
pub struct BrowserInstall {
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BrowserRuntimeStatus {
    pub running: bool,
    pub executable: Option<String>,
    pub profile_dir: Option<String>,
    pub cdp_port: Option<u16>,
    pub cdp_ws_url: Option<String>,
    pub session_id: Option<String>,
    pub last_error: Option<String>,
    pub installations: Vec<BrowserInstall>,
}

struct Runtime {
    child: Child,
    executable: String,
    profile_dir: PathBuf,
    cdp_port: u16,
    session_id: String,
    cdp_ws_url: Option<String>,
    last_error: Option<String>,
}

static RUNTIME: Mutex<Option<Runtime>> = Mutex::new(None);

fn err(code: &str, message: impl Into<String>, recoverable: bool) -> CommandError {
    CommandError {
        code: code.to_string(),
        message: message.into(),
        recoverable,
    }
}

fn pick_free_port() -> CmdResult<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| err("port_unavailable", e.to_string(), true))?;
    Ok(listener
        .local_addr()
        .map_err(|e| err("port_unavailable", e.to_string(), true))?
        .port())
}

fn exists_file(path: &str) -> bool {
    PathBuf::from(path).is_file()
}

/// Detect Edge first, then Chrome, on Windows; common paths on other platforms.
pub fn detect_installations() -> Vec<BrowserInstall> {
    let mut out = Vec::new();
    let candidates: &[(&str, &str, &str)] = &[
        (
            "Microsoft Edge",
            "edge",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        ),
        (
            "Microsoft Edge",
            "edge",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ),
        (
            "Google Chrome",
            "chrome",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        ),
        (
            "Google Chrome",
            "chrome",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ),
        (
            "Google Chrome",
            "chrome",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
        (
            "Microsoft Edge",
            "edge",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ),
        ("Google Chrome", "chrome", "/usr/bin/google-chrome"),
        ("Google Chrome", "chrome", "/usr/bin/google-chrome-stable"),
        ("Chromium", "chrome", "/usr/bin/chromium"),
        ("Chromium", "chrome", "/usr/bin/chromium-browser"),
    ];
    for (name, kind, path) in candidates {
        if exists_file(path) {
            out.push(BrowserInstall {
                name: (*name).into(),
                path: (*path).into(),
                kind: (*kind).into(),
            });
        }
    }
    out
}

fn profile_root(app: &tauri::AppHandle) -> CmdResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| err("profile_path", e.to_string(), true))?
        .join("browser")
        .join("profiles")
        .join("default");
    fs::create_dir_all(&dir).map_err(|e| err("profile_path", e.to_string(), true))?;
    Ok(dir)
}

fn wait_for_cdp(port: u16, timeout: Duration) -> Option<String> {
    let start = Instant::now();
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(400))
        .build()
        .ok()?;
    let url = format!("http://127.0.0.1:{port}/json/version");
    while start.elapsed() < timeout {
        if let Ok(res) = client.get(&url).send() {
            if let Ok(body) = res.json::<serde_json::Value>() {
                if let Some(ws) = body.get("webSocketDebuggerUrl").and_then(|v| v.as_str()) {
                    return Some(ws.to_string());
                }
            }
        }
        std::thread::sleep(Duration::from_millis(120));
    }
    None
}

#[tauri::command]
pub fn browser_detect_installations() -> Vec<BrowserInstall> {
    detect_installations()
}

#[tauri::command]
pub fn browser_status(app: tauri::AppHandle) -> BrowserRuntimeStatus {
    let installs = detect_installations();
    let mut guard = RUNTIME.lock().unwrap();
    if let Some(rt) = guard.as_mut() {
        // Reap exited process
        if let Ok(Some(status)) = rt.child.try_wait() {
            rt.last_error = Some(format!("Browser process exited: {status}"));
            let err = rt.last_error.clone();
            *guard = None;
            return BrowserRuntimeStatus {
                running: false,
                executable: None,
                profile_dir: None,
                cdp_port: None,
                cdp_ws_url: None,
                session_id: None,
                last_error: err,
                installations: installs,
            };
        }
        return BrowserRuntimeStatus {
            running: true,
            executable: Some(rt.executable.clone()),
            profile_dir: Some(rt.profile_dir.display().to_string()),
            cdp_port: Some(rt.cdp_port),
            cdp_ws_url: rt.cdp_ws_url.clone(),
            session_id: Some(rt.session_id.clone()),
            last_error: rt.last_error.clone(),
            installations: installs,
        };
    }
    BrowserRuntimeStatus {
        running: false,
        executable: None,
        profile_dir: profile_root(&app).ok().map(|p| p.display().to_string()),
        cdp_port: None,
        cdp_ws_url: None,
        session_id: None,
        last_error: None,
        installations: installs,
    }
}

#[tauri::command]
pub fn browser_start(
    app: tauri::AppHandle,
    executable: Option<String>,
) -> CmdResult<BrowserRuntimeStatus> {
    {
        let guard = RUNTIME.lock().unwrap();
        if guard.is_some() {
            drop(guard);
            return Ok(browser_status(app));
        }
    }

    let installs = detect_installations();
    let exe = executable
        .filter(|p| exists_file(p))
        .or_else(|| installs.first().map(|i| i.path.clone()))
        .ok_or_else(|| {
            err(
                "browser_missing",
                "Neither Microsoft Edge nor Google Chrome was found. Install one or set a custom path in Settings.",
                true,
            )
        })?;

    let profile = profile_root(&app)?;
    let port = pick_free_port()?;
    let session_id = format!("vs-{}", nanoid::nanoid!(10));

    // Headless=new still supports CDP; we use a real window off-screen-ish for reliability on Windows.
    // Isolated profile only — never the user default.
    let mut cmd = Command::new(&exe);
    cmd.args([
        &format!("--remote-debugging-port={port}"),
        "--remote-debugging-address=127.0.0.1",
        &format!("--user-data-dir={}", profile.display()),
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--disable-background-networking",
        "--disable-features=Translate,MediaRouter",
        "--window-size=1280,800",
        &format!("--vibespace-session={session_id}"),
        "about:blank",
    ]);
    // Hide console window flash on Windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let child = cmd.spawn().map_err(|e| {
        err(
            "browser_start_failed",
            format!("Failed to launch browser: {e}"),
            true,
        )
    })?;

    let ws = wait_for_cdp(port, Duration::from_secs(8));
    if ws.is_none() {
        // Leave process if still starting; surface recoverable error
        *RUNTIME.lock().unwrap() = Some(Runtime {
            child,
            executable: exe.clone(),
            profile_dir: profile.clone(),
            cdp_port: port,
            session_id: session_id.clone(),
            cdp_ws_url: None,
            last_error: Some("CDP endpoint did not become ready in time.".into()),
        });
        return Err(err(
            "cdp_timeout",
            "Browser launched but CDP did not become ready. Retry Start.",
            true,
        ));
    }

    *RUNTIME.lock().unwrap() = Some(Runtime {
        child,
        executable: exe,
        profile_dir: profile,
        cdp_port: port,
        session_id,
        cdp_ws_url: ws,
        last_error: None,
    });

    Ok(browser_status(app))
}

#[tauri::command]
pub fn browser_stop() -> CmdResult<bool> {
    let mut guard = RUNTIME.lock().unwrap();
    if let Some(mut rt) = guard.take() {
        let _ = rt.child.kill();
        let _ = rt.child.wait();
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub fn browser_clear_profile(app: tauri::AppHandle) -> CmdResult<bool> {
    let _ = browser_stop();
    let dir = profile_root(&app)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| err("clear_failed", e.to_string(), true))?;
        fs::create_dir_all(&dir).map_err(|e| err("clear_failed", e.to_string(), true))?;
    }
    Ok(true)
}

#[tauri::command]
pub fn browser_open_downloads_folder(app: tauri::AppHandle) -> CmdResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| err("path_failed", e.to_string(), true))?
        .join("browser")
        .join("downloads");
    fs::create_dir_all(&dir).map_err(|e| err("path_failed", e.to_string(), true))?;
    Ok(dir.display().to_string())
}
