//! Jarvis desktop shell ΓÇô Tauri 2 Rust core.
//!
//! Architecture (see docs/02-system-architecture.md ┬º2.1):
//!
//! ```text
//!  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ Tauri main (this crate) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
//!  Γöé   ΓÇó Window + tray + native notifications                                  Γöé
//!  Γöé   ΓÇó Global hotkeys, deep links, mic permissions                           Γöé
//!  Γöé   ΓÇó IPC broker between WebView, Node runtime, and Python voice sidecar    Γöé
//!  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ-ΓöÇΓöÿ
//!         Γöé                              Γöé                              Γöé
//!  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ                ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ                ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
//!  Γöé  WebView     Γöé                Γöé  Node      Γöé                Γöé  Python     Γöé
//!  Γöé  (Vite + R)  Γöé  Tauri cmd     Γöé  runtime   Γöé  stdin/stdout  Γöé  voice      Γöé
//!  Γöé              Γöé ΓùÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╢Γöé  (Mastra)  Γöé ΓùÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╢Γöé  (Pipecat)  Γöé
//!  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ                ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ                ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
//! ```
//!
//! ## V1 plugins registered
//! - `tauri-plugin-notification`  ΓÇô OS native banners (todo reminders, errors)
//! - `tauri-plugin-dialog`        ΓÇô open/save/message dialogs
//! - `tauri-plugin-shell`         ΓÇô `shell.open` for opening URLs in the OS browser
//! - `tauri-plugin-os`            ΓÇô platform/arch detection for the runtime
//! - `tauri-plugin-http`          ΓÇô native HTTP client used by the Ollama bridge
//!                                  to bypass `tauri://localhost` CORS that
//!                                  blocks `fetch` to `http://localhost:11434`
//!                                  in packaged builds.
//! - `tauri-plugin-process`       ΓÇô relaunch after updater installation
//! - `tauri-plugin-updater`       ΓÇô signed auto-update channel
//!
//! ## Plugins to wire up as features land
//! - `tauri-plugin-global-shortcut` ΓÇô cmd-space style global hotkeys
//! - `tauri-plugin-fs`              ΓÇô scoped reads/writes to ~/.jarvis
//! - `tauri-plugin-store`           ΓÇô persistent JSON preferences
//! - `tauri-plugin-window-state`    ΓÇô remember window size + position
//! - `tauri-plugin-single-instance` ΓÇô one Jarvis per user account
//! - `tauri-plugin-deep-link`       ΓÇô `jarvis://` URL handler
//!
//! New commands should be small and pure; heavy logic belongs in the Node
//! runtime sidecar so we keep the Rust core boring and stable.

use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod agent_coordination;
mod artifact_access;
mod branding;
mod browser_process;
mod cli_bridge;
mod context_search;
mod credentials;
mod dictation;
mod faster_whisper;
mod fsread;
mod kernel_host;
mod kokoro;
mod launcher;
mod local_ai;
mod ollama_http;
mod pets;
mod preview;
#[cfg(debug_assertions)]
mod sik_smoke;
mod static_server;
mod terminal;
mod terminal_snapshot;
mod wallpaper_master;

/// Sanity-check command. The JS bridge can call this during startup to verify
/// invoke() round-trips. Wire it in as needed; it returns a friendly string.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello {name}, this is Jarvis.")
}

/// Returns the running app version string (matches Cargo.toml package version).
/// Useful when the JS bridge prefers a single command rather than touching the
/// `@tauri-apps/api/app` getVersion API.
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Re-apply the embedded taskbar / window icon (Windows WebView2 recovery).
#[tauri::command]
fn refresh_app_branding(app: tauri::AppHandle) {
    branding::apply_app_branding(&app);
}

#[derive(Clone, serde::Serialize)]
struct ReopenPayload {
    reason: &'static str,
}

#[derive(Clone, serde::Serialize)]
struct PersistPayload {
    reason: &'static str,
}

#[derive(Clone, Copy)]
struct GlobalDictationShortcutConfig {
    modifiers: Option<Modifiers>,
    code: Code,
    opens_overlay: bool,
}

/// Ctrl+Space global dictation.
///
/// `opens_overlay: true`: outside VibeSpace the shortcut opens the VibeSpace
/// dictation overlay; when the app itself is focused, `dictation_route`
/// directs the press to the in-app composer STT instead (no floating
/// overlay on top of the app). Both paths use the same speech-to-text
/// pipeline as VibeSpace chat (local faster-whisper / Web Speech / Deepgram
/// / Groq per Settings). VibeSpace never routes dictation through the OS
/// default dictation (Windows Win+H).
fn global_dictation_shortcut_config() -> GlobalDictationShortcutConfig {
    GlobalDictationShortcutConfig {
        modifiers: Some(Modifiers::CONTROL),
        code: Code::Space,
        opens_overlay: true,
    }
}

fn show_main_window(app: &tauri::AppHandle, reason: &'static str) {
    println!("[lifecycle] showing main window ({reason})");
    branding::apply_app_branding(app);
    if let Some(window) = app.get_webview_window("main") {
        if let Err(err) = window.show() {
            eprintln!("[lifecycle] failed to show main window ({reason}): {err}");
        }
        if let Err(err) = window.unminimize() {
            eprintln!("[lifecycle] failed to unminimize main window ({reason}): {err}");
        }
        if let Err(err) = window.set_focus() {
            eprintln!("[lifecycle] failed to focus main window ({reason}): {err}");
        }
        // WebView2 often swaps HWND during show ΓÇö re-apply after the surface is back.
        branding::apply_window_icon(&window);
        if let Err(err) = window.emit("jarvis:reopen", ReopenPayload { reason }) {
            eprintln!("[lifecycle] failed to emit reopen event ({reason}): {err}");
        }
    } else {
        eprintln!("[lifecycle] main window missing during show request ({reason})");
    }
}

fn show_dictation_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("dictation") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("jarvis:global-dictation-toggle", ());
    } else {
        eprintln!("[dictation] dictation window missing");
    }
}

/// Where a Ctrl+Space press should route.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
enum DictationRoute {
    /// VibeSpace itself is focused: dictate into the focused in-app input
    /// (composer STT pipeline) - no floating overlay on top of the app.
    InApp,
    /// Another application is focused: open the small VibeSpace overlay
    /// that transcribes and pastes into that app.
    Overlay,
}

/// Focus-aware dictation routing. Never returns a Win+H / OS-dictation path.
fn dictation_route(main_window_focused: bool) -> DictationRoute {
    if main_window_focused {
        DictationRoute::InApp
    } else {
        DictationRoute::Overlay
    }
}

fn handle_global_dictation_shortcut(app: &tauri::AppHandle) {
    let main_focused = app
        .get_webview_window("main")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false);
    match dictation_route(main_focused) {
        DictationRoute::InApp => {
            if let Some(window) = app.get_webview_window("main") {
                // The frontend routes this to composer STT for the focused
                // in-app input - same pipeline, no separate overlay UI.
                let _ = window.emit("jarvis:global-dictation-in-app", ());
            }
        }
        DictationRoute::Overlay => show_dictation_window(app),
    }
}

/// Runs the Tauri app. Re-exposed under `#[mobile_entry_point]` so the same
/// crate works for future iOS / Android builds via `npx tauri ios|android`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    branding::init_platform_branding();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            println!("[single-instance] Reusing existing Jarvis service instance");
            show_main_window(app, "second-instance");
        }))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        // Ctrl+Space: focus-aware VibeSpace dictation.
                        // In-app -> composer STT; outside -> small overlay.
                        // Never routes through OS dictation (Win+H).
                        handle_global_dictation_shortcut(app);
                    }
                })
                .build(),
        )
        .manage(cli_bridge::CliBridgeState::default())
        .manage(kernel_host::KernelHostState::default())
        .manage(terminal::TerminalState::default())
        .manage(pets::PetWindowState::default())
        .manage(terminal_snapshot::PersistenceFlushState::default())
        .setup(|app| {
            // Restore pet window geometry from disk.
            {
                let geo = pets::load_geometry(&app.handle());
                if let Ok(mut g) = app.state::<pets::PetWindowState>().geometry.lock() {
                    *g = geo;
                }
            }
            let tray_menu = tauri::menu::Menu::with_items(
                app,
                &[
                    &tauri::menu::MenuItem::with_id(
                        app,
                        "show",
                        "Show VibeSpace",
                        true,
                        None::<&str>,
                    )
                    .unwrap(),
                    &tauri::menu::MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)
                        .unwrap(),
                ],
            )?;

            branding::apply_app_branding(&app.handle());
            branding::start_windows_icon_watchdog(&app.handle());

            let tray_icon = branding::build_tray_icon();

            let _tray = tauri::tray::TrayIconBuilder::with_id(branding::TRAY_ICON_ID)
                .icon(tray_icon)
                .tooltip("VibeSpace")
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        show_main_window(app, "tray-show");
                    }
                    "exit" => {
                        app.state::<terminal_snapshot::PersistenceFlushState>()
                            .begin();
                        let _ = app.emit(
                            "jarvis:persist-now",
                            PersistPayload {
                                reason: "tray-exit",
                            },
                        );
                        let app_handle = app.clone();
                        std::thread::spawn(move || {
                            let started = std::time::Instant::now();
                            while started.elapsed() < Duration::from_millis(1_500)
                                && !app_handle
                                    .state::<terminal_snapshot::PersistenceFlushState>()
                                    .is_completed()
                            {
                                std::thread::sleep(Duration::from_millis(25));
                            }
                            app_handle
                                .state::<terminal_snapshot::PersistenceFlushState>()
                                .complete();
                            app_handle.exit(0);
                        });
                    }
                    _ => {}
                })
                .build(app)?;

            let dictation_shortcut_config = global_dictation_shortcut_config();
            let dictation_shortcut = Shortcut::new(
                dictation_shortcut_config.modifiers,
                dictation_shortcut_config.code,
            );
            if let Err(err) = app.global_shortcut().register(dictation_shortcut) {
                eprintln!("[dictation] failed to register Ctrl+Space: {err}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::Focused(true)
                | tauri::WindowEvent::Resized(_)
                | tauri::WindowEvent::ScaleFactorChanged { .. } => {
                    if window.label() == "main" {
                        branding::apply_app_branding(&window.app_handle());
                    }
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    use tauri::Emitter as _;
                    // Pet windows: hide only; never destroy sessions.
                    if pets::handle_pet_window_close(window) {
                        api.prevent_close();
                        return;
                    }
                    // Main (and others): hide to tray; process stays alive.
                    let _ = window.emit("jarvis:before-hide", ());
                    println!(
                        "[lifecycle] hiding window {}; background service remains alive",
                        window.label()
                    );
                    if let Err(err) = window.hide() {
                        eprintln!("[lifecycle] failed to hide window: {err}");
                    }
                    api.prevent_close();
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            app_version,
            refresh_app_branding,
            artifact_access::open_jarvis_artifact_path,
            kernel_host::register_kernel_host,
            kernel_host::kernel_client_request,
            kernel_host::kernel_host_respond,
            kernel_host::release_kernel_host,
            cli_bridge::cli_bridge_scan,
            cli_bridge::cli_bridge_probe,
            cli_bridge::cli_bridge_start,
            cli_bridge::cli_bridge_cancel,
            context_search::context_search_replace_documents,
            context_search::context_search_delete_documents,
            context_search::context_search_query,
            context_search::context_search_status,
            context_search::context_search_acknowledge_rebuild,
            fsread::fs_create_dir_all,
            pets::pet_show_overlay,
            pets::pet_hide_overlay,
            pets::pet_is_overlay_visible,
            pets::pet_reassert_overlay_topmost,
            pets::pet_get_start_with_windows,
            pets::pet_set_start_with_windows,
            pets::pet_set_overlay_position,
            pets::pet_snap_overlay_to_edge,
            pets::pet_open_or_focus_panel,
            pets::pet_minimize_panel,
            pets::pet_hide_panel,
            pets::pet_is_panel_visible,
            pets::pet_save_panel_geometry,
            pets::pet_validate_action,
            fsread::fs_create_text_file,
            fsread::fs_create_text_with_content,
            fsread::fs_list_dir,
            fsread::fs_read_image_base64,
            fsread::fs_read_text,
            fsread::fs_read_text_sample,
            fsread::fs_write_text,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            terminal::terminal_move,
            terminal::terminal_list,
            terminal::terminal_reconcile,
            terminal_snapshot::terminal_snapshot_save,
            terminal_snapshot::terminal_snapshot_load,
            terminal_snapshot::terminal_snapshot_delete,
            terminal_snapshot::terminal_snapshot_delete_project,
            terminal_snapshot::persistence_flush_complete,
            agent_coordination::agent_coordination_snapshot,
            agent_coordination::agent_coordination_register,
            agent_coordination::agent_coordination_heartbeat,
            agent_coordination::agent_coordination_lock_file,
            agent_coordination::agent_coordination_release_file,
            agent_coordination::agent_coordination_append_event,
            credentials::credential_set,
            credentials::credential_get,
            credentials::credential_delete,
            dictation::dictation_paste_text,
            dictation::trigger_os_dictation,
            faster_whisper::faster_whisper_model_path,
            faster_whisper::faster_whisper_check_installed,
            faster_whisper::faster_whisper_status,
            faster_whisper::faster_whisper_download,
            faster_whisper::faster_whisper_transcribe,
            #[cfg(debug_assertions)]
            sik_smoke::sik_smoke_binding,
            #[cfg(debug_assertions)]
            sik_smoke::sik_smoke_voice_fixture,
            launcher::install_terminal_launcher,
            local_ai::ollama_installation_status,
            local_ai::ollama_start,
            local_ai::ensure_ollama_ready,
            local_ai::is_ollama_running,
            local_ai::open_ollama_troubleshooting,
            local_ai::open_system_speech_settings,
            kokoro::kokoro_model_path,
            kokoro::kokoro_check_installed,
            kokoro::kokoro_verify_checksums,
            kokoro::kokoro_status,
            kokoro::kokoro_warmup,
            kokoro::kokoro_download,
            kokoro::kokoro_resume_download,
            kokoro::kokoro_repair,
            kokoro::kokoro_delete_corrupt,
            kokoro::kokoro_speak,
            kokoro::kokoro_stop,
            ollama_http::ollama_ping,
            ollama_http::ollama_list_models,
            ollama_http::ollama_pull_model,
            ollama_http::ollama_chat_stream,
            // Preview Studio + Vibe Browser + wallpaper master
            static_server::preview_start_static_server,
            static_server::preview_stop_static_server,
            static_server::preview_static_server_status,
            static_server::preview_probe_dev_servers,
            preview::preview_create,
            preview::preview_set_bounds,
            preview::preview_navigate,
            preview::preview_show,
            preview::preview_hide,
            preview::preview_reload,
            preview::preview_destroy,
            preview::preview_status,
            preview::preview_probe_url,
            browser_process::browser_detect_installations,
            browser_process::browser_status,
            browser_process::browser_start,
            browser_process::browser_stop,
            browser_process::browser_clear_profile,
            browser_process::browser_open_downloads_folder,
            wallpaper_master::wallpaper_find_local_master,
            wallpaper_master::wallpaper_cache_full_master,
            wallpaper_master::wallpaper_full_cache_path,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                kernel_host::release_on_process_exit(app_handle);
                return;
            }
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                let state = app_handle.state::<terminal_snapshot::PersistenceFlushState>();
                if state.is_completed() {
                    return;
                }
                api.prevent_exit();
                if state.is_pending() {
                    return;
                }

                state.begin();
                let _ = app_handle.emit(
                    "jarvis:persist-now",
                    PersistPayload {
                        reason: "exit-requested",
                    },
                );
                let app_handle = app_handle.clone();
                std::thread::spawn(move || {
                    let started = std::time::Instant::now();
                    while started.elapsed() < Duration::from_millis(1_500)
                        && !app_handle
                            .state::<terminal_snapshot::PersistenceFlushState>()
                            .is_completed()
                    {
                        std::thread::sleep(Duration::from_millis(25));
                    }
                    app_handle
                        .state::<terminal_snapshot::PersistenceFlushState>()
                        .complete();
                    app_handle.exit(code.unwrap_or(0));
                });
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn global_dictation_shortcut_is_ctrl_space_opening_the_vibespace_overlay() {
        let config = global_dictation_shortcut_config();

        assert_eq!(config.modifiers, Some(Modifiers::CONTROL));
        assert_eq!(config.code, Code::Space);
        // The VibeSpace overlay is the ONLY global dictation path - the
        // shortcut must never route through OS dictation (Windows Win+H).
        assert!(config.opens_overlay);
    }

    #[test]
    fn dictation_routes_in_app_when_vibespace_is_focused_and_overlay_otherwise() {
        // Inside VibeSpace: no floating overlay - the press goes to the
        // focused in-app input via composer STT.
        assert_eq!(dictation_route(true), DictationRoute::InApp);
        // Outside VibeSpace: the small overlay handles transcribe + paste.
        assert_eq!(dictation_route(false), DictationRoute::Overlay);
    }
}
