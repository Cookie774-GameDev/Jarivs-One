//! Browser Chat provider surfaces embedded as child WebViews of the main VibeSpace window.
//!
//! The remote provider origin never receives VibeSpace capability authority: every command
//! verifies that the invoking webview is the local `main` view, and provider URLs come from a
//! fixed registry rather than renderer input.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{Webview, WebviewBuilder},
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
};

const PROVIDER_LABELS: [&str; 3] = [
    "browser-chat-chatgpt",
    "browser-chat-claude",
    "browser-chat-gemini",
];

// Native surface operations are serialized so React geometry updates cannot create duplicate
// child WebViews or race against route-leave hide commands. The visible label lets provider
// switches focus once without stealing focus during geometry-only updates.
#[derive(Debug)]
struct SurfaceState {
    visible_label: Option<&'static str>,
}

static SURFACE_STATE: Mutex<SurfaceState> = Mutex::new(SurfaceState {
    visible_label: None,
});

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

struct ProviderConfig {
    id: &'static str,
    label: &'static str,
    url: url::Url,
}

fn provider_config(provider_id: &str) -> Result<ProviderConfig, String> {
    let (id, label, url) = match provider_id {
        "chatgpt" => ("chatgpt", "browser-chat-chatgpt", "https://chatgpt.com/"),
        "claude" => ("claude", "browser-chat-claude", "https://claude.ai/new"),
        "gemini" => (
            "gemini",
            "browser-chat-gemini",
            "https://gemini.google.com/",
        ),
        _ => return Err("browser_chat_provider_not_allowed".to_string()),
    };

    Ok(ProviderConfig {
        id,
        label,
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

fn hide_provider(app: &AppHandle, label: &str) -> Result<(), String> {
    if let Some(webview) = app.get_webview(label) {
        webview
            .hide()
            .map_err(|error| format!("browser_chat_hide_failed:{error}"))?;
    }
    Ok(())
}

fn hide_other_providers(app: &AppHandle, selected: Option<&str>) -> Result<(), String> {
    for label in PROVIDER_LABELS {
        if Some(label) != selected {
            hide_provider(app, label)?;
        }
    }
    Ok(())
}

fn profile_directory(app: &AppHandle, provider_id: &str) -> Result<std::path::PathBuf, String> {
    let profile_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("browser_chat_profile_failed:{error}"))?
        .join("browser-chat")
        .join(provider_id);
    std::fs::create_dir_all(&profile_dir)
        .map_err(|error| format!("browser_chat_profile_failed:{error}"))?;
    Ok(profile_dir)
}

fn open_provider(
    app: AppHandle,
    provider: ProviderConfig,
    bounds: BrowserChatBounds,
) -> Result<bool, String> {
    let mut state = SURFACE_STATE
        .lock()
        .map_err(|_| "browser_chat_surface_lock_unavailable".to_string())?;

    hide_other_providers(&app, Some(provider.label))?;

    let (webview, created) = if let Some(existing) = app.get_webview(provider.label) {
        apply_bounds(&existing, &bounds)?;
        (existing, false)
    } else {
        let main = app
            .get_window("main")
            .ok_or_else(|| "browser_chat_main_window_missing".to_string())?;
        let (position, size) = relative_bounds(&bounds)?;
        let builder = WebviewBuilder::new(provider.label, WebviewUrl::External(provider.url))
            .data_directory(profile_directory(&app, provider.id)?)
            .focused(false);
        let created = main
            .add_child(builder, position, size)
            .map_err(|error| format!("browser_chat_create_failed:{error}"))?;
        (created, true)
    };

    let should_focus = created || state.visible_label != Some(provider.label);
    webview
        .show()
        .map_err(|error| format!("browser_chat_show_failed:{error}"))?;
    if should_focus {
        webview
            .set_focus()
            .map_err(|error| format!("browser_chat_focus_failed:{error}"))?;
    }
    state.visible_label = Some(provider.label);
    Ok(created)
}

#[tauri::command]
pub async fn browser_chat_surface_open(
    app: AppHandle,
    caller: WebviewWindow,
    provider_id: String,
    bounds: BrowserChatBounds,
) -> Result<BrowserChatSurfaceStatus, String> {
    ensure_main_caller(caller.label())?;
    validate_bounds(&bounds)?;
    let provider = provider_config(&provider_id)?;
    let status_provider_id = provider.id.to_string();

    let created = tauri::async_runtime::spawn_blocking(move || open_provider(app, provider, bounds))
        .await
        .map_err(|error| format!("browser_chat_task_failed:{error}"))??;

    Ok(BrowserChatSurfaceStatus {
        provider_id: status_provider_id,
        created,
    })
}

#[tauri::command]
pub async fn browser_chat_surface_hide_all(
    app: AppHandle,
    caller: WebviewWindow,
) -> Result<(), String> {
    ensure_main_caller(caller.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = SURFACE_STATE
            .lock()
            .map_err(|_| "browser_chat_surface_lock_unavailable".to_string())?;
        hide_other_providers(&app, None)?;
        state.visible_label = None;
        Ok::<(), String>(())
    })
    .await
    .map_err(|error| format!("browser_chat_task_failed:{error}"))??;
    Ok(())
}

#[tauri::command]
pub async fn browser_chat_surface_hide(
    app: AppHandle,
    caller: WebviewWindow,
    provider_id: String,
) -> Result<(), String> {
    ensure_main_caller(caller.label())?;
    let provider = provider_config(&provider_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = SURFACE_STATE
            .lock()
            .map_err(|_| "browser_chat_surface_lock_unavailable".to_string())?;
        hide_provider(&app, provider.label)?;
        if state.visible_label == Some(provider.label) {
            state.visible_label = None;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|error| format!("browser_chat_task_failed:{error}"))??;
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
        assert!(validate_bounds(&BrowserChatBounds {
            x: 10.0,
            y: 20.0,
            width: 800.0,
            height: 600.0,
        })
        .is_ok());
        assert!(validate_bounds(&BrowserChatBounds {
            x: f64::NAN,
            y: 0.0,
            width: 0.0,
            height: 600.0,
        })
        .is_err());
    }

    #[test]
    fn child_bounds_remain_relative_to_the_main_window() {
        let (position, size) = relative_bounds(&BrowserChatBounds {
            x: 120.0,
            y: 90.0,
            width: 880.0,
            height: 620.0,
        })
        .expect("valid relative bounds");

        assert_eq!(position.x, 120.0);
        assert_eq!(position.y, 90.0);
        assert_eq!(size.width, 880.0);
        assert_eq!(size.height, 620.0);
    }

    #[test]
    fn visible_provider_state_distinguishes_activation_from_geometry_updates() {
        let mut state = SurfaceState { visible_label: None };
        assert_ne!(state.visible_label, Some("browser-chat-chatgpt"));
        state.visible_label = Some("browser-chat-chatgpt");
        assert_eq!(state.visible_label, Some("browser-chat-chatgpt"));
        assert_ne!(state.visible_label, Some("browser-chat-claude"));
    }
}
