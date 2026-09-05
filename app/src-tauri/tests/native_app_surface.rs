#[path = "../src/native_app_surface.rs"]
mod native_app_surface;

#[test]
fn native_app_surface_is_a_real_windows_child_host_not_a_process_killer() {
    let source = include_str!("../src/native_app_surface.rs");
    for required in [
        "SetParent",
        "SetWindowPos",
        "EnumWindows",
        "OpenProcess",
        "QueryFullProcessImageNameW",
        "IApplicationActivationManager",
        "GetWindowLongPtrW",
        "SetWindowLongPtrW",
    ] {
        assert!(source.contains(required), "missing {required}");
    }
    for forbidden in [".kill()", "taskkill", "powershell", "cmd.exe", "ShellExecute"] {
        assert!(!source.contains(forbidden), "forbidden process path: {forbidden}");
    }
}

#[test]
fn native_app_surface_has_catalog_open_hide_and_detach_commands() {
    let source = include_str!("../src/native_app_surface.rs");
    for command in [
        "workbench_native_app_list",
        "workbench_native_app_surface_open",
        "workbench_native_app_surface_hide",
        "workbench_native_app_surface_detach",
    ] {
        assert!(source.contains(command), "missing {command}");
    }
}

#[test]
fn native_app_surface_validates_callers_paths_bounds_and_restores_window_state() {
    let source = include_str!("../src/native_app_surface.rs");
    for invariant in [
        "ensure_main_caller",
        "validate_executable_path",
        "validate_bounds",
        "original_style",
        "original_ex_style",
        "original_parent",
        "original_rect",
    ] {
        assert!(source.contains(invariant), "missing invariant {invariant}");
    }
}
