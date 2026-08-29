//! Preview Studio: isolated WebviewWindow positioned over a reserved React rectangle.
//! No VibeSpace IPC is exposed to remote/preview pages (separate window label + capabilities).

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(windows)]
use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR};

use crate::static_server::CommandError;

type CmdResult<T> = Result<T, CommandError>;

const PREVIEW_LABEL: &str = "preview-surface";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewBounds {
    /// Logical CSS pixels relative to the main window content origin.
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreviewStatus {
    pub created: bool,
    pub visible: bool,
    pub url: Option<String>,
}

struct PreviewState {
    url: String,
    visible: bool,
}

static STATE: Mutex<Option<PreviewState>> = Mutex::new(None);

fn err(code: &str, message: impl Into<String>, recoverable: bool) -> CommandError {
    CommandError {
        code: code.to_string(),
        message: message.into(),
        recoverable,
    }
}

fn main_window(app: &AppHandle) -> CmdResult<tauri::WebviewWindow> {
    app.get_webview_window("main")
        .ok_or_else(|| err("window_missing", "Main window is not available.", true))
}

fn sanitize_url(raw: &str) -> CmdResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(err("invalid_url", "URL is empty.", true));
    }
    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else if trimmed.starts_with("localhost") || trimmed.starts_with("127.0.0.1") {
        format!("http://{trimmed}")
    } else {
        return Err(err(
            "unsupported_protocol",
            "Only http:// and https:// preview URLs are allowed.",
            true,
        ));
    };
    let parsed = url::Url::parse(&with_scheme)
        .map_err(|e| err("invalid_url", format!("Malformed URL: {e}"), true))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        _ => Err(err(
            "unsupported_protocol",
            format!("Scheme not allowed: {}", parsed.scheme()),
            true,
        )),
    }
}

/// Convert content-relative logical bounds into absolute outer position for an overlay window.
fn absolute_position(
    main: &tauri::WebviewWindow,
    bounds: &PreviewBounds,
) -> CmdResult<(tauri::PhysicalPosition<i32>, tauri::PhysicalSize<u32>)> {
    let scale = main
        .scale_factor()
        .map_err(|e| err("bounds_failed", e.to_string(), true))?;
    let origin = main
        .inner_position()
        .map_err(|e| err("bounds_failed", e.to_string(), true))?;
    let x = origin.x + (bounds.x * scale).round() as i32;
    let y = origin.y + (bounds.y * scale).round() as i32;
    let w = ((bounds.width.max(1.0)) * scale).round() as u32;
    let h = ((bounds.height.max(1.0)) * scale).round() as u32;
    Ok((
        tauri::PhysicalPosition::new(x, y),
        tauri::PhysicalSize::new(w.max(1), h.max(1)),
    ))
}

fn apply_bounds(
    win: &tauri::WebviewWindow,
    main: &tauri::WebviewWindow,
    bounds: &PreviewBounds,
) -> CmdResult<()> {
    let (pos, size) = absolute_position(main, bounds)?;
    win.set_position(pos)
        .map_err(|e| err("bounds_failed", e.to_string(), true))?;
    win.set_size(size)
        .map_err(|e| err("bounds_failed", e.to_string(), true))?;
    Ok(())
}

fn device_metrics_params(emulation: &PreviewEmulation) -> CmdResult<serde_json::Value> {
    if !(200..=3840).contains(&emulation.viewport_width)
        || !(200..=2400).contains(&emulation.viewport_height)
        || !(200..=3840).contains(&emulation.screen_width)
        || !(200..=2400).contains(&emulation.screen_height)
    {
        return Err(err(
            "invalid_emulation",
            "Preview viewport and screen dimensions are outside supported bounds.",
            true,
        ));
    }
    if !emulation.device_scale_factor.is_finite()
        || !(0.5..=8.0).contains(&emulation.device_scale_factor)
        || !emulation.display_scale.is_finite()
        || !(0.1..=2.0).contains(&emulation.display_scale)
    {
        return Err(err(
            "invalid_emulation",
            "Preview DPR or display scale is invalid.",
            true,
        ));
    }
    let (orientation_type, angle) = match emulation.orientation.as_str() {
        "portrait" => ("portraitPrimary", 0),
        "landscape" => ("landscapePrimary", 90),
        _ => {
            return Err(err(
                "invalid_emulation",
                "Preview orientation must be portrait or landscape.",
                true,
            ))
        }
    };
    Ok(serde_json::json!({
        "width": emulation.viewport_width,
        "height": emulation.viewport_height,
        "deviceScaleFactor": emulation.device_scale_factor,
        "mobile": emulation.mobile,
        "scale": emulation.display_scale,
        "screenWidth": emulation.screen_width,
        "screenHeight": emulation.screen_height,
        "positionX": 0,
        "positionY": 0,
        "dontSetVisibleSize": false,
        "screenOrientation": {
            "type": orientation_type,
            "angle": angle,
        },
    }))
}

fn touch_emulation_params(emulation: &PreviewEmulation) -> serde_json::Value {
    serde_json::json!({
        "enabled": emulation.touch,
        "maxTouchPoints": if emulation.touch { 5 } else { 1 },
    })
}

#[cfg(windows)]
fn apply_emulation(win: &tauri::WebviewWindow, emulation: &PreviewEmulation) -> CmdResult<()> {
    let metrics = device_metrics_params(emulation)?.to_string();
    let touch = touch_emulation_params(emulation).to_string();
    let (result_tx, result_rx) = std::sync::mpsc::sync_channel(1);
    win.with_webview(move |platform_webview| {
        let result = (|| -> Result<(), String> {
            let core = unsafe { platform_webview.controller().CoreWebView2() }
                .map_err(|_| "preview WebView2 core is unavailable".to_string())?;
            for (method, parameters) in [
                ("Emulation.setDeviceMetricsOverride", metrics),
                ("Emulation.setTouchEmulationEnabled", touch),
            ] {
                let method = CoTaskMemPWSTR::from(method);
                let parameters = CoTaskMemPWSTR::from(parameters.as_str());
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |error_code, response| {
                        if let Err(error) = error_code {
                            eprintln!("Preview emulation CDP command failed: {error}");
                        } else if response.contains("\"error\"") {
                            eprintln!("Preview emulation CDP response: {response}");
                        }
                        Ok(())
                    },
                ));
                unsafe {
                    core.CallDevToolsProtocolMethod(
                        *method.as_ref().as_pcwstr(),
                        *parameters.as_ref().as_pcwstr(),
                        &handler,
                    )
                }
                .map_err(|error| format!("could not schedule preview emulation: {error}"))?;
            }
            Ok(())
        })();
        let _ = result_tx.send(result);
    })
    .map_err(|error| err("emulation_failed", error.to_string(), true))?;
    result_rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .map_err(|_| {
            err(
                "emulation_failed",
                "Timed out while scheduling preview device emulation.",
                true,
            )
        })?
        .map_err(|message| err("emulation_failed", message, true))
}

#[cfg(not(windows))]
fn apply_emulation(_win: &tauri::WebviewWindow, emulation: &PreviewEmulation) -> CmdResult<()> {
    let _ = device_metrics_params(emulation)?;
    Ok(())
}

#[tauri::command]
pub fn preview_create(
    app: AppHandle,
    url: String,
    bounds: PreviewBounds,
    emulation: PreviewEmulation,
) -> CmdResult<PreviewStatus> {
    let safe = sanitize_url(&url)?;
    let main = main_window(&app)?;
    let parsed: url::Url = safe
        .parse()
        .map_err(|e| err("invalid_url", format!("{e}"), true))?;

    if let Some(existing) = app.get_webview_window(PREVIEW_LABEL) {
        let _ = existing.navigate(parsed);
        apply_bounds(&existing, &main, &bounds)?;
        apply_emulation(&existing, &emulation)?;
        let _ = existing.show();
        *STATE.lock().unwrap() = Some(PreviewState {
            url: safe.clone(),
            visible: true,
        });
        return Ok(PreviewStatus {
            created: true,
            visible: true,
            url: Some(safe),
        });
    }

    let (pos, size) = absolute_position(&main, &bounds)?;
    let builder = WebviewWindowBuilder::new(&app, PREVIEW_LABEL, WebviewUrl::External(parsed))
        .title("VibeSpace Preview")
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .inner_size(size.width as f64, size.height as f64)
        .position(pos.x as f64, pos.y as f64);

    // Tauri exposes native owner association on Windows. Other platforms keep
    // the same always-on-top overlay behavior without an unsupported API call.
    #[cfg(windows)]
    let builder = match builder.owner(&main) {
        Ok(builder) => builder,
        Err(_) => WebviewWindowBuilder::new(
            &app,
            PREVIEW_LABEL,
            WebviewUrl::External(
                safe.parse()
                    .map_err(|e| err("invalid_url", format!("{e}"), true))?,
            ),
        )
        .title("VibeSpace Preview")
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .inner_size(size.width as f64, size.height as f64)
        .position(pos.x as f64, pos.y as f64),
    };

    #[cfg(not(windows))]
    let builder = builder;

    builder.build().map_err(|e| {
        err(
            "webview_create_failed",
            format!("Could not create preview surface: {e}"),
            true,
        )
    })?;

    // Re-apply physical bounds (builder position APIs are logical on some platforms).
    if let Some(win) = app.get_webview_window(PREVIEW_LABEL) {
        apply_bounds(&win, &main, &bounds)?;
        apply_emulation(&win, &emulation)?;
    }

    *STATE.lock().unwrap() = Some(PreviewState {
        url: safe.clone(),
        visible: true,
    });

    Ok(PreviewStatus {
        created: true,
        visible: true,
        url: Some(safe),
    })
}

#[tauri::command]
pub fn preview_set_bounds(
    app: AppHandle,
    bounds: PreviewBounds,
    emulation: PreviewEmulation,
) -> CmdResult<bool> {
    let Some(win) = app.get_webview_window(PREVIEW_LABEL) else {
        return Ok(false);
    };
    let main = main_window(&app)?;
    apply_bounds(&win, &main, &bounds)?;
    apply_emulation(&win, &emulation)?;
    Ok(true)
}

#[tauri::command]
pub fn preview_navigate(app: AppHandle, url: String) -> CmdResult<PreviewStatus> {
    let safe = sanitize_url(&url)?;
    let Some(win) = app.get_webview_window(PREVIEW_LABEL) else {
        return Err(err(
            "webview_missing",
            "Preview surface is not created yet.",
            true,
        ));
    };
    let parsed: url::Url = safe
        .parse()
        .map_err(|e| err("invalid_url", format!("{e}"), true))?;
    win.navigate(parsed)
        .map_err(|e| err("navigate_failed", e.to_string(), true))?;
    if let Some(state) = STATE.lock().unwrap().as_mut() {
        state.url = safe.clone();
    }
    Ok(PreviewStatus {
        created: true,
        visible: STATE
            .lock()
            .unwrap()
            .as_ref()
            .map(|s| s.visible)
            .unwrap_or(true),
        url: Some(safe),
    })
}

#[tauri::command]
pub fn preview_show(app: AppHandle) -> CmdResult<bool> {
    let Some(win) = app.get_webview_window(PREVIEW_LABEL) else {
        return Ok(false);
    };
    win.show()
        .map_err(|e| err("show_failed", e.to_string(), true))?;
    if let Some(state) = STATE.lock().unwrap().as_mut() {
        state.visible = true;
    }
    Ok(true)
}

#[tauri::command]
pub fn preview_hide(app: AppHandle) -> CmdResult<bool> {
    let Some(win) = app.get_webview_window(PREVIEW_LABEL) else {
        return Ok(false);
    };
    win.hide()
        .map_err(|e| err("hide_failed", e.to_string(), true))?;
    if let Some(state) = STATE.lock().unwrap().as_mut() {
        state.visible = false;
    }
    Ok(true)
}

#[tauri::command]
pub fn preview_reload(app: AppHandle, hard: bool) -> CmdResult<bool> {
    let Some(win) = app.get_webview_window(PREVIEW_LABEL) else {
        return Ok(false);
    };
    let _ = hard;
    if let Some(url) = STATE.lock().unwrap().as_ref().map(|s| s.url.clone()) {
        let parsed: url::Url = url
            .parse()
            .map_err(|e| err("invalid_url", format!("{e}"), true))?;
        win.navigate(parsed)
            .map_err(|e| err("reload_failed", e.to_string(), true))?;
    }
    Ok(true)
}

#[tauri::command]
pub fn preview_destroy(app: AppHandle) -> CmdResult<bool> {
    if let Some(win) = app.get_webview_window(PREVIEW_LABEL) {
        let _ = win.close();
    }
    *STATE.lock().unwrap() = None;
    Ok(true)
}

#[tauri::command]
pub fn preview_status(app: AppHandle) -> PreviewStatus {
    let created = app.get_webview_window(PREVIEW_LABEL).is_some();
    let guard = STATE.lock().unwrap();
    PreviewStatus {
        created,
        visible: guard.as_ref().map(|s| s.visible).unwrap_or(false),
        url: guard.as_ref().map(|s| s.url.clone()),
    }
}

#[tauri::command]
pub fn preview_probe_url(url: String) -> Result<serde_json::Value, CommandError> {
    let safe = sanitize_url(&url)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .redirect(reqwest::redirect::Policy::limited(5))
        .danger_accept_invalid_certs(false)
        .build()
        .map_err(|e| err("client_error", e.to_string(), true))?;

    match client.get(&safe).send() {
        Ok(res) => Ok(serde_json::json!({
            "ok": true,
            "status": res.status().as_u16(),
            "final_url": res.url().to_string(),
            "code": if res.status().is_success() { "ok" } else { "http_error" },
        })),
        Err(e) => {
            let msg = e.to_string().to_lowercase();
            let code = if msg.contains("connection refused") || msg.contains("connect") {
                "connection_refused"
            } else if msg.contains("dns") || msg.contains("resolve") {
                "dns_failure"
            } else if msg.contains("certificate") || msg.contains("tls") || msg.contains("ssl") {
                "tls_error"
            } else if msg.contains("timed out") || msg.contains("timeout") {
                "timed_out"
            } else {
                "probe_failed"
            };
            Err(err(code, e.to_string(), true))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewEmulation {
    pub viewport_width: u32,
    pub viewport_height: u32,
    pub screen_width: u32,
    pub screen_height: u32,
    pub device_scale_factor: f64,
    pub display_scale: f64,
    pub mobile: bool,
    pub touch: bool,
    pub orientation: String,
}

#[cfg(test)]
mod tests {
    use super::{device_metrics_params, touch_emulation_params, PreviewEmulation};

    fn iphone_13(display_scale: f64) -> PreviewEmulation {
        PreviewEmulation {
            viewport_width: 390,
            viewport_height: 844,
            screen_width: 390,
            screen_height: 844,
            device_scale_factor: 3.0,
            display_scale,
            mobile: true,
            touch: true,
            orientation: "portrait".to_string(),
        }
    }

    #[test]
    fn device_metrics_keep_logical_viewport_separate_from_visual_scale() {
        let params = device_metrics_params(&iphone_13(0.5)).expect("valid iPhone metrics");
        assert_eq!(params["width"], 390);
        assert_eq!(params["height"], 844);
        assert_eq!(params["screenWidth"], 390);
        assert_eq!(params["screenHeight"], 844);
        assert_eq!(params["deviceScaleFactor"], 3.0);
        assert_eq!(params["scale"], 0.5);
        assert_eq!(params["mobile"], true);
        assert_eq!(params["screenOrientation"]["type"], "portraitPrimary");
        assert_eq!(params["screenOrientation"]["angle"], 0);
    }

    #[test]
    fn landscape_metrics_report_rotated_orientation() {
        let mut emulation = iphone_13(0.75);
        emulation.viewport_width = 844;
        emulation.viewport_height = 390;
        emulation.screen_width = 844;
        emulation.screen_height = 390;
        emulation.orientation = "landscape".to_string();
        let params = device_metrics_params(&emulation).expect("valid landscape metrics");
        assert_eq!(params["width"], 844);
        assert_eq!(params["height"], 390);
        assert_eq!(params["screenOrientation"]["type"], "landscapePrimary");
        assert_eq!(params["screenOrientation"]["angle"], 90);
    }

    #[test]
    fn rejects_invalid_metrics_before_webview_execution() {
        let mut emulation = iphone_13(0.5);
        emulation.device_scale_factor = f64::NAN;
        assert!(device_metrics_params(&emulation).is_err());

        let mut emulation = iphone_13(0.5);
        emulation.display_scale = 0.0;
        assert!(device_metrics_params(&emulation).is_err());
    }

    #[test]
    fn touch_parameters_follow_the_selected_device() {
        assert_eq!(touch_emulation_params(&iphone_13(1.0))["enabled"], true);
        let mut desktop = iphone_13(1.0);
        desktop.mobile = false;
        desktop.touch = false;
        assert_eq!(touch_emulation_params(&desktop)["enabled"], false);
    }
}
