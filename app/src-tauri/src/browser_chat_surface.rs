//! Browser Chat provider surfaces embedded as child WebViews of the main VibeSpace window.
//!
//! The remote provider origin never receives VibeSpace capability authority: every command
//! verifies that the invoking webview is the local `main` view, provider URLs come from a fixed
//! registry, navigation is allowlisted, and provider profile directories are hashed per
//! VibeSpace account/provider instead of being shared globally.

use std::{
    fmt::Write as _,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{
    webview::{Webview, WebviewBuilder},
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
};

#[derive(Debug, Clone)]
struct SurfaceRecord {
    provider_id: &'static str,
    label: String,
}

// Native surface operations are serialized so React geometry updates cannot create duplicate
// child WebViews or race against route-leave hide commands. The visible label lets provider or
// account switches focus once without stealing focus during geometry-only updates.
#[derive(Debug)]
struct SurfaceState {
    visible_label: Option<String>,
    surfaces: Vec<SurfaceRecord>,
}

static SURFACE_STATE: Mutex<SurfaceState> = Mutex::new(SurfaceState {
    visible_label: None,
    surfaces: Vec::new(),
});

// Hide commands increment this before waiting for the native operation mutex. An in-flight open
// therefore knows it is stale before it can show the child on a route that has already changed.
static SURFACE_VISIBILITY_GENERATION: AtomicU64 = AtomicU64::new(0);

const LEGACY_SURFACE_LABELS: [&str; 3] = [
    "browser-chat-chatgpt",
    "browser-chat-claude",
    "browser-chat-gemini",
];

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
    url: url::Url,
}

fn provider_config(provider_id: &str) -> Result<ProviderConfig, String> {
    let (id, url) = match provider_id {
        "chatgpt" => ("chatgpt", "https://chatgpt.com/"),
        "claude" => ("claude", "https://claude.ai/new"),
        "gemini" => ("gemini", "https://gemini.google.com/"),
        _ => return Err("browser_chat_provider_not_allowed".to_string()),
    };

    Ok(ProviderConfig {
        id,
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

fn validate_profile_key(profile_key: &str) -> Result<(), String> {
    if profile_key.is_empty()
        || profile_key.len() > 256
        || profile_key.trim() != profile_key
        || profile_key.chars().any(char::is_control)
    {
        Err("browser_chat_profile_key_invalid".to_string())
    } else {
        Ok(())
    }
}

fn profile_digest(profile_key: &str) -> Result<String, String> {
    validate_profile_key(profile_key)?;
    let digest = Sha256::digest(profile_key.as_bytes());
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(&mut encoded, "{byte:02x}")
            .map_err(|_| "browser_chat_profile_digest_failed".to_string())?;
    }
    Ok(encoded)
}

fn surface_label(provider_id: &str, digest: &str) -> Result<String, String> {
    if digest.len() < 16 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("browser_chat_profile_digest_invalid".to_string());
    }
    Ok(format!(
        "browser-chat-{provider_id}-{}",
        &digest[..16]
    ))
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

fn deactivate_surface(app: &AppHandle, label: &str) -> Result<(), String> {
    if let Some(webview) = app.get_webview(label) {
        // On Windows/WebView2 a hidden child can briefly retain its last compositor surface.
        // Move and shrink first so a delayed compositor frame cannot cover another VibeSpace route.
        let _ = webview.set_position(LogicalPosition::new(-32_000.0, -32_000.0));
        let _ = webview.set_size(LogicalSize::new(1.0, 1.0));
        webview
            .hide()
            .map_err(|error| format!("browser_chat_hide_failed:{error}"))?;
    }
    Ok(())
}

fn hide_surfaces_except(
    app: &AppHandle,
    state: &SurfaceState,
    selected: Option<&str>,
) -> Result<(), String> {
    for surface in &state.surfaces {
        if Some(surface.label.as_str()) != selected {
            deactivate_surface(app, &surface.label)?;
        }
    }

    // Older PR-31 builds used static labels. Hide those too so a renderer hot reload or an
    // in-place upgrade cannot leave a legacy provider view floating over the current shell.
    for label in LEGACY_SURFACE_LABELS {
        if Some(label) != selected {
            deactivate_surface(app, label)?;
        }
    }
    Ok(())
}

fn visibility_generation_is_current(requested: u64) -> bool {
    SURFACE_VISIBILITY_GENERATION.load(Ordering::Acquire) == requested
}

fn host_matches(host: &str, suffix: &str) -> bool {
    host == suffix || host.ends_with(&format!(".{suffix}"))
}

fn provider_navigation_allowed(provider_id: &str, target: &url::Url) -> bool {
    if target.as_str() == "about:blank" {
        return true;
    }
    if target.scheme() != "https" || target.username() != "" || target.password().is_some() {
        return false;
    }
    let Some(host) = target.host_str().map(str::to_ascii_lowercase) else {
        return false;
    };

    let shared_identity_hosts = [
        "accounts.google.com",
        "google.com",
        "login.microsoftonline.com",
        "live.com",
        "apple.com",
        "auth0.com",
        "okta.com",
        "cloudflare.com",
    ];
    let provider_hosts: &[&str] = match provider_id {
        "chatgpt" => &[
            "chatgpt.com",
            "openai.com",
            "oaistatic.com",
            "oaiusercontent.com",
        ],
        "claude" => &["claude.ai", "anthropic.com", "claudeusercontent.com"],
        "gemini" => &[
            "gemini.google.com",
            "google.com",
            "googleapis.com",
            "googleusercontent.com",
            "gstatic.com",
        ],
        _ => return false,
    };

    provider_hosts
        .iter()
        .chain(shared_identity_hosts.iter())
        .any(|suffix| host_matches(&host, suffix))
}

fn profile_directory(
    app: &AppHandle,
    provider_id: &str,
    digest: &str,
) -> Result<std::path::PathBuf, String> {
    let profile_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("browser_chat_profile_failed:{error}"))?
        .join("browser-chat")
        .join(digest)
        .join(provider_id);
    std::fs::create_dir_all(&profile_dir)
        .map_err(|error| format!("browser_chat_profile_failed:{error}"))?;
    Ok(profile_dir)
}

fn open_provider(
    app: AppHandle,
    provider: ProviderConfig,
    profile_key: String,
    bounds: BrowserChatBounds,
    requested_generation: u64,
) -> Result<bool, String> {
    let digest = profile_digest(&profile_key)?;
    let label = surface_label(provider.id, &digest)?;
    let mut state = SURFACE_STATE
        .lock()
        .map_err(|_| "browser_chat_surface_lock_unavailable".to_string())?;

    hide_surfaces_except(&app, &state, Some(&label))?;

    let (webview, created) = if let Some(existing) = app.get_webview(&label) {
        apply_bounds(&existing, &bounds)?;
        (existing, false)
    } else {
        let main = app
            .get_window("main")
            .ok_or_else(|| "browser_chat_main_window_missing".to_string())?;
        let (position, size) = relative_bounds(&bounds)?;
        let provider_id = provider.id;
        let builder = WebviewBuilder::new(label.clone(), WebviewUrl::External(provider.url))
            .data_directory(profile_directory(&app, provider.id, &digest)?)
            .focused(false)
            .on_navigation(move |target| provider_navigation_allowed(provider_id, target));
        let created = main
            .add_child(builder, position, size)
            .map_err(|error| format!("browser_chat_create_failed:{error}"))?;
        (created, true)
    };

    if !state
        .surfaces
        .iter()
        .any(|surface| surface.label == label)
    {
        state.surfaces.push(SurfaceRecord {
            provider_id: provider.id,
            label: label.clone(),
        });
    }

    if !visibility_generation_is_current(requested_generation) {
        deactivate_surface(&app, &label)?;
        if state.visible_label.as_deref() == Some(label.as_str()) {
            state.visible_label = None;
        }
        return Ok(created);
    }

    let should_focus = created || state.visible_label.as_deref() != Some(label.as_str());
    webview
        .show()
        .map_err(|error| format!("browser_chat_show_failed:{error}"))?;

    if !visibility_generation_is_current(requested_generation) {
        deactivate_surface(&app, &label)?;
        state.visible_label = None;
        return Ok(created);
    }

    if should_focus {
        webview
            .set_focus()
            .map_err(|error| format!("browser_chat_focus_failed:{error}"))?;
    }
    state.visible_label = Some(label);
    Ok(created)
}

#[tauri::command]
pub async fn browser_chat_surface_open(
    app: AppHandle,
    caller: WebviewWindow,
    provider_id: String,
    provider_profile_key: String,
    bounds: BrowserChatBounds,
) -> Result<BrowserChatSurfaceStatus, String> {
    ensure_main_caller(caller.label())?;
    validate_bounds(&bounds)?;
    validate_profile_key(&provider_profile_key)?;
    let provider = provider_config(&provider_id)?;
    let status_provider_id = provider.id.to_string();
    let requested_generation = SURFACE_VISIBILITY_GENERATION.load(Ordering::Acquire);

    let created = tauri::async_runtime::spawn_blocking(move || {
        open_provider(
            app,
            provider,
            provider_profile_key,
            bounds,
            requested_generation,
        )
    })
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
    SURFACE_VISIBILITY_GENERATION.fetch_add(1, Ordering::AcqRel);
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = SURFACE_STATE
            .lock()
            .map_err(|_| "browser_chat_surface_lock_unavailable".to_string())?;
        hide_surfaces_except(&app, &state, None)?;
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
    SURFACE_VISIBILITY_GENERATION.fetch_add(1, Ordering::AcqRel);
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = SURFACE_STATE
            .lock()
            .map_err(|_| "browser_chat_surface_lock_unavailable".to_string())?;
        let labels: Vec<String> = state
            .surfaces
            .iter()
            .filter(|surface| surface.provider_id == provider.id)
            .map(|surface| surface.label.clone())
            .collect();
        for label in &labels {
            deactivate_surface(&app, label)?;
        }
        let legacy_label = format!("browser-chat-{}", provider.id);
        deactivate_surface(&app, &legacy_label)?;
        if state
            .visible_label
            .as_ref()
            .is_some_and(|visible| labels.iter().any(|label| label == visible))
        {
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
        assert_eq!(chatgpt.id, "chatgpt");
        assert_eq!(chatgpt.url.as_str(), "https://chatgpt.com/");
        assert!(provider_config("https://attacker.example").is_err());
        assert!(provider_config("../chatgpt").is_err());
    }

    #[test]
    fn rejects_non_main_callers_invalid_bounds_and_malformed_profile_keys() {
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
        assert!(validate_profile_key("vibespace-account:account-a").is_ok());
        assert!(validate_profile_key("").is_err());
        assert!(validate_profile_key("bad\nprofile").is_err());
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
    fn profile_labels_are_stable_but_isolated_between_accounts() {
        let account_a = profile_digest("vibespace-account:account-a").expect("valid profile");
        let account_a_again =
            profile_digest("vibespace-account:account-a").expect("valid profile");
        let account_b = profile_digest("vibespace-account:account-b").expect("valid profile");
        assert_eq!(account_a, account_a_again);
        assert_ne!(account_a, account_b);
        assert_ne!(
            surface_label("chatgpt", &account_a).expect("valid label"),
            surface_label("chatgpt", &account_b).expect("valid label")
        );
    }

    #[test]
    fn route_hide_generation_invalidates_an_older_open() {
        let current = SURFACE_VISIBILITY_GENERATION.load(Ordering::Acquire);
        assert!(visibility_generation_is_current(current));
        SURFACE_VISIBILITY_GENERATION.fetch_add(1, Ordering::AcqRel);
        assert!(!visibility_generation_is_current(current));
    }

    #[test]
    fn navigation_allows_provider_and_identity_hosts_but_blocks_untrusted_origins() {
        assert!(provider_navigation_allowed(
            "chatgpt",
            &"https://chatgpt.com/c/abc".parse().expect("valid url")
        ));
        assert!(provider_navigation_allowed(
            "chatgpt",
            &"https://auth.openai.com/authorize".parse().expect("valid url")
        ));
        assert!(provider_navigation_allowed(
            "chatgpt",
            &"https://accounts.google.com/o/oauth2/v2/auth"
                .parse()
                .expect("valid url")
        ));
        assert!(!provider_navigation_allowed(
            "chatgpt",
            &"https://attacker.example/phish".parse().expect("valid url")
        ));
        assert!(!provider_navigation_allowed(
            "chatgpt",
            &"http://chatgpt.com/".parse().expect("valid url")
        ));
    }

    #[test]
    fn visible_provider_state_distinguishes_activation_from_geometry_updates() {
        let mut state = SurfaceState {
            visible_label: None,
            surfaces: Vec::new(),
        };
        assert_ne!(
            state.visible_label.as_deref(),
            Some("browser-chat-chatgpt-account-a")
        );
        state.visible_label = Some("browser-chat-chatgpt-account-a".to_string());
        assert_eq!(
            state.visible_label.as_deref(),
            Some("browser-chat-chatgpt-account-a")
        );
        assert_ne!(
            state.visible_label.as_deref(),
            Some("browser-chat-claude-account-a")
        );
    }
}
