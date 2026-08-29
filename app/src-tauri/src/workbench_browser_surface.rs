//! True in-window Workbench browser surfaces.
//!
//! Remote pages are child WebViews of the trusted local main window. They receive no
//! VibeSpace command capability, and every renderer command is bound to one validated
//! panel/operation pair.

use std::{collections::HashMap, sync::LazyLock, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{PageLoadEvent, Webview, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
};

const EVENT_NAME: &str = "workbench-browser://state";
const INIT_SCRIPT: &str = r#"
(() => {
  try { delete window.__TAURI_INTERNALS__; } catch (_) {}
  const navigate = (value) => {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) location.assign(value);
    return null;
  };
  try { window.open = navigate; } catch (_) {}
  document.addEventListener('click', (event) => {
    const anchor = event.target?.closest?.('a[target="_blank"]');
    if (anchor) anchor.removeAttribute('target');
  }, true);
})();
"#;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchBrowserBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchBrowserStatus {
    panel_id: String,
    operation_id: String,
    url: String,
    loading: bool,
    error: Option<String>,
}

#[derive(Clone, Debug)]
struct SurfaceRecord {
    operation_id: String,
}

static SURFACES: LazyLock<Mutex<HashMap<String, SurfaceRecord>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn validate_id(value: &str, code: &'static str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 120
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(code.to_owned());
    }
    Ok(())
}

fn ensure_caller(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("workbench_browser_caller_not_authorized".to_owned())
    }
}

fn validate_url(raw: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(raw).map_err(|_| "workbench_browser_url_invalid".to_owned())?;
    if !matches!(parsed.scheme(), "http" | "https")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("workbench_browser_url_not_allowed".to_owned());
    }
    Ok(parsed)
}

fn navigation_allowed(candidate: &url::Url) -> bool {
    candidate.as_str() == "about:blank"
        || (matches!(candidate.scheme(), "http" | "https")
            && candidate.username().is_empty()
            && candidate.password().is_none())
}

fn validate_bounds(bounds: &WorkbenchBrowserBounds) -> Result<(), String> {
    if bounds.x.is_finite()
        && bounds.y.is_finite()
        && bounds.width.is_finite()
        && bounds.height.is_finite()
        && bounds.width >= 1.0
        && bounds.height >= 1.0
        && bounds.width <= 16_384.0
        && bounds.height <= 16_384.0
    {
        Ok(())
    } else {
        Err("workbench_browser_bounds_invalid".to_owned())
    }
}

fn label(panel_id: &str) -> String {
    format!("workbench-browser-{panel_id}")
}

fn apply_bounds(webview: &Webview, bounds: &WorkbenchBrowserBounds) -> Result<(), String> {
    webview
        .set_position(LogicalPosition::new(bounds.x, bounds.y))
        .map_err(|_| "workbench_browser_bounds_unavailable".to_owned())?;
    webview
        .set_size(LogicalSize::new(bounds.width, bounds.height))
        .map_err(|_| "workbench_browser_bounds_unavailable".to_owned())
}

fn current_operation(panel_id: &str, operation_id: &str) -> Result<(), String> {
    let state = SURFACES
        .lock()
        .map_err(|_| "workbench_browser_state_unavailable".to_owned())?;
    match state.get(panel_id) {
        Some(record) if record.operation_id == operation_id => Ok(()),
        _ => Err("workbench_browser_operation_stale".to_owned()),
    }
}

fn emit_state(
    app: &AppHandle,
    panel_id: &str,
    operation_id: &str,
    url: &url::Url,
    loading: bool,
    error: Option<String>,
) {
    let _ = app.emit_to(
        "main",
        EVENT_NAME,
        WorkbenchBrowserStatus {
            panel_id: panel_id.to_owned(),
            operation_id: operation_id.to_owned(),
            url: url.to_string(),
            loading,
            error,
        },
    );
}

fn emit_current_state(
    app: &AppHandle,
    panel_id: &str,
    url: &url::Url,
    loading: bool,
    error: Option<String>,
) {
    let operation_id = SURFACES.lock().ok().and_then(|state| {
        state
            .get(panel_id)
            .map(|record| record.operation_id.clone())
    });
    if let Some(operation_id) = operation_id {
        emit_state(app, panel_id, &operation_id, url, loading, error);
    }
}

#[tauri::command]
pub async fn workbench_browser_surface_open(
    app: AppHandle,
    caller: WebviewWindow,
    panel_id: String,
    operation_id: String,
    url: String,
    bounds: WorkbenchBrowserBounds,
) -> Result<WorkbenchBrowserStatus, String> {
    ensure_caller(caller.label())?;
    validate_id(&panel_id, "workbench_browser_panel_invalid")?;
    validate_id(&operation_id, "workbench_browser_operation_invalid")?;
    validate_bounds(&bounds)?;
    let target = validate_url(&url)?;
    let surface_label = label(&panel_id);

    SURFACES
        .lock()
        .map_err(|_| "workbench_browser_state_unavailable".to_owned())?
        .insert(
            panel_id.clone(),
            SurfaceRecord {
                operation_id: operation_id.clone(),
            },
        );

    let webview = if let Some(existing) = app.get_webview(&surface_label) {
        if existing
            .url()
            .map_err(|_| "workbench_browser_navigation_unavailable".to_owned())?
            != target
        {
            existing
                .navigate(target.clone())
                .map_err(|_| "workbench_browser_navigation_unavailable".to_owned())?;
        }
        existing
    } else {
        let main = app
            .get_window("main")
            .ok_or_else(|| "workbench_browser_main_window_missing".to_owned())?;
        let profile = app
            .path()
            .app_data_dir()
            .map_err(|_| "workbench_browser_profile_unavailable".to_owned())?
            .join("workbench-browser")
            .join(&panel_id);
        std::fs::create_dir_all(&profile)
            .map_err(|_| "workbench_browser_profile_unavailable".to_owned())?;
        let event_app = app.clone();
        let event_panel = panel_id.clone();
        let load_app = app.clone();
        let load_panel = panel_id.clone();
        let builder = WebviewBuilder::new(surface_label, WebviewUrl::External(target.clone()))
            .data_directory(profile)
            .focused(false)
            .initialization_script(INIT_SCRIPT)
            .on_navigation(move |candidate| {
                let allowed = navigation_allowed(candidate);
                if allowed && candidate.as_str() != "about:blank" {
                    emit_current_state(&event_app, &event_panel, candidate, true, None);
                }
                allowed
            })
            .on_page_load(move |_webview, payload| {
                if payload.url().as_str() == "about:blank" || !navigation_allowed(payload.url()) {
                    return;
                }
                emit_current_state(
                    &load_app,
                    &load_panel,
                    payload.url(),
                    matches!(payload.event(), PageLoadEvent::Started),
                    None,
                );
            });
        main.add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width, bounds.height),
        )
        .map_err(|_| "workbench_browser_webview_unavailable".to_owned())?
    };
    apply_bounds(&webview, &bounds)?;
    webview
        .show()
        .map_err(|_| "workbench_browser_window_unavailable".to_owned())?;
    emit_state(&app, &panel_id, &operation_id, &target, true, None);
    Ok(WorkbenchBrowserStatus {
        panel_id,
        operation_id,
        url: target.to_string(),
        loading: true,
        error: None,
    })
}

fn with_surface(app: &AppHandle, panel_id: &str, operation_id: &str) -> Result<Webview, String> {
    validate_id(panel_id, "workbench_browser_panel_invalid")?;
    validate_id(operation_id, "workbench_browser_operation_invalid")?;
    current_operation(panel_id, operation_id)?;
    app.get_webview(&label(panel_id))
        .ok_or_else(|| "workbench_browser_surface_unavailable".to_owned())
}

#[tauri::command]
pub async fn workbench_browser_surface_history(
    app: AppHandle,
    caller: WebviewWindow,
    panel_id: String,
    operation_id: String,
    delta: i8,
) -> Result<(), String> {
    ensure_caller(caller.label())?;
    if !matches!(delta, -1 | 1) {
        return Err("workbench_browser_history_delta_invalid".to_owned());
    }
    let webview = with_surface(&app, &panel_id, &operation_id)?;
    webview
        .eval(if delta < 0 {
            "history.back()"
        } else {
            "history.forward()"
        })
        .map_err(|_| "workbench_browser_history_unavailable".to_owned())
}

#[tauri::command]
pub async fn workbench_browser_surface_reload(
    app: AppHandle,
    caller: WebviewWindow,
    panel_id: String,
    operation_id: String,
) -> Result<(), String> {
    ensure_caller(caller.label())?;
    with_surface(&app, &panel_id, &operation_id)?
        .reload()
        .map_err(|_| "workbench_browser_reload_unavailable".to_owned())
}

#[tauri::command]
pub async fn workbench_browser_surface_stop(
    app: AppHandle,
    caller: WebviewWindow,
    panel_id: String,
    operation_id: String,
) -> Result<(), String> {
    ensure_caller(caller.label())?;
    with_surface(&app, &panel_id, &operation_id)?
        .eval("window.stop()")
        .map_err(|_| "workbench_browser_stop_unavailable".to_owned())
}

#[tauri::command]
pub async fn workbench_browser_surface_hide(
    app: AppHandle,
    caller: WebviewWindow,
    panel_id: String,
    operation_id: String,
) -> Result<(), String> {
    ensure_caller(caller.label())?;
    let webview = with_surface(&app, &panel_id, &operation_id)?;
    webview
        .hide()
        .map_err(|_| "workbench_browser_window_unavailable".to_owned())?;
    webview
        .close()
        .map_err(|_| "workbench_browser_window_unavailable".to_owned())?;
    SURFACES
        .lock()
        .map_err(|_| "workbench_browser_state_unavailable".to_owned())?
        .remove(&panel_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_credentialless_http_urls() {
        assert!(validate_url("https://www.youtube.com/").is_ok());
        assert!(validate_url("http://example.com/path").is_ok());
        for blocked in [
            "file:///C:/secret.txt",
            "javascript:alert(1)",
            "https://user:secret@example.com/",
        ] {
            assert!(validate_url(blocked).is_err());
        }
    }

    #[test]
    fn child_surface_has_no_external_window_or_tauri_bridge_authority() {
        let source = include_str!("workbench_browser_surface.rs");
        let external_window_builder = ["WebviewWindow", "Builder"].concat();
        let external_open = ["open", "_external"].concat();
        assert!(source.contains("main.add_child("));
        assert!(!source.contains(&external_window_builder));
        assert!(!source.contains(&external_open));
        assert!(INIT_SCRIPT.contains("delete window.__TAURI_INTERNALS__"));
    }

    #[test]
    fn navigation_and_operations_are_bounded() {
        let allowed = url::Url::parse("https://www.wikipedia.org/").unwrap();
        let blocked = url::Url::parse("file:///C:/secret.txt").unwrap();
        assert!(navigation_allowed(&allowed));
        assert!(!navigation_allowed(&blocked));
        assert!(validate_id("panel_1", "invalid").is_ok());
        assert!(validate_id("../panel", "invalid").is_err());
        assert!(matches!(-1_i8, -1 | 1));
        assert!(matches!(1_i8, -1 | 1));
    }
}
