use std::{path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{Cookie, NewWindowResponse, WebviewBuilder},
    AppHandle, LogicalPosition, LogicalSize, Manager, State, Webview, WebviewUrl, Window,
};

use super::SiyuanRuntimeState;

const SURFACE_LABEL: &str = "siyuan-context-vault";
const MAIN_WEBVIEW_ADDITIONAL_BROWSER_ARGS: &str = "--js-flags=--max-old-space-size=1536";
const SIYUAN_CHILD_CDP_PORT_ENV: &str = "VIBESPACE_SIYUAN_CHILD_CDP_PORT";
const SIYUAN_GRAPH_FIRST_INITIALIZATION_SCRIPT_TEMPLATE: &str = r#"
((targetDocumentId, graphMode) => {
  if (
    window.top !== window ||
    window.location.protocol !== "http:" ||
    window.location.hostname !== "127.0.0.1"
  ) {
    return;
  }

  const deadline = Date.now() + 10000;
  const local = graphMode === "local";
  const dockSelector = local
    ? '.dock__item[data-type="graph"]'
    : '.dock__item[data-type="globalGraph"]';
  const graphSelector = local ? ".sy__graph" : ".sy__globalGraph";
  const fullscreenSelector = '[data-type="fullscreen"]';
  let documentRequested = !local;
  let dockRequested = false;
  let timer;

  const stop = () => {
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };

  const tick = () => {
    try {
      if (Date.now() >= deadline) {
        stop();
        return;
      }

      if (!documentRequested) {
        const api = window.require?.("siyuan");
        const app = window.siyuan?.ws?.app;
        if (!api?.openTab || !app || !targetDocumentId) {
          return;
        }
        documentRequested = true;
        api.openTab({ app, doc: { id: targetDocumentId } });
        return;
      }

      const dock = document.querySelector(dockSelector);
      if (!dock) {
        return;
      }

      const graph = document.querySelector(graphSelector);
      if (!graph || !dock.classList.contains("dock__item--active")) {
        if (!dockRequested) {
          dockRequested = true;
          dock.click();
        }
        return;
      }

      if (graph.classList.contains("fullscreen")) {
        stop();
        return;
      }

      const fullscreen = graph.querySelector(fullscreenSelector);
      if (!fullscreen) {
        return;
      }

      fullscreen.click();
      stop();
    } catch (_error) {
      stop();
    }
  };

  timer = window.setInterval(tick, 200);
  window.addEventListener("pagehide", stop, { once: true });
  tick();
})(__TARGET_DOCUMENT_ID__, __GRAPH_MODE__);
"#;
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
    map_id: Option<String>,
    notebook_id: Option<String>,
    root_document_id: Option<String>,
    graph_mode: Option<String>,
}

struct SurfaceRecord {
    project_id: String,
    map_id: String,
    notebook_id: Option<String>,
    root_document_id: Option<String>,
    graph_mode: String,
    visible: bool,
}

static SURFACE_STATE: Mutex<Option<SurfaceRecord>> = Mutex::new(None);

fn public_error(code: &'static str) -> String {
    code.to_owned()
}

fn validate_identifier(value: &str, code: &'static str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 160
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        Err(public_error(code))
    } else {
        Ok(())
    }
}

fn validate_siyuan_node_id(value: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    let valid = bytes.len() == 22
        && bytes[..14].iter().all(u8::is_ascii_digit)
        && bytes[14] == b'-'
        && bytes[15..]
            .iter()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit());
    if valid {
        Ok(())
    } else {
        Err(public_error("siyuan_node_id_invalid"))
    }
}

fn graph_initialization_script(
    graph_mode: &str,
    root_document_id: Option<&str>,
) -> Result<String, String> {
    if !matches!(graph_mode, "local" | "global") {
        return Err(public_error("siyuan_surface_graph_mode_invalid"));
    }
    if graph_mode == "local" {
        validate_siyuan_node_id(
            root_document_id.ok_or_else(|| public_error("siyuan_surface_target_invalid"))?,
        )?;
    } else if let Some(value) = root_document_id {
        validate_siyuan_node_id(value)?;
    }
    let target = serde_json::to_string(&root_document_id)
        .map_err(|_| public_error("siyuan_surface_target_invalid"))?;
    let mode = serde_json::to_string(graph_mode)
        .map_err(|_| public_error("siyuan_surface_graph_mode_invalid"))?;
    Ok(SIYUAN_GRAPH_FIRST_INITIALIZATION_SCRIPT_TEMPLATE
        .replace("__TARGET_DOCUMENT_ID__", &target)
        .replace("__GRAPH_MODE__", &mode))
}

fn siyuan_session_cookie_for_deletion() -> Cookie<'static> {
    Cookie::build(("siyuan", ""))
        .domain("127.0.0.1")
        .path("/")
        .build()
}

fn retire_surface_window(webview: &Webview) -> Result<(), tauri::Error> {
    let _ = webview.delete_cookie(siyuan_session_cookie_for_deletion());
    webview.close()
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

fn main_window(app: &AppHandle) -> Result<Window, String> {
    app.get_window("main")
        .ok_or_else(|| public_error("siyuan_surface_main_window_unavailable"))
}

fn debug_child_cdp_port(value: Option<&str>, debug_build: bool) -> Option<u16> {
    if !debug_build {
        return None;
    }
    value?
        .trim()
        .parse::<u16>()
        .ok()
        .filter(|port| *port >= 1024)
}

fn child_cdp_configuration(app: &AppHandle) -> Result<Option<(PathBuf, String)>, String> {
    let port = debug_child_cdp_port(
        std::env::var(SIYUAN_CHILD_CDP_PORT_ENV).ok().as_deref(),
        cfg!(debug_assertions),
    );
    let Some(port) = port else {
        return Ok(None);
    };
    let data_directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| public_error("siyuan_surface_webview_unavailable"))?
        .join("webview-data")
        .join("siyuan-child-cdp")
        .join(port.to_string());
    let browser_args = format!(
        "{MAIN_WEBVIEW_ADDITIONAL_BROWSER_ARGS} --remote-debugging-address=127.0.0.1 --remote-debugging-port={port}"
    );
    Ok(Some((data_directory, browser_args)))
}

fn child_geometry(
    bounds: &SiyuanSurfaceBounds,
) -> Result<(LogicalPosition<f64>, LogicalSize<f64>), String> {
    validate_bounds(bounds)?;
    Ok((
        LogicalPosition::new(bounds.x, bounds.y),
        LogicalSize::new(bounds.width, bounds.height),
    ))
}

fn apply_bounds(webview: &Webview, bounds: &SiyuanSurfaceBounds) -> Result<(), String> {
    let (position, size) = child_geometry(bounds)?;
    webview
        .set_position(position)
        .map_err(|_| public_error("siyuan_surface_bounds_unavailable"))?;
    webview
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
    let created = app.get_webview(SURFACE_LABEL).is_some();
    let state = SURFACE_STATE.lock().ok();
    let record = state.as_ref().and_then(|guard| guard.as_ref());
    SiyuanSurfaceStatus {
        created,
        visible: created && record.is_some_and(|value| value.visible),
        project_id: record.map(|value| value.project_id.clone()),
        map_id: record.map(|value| value.map_id.clone()),
        notebook_id: record.and_then(|value| value.notebook_id.clone()),
        root_document_id: record.and_then(|value| value.root_document_id.clone()),
        graph_mode: record.map(|value| value.graph_mode.clone()),
    }
}

#[tauri::command]
pub async fn siyuan_surface_open(
    app: AppHandle,
    project_id: String,
    map_id: String,
    notebook_id: Option<String>,
    root_document_id: Option<String>,
    graph_mode: String,
    bounds: SiyuanSurfaceBounds,
    state: State<'_, SiyuanRuntimeState>,
) -> Result<SiyuanSurfaceStatus, String> {
    validate_bounds(&bounds)?;
    validate_identifier(&project_id, "siyuan_project_id_invalid")?;
    validate_identifier(&map_id, "siyuan_map_id_invalid")?;
    if let Some(value) = notebook_id.as_deref() {
        validate_siyuan_node_id(value)?;
    }
    if graph_mode == "local" && notebook_id.is_none() {
        return Err(public_error("siyuan_surface_target_invalid"));
    }
    let initialization_script =
        graph_initialization_script(&graph_mode, root_document_id.as_deref())?;
    let runtime = state.inner().clone();
    let project_for_runtime = project_id.clone();
    let authority = tauri::async_runtime::spawn_blocking(move || {
        runtime
            .surface_session_with_recovery(&project_for_runtime)
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
    if let Some(existing) = app.get_webview(SURFACE_LABEL) {
        let same_target = SURFACE_STATE
            .lock()
            .map_err(|_| public_error("siyuan_surface_state_unavailable"))?
            .as_ref()
            .is_some_and(|record| {
                record.project_id == project_id
                    && record.map_id == map_id
                    && record.notebook_id == notebook_id
                    && record.root_document_id == root_document_id
                    && record.graph_mode == graph_mode
            });
        if same_target {
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
            apply_bounds(&existing, &bounds)?;
            existing
                .show()
                .map_err(|_| public_error("siyuan_surface_window_unavailable"))?;
            *SURFACE_STATE
                .lock()
                .map_err(|_| public_error("siyuan_surface_state_unavailable"))? =
                Some(SurfaceRecord {
                    project_id,
                    map_id,
                    notebook_id,
                    root_document_id,
                    graph_mode,
                    visible: true,
                });
            return Ok(status(&app));
        }
        let _ = retire_surface_window(&existing);
        *SURFACE_STATE
            .lock()
            .map_err(|_| public_error("siyuan_surface_state_unavailable"))? = None;
    }

    let blank = url::Url::parse("about:blank")
        .map_err(|_| public_error("siyuan_surface_origin_invalid"))?;
    let allowed_origin = origin.clone();
    let (position, size) = child_geometry(&bounds)?;
    let mut builder = WebviewBuilder::new(SURFACE_LABEL, WebviewUrl::External(blank))
        .focused(true)
        .additional_browser_args(MAIN_WEBVIEW_ADDITIONAL_BROWSER_ARGS)
        .initialization_script(&initialization_script)
        .on_navigation(move |candidate| navigation_allowed(&allowed_origin, candidate))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false);
    if let Some((data_directory, browser_args)) = child_cdp_configuration(&app)? {
        builder = builder
            .data_directory(data_directory)
            .additional_browser_args(&browser_args);
    }

    let webview = main
        .add_child(builder, position, size)
        .map_err(|_| public_error("siyuan_surface_webview_unavailable"))?;
    webview
        .set_cookie(
            Cookie::build(("siyuan", cookie_value))
                .domain("127.0.0.1")
                .path("/")
                .http_only(true)
                .build(),
        )
        .map_err(|_| public_error("siyuan_surface_session_unavailable"))?;
    webview
        .navigate(origin)
        .map_err(|_| public_error("siyuan_surface_navigation_unavailable"))?;
    apply_bounds(&webview, &bounds)?;
    webview
        .show()
        .map_err(|_| public_error("siyuan_surface_window_unavailable"))?;
    *SURFACE_STATE
        .lock()
        .map_err(|_| public_error("siyuan_surface_state_unavailable"))? = Some(SurfaceRecord {
        project_id,
        map_id,
        notebook_id,
        root_document_id,
        graph_mode,
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
    let Some(webview) = app.get_webview(SURFACE_LABEL) else {
        return Ok(false);
    };
    apply_bounds(&webview, &bounds)?;
    Ok(true)
}

#[tauri::command]
pub fn siyuan_surface_hide(app: AppHandle) -> Result<bool, String> {
    let Some(webview) = app.get_webview(SURFACE_LABEL) else {
        return Ok(false);
    };
    webview
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
    let Some(webview) = app.get_webview(SURFACE_LABEL) else {
        return Ok(false);
    };
    webview
        .reload()
        .map_err(|_| public_error("siyuan_surface_navigation_unavailable"))?;
    Ok(true)
}

#[tauri::command]
pub fn siyuan_surface_close(app: AppHandle) -> Result<bool, String> {
    let Some(webview) = app.get_webview(SURFACE_LABEL) else {
        return Ok(false);
    };
    retire_surface_window(&webview)
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
    if let Some(webview) = app.get_webview(SURFACE_LABEL) {
        let _ = retire_surface_window(&webview);
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
            map_id: Some("map-1".to_owned()),
            notebook_id: Some("20260824010101-abcdefg".to_owned()),
            root_document_id: Some("20260824010102-abcdefg".to_owned()),
            graph_mode: Some("local".to_owned()),
        })
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "created": true,
                "visible": true,
                "projectId": "project-1",
                "mapId": "map-1",
                "notebookId": "20260824010101-abcdefg",
                "rootDocumentId": "20260824010102-abcdefg",
                "graphMode": "local",
            })
        );
        let rendered = value.to_string().to_ascii_lowercase();
        for forbidden in ["cookie", "token", "port", "origin", "url"] {
            assert!(!rendered.contains(forbidden));
        }
    }

    #[test]
    fn surface_webview_browser_args_match_the_main_window_environment() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        let main_window = config["app"]["windows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|window| window["label"] == "main")
            .unwrap();

        assert_eq!(
            main_window["additionalBrowserArgs"].as_str(),
            Some(MAIN_WEBVIEW_ADDITIONAL_BROWSER_ARGS)
        );
    }

    #[test]
    fn child_cdp_port_is_debug_only_and_validated() {
        assert_eq!(debug_child_cdp_port(Some(" 9334 "), true), Some(9334));
        assert_eq!(debug_child_cdp_port(Some("9334"), false), None);
        assert_eq!(debug_child_cdp_port(Some("0"), true), None);
        assert_eq!(debug_child_cdp_port(Some("1023"), true), None);
        assert_eq!(debug_child_cdp_port(Some("not-a-port"), true), None);
        assert_eq!(debug_child_cdp_port(None, true), None);
    }

    #[test]
    fn child_cdp_configuration_is_isolated_and_loopback_only() {
        let source = include_str!("surface.rs");
        assert!(source.contains("cfg!(debug_assertions)"));
        assert!(source.contains(".data_directory(data_directory)"));
        assert!(source.contains("--remote-debugging-address=127.0.0.1"));
        assert!(source.contains("--remote-debugging-port={port}"));
    }

    #[test]
    fn surface_is_a_true_child_webview_of_the_main_window() {
        let source = include_str!("surface.rs");
        let child_builder = ["Webview", "Builder::new("].join("");
        let add_child = [".add", "_child("].join("");
        let managed_child_lookup = ["app.get", "_webview(SURFACE_LABEL)"].join("");
        let independent_builder = ["Webview", "WindowBuilder"].join("");
        let native_owner = [".owner", "(&main)"].join("");
        let desktop_origin = ["main.inner", "_position()"].join("");

        assert!(source.contains(&child_builder));
        assert!(source.contains(&add_child));
        assert!(source.contains(&managed_child_lookup));
        assert!(!source.contains(&independent_builder));
        assert!(!source.contains(&native_owner));
        assert!(!source.contains(&desktop_origin));
    }

    #[test]
    fn child_geometry_is_parent_relative_and_logical() {
        let (position, size) = child_geometry(&SiyuanSurfaceBounds {
            x: 120.5,
            y: 80.25,
            width: 1_200.0,
            height: 800.0,
        })
        .unwrap();

        assert_eq!(position, LogicalPosition::new(120.5, 80.25));
        assert_eq!(size, LogicalSize::new(1_200.0, 800.0));
    }

    #[test]
    fn graph_first_initialization_uses_only_official_bounded_dom_actions() {
        let script = graph_initialization_script("local", Some("20260824010102-abcdefg"))
            .expect("valid local graph target");

        for required in [
            r#".dock__item[data-type="graph"]"#,
            r#".dock__item[data-type="globalGraph"]"#,
            ".sy__graph",
            ".sy__globalGraph",
            r#"window.require?.("siyuan")"#,
            "window.siyuan?.ws?.app",
            "api.openTab({ app, doc: { id: targetDocumentId } })",
            "20260824010102-abcdefg",
            r#"[data-type="fullscreen"]"#,
            "window.top !== window",
            r#"window.location.protocol !== "http:""#,
            r#"window.location.hostname !== "127.0.0.1""#,
            "Date.now() + 10000",
            "window.setInterval(tick, 200)",
            "window.clearInterval(timer)",
            "pagehide",
            "try {",
            "catch (_error)",
            ".click()",
        ] {
            assert!(
                script.contains(required),
                "missing graph-first contract: {required}"
            );
        }

        for forbidden in [
            "fetch(",
            "/api/",
            "Authorization",
            "token",
            "cookie",
            "document.cookie",
            "localStorage",
            "innerHTML",
            "eval(",
        ] {
            assert!(
                !script.contains(forbidden),
                "forbidden graph-first authority: {forbidden}"
            );
        }
        assert_eq!(script.matches(".click()").count(), 2);
    }

    #[test]
    fn graph_first_initialization_is_installed_on_the_child_builder() {
        let source = include_str!("surface.rs");
        let install_call = [".initialization", "_script(&initialization_script)"].join("");

        assert!(source.contains(&install_call));
    }

    #[test]
    fn graph_target_validation_fails_closed() {
        assert!(graph_initialization_script("local", Some("20260824010102-abcdefg")).is_ok());
        assert!(graph_initialization_script("global", None).is_ok());
        assert_eq!(
            graph_initialization_script("local", None),
            Err("siyuan_surface_target_invalid".to_owned())
        );
        assert_eq!(
            graph_initialization_script("other", None),
            Err("siyuan_surface_graph_mode_invalid".to_owned())
        );
        assert!(graph_initialization_script("local", Some("bad');fetch('/api');")).is_err());
    }

    #[test]
    fn surface_retirement_never_clears_the_shared_webview_profile() {
        let source = include_str!("surface.rs");
        let profile_wide_clear = ["clear", "all", "browsing", "data"].join("_");
        let retirement_symbol = ["retire", "surface", "window"].join("_");
        let retirement_call = format!("{retirement_symbol}(");
        let cookie = siyuan_session_cookie_for_deletion();

        assert!(!source.contains(&profile_wide_clear));
        assert_eq!(source.matches(&retirement_call).count(), 4);
        assert_eq!(cookie.name(), "siyuan");
        assert_eq!(cookie.value(), "");
        assert_eq!(cookie.domain(), Some("127.0.0.1"));
        assert_eq!(cookie.path(), Some("/"));
    }
}
