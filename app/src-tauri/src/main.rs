// Prevents an extra console window from spawning on Windows in release builds.
// The webview is still our visible UI; we don't need a parent terminal.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
fn attach_parent_console_for_cli() {
    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn AttachConsole(process_id: u32) -> i32;
    }

    const ATTACH_PARENT_PROCESS: u32 = u32::MAX;
    unsafe {
        let _ = AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

fn main() {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    if arguments.first().map(String::as_str) == Some("--vibespace-cli") {
        #[cfg(target_os = "windows")]
        attach_parent_console_for_cli();
        std::process::exit(jarvis_lib::terminal_cli::run_terminal_cli(&arguments[1..]));
    }
    jarvis_lib::run();
}
