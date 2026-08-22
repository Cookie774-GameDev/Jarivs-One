//! Pixel Pet windows: pet-overlay + pet-mini-panel lifecycle and geometry.
//! Least-privilege: only window show/hide/focus/position/size for pet labels.
//! Does not expose shell, unrestricted filesystem, or remote navigation.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex,
};
use std::time::Duration;
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
const MAIN_NAV_EXCLUSION_LOGICAL_W: f64 = 240.0;
const PET_AUTOSTART_VALUE_NAME: &str = "VibeSpace";
const TOPMOST_WATCHDOG_INTERVAL_MS: u64 = 1000;
const OVERLAY_SHOW_RESULT_TIMEOUT: Duration = Duration::from_secs(2);

#[cfg(target_os = "windows")]
const PET_TOPMOST_POS_FLAGS: windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS =
    windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS(
        windows::Win32::UI::WindowsAndMessaging::SWP_NOMOVE.0
            | windows::Win32::UI::WindowsAndMessaging::SWP_NOSIZE.0
            | windows::Win32::UI::WindowsAndMessaging::SWP_NOACTIVATE.0,
    );

fn windows_startup_command(executable: &Path) -> String {
    let safe_path = executable.to_string_lossy().replace('"', "");
    format!(r#""{safe_path}""#)
}

/// Stable named-profile identifiers for each privileged Pixel Pet HKCU effect.
/// These match the frozen MC0B side-effect inventory row ids.
pub(crate) const EFFECT_REGISTRY_READ: &str = "pets-36-registry-read";
pub(crate) const EFFECT_REGISTRY_CREATE: &str = "pets-60-registry-create";
pub(crate) const EFFECT_REGISTRY_SET: &str = "pets-65-registry-set";
pub(crate) const EFFECT_REGISTRY_DELETE: &str = "pets-72-registry-delete";

// ---------------------------------------------------------------------------
// Named-profile privileged-effect guard (defense-in-depth).
//
// Production consumes task 114's crate-visible
// crate::runtime_profile::ensure_privileged_effect_allowed; the guard runs
// before any HKCU access. Tests inject an equivalent guard (see credentials.rs
// for the full rationale). Unknown profiles fail closed.
// ---------------------------------------------------------------------------

#[cfg(not(test))]
fn ensure_effect_allowed(effect: &'static str) -> Result<(), String> {
    crate::runtime_profile::ensure_privileged_effect_allowed(
        crate::runtime_profile::DENIED_EFFECT_REGISTRY,
        effect,
    )
}

#[cfg(test)]
type TestGuard = dyn Fn(&'static str) -> Result<(), String>;

#[cfg(test)]
std::thread_local! {
    static TEST_GUARD: std::cell::RefCell<Option<Box<TestGuard>>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
fn ensure_effect_allowed(effect: &'static str) -> Result<(), String> {
    TEST_GUARD.with(|slot| match &*slot.borrow() {
        Some(guard) => guard(effect),
        None => Err(format!(
            "privileged effect '{effect}' denied by named-profile guard (fail closed)"
        )),
    })
}

#[cfg(test)]
pub(crate) fn install_test_guard<F>(guard: F)
where
    F: Fn(&'static str) -> Result<(), String> + 'static,
{
    TEST_GUARD.with(|slot| *slot.borrow_mut() = Some(Box::new(guard)));
}

#[cfg(test)]
pub(crate) fn clear_test_guard() {
    TEST_GUARD.with(|slot| *slot.borrow_mut() = None);
}

// ---------------------------------------------------------------------------
// Injectable HKCU autostart effect seam (Windows).
//
// Production performs the real registry access, preserving current behavior
// exactly (including the release-only debug guard and current_exe resolution).
// Tests inject a counting fake so no real HKCU mutation occurs during
// verification, while ordinary-mode tests prove the seam is invoked.
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
trait PetAutostartSink {
    fn read_enabled(&self) -> Result<bool, String>;
    fn enable(&self) -> Result<(), String>;
    fn disable(&self) -> Result<(), String>;
}

#[cfg(all(target_os = "windows", not(test)))]
struct RealPetAutostart;

#[cfg(all(target_os = "windows", not(test)))]
impl PetAutostartSink for RealPetAutostart {
    fn read_enabled(&self) -> Result<bool, String> {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run = match hkcu
            .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_READ)
        {
            Ok(run) => run,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(format!("failed to read Windows startup settings: {error}")),
        };
        Ok(run.get_value::<String, _>(PET_AUTOSTART_VALUE_NAME).is_ok())
    }

    fn enable(&self) -> Result<(), String> {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        if cfg!(debug_assertions) {
            return Err(
                "Start with Windows can only be changed by an installed release build".into(),
            );
        }
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run, _) = hkcu
            .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
            .map_err(|error| format!("failed to open Windows startup settings: {error}"))?;
        let executable = std::env::current_exe()
            .map_err(|error| format!("failed to resolve the installed executable: {error}"))?;
        run.set_value(
            PET_AUTOSTART_VALUE_NAME,
            &windows_startup_command(&executable),
        )
        .map_err(|error| format!("failed to enable Windows startup: {error}"))
    }

    fn disable(&self) -> Result<(), String> {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        if cfg!(debug_assertions) {
            return Err(
                "Start with Windows can only be changed by an installed release build".into(),
            );
        }
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run, _) = hkcu
            .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
            .map_err(|error| format!("failed to open Windows startup settings: {error}"))?;
        match run.delete_value(PET_AUTOSTART_VALUE_NAME) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("failed to disable Windows startup: {error}")),
        }
    }
}

#[cfg(all(target_os = "windows", not(test)))]
fn sink() -> &'static dyn PetAutostartSink {
    &RealPetAutostart
}

#[cfg(all(target_os = "windows", test))]
#[derive(Default)]
struct CountingPetAutostart {
    enabled: std::cell::RefCell<bool>,
    counters: std::cell::RefCell<std::collections::HashMap<&'static str, usize>>,
}

#[cfg(all(target_os = "windows", test))]
impl CountingPetAutostart {
    fn bump(&self, effect: &'static str) {
        *self.counters.borrow_mut().entry(effect).or_insert(0) += 1;
    }
    fn count(&self, effect: &'static str) -> usize {
        self.counters.borrow().get(effect).copied().unwrap_or(0)
    }
    fn total(&self) -> usize {
        self.counters.borrow().values().sum()
    }
}

#[cfg(all(target_os = "windows", test))]
impl PetAutostartSink for CountingPetAutostart {
    fn read_enabled(&self) -> Result<bool, String> {
        self.bump(EFFECT_REGISTRY_READ);
        Ok(*self.enabled.borrow())
    }
    fn enable(&self) -> Result<(), String> {
        self.bump(EFFECT_REGISTRY_CREATE);
        self.bump(EFFECT_REGISTRY_SET);
        *self.enabled.borrow_mut() = true;
        Ok(())
    }
    fn disable(&self) -> Result<(), String> {
        self.bump(EFFECT_REGISTRY_CREATE);
        self.bump(EFFECT_REGISTRY_DELETE);
        *self.enabled.borrow_mut() = false;
        Ok(())
    }
}

#[cfg(all(target_os = "windows", test))]
std::thread_local! {
    static TEST_SINK: std::cell::RefCell<Option<std::rc::Rc<CountingPetAutostart>>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(all(target_os = "windows", test))]
fn sink() -> std::rc::Rc<CountingPetAutostart> {
    TEST_SINK
        .with(|slot| slot.borrow().clone())
        .expect("test pet autostart sink not installed")
}

#[cfg(all(target_os = "windows", test))]
fn install_counting_sink() -> std::rc::Rc<CountingPetAutostart> {
    let sink = std::rc::Rc::new(CountingPetAutostart::default());
    TEST_SINK.with(|slot| *slot.borrow_mut() = Some(sink.clone()));
    sink
}

#[cfg(target_os = "windows")]
fn get_windows_startup_enabled() -> Result<bool, String> {
    ensure_effect_allowed(EFFECT_REGISTRY_READ)?;
    sink().read_enabled()
}

#[cfg(not(target_os = "windows"))]
fn get_windows_startup_enabled() -> Result<bool, String> {
    Ok(false)
}

#[cfg(target_os = "windows")]
fn set_windows_startup_enabled(enabled: bool) -> Result<bool, String> {
    ensure_effect_allowed(EFFECT_REGISTRY_CREATE)?;
    if enabled {
        ensure_effect_allowed(EFFECT_REGISTRY_SET)?;
        sink().enable()?;
        return Ok(true);
    }
    ensure_effect_allowed(EFFECT_REGISTRY_DELETE)?;
    sink().disable()?;
    Ok(false)
}

#[cfg(not(target_os = "windows"))]
fn set_windows_startup_enabled(_enabled: bool) -> Result<bool, String> {
    Err("Start with Windows is only available on Windows".into())
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PetPanelMode {
    FollowPet,
    AlwaysOnTop,
    #[default]
    Normal,
}

fn panel_stays_on_top(_mode: PetPanelMode) -> bool {
    // Position modes (follow vs parked) do not drop OS z-order. A visible
    // panel stays above other apps the same way the pet sprite does.
    true
}

fn should_pin_pet_window(visible: bool, minimized: bool) -> bool {
    visible && !minimized
}

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
    pub reconstrain_generation: AtomicU64,
    pub topmost_watchdog_started: AtomicBool,
}

/// The acknowledged outcome of asking the native runtime to show the detached
/// Pet overlay. This is deliberately distinct from a renderer-ready signal:
/// native code can prove window creation/visibility, but cannot prove that the
/// WebView has painted the Pixi scene.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PetOverlayShowResult {
    /// `native-overlay` is the only successful Tauri mode. The UI must not
    /// silently reinterpret a failure as an inline overlay.
    pub mode: &'static str,
    /// Whether this request created the native window (rather than reusing it).
    pub created: bool,
    /// Read back after `show`; false means callers must treat the request as a
    /// failed acknowledgement rather than a usable desktop overlay.
    pub visible: bool,
    /// The Tauri topmost request completed. Absolute z-order is still subject
    /// to Windows platform limitations and has a separate native acceptance row.
    pub topmost_applied: bool,
    /// Native window code cannot truthfully observe renderer readiness.
    pub renderer_ready: Option<bool>,
    /// Stable, safe failure category. Never contains WebView, OS, or GPU text.
    pub reason: Option<&'static str>,
}

impl PetOverlayShowResult {
    fn visible(created: bool) -> Self {
        Self {
            mode: "native-overlay",
            created,
            visible: true,
            topmost_applied: true,
            renderer_ready: None,
            reason: None,
        }
    }

    fn failed(reason: &'static str) -> Self {
        Self::failed_after_create(false, reason)
    }

    fn failed_after_create(created: bool, reason: &'static str) -> Self {
        Self {
            mode: "native-overlay",
            created,
            visible: false,
            topmost_applied: false,
            renderer_ready: None,
            reason: Some(reason),
        }
    }
}

/// The acknowledged outcome of opening the one native Pet Panel. As with the
/// overlay contract, the native runtime proves only window lifecycle state,
/// not that a renderer has painted the Chat, Terminal, or Activity surface.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PetPanelOpenResult {
    pub mode: &'static str,
    pub created: bool,
    pub visible: bool,
    pub focused: bool,
    pub topmost_applied: bool,
    pub renderer_ready: Option<bool>,
    pub reason: Option<&'static str>,
}

impl PetPanelOpenResult {
    fn visible_and_focused(created: bool) -> Self {
        Self {
            mode: "native-panel",
            created,
            visible: true,
            focused: true,
            topmost_applied: true,
            renderer_ready: None,
            reason: None,
        }
    }

    fn failed(created: bool, reason: &'static str) -> Self {
        Self {
            mode: "native-panel",
            created,
            visible: false,
            focused: false,
            topmost_applied: false,
            renderer_ready: None,
            reason: Some(reason),
        }
    }
}

fn geometry_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("pets").join("window-geometry.json"))
}

pub fn load_geometry(app: &AppHandle) -> PetGeometryState {
    if let Some(path) = geometry_path(app) {
        if let Some(geometry) = read_geometry(&path) {
            return geometry;
        }
        if let Some(previous) = previous_geometry_path(app) {
            if let Some(geometry) = read_geometry(&previous) {
                return geometry;
            }
        }
    }
    PetGeometryState::default()
}

pub fn save_geometry(app: &AppHandle, geo: &PetGeometryState) {
    if !geometry_is_valid(geo) {
        return;
    }
    if let Some(path) = geometry_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(bytes) = serde_json::to_vec_pretty(geo) {
            let temp = path.with_extension("json.tmp");
            if let Ok(mut file) = fs::File::create(&temp) {
                use std::io::Write;
                if file.write_all(&bytes).is_ok() && file.sync_all().is_ok() {
                    if path.exists() {
                        if let Some(previous) = previous_geometry_path(app) {
                            let _ = fs::copy(&path, previous);
                        }
                    }
                    if fs::rename(&temp, &path).is_err() {
                        let _ = fs::remove_file(&path);
                        let _ = fs::rename(&temp, &path);
                    }
                }
            }
            let _ = fs::remove_file(temp);
        }
    }
}

/// Clamp physical position into an operating-system monitor work area.
fn clamp_to_monitors(
    app: &AppHandle,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    preferred_monitor_name: Option<&str>,
) -> (f64, f64) {
    let monitors = app.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        return if x.is_finite() && y.is_finite() {
            (x.max(0.0), y.max(0.0))
        } else {
            (24.0, 120.0)
        };
    }
    let x = if x.is_finite() { x } else { 24.0 };
    let y = if y.is_finite() { y } else { 120.0 };
    let w = if w.is_finite() && w > 0.0 {
        w
    } else {
        OVERLAY_SIZE as f64
    };
    let h = if h.is_finite() && h > 0.0 {
        h
    } else {
        OVERLAY_SIZE as f64
    };
    let containing = monitors.iter().find(|monitor| {
        let area = monitor.work_area();
        let pos = area.position;
        let size = area.size;
        let mx = pos.x as f64;
        let my = pos.y as f64;
        let mw = size.width as f64;
        let mh = size.height as f64;
        x >= mx && y >= my && x < mx + mw && y < my + mh
    });
    let preferred = preferred_monitor_name.and_then(|name| {
        monitors.iter().find(|monitor| {
            monitor
                .name()
                .is_some_and(|monitor_name| monitor_name == name)
        })
    });
    let primary = app.primary_monitor().ok().flatten();
    let m = match containing
        .cloned()
        .or_else(|| preferred.cloned())
        .or(primary)
        .or_else(|| monitors.first().cloned())
    {
        Some(m) => m,
        None => return (x.max(0.0), y.max(0.0)),
    };
    let area = m.work_area();
    let pos = area.position;
    let size = area.size;
    let mx = pos.x as f64;
    let my = pos.y as f64;
    let mw = size.width as f64;
    let mh = size.height as f64;
    let cx = x.clamp(mx, (mx + mw - w).max(mx));
    let cy = y.clamp(my, (my + mh - h).max(my));
    (cx, cy)
}

fn main_nav_exclusion_active(main_visible: bool, main_minimized: bool) -> bool {
    main_visible && !main_minimized
}

#[derive(Clone, Debug, PartialEq)]
struct MonitorWorkArea {
    name: Option<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Debug, PartialEq)]
struct OverlayPlacement {
    x: f64,
    y: f64,
    monitor_name: Option<String>,
}

fn monitor_work_areas(app: &AppHandle) -> Vec<MonitorWorkArea> {
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|monitor| {
            let area = monitor.work_area();
            MonitorWorkArea {
                name: monitor.name().cloned(),
                x: area.position.x as f64,
                y: area.position.y as f64,
                width: area.size.width as f64,
                height: area.size.height as f64,
            }
        })
        .collect()
}

fn clamp_to_work_area(x: f64, y: f64, w: f64, h: f64, area: &MonitorWorkArea) -> (f64, f64) {
    (
        x.clamp(area.x, (area.x + area.width - w).max(area.x)),
        y.clamp(area.y, (area.y + area.height - h).max(area.y)),
    )
}

fn final_monitor_name_for_position(
    areas: &[MonitorWorkArea],
    x: f64,
    y: f64,
    observed_monitor_name: Option<String>,
) -> Option<String> {
    areas
        .iter()
        .find(|area| {
            x >= area.x && y >= area.y && x < area.x + area.width && y < area.y + area.height
        })
        .and_then(|area| area.name.clone())
        .or(observed_monitor_name)
}

fn main_nav_exit_candidates(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    main_x: f64,
    main_y: f64,
    main_w: f64,
    main_h: f64,
    main_scale_factor: f64,
) -> Option<[(f64, f64); 4]> {
    let scale = if main_scale_factor.is_finite() && main_scale_factor > 0.0 {
        main_scale_factor
    } else {
        1.0
    };
    let main_right = main_x + main_w.max(0.0);
    let main_bottom = main_y + main_h.max(0.0);
    let nav_right = (main_x + MAIN_NAV_EXCLUSION_LOGICAL_W * scale).min(main_right);
    let overlaps_main_vertically = y < main_bottom && y + h > main_y;
    let overlaps_navigation_horizontally = x < nav_right && x + w > main_x;

    if overlaps_main_vertically && overlaps_navigation_horizontally {
        Some([
            (main_x - w, y),
            (nav_right, y),
            (x, main_y - h),
            (x, main_bottom),
        ])
    } else {
        None
    }
}

fn position_distance_squared(origin: (f64, f64), candidate: (f64, f64)) -> f64 {
    (candidate.0 - origin.0).powi(2) + (candidate.1 - origin.1).powi(2)
}

#[allow(clippy::too_many_arguments)]
fn select_candidate_in_areas(
    raw_candidates: &[(f64, f64); 4],
    origin: (f64, f64),
    w: f64,
    h: f64,
    main_x: f64,
    main_y: f64,
    main_w: f64,
    main_h: f64,
    main_scale_factor: f64,
    areas: &[&MonitorWorkArea],
) -> Option<OverlayPlacement> {
    raw_candidates
        .iter()
        .flat_map(|(candidate_x, candidate_y)| {
            areas.iter().filter_map(move |area| {
                if area.width < w || area.height < h {
                    return None;
                }
                let (x, y) = clamp_to_work_area(*candidate_x, *candidate_y, w, h, area);
                main_nav_exit_candidates(
                    x,
                    y,
                    w,
                    h,
                    main_x,
                    main_y,
                    main_w,
                    main_h,
                    main_scale_factor,
                )
                .is_none()
                .then(|| OverlayPlacement {
                    x,
                    y,
                    monitor_name: area.name.clone(),
                })
            })
        })
        .min_by(|left, right| {
            position_distance_squared(origin, (left.x, left.y))
                .total_cmp(&position_distance_squared(origin, (right.x, right.y)))
        })
}

#[allow(clippy::too_many_arguments)]
fn select_main_nav_exit_candidate(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    main_x: f64,
    main_y: f64,
    main_w: f64,
    main_h: f64,
    main_scale_factor: f64,
    areas: &[MonitorWorkArea],
    preferred_monitor_name: Option<&str>,
) -> Option<OverlayPlacement> {
    let raw_candidates = main_nav_exit_candidates(
        x,
        y,
        w,
        h,
        main_x,
        main_y,
        main_w,
        main_h,
        main_scale_factor,
    )?;
    let preferred_areas: Vec<_> = preferred_monitor_name
        .map(|preferred| {
            areas
                .iter()
                .filter(|area| area.name.as_deref() == Some(preferred))
                .collect()
        })
        .unwrap_or_default();

    if let Some(selected) = select_candidate_in_areas(
        &raw_candidates,
        (x, y),
        w,
        h,
        main_x,
        main_y,
        main_w,
        main_h,
        main_scale_factor,
        &preferred_areas,
    ) {
        return Some(selected);
    }

    let fallback_areas: Vec<_> = areas
        .iter()
        .filter(|area| {
            preferred_monitor_name.is_none() || area.name.as_deref() != preferred_monitor_name
        })
        .collect();
    select_candidate_in_areas(
        &raw_candidates,
        (x, y),
        w,
        h,
        main_x,
        main_y,
        main_w,
        main_h,
        main_scale_factor,
        &fallback_areas,
    )
}

fn exclude_main_nav_overlap(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    main_x: f64,
    main_y: f64,
    main_w: f64,
    main_h: f64,
    main_scale_factor: f64,
) -> (f64, f64) {
    main_nav_exit_candidates(
        x,
        y,
        w,
        h,
        main_x,
        main_y,
        main_w,
        main_h,
        main_scale_factor,
    )
    .and_then(|candidates| {
        candidates.into_iter().min_by(|left, right| {
            position_distance_squared((x, y), *left)
                .total_cmp(&position_distance_squared((x, y), *right))
        })
    })
    .unwrap_or((x, y))
}

fn constrain_overlay_position(
    app: &AppHandle,
    x: f64,
    y: f64,
    preferred_monitor_name: Option<&str>,
) -> (f64, f64) {
    let (clamped_x, clamped_y) = clamp_to_monitors(
        app,
        x,
        y,
        OVERLAY_SIZE as f64,
        OVERLAY_SIZE as f64,
        preferred_monitor_name,
    );
    let Some(main) = app.get_webview_window("main") else {
        return (clamped_x, clamped_y);
    };
    let main_visible = main.is_visible().unwrap_or(false);
    let main_minimized = main.is_minimized().unwrap_or(false);
    if !main_nav_exclusion_active(main_visible, main_minimized) {
        return (clamped_x, clamped_y);
    }
    let Ok(main_position) = main.outer_position() else {
        return (clamped_x, clamped_y);
    };
    let Ok(main_size) = main.outer_size() else {
        return (clamped_x, clamped_y);
    };
    let scale_factor = main.scale_factor().unwrap_or(1.0);
    let Some(selected) = select_main_nav_exit_candidate(
        clamped_x,
        clamped_y,
        OVERLAY_SIZE as f64,
        OVERLAY_SIZE as f64,
        main_position.x as f64,
        main_position.y as f64,
        main_size.width as f64,
        main_size.height as f64,
        scale_factor,
        &monitor_work_areas(app),
        preferred_monitor_name,
    ) else {
        return (clamped_x, clamped_y);
    };
    (selected.x, selected.y)
}

/// When saved monitor is gone, fall back to primary top-right-ish.
fn recover_position(
    app: &AppHandle,
    saved_x: Option<f64>,
    saved_y: Option<f64>,
    w: f64,
    h: f64,
    preferred_monitor_name: Option<&str>,
) -> (f64, f64) {
    if let (Some(x), Some(y)) = (saved_x, saved_y) {
        return clamp_to_monitors(app, x, y, w, h, preferred_monitor_name);
    }
    if let Ok(Some(primary)) = app.primary_monitor() {
        let pos = primary.position();
        let size = primary.size();
        let x = pos.x as f64 + size.width as f64 - w - 24.0;
        let y = pos.y as f64 + size.height as f64 - h - 80.0;
        return clamp_to_monitors(app, x, y, w, h, preferred_monitor_name);
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

#[cfg(target_os = "windows")]
fn native_pin_hwnd_topmost_noactivate(win: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST,
        WS_EX_TOPMOST,
    };

    let Ok(raw) = win.hwnd() else {
        return;
    };
    let hwnd = HWND(raw.0 as *mut _);
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let topmost_bit = WS_EX_TOPMOST.0 as isize;
        if ex & topmost_bit == 0 {
            let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | topmost_bit);
        }
        let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, PET_TOPMOST_POS_FLAGS);
    }
}

#[cfg(not(target_os = "windows"))]
fn native_pin_hwnd_topmost_noactivate(_win: &WebviewWindow) {}

fn pin_pet_window_topmost(win: &WebviewWindow, restore_overlay_chrome: bool) {
    let _ = win.set_always_on_top(true);
    if restore_overlay_chrome {
        ensure_pet_overlay_transparent(win);
    }
    native_pin_hwnd_topmost_noactivate(win);
}

fn pet_window_should_stay_topmost(win: &WebviewWindow) -> bool {
    should_pin_pet_window(
        win.is_visible().unwrap_or(false),
        win.is_minimized().unwrap_or(false),
    )
}

pub(crate) fn pin_visible_pet_windows(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(PET_OVERLAY_LABEL) {
        if pet_window_should_stay_topmost(&win) {
            pin_pet_window_topmost(&win, true);
        }
    }
    if let Some(win) = app.get_webview_window(PET_MINI_PANEL_LABEL) {
        if pet_window_should_stay_topmost(&win) {
            pin_pet_window_topmost(&win, false);
        }
    }
}

pub(crate) fn ensure_pet_topmost_watchdog(app: &AppHandle) {
    let started = &app.state::<PetWindowState>().topmost_watchdog_started;
    if started.swap(true, Ordering::SeqCst) {
        return;
    }
    let watchdog_app = app.clone();
    let _ = std::thread::Builder::new()
        .name("pet-topmost-watchdog".into())
        .spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(
                TOPMOST_WATCHDOG_INTERVAL_MS,
            ));
            let callback_app = watchdog_app.clone();
            let _ = watchdog_app.run_on_main_thread(move || {
                pin_visible_pet_windows(&callback_app);
            });
        });
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
    .decorations(false)
    .transparent(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .focused(false)
    .build()
    .map_err(|e| format!("failed to create pet-mini-panel window: {e}"))
}

/// Show the pet overlay (create visibility). Single instance by label.
#[tauri::command]
pub async fn pet_show_overlay(app: AppHandle) -> Result<PetOverlayShowResult, String> {
    #[cfg(debug_assertions)]
    eprintln!("[pets] pet_show_overlay invoked");

    let (x, y) = {
        let state = app.state::<PetWindowState>();
        let mut geo = match state.geometry.lock() {
            Ok(geo) => geo,
            Err(_) => return Ok(PetOverlayShowResult::failed("geometry_unavailable")),
        };
        let (recovered_x, recovered_y) = recover_position(
            &app,
            geo.overlay_x,
            geo.overlay_y,
            OVERLAY_SIZE as f64,
            OVERLAY_SIZE as f64,
            geo.overlay_monitor_name.as_deref(),
        );
        let (x, y) = constrain_overlay_position(
            &app,
            recovered_x,
            recovered_y,
            geo.overlay_monitor_name.as_deref(),
        );
        geo.overlay_x = Some(x);
        geo.overlay_y = Some(y);
        save_geometry(&app, &geo);
        (x, y)
    };

    let (result_tx, result_rx) = std::sync::mpsc::sync_channel(1);
    let app_for_create = app.clone();
    let create_result_tx = result_tx.clone();
    if app
        .run_on_main_thread(move || {
            let created = app_for_create
                .get_webview_window(PET_OVERLAY_LABEL)
                .is_none();
            if get_or_create_pet_overlay(&app_for_create).is_err() {
                let _ = create_result_tx.send(PetOverlayShowResult::failed("window_create_failed"));
                return;
            }

            // Let the WebView creation message return to the event loop before
            // applying window operations. Calling set_position/show immediately
            // after build() can race WebView2 and produce "failed to receive
            // message from webview" on Windows.
            let app_for_show = app_for_create.clone();
            let show_result_tx = create_result_tx.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(80));
                let app_for_callback = app_for_show.clone();
                let callback_result_tx = show_result_tx.clone();
                if app_for_show
                    .run_on_main_thread(move || {
                        let result = show_existing_pet_overlay(app_for_callback, x, y, created)
                            .unwrap_or_else(|reason| {
                                PetOverlayShowResult::failed_after_create(created, reason)
                            });
                        let _ = callback_result_tx.send(result);
                    })
                    .is_err()
                {
                    let _ = show_result_tx
                        .send(PetOverlayShowResult::failed("main_thread_unavailable"));
                }
            });
        })
        .is_err()
    {
        return Ok(PetOverlayShowResult::failed("main_thread_unavailable"));
    }

    match tauri::async_runtime::spawn_blocking(move || {
        result_rx.recv_timeout(OVERLAY_SHOW_RESULT_TIMEOUT)
    })
    .await
    {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(std::sync::mpsc::RecvTimeoutError::Timeout)) => {
            Ok(PetOverlayShowResult::failed("visibility_timeout"))
        }
        Ok(Err(std::sync::mpsc::RecvTimeoutError::Disconnected)) => {
            Ok(PetOverlayShowResult::failed("native_callback_lost"))
        }
        Err(_) => Ok(PetOverlayShowResult::failed("native_task_failed")),
    }
}

fn show_existing_pet_overlay(
    app: AppHandle,
    x: f64,
    y: f64,
    created: bool,
) -> Result<PetOverlayShowResult, &'static str> {
    let win = app
        .get_webview_window(PET_OVERLAY_LABEL)
        .ok_or("window_missing")?;
    let overlay_size = PhysicalSize::new(OVERLAY_SIZE, OVERLAY_SIZE);
    win.set_position(PhysicalPosition::new(x as i32, y as i32))
        .map_err(|_| "position_failed")?;
    win.set_min_size(Some(overlay_size))
        .map_err(|_| "size_failed")?;
    win.set_max_size(Some(overlay_size))
        .map_err(|_| "size_failed")?;
    win.set_size(overlay_size).map_err(|_| "size_failed")?;
    win.set_always_on_top(true).map_err(|_| "topmost_failed")?;
    pin_pet_window_topmost(&win, true);
    win.show().map_err(|_| "show_failed")?;
    // Windows/WebView2 can report a tiny transparent host HWND on first show.
    // Re-assert the exact pet surface size after visibility is applied.
    win.set_size(overlay_size).map_err(|_| "size_failed")?;
    // Second topmost pass — some hosts drop Z-order during the first show.
    pin_pet_window_topmost(&win, true);
    ensure_pet_topmost_watchdog(&app);
    if !win.is_visible().map_err(|_| "visibility_check_failed")? {
        return Err("not_visible");
    }
    Ok(PetOverlayShowResult::visible(created))
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

#[tauri::command]
pub fn pet_get_start_with_windows() -> Result<bool, String> {
    get_windows_startup_enabled()
}

#[tauri::command]
pub fn pet_set_start_with_windows(enabled: bool) -> Result<bool, String> {
    set_windows_startup_enabled(enabled)
}

fn previous_geometry_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("pets").join("window-geometry.previous.json"))
}

fn geometry_is_valid(geo: &PetGeometryState) -> bool {
    [
        geo.overlay_x,
        geo.overlay_y,
        geo.panel_x,
        geo.panel_y,
        geo.panel_w,
        geo.panel_h,
    ]
    .into_iter()
    .flatten()
    .all(f64::is_finite)
        && geo
            .panel_w
            .map_or(true, |w| (PANEL_MIN_W..=4000.0).contains(&w))
        && geo
            .panel_h
            .map_or(true, |h| (PANEL_MIN_H..=4000.0).contains(&h))
}

fn read_geometry(path: &std::path::Path) -> Option<PetGeometryState> {
    let bytes = fs::read(path).ok()?;
    if bytes.len() > 64 * 1024 {
        return None;
    }
    let geometry = serde_json::from_slice::<PetGeometryState>(&bytes).ok()?;
    geometry_is_valid(&geometry).then_some(geometry)
}

/// Reassert topmost only for pet windows that are already visible.
/// Never shows, focuses, or activates a hidden Pet window.
#[tauri::command]
pub fn pet_reassert_overlay_topmost(app: AppHandle) -> Result<(), String> {
    pin_visible_pet_windows(&app);
    ensure_pet_topmost_watchdog(&app);
    Ok(())
}

fn reconstrain_visible_overlay(app: &AppHandle) -> Result<(), String> {
    let Some(win) = app.get_webview_window(PET_OVERLAY_LABEL) else {
        return Ok(());
    };
    if !win.is_visible().unwrap_or(false) {
        return Ok(());
    }
    let position = win
        .outer_position()
        .map_err(|error| format!("failed to read pet-overlay position: {error}"))?;
    let monitor_name = win
        .current_monitor()
        .ok()
        .flatten()
        .and_then(|monitor| monitor.name().cloned());
    let (x, y) = constrain_overlay_position(
        app,
        position.x as f64,
        position.y as f64,
        monitor_name.as_deref(),
    );
    if position.x == x as i32 && position.y == y as i32 {
        return Ok(());
    }
    win.set_position(PhysicalPosition::new(x as i32, y as i32))
        .map_err(|error| format!("failed to reconstrain pet-overlay: {error}"))?;
    let observed_monitor_name = win
        .current_monitor()
        .ok()
        .flatten()
        .and_then(|monitor| monitor.name().cloned());
    let final_monitor_name =
        final_monitor_name_for_position(&monitor_work_areas(app), x, y, observed_monitor_name);
    if let Ok(mut geo) = app.state::<PetWindowState>().geometry.lock() {
        geo.overlay_x = Some(x);
        geo.overlay_y = Some(y);
        geo.overlay_monitor_name = final_monitor_name;
        save_geometry(app, &geo);
    }
    Ok(())
}

pub fn schedule_visible_overlay_reconstrain(app: AppHandle) {
    let generation = app
        .state::<PetWindowState>()
        .reconstrain_generation
        .fetch_add(1, Ordering::Relaxed)
        + 1;
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(80));
        if app
            .state::<PetWindowState>()
            .reconstrain_generation
            .load(Ordering::Relaxed)
            != generation
        {
            return;
        }
        let app_for_callback = app.clone();
        let _ = app.run_on_main_thread(move || {
            if app_for_callback
                .state::<PetWindowState>()
                .reconstrain_generation
                .load(Ordering::Relaxed)
                != generation
            {
                return;
            }
            if let Err(error) = reconstrain_visible_overlay(&app_for_callback) {
                eprintln!("[pets] failed to reconstrain visible overlay: {error}");
            }
        });
    });
}

/// Move pet overlay to physical position (DPI-aware path via physical coords).
/// Always clamped so the sprite cannot be dragged fully off-screen.
#[tauri::command]
pub fn pet_set_overlay_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let Some(win) = app.get_webview_window(PET_OVERLAY_LABEL) else {
        return Ok(());
    };
    // Keep at least ~24px of the pet window on-screen (cannot disappear off edge).
    let (cx, cy) = constrain_overlay_position(&app, x, y, None);
    let _ = win.set_position(PhysicalPosition::new(cx as i32, cy as i32));
    pin_pet_window_topmost(&win, true);
    if let Ok(mut geo) = app.state::<PetWindowState>().geometry.lock() {
        geo.overlay_x = Some(cx);
        geo.overlay_y = Some(cy);
        geo.overlay_monitor_name = win
            .current_monitor()
            .ok()
            .flatten()
            .and_then(|monitor| monitor.name().cloned());
        save_geometry(&app, &geo);
    }
    Ok(())
}

fn nearest_edge_position(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    monitor_x: f64,
    monitor_y: f64,
    monitor_w: f64,
    monitor_h: f64,
    margin: f64,
) -> (f64, f64) {
    let left = monitor_x + margin;
    let right = (monitor_x + monitor_w - w - margin).max(left);
    let top = monitor_y + margin;
    let bottom = (monitor_y + monitor_h - h - margin).max(top);
    let candidates = [
        (left, y.clamp(top, bottom), (x - left).abs()),
        (right, y.clamp(top, bottom), (x - right).abs()),
        (x.clamp(left, right), top, (y - top).abs()),
        (x.clamp(left, right), bottom, (y - bottom).abs()),
    ];
    candidates
        .into_iter()
        .min_by(|a, b| a.2.total_cmp(&b.2))
        .map(|(cx, cy, _)| (cx, cy))
        .unwrap_or((left, top))
}

/// Snap the visible overlay to the nearest edge of its current monitor.
#[tauri::command]
pub fn pet_snap_overlay_to_edge(app: AppHandle) -> Result<(), String> {
    let Some(win) = app.get_webview_window(PET_OVERLAY_LABEL) else {
        return Ok(());
    };
    let position = win
        .outer_position()
        .map_err(|e| format!("failed to read pet-overlay position: {e}"))?;
    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let work_area = monitor.work_area();
    let monitor_position = work_area.position;
    let monitor_size = work_area.size;
    let (snapped_x, snapped_y) = nearest_edge_position(
        position.x as f64,
        position.y as f64,
        OVERLAY_SIZE as f64,
        OVERLAY_SIZE as f64,
        monitor_position.x as f64,
        monitor_position.y as f64,
        monitor_size.width as f64,
        monitor_size.height as f64,
        8.0,
    );
    let (x, y) = constrain_overlay_position(
        &app,
        snapped_x,
        snapped_y,
        monitor.name().map(String::as_str),
    );
    win.set_position(PhysicalPosition::new(x as i32, y as i32))
        .map_err(|e| format!("failed to snap pet-overlay: {e}"))?;
    pin_pet_window_topmost(&win, true);
    if let Ok(mut geo) = app.state::<PetWindowState>().geometry.lock() {
        geo.overlay_x = Some(x);
        geo.overlay_y = Some(y);
        geo.overlay_monitor_name = monitor.name().cloned();
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
pub fn pet_open_or_focus_panel(
    app: AppHandle,
    near_x: Option<f64>,
    near_y: Option<f64>,
    panel_mode: Option<PetPanelMode>,
) -> Result<PetPanelOpenResult, String> {
    let created = app.get_webview_window(PET_MINI_PANEL_LABEL).is_none();
    let win = match get_or_create_pet_panel(&app) {
        Ok(win) => win,
        Err(_) => return Ok(PetPanelOpenResult::failed(false, "window_create_failed")),
    };
    let panel_mode = panel_mode.unwrap_or_default();

    let state = app.state::<PetWindowState>();
    let mut open = match state.panel_open.lock() {
        Ok(open) => open,
        Err(_) => {
            return Ok(PetPanelOpenResult::failed(
                created,
                "panel_state_unavailable",
            ))
        }
    };
    let mut geo = match state.geometry.lock() {
        Ok(geo) => geo,
        Err(_) => return Ok(PetPanelOpenResult::failed(created, "geometry_unavailable")),
    };

    let w = geo.panel_w.unwrap_or(PANEL_DEFAULT_W);
    let h = geo.panel_h.unwrap_or(PANEL_DEFAULT_H);
    let follow_anchor = if panel_mode == PetPanelMode::FollowPet {
        near_x.zip(near_y).or_else(|| {
            app.get_webview_window(PET_OVERLAY_LABEL)
                .and_then(|overlay| overlay.outer_position().ok())
                .map(|position| (position.x as f64, position.y as f64))
        })
    } else {
        None
    };
    let (x, y) = if let Some((nx, ny)) = follow_anchor {
        recover_position(
            &app,
            Some(nx + OVERLAY_SIZE as f64 + 8.0),
            Some(ny),
            w,
            h,
            None,
        )
    } else if let (Some(px), Some(py)) = (geo.panel_x, geo.panel_y) {
        recover_position(
            &app,
            Some(px),
            Some(py),
            w,
            h,
            geo.panel_monitor_name.as_deref(),
        )
    } else if let (Some(nx), Some(ny)) = (near_x, near_y) {
        recover_position(
            &app,
            Some(nx + OVERLAY_SIZE as f64 + 8.0),
            Some(ny),
            w,
            h,
            None,
        )
    } else {
        recover_position(&app, None, None, w, h, geo.panel_monitor_name.as_deref())
    };

    if win.set_size(PhysicalSize::new(w as u32, h as u32)).is_err() {
        return Ok(PetPanelOpenResult::failed(created, "size_failed"));
    }
    if win
        .set_min_size(Some(tauri::LogicalSize::new(PANEL_MIN_W, PANEL_MIN_H)))
        .is_err()
    {
        return Ok(PetPanelOpenResult::failed(created, "size_failed"));
    }
    if win
        .set_position(PhysicalPosition::new(x as i32, y as i32))
        .is_err()
    {
        return Ok(PetPanelOpenResult::failed(created, "position_failed"));
    }
    if win
        .set_always_on_top(panel_stays_on_top(panel_mode))
        .is_err()
    {
        return Ok(PetPanelOpenResult::failed(created, "topmost_failed"));
    }
    if win.unminimize().is_err() {
        return Ok(PetPanelOpenResult::failed(created, "restore_failed"));
    }
    if win.show().is_err() {
        return Ok(PetPanelOpenResult::failed(created, "show_failed"));
    }
    pin_pet_window_topmost(&win, false);
    ensure_pet_topmost_watchdog(&app);
    if win.set_focus().is_err() {
        return Ok(PetPanelOpenResult::failed(created, "focus_failed"));
    }

    let visible = match win.is_visible() {
        Ok(visible) => visible,
        Err(_) => {
            return Ok(PetPanelOpenResult::failed(
                created,
                "visibility_check_failed",
            ))
        }
    };
    let minimized = match win.is_minimized() {
        Ok(minimized) => minimized,
        Err(_) => {
            return Ok(PetPanelOpenResult::failed(
                created,
                "visibility_check_failed",
            ))
        }
    };
    if !visible || minimized {
        return Ok(PetPanelOpenResult::failed(created, "not_visible"));
    }
    let focused = match win.is_focused() {
        Ok(focused) => focused,
        Err(_) => return Ok(PetPanelOpenResult::failed(created, "focus_check_failed")),
    };
    if !focused {
        return Ok(PetPanelOpenResult::failed(created, "not_focused"));
    }

    geo.panel_x = Some(x);
    geo.panel_y = Some(y);
    geo.panel_w = Some(w);
    geo.panel_h = Some(h);
    geo.panel_monitor_name = win
        .current_monitor()
        .ok()
        .flatten()
        .and_then(|monitor| monitor.name().cloned());
    save_geometry(&app, &geo);
    *open = true;
    drop(open);
    drop(geo);

    // Intentionally do not hide pet-overlay here — JS confirm-then-hide.
    Ok(PetPanelOpenResult::visible_and_focused(created))
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
    let (cx, cy) = clamp_to_monitors(&app, x, y, w, h, None);
    if let Ok(mut geo) = app.state::<PetWindowState>().geometry.lock() {
        geo.panel_x = Some(cx);
        geo.panel_y = Some(cy);
        geo.panel_w = Some(w.max(PANEL_MIN_W));
        geo.panel_h = Some(h.max(PANEL_MIN_H));
        geo.panel_monitor_name = app
            .get_webview_window(PET_MINI_PANEL_LABEL)
            .and_then(|window| window.current_monitor().ok().flatten())
            .and_then(|monitor| monitor.name().cloned());
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

    #[test]
    fn panel_mode_defaults_to_normal_but_visible_panel_stays_topmost() {
        assert_eq!(PetPanelMode::default(), PetPanelMode::Normal);
        assert!(panel_stays_on_top(PetPanelMode::FollowPet));
        assert!(panel_stays_on_top(PetPanelMode::AlwaysOnTop));
        assert!(panel_stays_on_top(PetPanelMode::Normal));
    }

    #[test]
    fn topmost_pin_targets_visible_unminimized_pet_windows_only() {
        assert!(should_pin_pet_window(true, false));
        assert!(!should_pin_pet_window(true, true));
        assert!(!should_pin_pet_window(false, false));
        assert!(!should_pin_pet_window(false, true));
    }

    #[test]
    fn overlay_show_result_is_typed_and_does_not_claim_renderer_readiness() {
        let success = PetOverlayShowResult::visible(true);
        assert_eq!(success.mode, "native-overlay");
        assert!(success.created);
        assert!(success.visible);
        assert!(success.topmost_applied);
        assert_eq!(success.renderer_ready, None);
        assert_eq!(success.reason, None);

        let failure = PetOverlayShowResult::failed("window_create_failed");
        let serialized = serde_json::to_value(failure).expect("serializes safe result");
        assert_eq!(serialized["topmostApplied"], false);
        assert_eq!(serialized["rendererReady"], serde_json::Value::Null);
        assert_eq!(serialized["reason"], "window_create_failed");
    }

    #[test]
    fn panel_open_result_requires_visible_focused_native_window() {
        let success = PetPanelOpenResult::visible_and_focused(false);
        assert_eq!(success.mode, "native-panel");
        assert!(!success.created);
        assert!(success.visible);
        assert!(success.focused);
        assert!(success.topmost_applied);
        assert_eq!(success.renderer_ready, None);

        let failure = PetPanelOpenResult::failed(true, "focus_failed");
        let serialized = serde_json::to_value(failure).expect("serializes safe result");
        assert_eq!(serialized["created"], true);
        assert_eq!(serialized["visible"], false);
        assert_eq!(serialized["focused"], false);
        assert_eq!(serialized["reason"], "focus_failed");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn topmost_pin_flags_do_not_activate_or_move() {
        use windows::Win32::UI::WindowsAndMessaging::{
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
        };
        assert_eq!(
            PET_TOPMOST_POS_FLAGS.0,
            SWP_NOMOVE.0 | SWP_NOSIZE.0 | SWP_NOACTIVATE.0
        );
        assert_eq!(PET_TOPMOST_POS_FLAGS.0 & SWP_SHOWWINDOW.0, 0);
    }

    #[test]
    fn overlay_is_shifted_past_the_scaled_main_navigation_when_rectangles_overlap() {
        assert_eq!(
            exclude_main_nav_overlap(110.0, 180.0, 144.0, 144.0, 100.0, 100.0, 1600.0, 900.0, 1.5,),
            (-44.0, 180.0),
        );
    }

    #[test]
    fn main_navigation_exclusion_requires_a_visible_non_minimized_main_window() {
        assert!(main_nav_exclusion_active(true, false));
        assert!(!main_nav_exclusion_active(false, false));
        assert!(!main_nav_exclusion_active(true, true));
    }

    #[test]
    fn overlay_outside_the_main_navigation_keeps_its_position() {
        assert_eq!(
            exclude_main_nav_overlap(
                -200.0, 180.0, 144.0, 144.0, 100.0, 100.0, 1600.0, 900.0, 1.0,
            ),
            (-200.0, 180.0),
        );
        assert_eq!(
            exclude_main_nav_overlap(
                110.0, 1100.0, 144.0, 144.0, 100.0, 100.0, 1600.0, 900.0, 1.0,
            ),
            (110.0, 1100.0),
        );
        assert_eq!(
            exclude_main_nav_overlap(500.0, 180.0, 144.0, 144.0, 100.0, 100.0, 1600.0, 900.0, 1.0,),
            (500.0, 180.0),
        );
    }

    #[test]
    fn invalid_scale_factor_uses_one_for_a_safe_navigation_boundary() {
        assert_eq!(
            exclude_main_nav_overlap(
                -1810.0,
                80.0,
                144.0,
                144.0,
                -1920.0,
                0.0,
                1600.0,
                900.0,
                f64::NAN,
            ),
            (-1680.0, 80.0),
        );
    }

    #[test]
    fn preferred_monitor_candidate_does_not_teleport_across_a_seam() {
        let areas = [
            MonitorWorkArea {
                name: Some("left".to_string()),
                x: -1920.0,
                y: 0.0,
                width: 1920.0,
                height: 1080.0,
            },
            MonitorWorkArea {
                name: Some("right".to_string()),
                x: 0.0,
                y: 0.0,
                width: 1920.0,
                height: 1080.0,
            },
        ];

        let selected = select_main_nav_exit_candidate(
            10.0,
            100.0,
            144.0,
            144.0,
            0.0,
            0.0,
            1920.0,
            1080.0,
            1.0,
            &areas,
            Some("right"),
        )
        .expect("right monitor has a valid navigation exit");

        assert_eq!(selected.x, 240.0);
        assert_eq!(selected.y, 100.0);
        assert_eq!(selected.monitor_name.as_deref(), Some("right"));
        assert_ne!(selected.x, -144.0);
    }

    #[test]
    fn candidate_selection_uses_other_monitors_only_as_a_fallback() {
        let areas = [
            MonitorWorkArea {
                name: Some("narrow".to_string()),
                x: 0.0,
                y: 0.0,
                width: 200.0,
                height: 200.0,
            },
            MonitorWorkArea {
                name: Some("left".to_string()),
                x: -1920.0,
                y: 0.0,
                width: 1920.0,
                height: 1080.0,
            },
        ];

        let selected = select_main_nav_exit_candidate(
            10.0,
            10.0,
            144.0,
            144.0,
            0.0,
            0.0,
            200.0,
            200.0,
            1.0,
            &areas,
            Some("narrow"),
        )
        .expect("the adjacent monitor is a valid explicit fallback");

        assert_eq!(selected.x, -144.0);
        assert_eq!(selected.monitor_name.as_deref(), Some("left"));
    }

    #[test]
    fn destination_monitor_identity_overrides_a_stale_observed_monitor() {
        let areas = [
            MonitorWorkArea {
                name: Some("left".to_string()),
                x: -1920.0,
                y: 0.0,
                width: 1920.0,
                height: 1080.0,
            },
            MonitorWorkArea {
                name: Some("right".to_string()),
                x: 0.0,
                y: 0.0,
                width: 1920.0,
                height: 1080.0,
            },
        ];

        assert_eq!(
            final_monitor_name_for_position(&areas, -144.0, 100.0, Some("right".to_string()))
                .as_deref(),
            Some("left"),
        );
        assert_eq!(
            final_monitor_name_for_position(&areas, 240.0, 100.0, Some("left".to_string()))
                .as_deref(),
            Some("right"),
        );
        assert_eq!(
            final_monitor_name_for_position(&areas, 5000.0, 100.0, Some("right".to_string()))
                .as_deref(),
            Some("right"),
        );
    }

    #[test]
    fn nearest_edge_snap_respects_negative_monitor_coordinates() {
        let (x, y) = nearest_edge_position(
            -300.0, 300.0, 144.0, 144.0, -1920.0, 0.0, 1920.0, 1040.0, 8.0,
        );
        assert_eq!(x, -152.0);
        assert_eq!(y, 300.0);
    }

    #[test]
    fn geometry_validation_rejects_non_finite_and_unusable_panel_sizes() {
        let valid = PetGeometryState {
            overlay_x: Some(-1200.0),
            overlay_y: Some(80.0),
            panel_w: Some(PANEL_MIN_W),
            panel_h: Some(PANEL_MIN_H),
            ..PetGeometryState::default()
        };
        assert!(geometry_is_valid(&valid));

        let mut invalid = valid.clone();
        invalid.overlay_x = Some(f64::NAN);
        assert!(!geometry_is_valid(&invalid));

        invalid = valid;
        invalid.panel_w = Some(PANEL_MIN_W - 1.0);
        assert!(!geometry_is_valid(&invalid));
    }

    #[test]
    fn windows_startup_command_is_quoted_and_uses_one_stable_value_name() {
        assert_eq!(PET_AUTOSTART_VALUE_NAME, "VibeSpace");
        assert_eq!(
            windows_startup_command(std::path::Path::new(
                r"C:\\Program Files\\VibeSpace\\VibeSpace.exe"
            )),
            r#""C:\\Program Files\\VibeSpace\\VibeSpace.exe""#
        );
    }

    fn allowed_actions_contains(a: &str) -> bool {
        pet_validate_action(a.to_string()).unwrap_or(false)
    }

    // ----- Named-profile guard + injectable HKCU seam tests (Windows) -----

    #[cfg(target_os = "windows")]
    fn ordinary_guard() -> impl Fn(&'static str) -> Result<(), String> {
        |_effect| Ok(())
    }

    #[cfg(target_os = "windows")]
    fn visual_test_guard() -> impl Fn(&'static str) -> Result<(), String> {
        |effect| {
            Err(format!(
                "privileged effect '{effect}' is disabled by the monochrome-visual-test runtime profile"
            ))
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn ordinary_mode_autostart_read_invokes_seam() {
        install_test_guard(ordinary_guard());
        let sink = install_counting_sink();
        assert_eq!(get_windows_startup_enabled(), Ok(false));
        assert_eq!(sink.count(EFFECT_REGISTRY_READ), 1);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn ordinary_mode_autostart_enable_invokes_create_and_set_seams() {
        install_test_guard(ordinary_guard());
        let sink = install_counting_sink();
        assert_eq!(set_windows_startup_enabled(true), Ok(true));
        assert_eq!(sink.count(EFFECT_REGISTRY_CREATE), 1);
        assert_eq!(sink.count(EFFECT_REGISTRY_SET), 1);
        assert_eq!(sink.count(EFFECT_REGISTRY_DELETE), 0);
        assert_eq!(get_windows_startup_enabled(), Ok(true));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn ordinary_mode_autostart_disable_invokes_create_and_delete_seams() {
        install_test_guard(ordinary_guard());
        let sink = install_counting_sink();
        assert_eq!(set_windows_startup_enabled(false), Ok(false));
        assert_eq!(sink.count(EFFECT_REGISTRY_CREATE), 1);
        assert_eq!(sink.count(EFFECT_REGISTRY_DELETE), 1);
        assert_eq!(sink.count(EFFECT_REGISTRY_SET), 0);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn visual_test_mode_denies_autostart_read_before_hkcu() {
        install_test_guard(visual_test_guard());
        let sink = install_counting_sink();
        let message =
            get_windows_startup_enabled().expect_err("visual-test must deny registry read");
        assert!(message.contains("monochrome-visual-test"));
        assert_eq!(sink.total(), 0);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn visual_test_mode_denies_autostart_write_before_hkcu() {
        install_test_guard(visual_test_guard());
        let sink = install_counting_sink();
        assert!(set_windows_startup_enabled(true).is_err());
        assert!(set_windows_startup_enabled(false).is_err());
        assert_eq!(sink.total(), 0, "denial must precede every HKCU effect");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn unknown_profile_fails_closed_before_hkcu() {
        clear_test_guard();
        let sink = install_counting_sink();
        assert!(get_windows_startup_enabled().is_err());
        assert!(set_windows_startup_enabled(true).is_err());
        assert_eq!(sink.total(), 0);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn real_guard_ordinary_autostart_end_to_end() {
        install_test_guard(|effect| {
            crate::runtime_profile::ensure_privileged_effect_allowed(
                crate::runtime_profile::DENIED_EFFECT_REGISTRY,
                effect,
            )
        });
        let sink = install_counting_sink();
        let _environment = crate::runtime_profile::test_runtime_environment(None, None);
        assert_eq!(set_windows_startup_enabled(true), Ok(true));
        assert_eq!(sink.count(EFFECT_REGISTRY_SET), 1);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn real_guard_visual_test_autostart_denied_end_to_end() {
        install_test_guard(|effect| {
            crate::runtime_profile::ensure_privileged_effect_allowed(
                crate::runtime_profile::DENIED_EFFECT_REGISTRY,
                effect,
            )
        });
        let sink = install_counting_sink();
        let _environment = crate::runtime_profile::test_runtime_environment(
            Some(std::ffi::OsString::from(
                crate::runtime_profile::MONOCHROME_VISUAL_TEST,
            )),
            None,
        );
        let message = set_windows_startup_enabled(true).expect_err("visual-test must deny");
        assert!(message.contains("monochrome-visual-test"));
        assert_eq!(sink.total(), 0);
    }
}

/// Initialize managed state and restore geometry from disk.
pub fn init_pet_state(app: &AppHandle) -> PetWindowState {
    let geo = load_geometry(app);
    PetWindowState {
        geometry: Mutex::new(geo),
        panel_open: Mutex::new(false),
        reconstrain_generation: AtomicU64::new(0),
        topmost_watchdog_started: AtomicBool::new(false),
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
        tauri::async_runtime::spawn(async move {
            let _ = pet_show_overlay(app).await;
        });
    }
    true
}
