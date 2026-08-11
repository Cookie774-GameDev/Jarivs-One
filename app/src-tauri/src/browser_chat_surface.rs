//! Browser Chat provider surfaces hosted as children of the main native window.
//!
//! Provider pages receive no initialization script or VibeSpace command
//! authority. The native navigation callback emits only allowlisted top-level
//! URL metadata to the local `main` webview.

use std::sync::{mpsc, LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewBuilder, WebviewUrl,
    WebviewWindow,
};

const NAVIGATION_EVENT: &str = "browser-chat://navigation";

#[derive(Default)]
struct SurfaceState {
    active_surface: Option<String>,
}

static SURFACE_STATE: LazyLock<Mutex<SurfaceState>> =
    LazyLock::new(|| Mutex::new(SurfaceState::default()));

type SurfaceOperation = Box<dyn FnOnce() + Send + 'static>;

static SURFACE_OPERATION_QUEUE: LazyLock<mpsc::Sender<SurfaceOperation>> = LazyLock::new(|| {
    let (sender, receiver) = mpsc::channel::<SurfaceOperation>();
    std::thread::Builder::new()
        .name("browser-chat-surface".to_string())
        .spawn(move || {
            while let Ok(operation) = receiver.recv() {
                operation();
            }
        })
        .expect("browser chat surface operation worker must start");
    sender
});

fn queue_surface_operation<T, F>(operation: F) -> Result<mpsc::Receiver<Result<T, String>>, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (result_sender, result_receiver) = mpsc::sync_channel(1);
    SURFACE_OPERATION_QUEUE
        .send(Box::new(move || {
            let _ = result_sender.send(operation());
        }))
        .map_err(|_| "browser_chat_surface_queue_unavailable".to_string())?;
    Ok(result_receiver)
}

async fn execute_surface_operation<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let receiver = queue_surface_operation(operation)?;
    tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv()
            .map_err(|_| "browser_chat_surface_result_unavailable".to_string())?
    })
    .await
    .map_err(|error| format!("browser_chat_surface_worker_failed:{error}"))?
}

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
    account_profile_key: String,
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

fn validate_account_profile_key(value: &str) -> Result<(), String> {
    let digest = value
        .strip_prefix("profile_")
        .ok_or_else(|| "browser_chat_profile_not_allowed".to_string())?;
    if digest.len() == 64
        && digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err("browser_chat_profile_not_allowed".to_string())
    }
}

fn scoped_surface_label(
    provider: &ProviderConfig,
    account_profile_key: &str,
) -> Result<String, String> {
    validate_account_profile_key(account_profile_key)?;
    Ok(format!(
        "{}-{}",
        provider.label,
        &account_profile_key["profile_".len()..]
    ))
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
    account_profile_key: &str,
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
        account_profile_key: account_profile_key.to_string(),
        url: format!("https://{}{}", provider.hostname, candidate.path()),
        timestamp,
        kind: kind.to_string(),
    })
}

fn normalized_provider_url(provider: &ProviderConfig, raw_url: &str) -> Option<url::Url> {
    let candidate = raw_url.parse().ok()?;
    let navigation = normalized_navigation(
        provider,
        "profile_0000000000000000000000000000000000000000000000000000000000000000",
        &candidate,
        0,
    )?;
    navigation.url.parse().ok()
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
    account_profile_key: &str,
    surface_label: &str,
    navigation_url: &url::Url,
    bounds: &BrowserChatBounds,
) -> Result<Webview, String> {
    let (position, size) = relative_bounds(bounds)?;
    let profile_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("browser_chat_profile_failed:{error}"))?
        .join("browser-chat")
        .join(account_profile_key)
        .join(provider.id);
    std::fs::create_dir_all(&profile_dir)
        .map_err(|error| format!("browser_chat_profile_failed:{error}"))?;

    let navigation_app = app.clone();
    let navigation_provider = provider.clone();
    let navigation_profile_key = account_profile_key.to_string();
    let builder = WebviewBuilder::new(surface_label, WebviewUrl::External(navigation_url.clone()))
        .data_directory(profile_dir)
        .on_navigation(move |candidate| {
            if let Some(navigation) = normalized_navigation(
                &navigation_provider,
                &navigation_profile_key,
                candidate,
                now_millis(),
            ) {
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
    account_profile_key: &str,
    surface_label: &str,
    navigation_url: Option<&url::Url>,
    bounds: &BrowserChatBounds,
    activate: bool,
) -> Result<(), String> {
    let (webview, created) = match app.get_webview(surface_label) {
        Some(existing) => {
            apply_bounds(&existing, bounds)?;
            if let Some(target) = navigation_url {
                existing
                    .navigate(target.clone())
                    .map_err(|error| format!("browser_chat_navigate_failed:{error}"))?;
            }
            (existing, false)
        }
        None => (
            create_provider(
                app,
                caller,
                provider,
                account_profile_key,
                surface_label,
                navigation_url.unwrap_or(&provider.url),
                bounds,
            )?,
            true,
        ),
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
pub async fn browser_chat_surface_open(
    app: AppHandle,
    caller: WebviewWindow,
    provider_id: String,
    bounds: BrowserChatBounds,
    navigation_url: Option<String>,
    account_profile_key: String,
) -> Result<BrowserChatSurfaceStatus, String> {
    ensure_main_caller(caller.label())?;
    validate_bounds(&bounds)?;
    let provider = provider_config(&provider_id)?;
    let surface_label = scoped_surface_label(&provider, &account_profile_key)?;
    let navigation_url = navigation_url
        .as_deref()
        .map(|raw_url| {
            normalized_provider_url(&provider, raw_url)
                .ok_or_else(|| "browser_chat_navigation_not_allowed".to_string())
        })
        .transpose()?;
    execute_surface_operation(move || {
        let mut state = SURFACE_STATE
            .lock()
            .map_err(|_| "browser_chat_surface_state_unavailable".to_string())?;
        let created = app.get_webview(&surface_label).is_none();
        let activate = state.active_surface.as_deref() != Some(surface_label.as_str());
        if activate {
            if let Some(previous) = state.active_surface.as_deref() {
                if let Some(webview) = app.get_webview(previous) {
                    webview
                        .hide()
                        .map_err(|error| format!("browser_chat_hide_failed:{error}"))?;
                }
            }
        }
        open_provider(
            &app,
            &caller,
            &provider,
            &account_profile_key,
            &surface_label,
            navigation_url.as_ref(),
            &bounds,
            activate,
        )?;
        state.active_surface = Some(surface_label);
        Ok(BrowserChatSurfaceStatus {
            provider_id,
            created,
        })
    })
    .await
}

#[tauri::command]
pub async fn browser_chat_surface_hide_all(
    app: AppHandle,
    caller: WebviewWindow,
) -> Result<(), String> {
    ensure_main_caller(caller.label())?;
    execute_surface_operation(move || {
        let mut state = SURFACE_STATE
            .lock()
            .map_err(|_| "browser_chat_surface_state_unavailable".to_string())?;
        if let Some(surface_label) = state.active_surface.take() {
            if let Some(webview) = app.get_webview(&surface_label) {
                webview
                    .hide()
                    .map_err(|error| format!("browser_chat_hide_failed:{error}"))?;
            }
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn browser_chat_surface_hide(
    app: AppHandle,
    caller: WebviewWindow,
    provider_id: String,
    account_profile_key: String,
) -> Result<(), String> {
    ensure_main_caller(caller.label())?;
    let provider = provider_config(&provider_id)?;
    let surface_label = scoped_surface_label(&provider, &account_profile_key)?;
    execute_surface_operation(move || {
        let mut state = SURFACE_STATE
            .lock()
            .map_err(|_| "browser_chat_surface_state_unavailable".to_string())?;
        if let Some(webview) = app.get_webview(&surface_label) {
            webview
                .hide()
                .map_err(|error| format!("browser_chat_hide_failed:{error}"))?;
        }
        if state.active_surface.as_deref() == Some(surface_label.as_str()) {
            state.active_surface = None;
        }
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

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
        let provider = provider_config("chatgpt").expect("provider");
        let profile_key = format!("profile_{}", "a".repeat(64));
        assert!(validate_account_profile_key(&profile_key).is_ok());
        assert_eq!(
            scoped_surface_label(&provider, &profile_key).expect("scoped label"),
            format!("browser-chat-chatgpt-{}", "a".repeat(64))
        );
        assert!(scoped_surface_label(&provider, "profile_account-a").is_err());
    }

    #[test]
    fn emits_only_allowlisted_navigation_without_query_or_fragment() {
        let provider = provider_config("chatgpt").expect("provider");
        let profile_key = format!("profile_{}", "a".repeat(64));
        let accepted = normalized_navigation(
            &provider,
            &profile_key,
            &"https://chatgpt.com/c/abc?x=1#y".parse().unwrap(),
            7,
        )
        .expect("allowlisted navigation");
        assert_eq!(
            accepted,
            BrowserChatNavigation {
                provider_id: "chatgpt".to_string(),
                surface_id: "browser-chat-chatgpt".to_string(),
                account_profile_key: profile_key.clone(),
                url: "https://chatgpt.com/c/abc".to_string(),
                timestamp: 7,
                kind: "conversation".to_string(),
            }
        );
        assert!(normalized_navigation(
            &provider,
            &profile_key,
            &"https://chatgpt.com.evil.example/c/abc".parse().unwrap(),
            8,
        )
        .is_none());
        assert!(normalized_navigation(
            &provider,
            &profile_key,
            &"https://chatgpt.com/backend-api/conversations"
                .parse()
                .unwrap(),
            9,
        )
        .is_none());
        assert_eq!(
            normalized_provider_url(
                &provider,
                "https://chatgpt.com/c/abc?temporary=true#private"
            )
            .expect("saved provider location")
            .as_str(),
            "https://chatgpt.com/c/abc"
        );
        assert!(
            normalized_provider_url(&provider, "https://chatgpt.com.evil.example/c/stolen")
                .is_none()
        );
    }

    #[test]
    fn surface_operation_queue_is_fifo_and_returns_failures() {
        let observations = Arc::new(Mutex::new(Vec::new()));
        let first_observations = Arc::clone(&observations);
        let first = queue_surface_operation(move || {
            first_observations.lock().expect("observations").push(1);
            Ok(1)
        })
        .expect("first queued");
        let second_observations = Arc::clone(&observations);
        let second = queue_surface_operation(move || {
            second_observations.lock().expect("observations").push(2);
            Err::<u8, _>("native_failure".to_string())
        })
        .expect("second queued");

        assert_eq!(first.recv().expect("first result"), Ok(1));
        assert_eq!(
            second.recv().expect("second result"),
            Err("native_failure".to_string())
        );
        assert_eq!(*observations.lock().expect("observations"), vec![1, 2]);
    }
}
