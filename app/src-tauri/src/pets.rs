//! Pixel Pet windows: pet-overlay + pet-mini-panel lifecycle and geometry.
//! Least-privilege: only window show/hide/focus/position/size for pet labels.
//! Does not expose shell, unrestricted filesystem, or remote navigation.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub const PET_OVERLAY_LABEL: &str = "pet-overlay";
pub const PET_MINI_PANEL_LABEL: &str = "pet-mini-panel";

const OVERLAY_SIZE: u32 = 144;
const PANEL_DEFAULT_W: f64 = 430.0;
const PANEL_DEFAULT_H: f64 = 560.0;
const PANEL_MIN_W: f64 = 360.0;
const PANEL_MIN_H: f64 = 360.0;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PetGeometryState {
    pub overlay_x: Option<f64>,
    pub overlay_y: Option<f64>,
    pub overlay_monitor_name: Option<String>,
    pub panel_x: Option<f64>,
    pub panel_y: Option<f64>,
    pub panel_w: Option<f64>,
    pub panel_h: Option<f64>,
    pub panel_monitor_name: Option<String>,
}

#[derive(Default)]
pub struct PetWindowState {
    pub geometry: Mutex<PetGeometryState>,
    pub panel_open: Mutex<bool>,
}

fn geometry_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("pets").join("window-geometry.json"))
}

pub fn load_geometry(app: &AppHandle) -> PetGeometryState {
    if let Some(path) = geometry_path(app) {
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(g) = serde_json::from_slice::<PetGeometryState>(&bytes) {
                return g;
            }
        }
    }
    PetGeometryState::default()
}

pub fn save_geometry(app: &AppHandle, geo: &PetGeometryState) {
    if let Some(path) = geometry_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(bytes) = serde_json::to_vec_pretty(geo) {
            let _ = fs::write(path, bytes);
        }
    }
}

/// Clamp logical position into a monitor work area (approx via available monitors).
fn clamp_to_monitors(app: &AppHandle, x: f64, y: f64, w: f64, h: f64) -> (f64, f64) {
    let monitors = app.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        return (x.max(0.0), y.max(0.0));
    }
    // Prefer monitor containing point; else primary; else first.
    let mut chosen = monitors.first().cloned();
    for m in &monitors {
        let pos = m.position();
        let size = m.size();
        let mx = pos.x as f64;
        let my = pos.y as f64;
        let mw = size.width as f64;
        let mh = size.height as f64;
        if x >= mx && y >= my && x < mx + mw && y < my + mh {
            chosen = Some(m.clone());
            break;
        }
    }
    let m = match chosen.or_else(|| app.primary_monitor().ok().flatten()) {
        Some(m) => m,
        None => return (x.max(0.0), y.max(0.0)),
    };
    let pos = m.position();
    let size = m.size();
    let scale = m.scale_factor();
    // Work area approximation: leave ~40px bottom for taskbar in logical px.
    let taskbar = 40.0 * scale;
    let mx = pos.x as f64;
    let my = pos.y as f64;
    let mw = size.width as f64;
    let mh = size.height as f64 - taskbar;
    let cx = x.clamp(mx, (mx + mw - w).max(mx));
    let cy = y.clamp(my, (my + mh - h).max(my));
    (cx, cy)
}

/// When saved monitor is gone, fall back to primary top-right-ish.
fn recover_position(
    app: &AppHandle,
    saved_x: Option<f64>,
    saved_y: Option<f64>,
    w: f64,
    h: f64,
) -> (f64, f64) {
    if let (Some(x), Some(y)) = (saved_x, saved_y) {
        return clamp_to_monitors(app, x, y, w, h);
    }
    if let Ok(Some(primary)) = app.primary_monitor() {
        let pos = primary.position();
        let size = primary.size();
        let x = pos.x as f64 + size.width as f64 - w - 24.0;
        let y = pos.y as f64 + size.height as f64 - h - 80.0;
        return clamp_to_monitors(app, x, y, w, h);
    }
    (24.0, 120.0)
}

fn is_pet_label(label: &str) -> bool {
    label == PET_OVERLAY_LABEL || label == PET_MINI_PANEL_LABEL
}

/// Ensure the pet-overlay WebView paints a fully transparent chrome (Windows).
///
/// On Windows 8+, WebView2 treats any non-zero alpha as opaque 255 for the
/// webview layer — only alpha `0` yields a transparent clear. Pair this with
/// `transparent: true` + `--default-background-color=00000000` in conf.
fn ensure_pet_overlay_transparent(win: &tauri::WebviewWindow) {
    let _ = win.set_shadow(false);
    let _ = win.set_decorations(false);
    // Fully transparent clear (R,G,B,A) — A must be 0 on Windows WebView2.
    let _ = win.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
    // Keep the pet clickable/draggable (do not ignore cursor events).
    let _ = win.set_ignore_cursor_events(false);
}

fn pet_webview_url(app: &AppHandle, view: &str) -> Result<WebviewUrl, String> {
    #[cfg(debug_assertions)]
    if let Some(mut dev_url) = app.config().build.dev_url.clone() {
        dev_url.set_query(Some(&format!("view={view}")));
        return Ok(WebviewUrl::External(dev_url));
    }

    Ok(WebviewUrl::App(format!("index.html?view={view}").into()))
}

#[cfg(debug_assertions)]
fn log_pet_window_metrics(label: &str, win: &WebviewWindow) {
    let visible = win.is_visible().unwrap_or(false);
    let title = win.title().unwrap_or_else(|_| "<unknown>".to_string());
    let pos = win
        .outer_position()
        .map(|p| format!("{},{}", p.x, p.y))
        .unwrap_or_else(|e| format!("err:{e}"));
    let size = win
        .outer_size()
        .map(|s| format!("{}x{}", s.width, s.height))
        .unwrap_or_else(|e| format!("err:{e}"));
    eprintln!("[pets] {label}: title={title:?} visible={visible} pos={pos} size={size}");
}

fn get_or_create_pet_overlay(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(win) = app.get_webview_window(PET_OVERLAY_LABEL) {
        return Ok(win);
    }

    #[cfg(debug_assertions)]
    eprintln!("[pets] creating pet-overlay window");

    WebviewWindowBuilder::new(
        app,
        PET_OVERLAY_LABEL,
        pet_webview_url(app, "pet-overlay")?,
    )
    .title("VibeSpace Pet")
    .inner_size(OVERLAY_SIZE as f64, OVERLAY_SIZE as f64)
    .min_inner_size(OVERLAY_SIZE as f64, OVERLAY_SIZE as f64)
    .max_inner_size(OVERLAY_SIZE as f64, OVERLAY_SIZE as f64)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(true)
    .focused(false)
    .shadow(false)
    .background_color(tauri::window::Color(0, 0, 0, 0))
    .additional_browser_args(
        "--default-background-color=00000000 --disable-features=CalculateNativeWinOcclusion --autoplay-policy=no-user-gesture-required",
    )
    .build()
    .map_err(|e| format!("failed to create pet-overlay window: {e}"))
}

fn get_or_create_pet_panel(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(win) = app.get_webview_window(PET_MINI_PANEL_LABEL) {
        return Ok(win);
    }

    #[cfg(debug_assertions)]
    eprintln!("[pets] creating pet-mini-panel window");

    WebviewWindowBuilder::new(
        app,
        PET_MINI_PANEL_LABEL,
        pet_webview_url(app, "pet-mini-panel")?,
    )
    .title("VibeSpace Pet Panel")
    .inner_size(PANEL_DEFAULT_W, PANEL_DEFAULT_H)
    .min_inner_size(PANEL_MIN_W, PANEL_MIN_H)
    .resizable(true)
    .decorations(true)
    .transparent(false)
    .always_on_top(true)
    .skip_taskbar(false)
    .visible(false)
    .focused(false)
    .build()
    .map_err(|e| format!("failed to create pet-mini-panel window: {e}"))
}

/// Show the pet overlay (create visibility). Single instance by label.
#[tauri::command]
pub async fn pet_show_overlay(app: AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    eprintln!("[pets] pet_show_overlay invoked");

    let state = app.state::<PetWindowState>();
    let geo = state.geometry.lock().map_err(|e| e.to_string())?;
    let (x, y) = recover_position(
        &app,
        geo.overlay_x,
        geo.overlay_y,
        OVERLAY_SIZE as f64,
        OVERLAY_SIZE as f64,
    );
    drop(geo);

    let app_for_create = app.clone();
    app.run_on_main_thread(move || {
        if let Err(err) = get_or_create_pet_overlay(&app_for_create) {
            eprintln!("[pets] failed to create pet-overlay: {err}");
            return;
        }

        // Let the WebView creation message return to the event loop before
        // applying window operations. Calling set_position/show immediately
        // after build() can race WebView2 and produce "failed to receive
        // message from webview" on Windows.
        let app_for_show = app_for_create.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(80));
            let app_for_callback = app_for_show.clone();
            let _ = app_for_show.run_on_main_thread(move || {
                if let Err(err) = show_existing_pet_overlay(app_for_callback.clone(), x, y) {
                    eprintln!("[pets] failed to show pet-overlay: {err}");
                }
            });
        });
    })
    .map_err(|e| format!("failed to schedule pet-overlay creation: {e}"))?;

    Ok(())
}

fn show_existing_pet_overlay(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let win = app
        .get_webview_window(PET_OVERLAY_LABEL)
        .ok_or_else(|| "pet-overlay window missing after creation".to_string())?;
    let overlay_size = PhysicalSize::new(OVERLAY_SIZE, OVERLAY_SIZE);
    win.set_position(PhysicalPosition::new(x as i32, y as i32))
        .map_err(|e| format!("failed to position pet-overlay: {e}"))?;
    win.set_min_size(Some(overlay_size))
        .map_err(|e| format!("failed to set pet-overlay min size: {e}"))?;
    win.set_max_size(Some(overlay_size))
        .map_err(|e| format!("failed to set pet-overlay max size: {e}"))?;
    win.set_size(overlay_size)
        .map_err(|e| format!("failed to size pet-overlay: {e}"))?;
    win.set_always_on_top(true)
        .map_err(|e| format!("failed to set pet-overlay always-on-top: {e}"))?;
    ensure_pet_overlay_transparent(&win);
    win.show()
        .map_err(|e| format!("failed to show pet-overlay: {e}"))?;
    // Windows/WebView2 can report a tiny transparent host HWND on first show.
    // Re-assert the exact pet surface size after visibility is applied.
    win.set_size(overlay_size)
        .map_err(|e| format!("failed to confirm pet-overlay size: {e}"))?;
    #[cfg(debug_assertions)]
    log_pet_window_metrics("after pet_show_overlay", &win);
    Ok(())
}

/// Hide the pet overlay without destroying the webview (no duplicate on re-show).
#[tauri::command]
pub fn pet_hide_overlay(app: AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    eprintln!("[pets] pet_hide_overlay invoked");

    if let Some(win) = app.get_webview_window(PET_OVERLAY_LABEL) {
        let _ = win.hide();
    }
    Ok(())
}

/// Whether the pet overlay is currently visible.
#[tauri::command]
pub fn pet_is_overlay_visible(app: AppHandle) -> Result<bool, String> {
    Ok(app
        .get_webview_window(PET_OVERLAY_LABEL)
        .and_then(|win| win.is_visible().ok())
        .unwrap_or(false))
}

/// Move pet overlay to physical position (DPI-aware path via physical coords).
/// Always clamped so the sprite cannot be dragged fully off-screen.
#[tauri::command]
pub fn pet_set_overlay_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let Some(win) = app.get_webview_window(PET_OVERLAY_LABEL) else {
        return Ok(());
    };
    // Keep at least ~24px of the pet window on-screen (cannot disappear off edge).
    let (cx, cy) = clamp_to_monitors(&app, x, y, OVERLAY_SIZE as f64, OVERLAY_SIZE as f64);
    let _ = win.set_position(PhysicalPosition::new(cx as i32, cy as i32));
    if let Ok(mut geo) = app.state::<PetWindowState>().geometry.lock() {
        geo.overlay_x = Some(cx);
        geo.overlay_y = Some(cy);
        save_geometry(&app, &geo);
    }
    Ok(())
}

/// Open or focus the single pet-mini-panel instance near the pet.
///
/// Does **not** hide the pet-overlay. The frontend must call
/// `pet_hide_overlay` only after confirming the panel is visible
/// (`pet_is_panel_visible`), so a failed panel open cannot leave the
/// user with neither sprite nor panel.
#[tauri::command]
pub async fn pet_open_or_focus_panel(
    app: AppHandle,
    near_x: Option<f64>,
    near_y: Option<f64>,
) -> Result<(), String> {
    let win = get_or_create_pet_panel(&app)?;

    let state = app.state::<PetWindowState>();
    let mut open = state.panel_open.lock().map_err(|e| e.to_string())?;
    let mut geo = state.geometry.lock().map_err(|e| e.to_string())?;

    let w = geo.panel_w.unwrap_or(PANEL_DEFAULT_W);
    let h = geo.panel_h.unwrap_or(PANEL_DEFAULT_H);
    let (x, y) = if let (Some(px), Some(py)) = (geo.panel_x, geo.panel_y) {
        recover_position(&app, Some(px), Some(py), w, h)
    } else if let (Some(nx), Some(ny)) = (near_x, near_y) {
        recover_position(&app, Some(nx + OVERLAY_SIZE as f64 + 8.0), Some(ny), w, h)
    } else {
        recover_position(&app, None, None, w, h)
    };

    let _ = win.set_size(PhysicalSize::new(w as u32, h as u32));
    let _ = win.set_min_size(Some(tauri::LogicalSize::new(PANEL_MIN_W, PANEL_MIN_H)));
    let _ = win.set_position(PhysicalPosition::new(x as i32, y as i32));
    let _ = win.set_always_on_top(true);
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();

    geo.panel_x = Some(x);
    geo.panel_y = Some(y);
    geo.panel_w = Some(w);
    geo.panel_h = Some(h);
    save_geometry(&app, &geo);
    *open = true;
    drop(open);
    drop(geo);

    // Intentionally do not hide pet-overlay here — JS confirm-then-hide.
    Ok(())
}

/// Minimize panel only — sessions keep running. Restores the pet sprite.
#[tauri::command]
pub fn pet_minimize_panel(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(PET_MINI_PANEL_LABEL) {
        let _ = win.minimize();
    }
    if let Ok(mut open) = app.state::<PetWindowState>().panel_open.lock() {
        *open = false;
    }
    // Bring pet sprite back
    tauri::async_runtime::spawn(async move {
        let _ = pet_show_overlay(app.clone()).await;
    });
    Ok(())
}

/// Hide panel without killing sessions (close after user confirms in UI). Restores pet.
#[tauri::command]
pub fn pet_hide_panel(app: AppHandle) -> Result<(), String> {
    let win = match app.get_webview_window(PET_MINI_PANEL_LABEL) {
        Some(win) => win,
        None => {
            if let Ok(mut open) = app.state::<PetWindowState>().panel_open.lock() {
                *open = false;
            }
            tauri::async_runtime::spawn(async move {
                let _ = pet_show_overlay(app.clone()).await;
            });
            return Ok(());
        }
    };
    // Capture size/pos before hide
    if let Ok(mut geo) = app.state::<PetWindowState>().geometry.lock() {
        if let Ok(pos) = win.outer_position() {
            geo.panel_x = Some(pos.x as f64);
            geo.panel_y = Some(pos.y as f64);
        }
        if let Ok(size) = win.outer_size() {
            geo.panel_w = Some(size.width as f64);
            geo.panel_h = Some(size.height as f64);
        }
        save_geometry(&app, &geo);
    }
    let _ = win.hide();
    if let Ok(mut open) = app.state::<PetWindowState>().panel_open.lock() {
        *open = false;
    }
    tauri::async_runtime::spawn(async move {
        let _ = pet_show_overlay(app.clone()).await;
    });
    Ok(())
}

#[tauri::command]
pub fn pet_is_panel_visible(app: AppHandle) -> Result<bool, String> {
    let Some(win) = app.get_webview_window(PET_MINI_PANEL_LABEL) else {
        return Ok(false);
    };
    let visible = win.is_visible().unwrap_or(false);
    let minimized = win.is_minimized().unwrap_or(false);
    Ok(visible && !minimized)
}

#[tauri::command]
pub fn pet_save_panel_geometry(
    app: AppHandle,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let (cx, cy) = clamp_to_monitors(&app, x, y, w, h);
    if let Ok(mut geo) = app.state::<PetWindowState>().geometry.lock() {
        geo.panel_x = Some(cx);
        geo.panel_y = Some(cy);
        geo.panel_w = Some(w.max(PANEL_MIN_W));
        geo.panel_h = Some(h.max(PANEL_MIN_H));
        save_geometry(&app, &geo);
    }
    Ok(())
}

/// Validate a protocol action name is in the allowed set (defense in depth).
#[tauri::command]
pub fn pet_validate_action(action: String) -> Result<bool, String> {
    const ALLOWED: &[&str] = &[
        "pet:ready",
        "pet:anim_changed",
        "pet:click",
        "pet:drag_start",
        "pet:drag_end",
        "pet:position",
        "panel:open",
        "panel:focus",
        "panel:minimize",
        "panel:restore",
        "panel:close_request",
        "panel:close_confirmed",
        "panel:closed",
        "panel:lifecycle",
        "presentation:claim_chat",
        "presentation:release_chat",
        "presentation:claim_terminal",
        "presentation:release_terminal",
        "presentation:sync",
        "activity:push",
        "session:heartbeat",
    ];
    Ok(ALLOWED.contains(&action.as_str()))
}

/// Unit-testable helpers (pure).
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_labels_are_distinct() {
        assert_ne!(PET_OVERLAY_LABEL, PET_MINI_PANEL_LABEL);
        assert!(is_pet_label(PET_OVERLAY_LABEL));
        assert!(is_pet_label(PET_MINI_PANEL_LABEL));
        assert!(!is_pet_label("main"));
    }

    #[test]
    fn validate_action_list_includes_panel_open() {
        assert!(allowed_actions_contains("panel:open"));
    }

    fn allowed_actions_contains(a: &str) -> bool {
        pet_validate_action(a.to_string()).unwrap_or(false)
    }
}

/// Initialize managed state and restore geometry from disk.
pub fn init_pet_state(app: &AppHandle) -> PetWindowState {
    let geo = load_geometry(app);
    PetWindowState {
        geometry: Mutex::new(geo),
        panel_open: Mutex::new(false),
    }
}

/// Apply close policy for pet windows: hide, never kill sessions.
/// Returns true if this was a pet window and the close was intercepted.
pub fn handle_pet_window_close(window: &tauri::Window) -> bool {
    let label = window.label().to_string();
    if !is_pet_label(&label) {
        return false;
    }
    let _ = window.hide();
    if label == PET_MINI_PANEL_LABEL {
        let app = window.app_handle().clone();
        if let Some(state) = app.try_state::<PetWindowState>() {
            if let Ok(mut open) = state.inner().panel_open.lock() {
                *open = false;
            }
        }
    }
    true
}
