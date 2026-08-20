//! Security invariants for any future native SiYuan runtime broker.

use std::path::{Component, Path, PathBuf};

pub const LOOPBACK_HOST: &str = "127.0.0.1";
pub const RANDOM_PORT_REQUEST: u16 = 0;
pub const MIN_RUNTIME_TOKEN_BYTES: usize = 32;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApiCaller {
    TauriBackend,
    Renderer,
    Model,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SecurityError {
    NonLoopbackBinding,
    FixedPortForbidden,
    InvalidRuntimeToken,
    DirectApiAccessForbidden,
    PublishModeForbidden,
    RawSqlForbidden,
    InvalidAllowlistRoot,
    PathOutsideAllowlist,
}

pub fn validate_runtime_binding(host: &str, requested_port: u16) -> Result<(), SecurityError> {
    if host != LOOPBACK_HOST {
        return Err(SecurityError::NonLoopbackBinding);
    }
    if requested_port != RANDOM_PORT_REQUEST {
        return Err(SecurityError::FixedPortForbidden);
    }
    Ok(())
}

pub fn validate_runtime_token(token: &str) -> Result<(), SecurityError> {
    if token.len() < MIN_RUNTIME_TOKEN_BYTES
        || token
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err(SecurityError::InvalidRuntimeToken);
    }
    Ok(())
}

pub fn authorize_api_caller(caller: ApiCaller) -> Result<(), SecurityError> {
    match caller {
        ApiCaller::TauriBackend => Ok(()),
        ApiCaller::Renderer | ApiCaller::Model => Err(SecurityError::DirectApiAccessForbidden),
    }
}

pub fn require_publish_mode_disabled(enabled: bool) -> Result<(), SecurityError> {
    if enabled {
        Err(SecurityError::PublishModeForbidden)
    } else {
        Ok(())
    }
}

pub fn deny_raw_sql(_query: &str) -> Result<(), SecurityError> {
    Err(SecurityError::RawSqlForbidden)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PathAllowlist {
    roots: Vec<PathBuf>,
}

impl PathAllowlist {
    pub fn new<I, P>(roots: I) -> Result<Self, SecurityError>
    where
        I: IntoIterator<Item = P>,
        P: Into<PathBuf>,
    {
        let roots: Vec<PathBuf> = roots.into_iter().map(Into::into).collect();
        if roots.is_empty() || roots.iter().any(|root| !is_safe_absolute_path(root)) {
            return Err(SecurityError::InvalidAllowlistRoot);
        }
        Ok(Self { roots })
    }

    pub fn authorize(&self, candidate: &Path) -> Result<(), SecurityError> {
        if !is_safe_absolute_path(candidate)
            || !self.roots.iter().any(|root| candidate.starts_with(root))
        {
            return Err(SecurityError::PathOutsideAllowlist);
        }
        Ok(())
    }
}

fn is_safe_absolute_path(path: &Path) -> bool {
    path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_must_use_ipv4_loopback_and_an_os_selected_port() {
        assert_eq!(validate_runtime_binding("127.0.0.1", 0), Ok(()));
        assert_eq!(
            validate_runtime_binding("0.0.0.0", 0),
            Err(SecurityError::NonLoopbackBinding)
        );
        assert_eq!(
            validate_runtime_binding("127.0.0.1", 6806),
            Err(SecurityError::FixedPortForbidden)
        );
    }

    #[test]
    fn runtime_token_is_non_empty_high_entropy_material() {
        assert!(validate_runtime_token("0123456789abcdef0123456789abcdef").is_ok());
        assert_eq!(
            validate_runtime_token("short"),
            Err(SecurityError::InvalidRuntimeToken)
        );
        assert_eq!(
            validate_runtime_token("0123456789abcdef 123456789abcdef"),
            Err(SecurityError::InvalidRuntimeToken)
        );
    }

    #[test]
    fn only_the_native_broker_may_call_the_runtime_api() {
        assert_eq!(authorize_api_caller(ApiCaller::TauriBackend), Ok(()));
        assert_eq!(
            authorize_api_caller(ApiCaller::Renderer),
            Err(SecurityError::DirectApiAccessForbidden)
        );
        assert_eq!(
            authorize_api_caller(ApiCaller::Model),
            Err(SecurityError::DirectApiAccessForbidden)
        );
        assert_eq!(
            deny_raw_sql("select * from blocks"),
            Err(SecurityError::RawSqlForbidden)
        );
    }

    #[test]
    fn path_access_is_limited_to_explicit_workspace_roots() {
        let base = std::env::temp_dir().join("vibespace-siyuan-project");
        let other = std::env::temp_dir().join("vibespace-other-project");
        let allowlist = PathAllowlist::new([base.clone()]).expect("absolute root");
        assert_eq!(allowlist.authorize(&base.join("data/20260820.sy")), Ok(()));
        assert_eq!(
            allowlist.authorize(&other.join("data/secret.sy")),
            Err(SecurityError::PathOutsideAllowlist)
        );
        assert_eq!(
            allowlist.authorize(&base.join("data/../outside.sy")),
            Err(SecurityError::PathOutsideAllowlist)
        );
    }
}
