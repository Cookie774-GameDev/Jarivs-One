use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{Cookie, NewWindowResponse},
    AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use super::SiyuanRuntimeState;

const SURFACE_LABEL: &str = "siyuan-context-vault";
const MIN_SURFACE_WIDTH: f64 = 320.0;
const MIN_SURFACE_HEIGHT: f64 = 240.0;
const MAX_SURFACE_EDGE: f64 = 16_384.0;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiyuanSurfaceBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiyuanSurfaceStatus {
    created: bool,
    visible: bool,
    project_id: Option<String>,
}

struct SurfaceRecord {
    project_id: String,
    visible: bool,
}

static SURFACE_STATE: Mutex<Option<SurfaceRecord>> = Mutex::new(None);

fn public_error(code: &'static str) -> String {
    code.to_owned()
}

fn validate_bounds(bounds: &SiyuanSurfaceBounds) -> Result<(), String> {
    if !bounds.x.is_finite()
        || !bounds.y.is_finite()
        || !bounds.width.is_finite()
        || !bounds.height.is_finite()
        || bounds.x.abs() > MAX_SURFACE_EDGE
        || bounds.y.abs() > MAX_SURFACE_EDGE
        || bounds.width < MIN_SURFACE_WIDTH
        || bounds.height < MIN_SURFACE_HEIGHT
        || bounds.width > MAX_SURFACE_EDGE
        || bounds.height > MAX_SURFACE_EDGE
    {
        Err(public_error("siyuan_surface_bounds_invalid"))
    } else {
        Ok(())
    }
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| public_error("siyuan_surface_main_window_unavailable"))
}

fn absolute_geometry(
    main: &WebviewWindow,
    bounds: &SiyuanSurfaceBounds,
) -> Result<(tauri::PhysicalPosition<i32>, tauri::PhysicalSize<u32>), String> {
    validate_bounds(bounds)?;
    let scale = main
        .scale_factor()
        .map_err(|_| public_error("siyuan_surface_bounds_unavailable"))?;
    let origin = main
        .inner_position()
        .map_err(|_| public_error("siyuan_surface_bounds_unavailable"))?;
    Ok((
        tauri::PhysicalPosition::new(
            origin.x.saturating_add((bounds.x * scale).round() as i32),
            origin.y.saturating_add((bounds.y * scale).round() as i32),
        ),
        tauri::PhysicalSize::new(
            (bounds.width * scale).round().max(1.0) as u32,
            (bounds.height * scale).round().max(1.0) as u32,
        ),
    ))
}

fn apply_bounds(
    window: &WebviewWindow,
    main: &WebviewWindow,
    bounds: &SiyuanSurfaceBounds,
) -> Result<(), String> {
    let (position, size) = absolute_geometry(main, bounds)?;
    window
        .set_position(position)
        .map_err(|_| public_error("siyuan_surface_bounds_unavailable"))?;
    window
        .set_size(size)
        .map_err(|_| public_error("siyuan_surface_bounds_unavailable"))?;
    Ok(())
}

fn navigation_allowed(origin: &url::Url, candidate: &url::Url) -> bool {
    if candidate.as_str() == "about:blank" {
        return true;
    }
    candidate.scheme() == "http"
        && candidate.username().is_empty()
        && candidate.password().is_none()
        && candidate.host_str() == Some("127.0.0.1")
        && candidate.scheme() == origin.scheme()
        && candidate.host_str() == origin.host_str()
        && candidate.port_or_known_default() == origin.port_or_known_default()
}

fn status(app: &AppHandle) -> SiyuanSurfaceStatus {
    let created = app.get_webview_window(SURFACE_LABEL).is_some();
    let state = SURFACE_STATE.lock().ok();
    let record = state.as_ref().and_then(|guard| guard.as_ref());
    SiyuanSurfaceStatus {
        created,
        visible: created && record.is_some_and(|value| value.visible),
        project_id: record.map(|value| value.project_id.clone()),
    }
}

#[tauri::command]
pub async fn siyuan_surface_open(
    app: AppHandle,
    project_id: String,
    bounds: SiyuanSurfaceBounds,
    state: State<'_, SiyuanRuntimeState>,
) -> Result<SiyuanSurfaceStatus, String> {
    validate_bounds(&bounds)?;
    let runtime = state.inner().clone();
    let project_for_runtime = project_id.clone();
    let authority = tauri::async_runtime::spawn_blocking(move || {
        runtime
            .start(&project_for_runtime)
            .map_err(|error| error.to_string())?;
        runtime
            .runtime_transport(&project_for_runtime)
            .map_err(|error| error.to_string())?
            .surface_session()
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|_| public_error("siyuan_surface_state_unavailable"))??;
    let (origin, cookie_value) = authority.into_parts();
    if origin.scheme() != "http"
        || origin.host_str() != Some("127.0.0.1")
        || origin.port().is_none()
        || origin.username() != ""
        || origin.password().is_some()
    {
        return Err(public_error("siyuan_surface_origin_invalid"));
    }

    let main = main_window(&app)?;
    if let Some(existing) = app.get_webview_window(SURFACE_LABEL) {
        let same_project = SURFACE_STATE
            .lock()
            .map_err(|_| public_error("siyuan_surface_state_unavailable"))?
            .as_ref()
            .is_some_and(|record| record.project_id == project_id);
        if same_project {
            existing
                .set_cookie(
                    Cookie::build(("siyuan", cookie_value))
                        .domain("127.0.0.1")
                        .path("/")
                        .http_only(true)
                        .build(),
                )
                .map_err(|_| public_error("siyuan_surface_session_unavailable"))?;
            existing
                .navigate(origin)
                .map_err(|_| public_error("siyuan_surface_navigation_unavailable"))?;
            apply_bounds(&existing, &main, &bounds)?;
            existing
                .show()
                .map_err(|_| public_error("siyuan_surface_window_unavailable"))?;
            *SURFACE_STATE
                .lock()
                .map_err(|_| public_error("siyuan_surface_state_unavailable"))? =
                Some(SurfaceRecord {
                    project_id,
                    visible: true,
                });
            return Ok(status(&app));
        }
        let _ = existing.clear_all_browsing_data();
        let _ = existing.destroy();
        *SURFACE_STATE
            .lock()
            .map_err(|_| public_error("siyuan_surface_state_unavailable"))? = None;
    }

    let blank = url::Url::parse("about:blank")
        .map_err(|_| public_error("siyuan_surface_origin_invalid"))?;
    let allowed_origin = origin.clone();
    let (position, size) = absolute_geometry(&main, &bounds)?;
    let builder = WebviewWindowBuilder::new(&app, SURFACE_LABEL, WebviewUrl::External(blank))
        .title("VibeSpace Context Vault")
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .focused(true)
        .inner_size(size.width as f64, size.height as f64)
        .position(position.x as f64, position.y as f64)
        .on_navigation(move |candidate| navigation_allowed(&allowed_origin, candidate))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false);

    #[cfg(windows)]
    let builder = builder
        .owner(&main)
        .map_err(|_| public_error("siyuan_surface_window_unavailable"))?;
    let window = builder
        .build()
        .map_err(|_| public_error("siyuan_surface_window_unavailable"))?;
    window
        .set_cookie(
            Cookie::build(("siyuan", cookie_value))
                .domain("127.0.0.1")
                .path("/")
                .http_only(true)
                .build(),
        )
        .map_err(|_| public_error("siyuan_surface_session_unavailable"))?;
    window
        .navigate(origin)
        .map_err(|_| public_error("siyuan_surface_navigation_unavailable"))?;
    apply_bounds(&window, &main, &bounds)?;
    window
        .show()
        .map_err(|_| public_error("siyuan_surface_window_unavailable"))?;
    *SURFACE_STATE
        .lock()
        .map_err(|_| public_error("siyuan_surface_state_unavailable"))? = Some(SurfaceRecord {
        project_id,
        visible: true,
    });
    Ok(status(&app))
}

#[tauri::command]
pub fn siyuan_surface_set_bounds(
    app: AppHandle,
    bounds: SiyuanSurfaceBounds,
) -> Result<bool, String> {
    validate_bounds(&bounds)?;
    let Some(window) = app.get_webview_window(SURFACE_LABEL) else {
        return Ok(false);
    };
    apply_bounds(&window, &main_window(&app)?, &bounds)?;
    Ok(true)
}

#[tauri::command]
pub fn siyuan_surface_hide(app: AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window(SURFACE_LABEL) else {
        return Ok(false);
    };
    window
        .hide()
        .map_err(|_| public_error("siyuan_surface_window_unavailable"))?;
    if let Some(record) = SURFACE_STATE
        .lock()
        .map_err(|_| public_error("siyuan_surface_state_unavailable"))?
        .as_mut()
    {
        record.visible = false;
    }
    Ok(true)
}

#[tauri::command]
pub fn siyuan_surface_reload(app: AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window(SURFACE_LABEL) else {
        return Ok(false);
    };
    window
        .reload()
        .map_err(|_| public_error("siyuan_surface_navigation_unavailable"))?;
    Ok(true)
}

#[tauri::command]
pub fn siyuan_surface_close(app: AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window(SURFACE_LABEL) else {
        return Ok(false);
    };
    let _ = window.clear_all_browsing_data();
    window
        .destroy()
        .map_err(|_| public_error("siyuan_surface_window_unavailable"))?;
    *SURFACE_STATE
        .lock()
        .map_err(|_| public_error("siyuan_surface_state_unavailable"))? = None;
    Ok(true)
}

#[tauri::command]
pub fn siyuan_surface_status(app: AppHandle) -> SiyuanSurfaceStatus {
    status(&app)
}

pub fn shutdown_surface(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SURFACE_LABEL) {
        let _ = window.clear_all_browsing_data();
        let _ = window.destroy();
    }
    if let Ok(mut state) = SURFACE_STATE.lock() {
        *state = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surface_bounds_are_finite_bounded_and_useful() {
        assert!(validate_bounds(&SiyuanSurfaceBounds {
            x: 120.0,
            y: 80.0,
            width: 1_200.0,
            height: 800.0,
        })
        .is_ok());
        for bounds in [
            SiyuanSurfaceBounds {
                x: 0.0,
                y: 0.0,
                width: 319.0,
                height: 800.0,
            },
            SiyuanSurfaceBounds {
                x: f64::NAN,
                y: 0.0,
                width: 1_200.0,
                height: 800.0,
            },
            SiyuanSurfaceBounds {
                x: 0.0,
                y: 0.0,
                width: 1_200.0,
                height: 20_000.0,
            },
        ] {
            assert_eq!(
                validate_bounds(&bounds),
                Err("siyuan_surface_bounds_invalid".to_owned())
            );
        }
    }

    #[test]
    fn navigation_is_exact_random_loopback_origin_only() {
        let origin = url::Url::parse("http://127.0.0.1:61342/").unwrap();
        for allowed in [
            "about:blank",
            "http://127.0.0.1:61342/",
            "http://127.0.0.1:61342/stage/build/app/index.html#editor",
        ] {
            assert!(navigation_allowed(
                &origin,
                &url::Url::parse(allowed).unwrap()
            ));
        }
        for denied in [
            "http://localhost:61342/",
            "http://127.0.0.1:61343/",
            "https://127.0.0.1:61342/",
            "https://example.com/",
            "http://user@127.0.0.1:61342/",
        ] {
            assert!(!navigation_allowed(
                &origin,
                &url::Url::parse(denied).unwrap()
            ));
        }
    }

    #[test]
    fn public_status_contains_no_origin_cookie_or_runtime_secret_fields() {
        let value = serde_json::to_value(SiyuanSurfaceStatus {
            created: true,
            visible: true,
            project_id: Some("project-1".to_owned()),
        })
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "created": true,
                "visible": true,
                "projectId": "project-1",
            })
        );
        let rendered = value.to_string().to_ascii_lowercase();
        for forbidden in ["cookie", "token", "port", "origin", "url"] {
            assert!(!rendered.contains(forbidden));
        }
    }
}
