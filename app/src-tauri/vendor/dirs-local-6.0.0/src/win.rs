extern crate dirs_sys;

use std::path::PathBuf;

pub fn home_dir()         -> Option<PathBuf> { local_instance_dir("Home").or_else(dirs_sys::known_folder_profile) }

pub fn cache_dir()        -> Option<PathBuf> { data_local_dir() }
pub fn config_dir()       -> Option<PathBuf> { local_instance_dir("Roaming").or_else(dirs_sys::known_folder_roaming_app_data) }
pub fn config_local_dir() -> Option<PathBuf> { local_instance_dir("Local").or_else(dirs_sys::known_folder_local_app_data) }
pub fn data_dir()         -> Option<PathBuf> { local_instance_dir("Roaming").or_else(dirs_sys::known_folder_roaming_app_data) }
pub fn data_local_dir()   -> Option<PathBuf> { local_instance_dir("Local").or_else(dirs_sys::known_folder_local_app_data) }
pub fn executable_dir()   -> Option<PathBuf> { None }
pub fn preference_dir()   -> Option<PathBuf> { local_instance_dir("Local").or_else(dirs_sys::known_folder_local_app_data) }
pub fn runtime_dir()      -> Option<PathBuf> { None }
pub fn state_dir()        -> Option<PathBuf> { None }

pub fn audio_dir()        -> Option<PathBuf> { dirs_sys::known_folder_music() }
pub fn desktop_dir()      -> Option<PathBuf> { dirs_sys::known_folder_desktop() }
pub fn document_dir()     -> Option<PathBuf> { dirs_sys::known_folder_documents() }
pub fn download_dir()     -> Option<PathBuf> { dirs_sys::known_folder_downloads() }
pub fn font_dir()         -> Option<PathBuf> { None }
pub fn picture_dir()      -> Option<PathBuf> { dirs_sys::known_folder_pictures() }
pub fn public_dir()       -> Option<PathBuf> { dirs_sys::known_folder_public()}
pub fn template_dir()     -> Option<PathBuf> { dirs_sys::known_folder_templates() }
pub fn video_dir()        -> Option<PathBuf> { dirs_sys::known_folder_videos() }

// Local D-drive development snapshot only. Release builds retain system paths.
fn local_instance_dir(leaf: &str) -> Option<PathBuf> {
    if !cfg!(debug_assertions) { return None; }
    let root = std::env::var_os("VIBESPACE_LOCAL_INSTANCE_ROOT")?;
    let root = PathBuf::from(root);
    assert!(root.is_absolute() && root.to_string_lossy().to_ascii_lowercase().starts_with("d:\\"), "isolated instance root must be absolute on D:");
    Some(root.join(leaf))
}

#[cfg(test)]
mod local_instance_tests {
    #[test]
    fn native_paths_use_isolated_root() {
        let root = std::env::var_os("VIBESPACE_LOCAL_INSTANCE_ROOT").expect("test requires explicit isolated root");
        let root = std::path::PathBuf::from(root);
        assert_eq!(super::data_dir(), Some(root.join("Roaming")));
        assert_eq!(super::config_dir(), Some(root.join("Roaming")));
        assert_eq!(super::data_local_dir(), Some(root.join("Local")));
        assert_eq!(super::cache_dir(), Some(root.join("Local")));
        assert_eq!(super::home_dir(), Some(root.join("Home")));
    }
}