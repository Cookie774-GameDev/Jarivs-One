use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use sha2::{Digest, Sha256};

const SMOKE_FLAG: &str = "VIBESPACE_SIK_SMOKE";
const CDP_PORT: &str = "VIBESPACE_SIK_CDP_PORT";
const PROFILE: &str = "VIBESPACE_SIK_PROFILE";
const NONCE: &str = "VIBESPACE_SIK_NONCE";
const APPDATA: &str = "APPDATA";
const LOCAL_APPDATA: &str = "LOCALAPPDATA";
const MAIN_WINDOW_LABEL: &str = "main";
const REQUIRED_NONCE_HEX_LEN: usize = 64;

const PINNED_VOICE_FIXTURE_BYTES: &[u8] = include_bytes!("../tests/fixtures/sik_voice_turn.wav");
const PINNED_VOICE_FIXTURE_SHA256: &str =
    "b3bab750a95495ae54c457b54cb9a066147e36acc6a711e1a09ea05265c272f7";

#[derive(Debug)]
struct SmokeGateInput {
    debug_build: bool,
    explicit_flag: Option<String>,
    cdp_host: Option<IpAddr>,
    cdp_port: Option<String>,
    cdp_port_is_bound: bool,
    profile: Option<PathBuf>,
    canonical_profile: Option<PathBuf>,
    appdata: Option<PathBuf>,
    local_appdata: Option<PathBuf>,
    nonce: Option<String>,
    window_label: String,
}

#[derive(Debug, PartialEq, Eq)]
enum SmokeGateError {
    ReleaseBuild,
    FlagDisabled,
    NonLoopbackHost,
    InvalidPort,
    PortNotBound,
    InvalidProfile,
    AppDataOutsideProfile,
    LocalAppDataOutsideProfile,
    InvalidNonce,
    InvalidWindow,
    FixtureDigestMismatch,
}

impl SmokeGateError {
    fn code(&self) -> &'static str {
        match self {
            Self::ReleaseBuild => "sik_smoke_release_build",
            Self::FlagDisabled => "sik_smoke_flag_disabled",
            Self::NonLoopbackHost => "sik_smoke_non_loopback_host",
            Self::InvalidPort => "sik_smoke_invalid_port",
            Self::PortNotBound => "sik_smoke_port_not_bound",
            Self::InvalidProfile => "sik_smoke_invalid_profile",
            Self::AppDataOutsideProfile => "sik_smoke_appdata_outside_profile",
            Self::LocalAppDataOutsideProfile => "sik_smoke_localappdata_outside_profile",
            Self::InvalidNonce => "sik_smoke_invalid_nonce",
            Self::InvalidWindow => "sik_smoke_invalid_window",
            Self::FixtureDigestMismatch => "sik_smoke_fixture_digest_mismatch",
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ValidatedSmokeGate {
    cdp_port: u16,
    profile: PathBuf,
    nonce: String,
}

fn validate_smoke_gate(input: SmokeGateInput) -> Result<ValidatedSmokeGate, SmokeGateError> {
    if !input.debug_build {
        return Err(SmokeGateError::ReleaseBuild);
    }
    if input.explicit_flag.as_deref() != Some("1") {
        return Err(SmokeGateError::FlagDisabled);
    }
    if input.cdp_host != Some(IpAddr::V4(Ipv4Addr::LOCALHOST)) {
        return Err(SmokeGateError::NonLoopbackHost);
    }

    let cdp_port = input
        .cdp_port
        .as_deref()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port != 0)
        .ok_or(SmokeGateError::InvalidPort)?;
    if !input.cdp_port_is_bound {
        return Err(SmokeGateError::PortNotBound);
    }

    let profile = input.profile.ok_or(SmokeGateError::InvalidProfile)?;
    let canonical_profile = input
        .canonical_profile
        .ok_or(SmokeGateError::InvalidProfile)?;
    if !profile.is_absolute()
        || !paths_refer_to_same_canonical_location(&profile, &canonical_profile)
    {
        return Err(SmokeGateError::InvalidProfile);
    }

    let appdata = input.appdata.ok_or(SmokeGateError::AppDataOutsideProfile)?;
    if !path_is_contained_or_equal(&appdata, &canonical_profile) {
        return Err(SmokeGateError::AppDataOutsideProfile);
    }
    let local_appdata = input
        .local_appdata
        .ok_or(SmokeGateError::LocalAppDataOutsideProfile)?;
    if !path_is_contained_or_equal(&local_appdata, &canonical_profile) {
        return Err(SmokeGateError::LocalAppDataOutsideProfile);
    }

    let nonce = input.nonce.ok_or(SmokeGateError::InvalidNonce)?;
    if nonce.len() != REQUIRED_NONCE_HEX_LEN || !nonce.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(SmokeGateError::InvalidNonce);
    }
    if input.window_label != MAIN_WINDOW_LABEL {
        return Err(SmokeGateError::InvalidWindow);
    }

    Ok(ValidatedSmokeGate {
        cdp_port,
        profile,
        nonce,
    })
}

#[cfg(windows)]
fn windows_canonical_path_key(path: &std::path::Path) -> Option<String> {
    let text = path.to_str()?.replace('/', "\\");
    let without_verbatim_prefix = if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        text
    };
    Some(without_verbatim_prefix.to_lowercase())
}

#[cfg(windows)]
fn paths_refer_to_same_canonical_location(
    path: &std::path::Path,
    canonical_path: &std::path::Path,
) -> bool {
    windows_canonical_path_key(path) == windows_canonical_path_key(canonical_path)
}

#[cfg(not(windows))]
fn paths_refer_to_same_canonical_location(
    path: &std::path::Path,
    canonical_path: &std::path::Path,
) -> bool {
    path == canonical_path
}

fn path_is_contained_or_equal(path: &std::path::Path, profile: &std::path::Path) -> bool {
    path == profile || path.starts_with(profile)
}

fn canonical_env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .map(PathBuf::from)
        .and_then(|path| std::fs::canonicalize(path).ok())
}

fn smoke_gate_input(window_label: &str) -> SmokeGateInput {
    let profile = std::env::var_os(PROFILE).map(PathBuf::from);
    let canonical_profile = profile
        .as_ref()
        .and_then(|path| std::fs::canonicalize(path).ok());
    let cdp_port = std::env::var(CDP_PORT).ok();
    let parsed_port = cdp_port
        .as_deref()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port != 0);
    let cdp_port_is_bound = parsed_port
        .map(|port| {
            TcpStream::connect_timeout(
                &SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port),
                Duration::from_millis(250),
            )
            .is_ok()
        })
        .unwrap_or(false);

    SmokeGateInput {
        debug_build: cfg!(debug_assertions),
        explicit_flag: std::env::var(SMOKE_FLAG).ok(),
        cdp_host: Some(IpAddr::V4(Ipv4Addr::LOCALHOST)),
        cdp_port,
        cdp_port_is_bound,
        profile,
        canonical_profile,
        appdata: canonical_env_path(APPDATA),
        local_appdata: canonical_env_path(LOCAL_APPDATA),
        nonce: std::env::var(NONCE).ok(),
        window_label: window_label.to_string(),
    }
}

fn validated_smoke_gate(window_label: &str) -> Result<ValidatedSmokeGate, String> {
    validate_smoke_gate(smoke_gate_input(window_label)).map_err(|error| error.code().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SikSmokeBinding {
    native_pid: u32,
    cdp_port: u16,
    canonical_profile: String,
    nonce: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SikSmokeVoiceFixture {
    audio_base64: String,
    sha256: String,
    mime_type: &'static str,
}

fn binding_from_validated(validated: ValidatedSmokeGate) -> SikSmokeBinding {
    SikSmokeBinding {
        native_pid: std::process::id(),
        cdp_port: validated.cdp_port,
        canonical_profile: validated.profile.to_string_lossy().into_owned(),
        nonce: validated.nonce,
    }
}

fn fixture_from_bytes(bytes: &[u8]) -> Result<SikSmokeVoiceFixture, SmokeGateError> {
    let digest = format!("{:x}", Sha256::digest(bytes));
    if digest != PINNED_VOICE_FIXTURE_SHA256 {
        return Err(SmokeGateError::FixtureDigestMismatch);
    }

    Ok(SikSmokeVoiceFixture {
        audio_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        sha256: digest,
        mime_type: "audio/wav",
    })
}

#[tauri::command]
pub(crate) fn sik_smoke_binding(window: tauri::WebviewWindow) -> Result<SikSmokeBinding, String> {
    let validated = validated_smoke_gate(window.label())?;
    Ok(binding_from_validated(validated))
}

#[tauri::command]
pub(crate) fn sik_smoke_voice_fixture(
    window: tauri::WebviewWindow,
) -> Result<SikSmokeVoiceFixture, String> {
    validated_smoke_gate(window.label())?;
    fixture_from_bytes(PINNED_VOICE_FIXTURE_BYTES).map_err(|error| error.code().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use std::net::{IpAddr, Ipv4Addr};
    use std::path::PathBuf;

    fn valid_gate_input() -> SmokeGateInput {
        let profile = std::env::temp_dir().join("vibespace-sik-smoke-profile");
        SmokeGateInput {
            debug_build: true,
            explicit_flag: Some("1".to_string()),
            cdp_host: Some(IpAddr::V4(Ipv4Addr::LOCALHOST)),
            cdp_port: Some("43117".to_string()),
            cdp_port_is_bound: true,
            profile: Some(profile.clone()),
            canonical_profile: Some(profile.clone()),
            appdata: Some(profile.join("appdata")),
            local_appdata: Some(profile.join("localappdata")),
            nonce: Some(
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string(),
            ),
            window_label: "main".to_string(),
        }
    }

    #[test]
    fn gate_accepts_exact_debug_loopback_canonical_isolated_binding() {
        let validated = validate_smoke_gate(valid_gate_input()).expect("valid binding");

        assert_eq!(validated.cdp_port, 43117);
        assert_eq!(
            validated.nonce,
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        );
        assert_eq!(
            validated.profile,
            std::env::temp_dir().join("vibespace-sik-smoke-profile")
        );
    }

    #[cfg(windows)]
    #[test]
    fn gate_accepts_windows_verbatim_canonical_paths_for_the_same_isolated_profile() {
        let profile = PathBuf::from(r"C:\Temp\vibespace-sik-smoke-profile");
        let canonical_profile = PathBuf::from(r"\\?\C:\Temp\vibespace-sik-smoke-profile");
        let mut input = valid_gate_input();
        input.profile = Some(profile.clone());
        input.canonical_profile = Some(canonical_profile.clone());
        input.appdata = Some(canonical_profile.join("appdata"));
        input.local_appdata = Some(canonical_profile.join("localappdata"));

        let validated = validate_smoke_gate(input).expect("equivalent Windows canonical path");
        assert_eq!(validated.profile, profile);
    }

    #[test]
    fn gate_rejects_release_build() {
        let mut input = valid_gate_input();
        input.debug_build = false;
        assert_eq!(
            validate_smoke_gate(input),
            Err(SmokeGateError::ReleaseBuild)
        );
    }

    #[test]
    fn gate_rejects_missing_or_non_exact_flag() {
        for flag in [None, Some("true".to_string()), Some("01".to_string())] {
            let mut input = valid_gate_input();
            input.explicit_flag = flag;
            assert_eq!(
                validate_smoke_gate(input),
                Err(SmokeGateError::FlagDisabled)
            );
        }
    }

    #[test]
    fn gate_rejects_non_loopback_or_unbound_or_malformed_port() {
        let mut non_loopback = valid_gate_input();
        non_loopback.cdp_host = Some("0.0.0.0".parse().unwrap());
        assert_eq!(
            validate_smoke_gate(non_loopback),
            Err(SmokeGateError::NonLoopbackHost)
        );

        for port in [
            None,
            Some("0".to_string()),
            Some("65536".to_string()),
            Some("abc".to_string()),
        ] {
            let mut input = valid_gate_input();
            input.cdp_port = port;
            assert_eq!(validate_smoke_gate(input), Err(SmokeGateError::InvalidPort));
        }

        let mut unbound = valid_gate_input();
        unbound.cdp_port_is_bound = false;
        assert_eq!(
            validate_smoke_gate(unbound),
            Err(SmokeGateError::PortNotBound)
        );
    }

    #[test]
    fn gate_rejects_missing_noncanonical_or_relative_profile() {
        let mut missing = valid_gate_input();
        missing.profile = None;
        assert_eq!(
            validate_smoke_gate(missing),
            Err(SmokeGateError::InvalidProfile)
        );

        let mut noncanonical = valid_gate_input();
        noncanonical.profile = Some(noncanonical.canonical_profile.as_ref().unwrap().join(".."));
        assert_eq!(
            validate_smoke_gate(noncanonical),
            Err(SmokeGateError::InvalidProfile)
        );

        let mut relative = valid_gate_input();
        relative.profile = Some(PathBuf::from("relative-profile"));
        relative.canonical_profile = Some(PathBuf::from("relative-profile"));
        assert_eq!(
            validate_smoke_gate(relative),
            Err(SmokeGateError::InvalidProfile)
        );
    }

    #[test]
    fn gate_rejects_appdata_or_localappdata_outside_profile() {
        let outside = std::env::temp_dir().join("outside-sik-profile");
        let mut appdata = valid_gate_input();
        appdata.appdata = Some(outside.clone());
        assert_eq!(
            validate_smoke_gate(appdata),
            Err(SmokeGateError::AppDataOutsideProfile)
        );

        let mut local_appdata = valid_gate_input();
        local_appdata.local_appdata = Some(outside);
        assert_eq!(
            validate_smoke_gate(local_appdata),
            Err(SmokeGateError::LocalAppDataOutsideProfile)
        );
    }

    #[test]
    fn gate_accepts_appdata_and_localappdata_equal_to_profile() {
        let mut input = valid_gate_input();
        let profile = input.profile.clone().unwrap();
        input.appdata = Some(profile.clone());
        input.local_appdata = Some(profile);

        assert!(validate_smoke_gate(input).is_ok());
    }

    #[test]
    fn gate_rejects_missing_or_weak_nonce() {
        for nonce in [
            None,
            Some("short".to_string()),
            Some("z123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string()),
        ] {
            let mut input = valid_gate_input();
            input.nonce = nonce;
            assert_eq!(
                validate_smoke_gate(input),
                Err(SmokeGateError::InvalidNonce)
            );
        }
    }

    #[test]
    fn gate_rejects_non_main_window_label() {
        for label in ["Main", "main-window", "dictation", ""] {
            let mut input = valid_gate_input();
            input.window_label = label.to_string();
            assert_eq!(
                validate_smoke_gate(input),
                Err(SmokeGateError::InvalidWindow)
            );
        }
    }

    #[test]
    fn fixture_bytes_and_hash_are_compile_time_pinned() {
        let fixture = fixture_from_bytes(PINNED_VOICE_FIXTURE_BYTES).expect("pinned fixture");

        assert_eq!(fixture.sha256, PINNED_VOICE_FIXTURE_SHA256);
        assert_eq!(fixture.mime_type, "audio/wav");
        assert_eq!(
            base64::engine::general_purpose::STANDARD
                .decode(fixture.audio_base64)
                .unwrap(),
            PINNED_VOICE_FIXTURE_BYTES
        );
    }

    #[test]
    fn changed_fixture_bytes_fail_the_frozen_digest() {
        let mut changed = PINNED_VOICE_FIXTURE_BYTES.to_vec();
        let midpoint = changed.len() / 2;
        changed[midpoint] ^= 1;

        assert_eq!(
            fixture_from_bytes(&changed),
            Err(SmokeGateError::FixtureDigestMismatch)
        );
    }

    #[test]
    fn fixture_schema_has_no_input_path_or_transcript_field() {
        let fixture = fixture_from_bytes(PINNED_VOICE_FIXTURE_BYTES).unwrap();
        let value = serde_json::to_value(fixture).unwrap();
        let fields = value.as_object().unwrap();

        assert_eq!(fields.len(), 3);
        assert!(fields.contains_key("audioBase64"));
        assert!(fields.contains_key("sha256"));
        assert_eq!(fields.get("mimeType").unwrap(), "audio/wav");
        assert!(!fields.contains_key("path"));
        assert!(!fields.contains_key("transcript"));

        let source = include_str!("sik_smoke.rs");
        let start = source
            .find("pub(crate) fn sik_smoke_voice_fixture")
            .expect("fixture command");
        let signature = &source[start..start + source[start..].find('{').unwrap()];
        let parameters =
            &signature[signature.find('(').unwrap() + 1..signature.rfind(')').unwrap()];
        assert!(parameters.contains("window: tauri::WebviewWindow"));
        for forbidden in ["String", "Path", "audio", "payload", "transcript"] {
            assert!(
                !parameters.contains(forbidden),
                "forbidden fixture input: {forbidden}"
            );
        }
    }

    #[test]
    fn binding_returns_only_real_pid_port_canonical_profile_and_nonce() {
        let validated = validate_smoke_gate(valid_gate_input()).unwrap();
        let binding = binding_from_validated(validated);
        let value = serde_json::to_value(binding).unwrap();
        let fields = value.as_object().unwrap();

        assert_eq!(fields.len(), 4);
        assert_eq!(fields.get("nativePid").unwrap(), std::process::id());
        assert_eq!(fields.get("cdpPort").unwrap(), 43117);
        assert_eq!(
            fields.get("canonicalProfile").unwrap(),
            &serde_json::json!(std::env::temp_dir()
                .join("vibespace-sik-smoke-profile")
                .to_string_lossy())
        );
        assert_eq!(
            fields.get("nonce").unwrap(),
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        );
    }

    #[test]
    fn release_registration_is_structurally_omitted() {
        let lib_source = include_str!("lib.rs").replace("\r\n", "\n");
        assert!(lib_source.contains("#[cfg(debug_assertions)]\nmod sik_smoke;"));
        assert!(lib_source
            .contains("#[cfg(debug_assertions)]\n            sik_smoke::sik_smoke_binding,"));
        assert!(lib_source
            .contains("#[cfg(debug_assertions)]\n            sik_smoke::sik_smoke_voice_fixture,"));
    }
}
