//! Browser Chat provider surfaces hosted as children of the main native window.
//!
//! Provider pages receive no initialization script or VibeSpace command
//! authority. The native navigation callback emits only allowlisted top-level
//! URL metadata to the local `main` webview.

use std::sync::{LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewBuilder, WebviewUrl,
    WebviewWindow,
};

const NAVIGATION_EVENT: &str = "browser-chat://navigation";
const PROVIDER_LABELS: [&str; 3] = [
    "browser-chat-chatgpt",
    "browser-chat-claude",
    "browser-chat-gemini",
];

#[derive(Default)]
struct SurfaceState {
    active_provider: Option<&'static str>,
}

static SURFACE_STATE: LazyLock<Mutex<SurfaceState>> =
    LazyLock::new(|| Mutex::new(SurfaceState::default()));

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserChatBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserChatSurfaceStatus {
    pub provider_id: String,
    pub created: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BrowserChatNavigation {
    provider_id: String,
    surface_id: String,
    url: String,
    timestamp: u64,
    kind: String,
}

#[derive(Clone)]
struct ProviderConfig {
    id: &'static str,
    label: &'static str,
    hostname: &'static str,
    url: url::Url,
}

fn provider_config(provider_id: &str) -> Result<ProviderConfig, String> {
    let (id, label, hostname, url) = match provider_id {
        "chatgpt" => (
            "chatgpt",
            "browser-chat-chatgpt",
            "chatgpt.com",
            "https://chatgpt.com/",
        ),
        "claude" => (
            "claude",
            "browser-chat-claude",
            "claude.ai",
            "https://claude.ai/new",
        ),
        "gemini" => (
            "gemini",
            "browser-chat-gemini",
            "gemini.google.com",
            "https://gemini.google.com/",
        ),
        _ => return Err("browser_chat_provider_not_allowed".to_string()),
    };
    Ok(ProviderConfig {
        id,
        label,
        hostname,
        url: url
            .parse()
            .map_err(|_| "browser_chat_provider_url_invalid".to_string())?,
    })
}

fn ensure_main_caller(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("browser_chat_caller_not_authorized".to_string())
    }
}

fn validate_bounds(bounds: &BrowserChatBounds) -> Result<(), String> {
    if bounds.x.is_finite()
        && bounds.y.is_finite()
        && bounds.width.is_finite()
        && bounds.height.is_finite()
        && bounds.width >= 1.0
        && bounds.height >= 1.0
    {
        Ok(())
    } else {
        Err("browser_chat_bounds_invalid".to_string())
    }
}

fn relative_bounds(
    bounds: &BrowserChatBounds,
) -> Result<(LogicalPosition<f64>, LogicalSize<f64>), String> {
    validate_bounds(bounds)?;
    Ok((
        LogicalPosition::new(bounds.x, bounds.y),
        LogicalSize::new(bounds.width, bounds.height),
    ))
}

fn apply_bounds(provider: &Webview, bounds: &BrowserChatBounds) -> Result<(), String> {
    let (position, size) = relative_bounds(bounds)?;
    provider
        .set_position(position)
        .map_err(|error| format!("browser_chat_position_failed:{error}"))?;
    provider
        .set_size(size)
        .map_err(|error| format!("browser_chat_size_failed:{error}"))
}

fn hide_other_providers(app: &AppHandle, selected: Option<&str>) {
    for label in PROVIDER_LABELS {
        if Some(label) != selected {
            if let Some(webview) = app.get_webview(label) {
                let _ = webview.hide();
            }
        }
    }
}

fn safe_key(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn navigation_kind(provider_id: &str, path: &str) -> Option<&'static str> {
    let segments: Vec<_> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    match provider_id {
        "chatgpt" => match segments.as_slice() {
            [] => Some("home"),
            ["c", conversation] if safe_key(conversation) => Some("conversation"),
            ["g", project, "project"] if safe_key(project) => Some("project"),
            ["g", project, "c", conversation] if safe_key(project) && safe_key(conversation) => {
                Some("conversation")
            }
            _ => None,
        },
        "claude" => match segments.as_slice() {
            [] | ["new"] => Some("home"),
            ["chat", conversation] if safe_key(conversation) => Some("conversation"),
            ["project", project] if safe_key(project) => Some("project"),
            _ => None,
        },
        "gemini" => match segments.as_slice() {
            [] => Some("home"),
            ["app", conversation] if safe_key(conversation) => Some("conversation"),
            _ => None,
        },
        _ => None,
    }
}

fn normalized_navigation(
    provider: &ProviderConfig,
    candidate: &url::Url,
    timestamp: u64,
) -> Option<BrowserChatNavigation> {
    if candidate.scheme() != "https"
        || candidate.host_str() != Some(provider.hostname)
        || candidate.port().is_some()
        || !candidate.username().is_empty()
        || candidate.password().is_some()
    {
        return None;
    }
    let kind = navigation_kind(provider.id, candidate.path())?;
    Some(BrowserChatNavigation {
        provider_id: provider.id.to_string(),
        surface_id: provider.label.to_string(),
        url: format!("https://{}{}", provider.hostname, candidate.path()),
        timestamp,
        kind: kind.to_string(),
    })
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn create_provider(
    app: &AppHandle,
    caller: &WebviewWindow,
    provider: &ProviderConfig,
    bounds: &BrowserChatBounds,
) -> Result<Webview, String> {
    let (position, size) = relative_bounds(bounds)?;
    let profile_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("browser_chat_profile_failed:{error}"))?
        .join("browser-chat")
        .join(provider.id);
    std::fs::create_dir_all(&profile_dir)
        .map_err(|error| format!("browser_chat_profile_failed:{error}"))?;

    let navigation_app = app.clone();
    let navigation_provider = provider.clone();
    let builder = WebviewBuilder::new(provider.label, WebviewUrl::External(provider.url.clone()))
        .data_directory(profile_dir)
        .on_navigation(move |candidate| {
            if let Some(navigation) =
                normalized_navigation(&navigation_provider, candidate, now_millis())
            {
                let _ = navigation_app.emit_to("main", NAVIGATION_EVENT, navigation);
            }
            true
        });

    app.get_window(caller.label())
        .ok_or_else(|| "browser_chat_main_window_missing".to_string())?
        .add_child(builder, position, size)
        .map_err(|error| format!("browser_chat_create_failed:{error}"))
}

fn open_provider(
    app: &AppHandle,
    caller: &WebviewWindow,
    provider: &ProviderConfig,
    bounds: &BrowserChatBounds,
    activate: bool,
) -> Result<(), String> {
    hide_other_providers(app, Some(provider.label));
    let (webview, created) = match app.get_webview(provider.label) {
        Some(existing) => {
            apply_bounds(&existing, bounds)?;
            (existing, false)
        }
        None => (create_provider(app, caller, provider, bounds)?, true),
    };
    if activate || created {
        webview
            .show()
            .map_err(|error| format!("browser_chat_show_failed:{error}"))?;
        webview
            .set_focus()
            .map_err(|error| format!("browser_chat_focus_failed:{error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_chat_surface_open(
    app: AppHandle,
    caller: WebviewWindow,
    provider_id: String,
    bounds: BrowserChatBounds,
) -> Result<BrowserChatSurfaceStatus, String> {
    ensure_main_caller(caller.label())?;
    validate_bounds(&bounds)?;
    let provider = provider_config(&provider_id)?;
    let created = app.get_webview(provider.label).is_none();

    std::thread::spawn(move || {
        let Ok(mut state) = SURFACE_STATE.lock() else {
            eprintln!("[browser-chat] surface state unavailable");
            return;
        };
        let activate = state.active_provider != Some(provider.id);
        match open_provider(&app, &caller, &provider, &bounds, activate) {
            Ok(()) => state.active_provider = Some(provider.id),
            Err(error) => eprintln!("[browser-chat] provider surface failed: {error}"),
        }
    });

    Ok(BrowserChatSurfaceStatus {
        provider_id,
        created,
    })
}

#[tauri::command]
pub fn browser_chat_surface_hide_all(app: AppHandle, caller: WebviewWindow) -> Result<(), String> {
    ensure_main_caller(caller.label())?;
    std::thread::spawn(move || {
        let Ok(mut state) = SURFACE_STATE.lock() else {
            return;
        };
        hide_other_providers(&app, None);
        state.active_provider = None;
    });
    Ok(())
}

#[tauri::command]
pub fn browser_chat_surface_hide(
    app: AppHandle,
    caller: WebviewWindow,
    provider_id: String,
) -> Result<(), String> {
    ensure_main_caller(caller.label())?;
    let provider = provider_config(&provider_id)?;
    std::thread::spawn(move || {
        let Ok(mut state) = SURFACE_STATE.lock() else {
            return;
        };
        if let Some(webview) = app.get_webview(provider.label) {
            if let Err(error) = webview.hide() {
                eprintln!("[browser-chat] provider hide failed: {error}");
            }
        }
        if state.active_provider == Some(provider.id) {
            state.active_provider = None;
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_registry_owned_provider_ids() {
        let chatgpt = provider_config("chatgpt").expect("ChatGPT is registry-owned");
        assert_eq!(chatgpt.label, "browser-chat-chatgpt");
        assert_eq!(chatgpt.url.as_str(), "https://chatgpt.com/");
        assert!(provider_config("https://attacker.example").is_err());
        assert!(provider_config("../chatgpt").is_err());
    }

    #[test]
    fn rejects_non_main_callers_and_invalid_bounds() {
        assert!(ensure_main_caller("main").is_ok());
        assert!(ensure_main_caller("browser-chat-chatgpt").is_err());
        assert!(relative_bounds(&BrowserChatBounds {
            x: 10.0,
            y: 20.0,
            width: 800.0,
            height: 600.0,
        })
        .is_ok());
        assert!(relative_bounds(&BrowserChatBounds {
            x: f64::NAN,
            y: 0.0,
            width: 0.0,
            height: 600.0,
        })
        .is_err());
    }

    #[test]
    fn emits_only_allowlisted_navigation_without_query_or_fragment() {
        let provider = provider_config("chatgpt").expect("provider");
        let accepted = normalized_navigation(
            &provider,
            &"https://chatgpt.com/c/abc?x=1#y".parse().unwrap(),
            7,
        )
        .expect("allowlisted navigation");
        assert_eq!(
            accepted,
            BrowserChatNavigation {
                provider_id: "chatgpt".to_string(),
                surface_id: "browser-chat-chatgpt".to_string(),
                url: "https://chatgpt.com/c/abc".to_string(),
                timestamp: 7,
                kind: "conversation".to_string(),
            }
        );
        assert!(normalized_navigation(
            &provider,
            &"https://chatgpt.com.evil.example/c/abc".parse().unwrap(),
            8,
        )
        .is_none());
        assert!(normalized_navigation(
            &provider,
            &"https://chatgpt.com/backend-api/conversations"
                .parse()
                .unwrap(),
            9,
        )
        .is_none());
    }
}
