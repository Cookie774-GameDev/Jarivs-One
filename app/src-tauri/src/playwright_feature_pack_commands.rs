use crate::playwright_feature_pack::{
    current_target_platform, validate_trust_policy, FeaturePackDiagnosis,
    FeaturePackDiagnosisStatus, FeaturePackError, FeaturePackMeasurement,
    FeaturePackMutationReceipt, FeaturePackTrustPolicy, ManifestSignatureVerifier,
    MinisignManifestVerifier, PlaywrightFeaturePackLifecycle, MAX_TOTAL_BYTES,
};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const EXTERNAL_TRUST_PREREQUISITE: &str = "production-trust-and-signed-artifact";
const EXTERNAL_ARTIFACT_PREREQUISITE: &str = "production-signed-artifact";

#[derive(Debug, Clone, Copy, Default)]
struct CompileTimeFeaturePackValues<'a> {
    public_key: Option<&'a str>,
    manifest_sha256: Option<&'a str>,
    browser_revision: Option<&'a str>,
    repair_artifact_root: Option<&'a str>,
}

impl CompileTimeFeaturePackValues<'static> {
    fn production() -> Self {
        Self {
            public_key: option_env!("VIBESPACE_PLAYWRIGHT_FEATURE_PACK_PUBLIC_KEY"),
            manifest_sha256: option_env!("VIBESPACE_PLAYWRIGHT_FEATURE_PACK_MANIFEST_SHA256"),
            browser_revision: option_env!("VIBESPACE_PLAYWRIGHT_FEATURE_PACK_BROWSER_REVISION"),
            repair_artifact_root: option_env!(
                "VIBESPACE_PLAYWRIGHT_FEATURE_PACK_REPAIR_ARTIFACT_ROOT"
            ),
        }
    }
}

struct ProductionFeaturePackConfiguration {
    trust: FeaturePackTrustPolicy,
    verifier: MinisignManifestVerifier,
    repair_artifact_root: Option<PathBuf>,
}

impl std::fmt::Debug for ProductionFeaturePackConfiguration {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ProductionFeaturePackConfiguration")
            .field("target_platform", &self.trust.target_platform)
            .field(
                "allowed_manifest_count",
                &self.trust.allowed_manifest_sha256.len(),
            )
            .field(
                "allowed_browser_revision_count",
                &self.trust.allowed_browser_revisions.len(),
            )
            .field(
                "repair_artifact_configured",
                &self.repair_artifact_root.is_some(),
            )
            .finish()
    }
}

impl ProductionFeaturePackConfiguration {
    fn from_values(values: CompileTimeFeaturePackValues<'_>) -> Result<Self, FeaturePackError> {
        let public_key = exact_required(values.public_key)?;
        let allowed_manifest_sha256 = exact_list(values.manifest_sha256)?;
        let allowed_browser_revisions = exact_list(values.browser_revision)?;
        let verifier = MinisignManifestVerifier::from_tauri_public_key(public_key)?;
        let trust = FeaturePackTrustPolicy {
            public_key_sha256: verifier.public_key_sha256().to_string(),
            expected_key_id: verifier.key_id().to_string(),
            target_platform: current_target_platform().to_string(),
            allowed_manifest_sha256,
            allowed_browser_revisions,
            maximum_total_bytes: MAX_TOTAL_BYTES,
        };
        validate_trust_policy(&trust, &verifier)?;
        let repair_artifact_root = match values.repair_artifact_root {
            Some(value) => {
                let value = exact_required(Some(value))?;
                let path = PathBuf::from(value);
                if !path.is_absolute() {
                    return Err(FeaturePackError::new("production_artifact_not_configured"));
                }
                Some(path)
            }
            None => None,
        };
        Ok(Self {
            trust,
            verifier,
            repair_artifact_root,
        })
    }

    fn production() -> Result<Self, FeaturePackError> {
        Self::from_values(CompileTimeFeaturePackValues::production())
    }

    fn lifecycle(
        &self,
        app_data_dir: PathBuf,
    ) -> PlaywrightFeaturePackLifecycle<'_, MinisignManifestVerifier> {
        PlaywrightFeaturePackLifecycle::new(app_data_dir, self.trust.clone(), &self.verifier)
    }
}

fn exact_required(value: Option<&str>) -> Result<&str, FeaturePackError> {
    let Some(value) = value else {
        return Err(FeaturePackError::new("production_trust_not_configured"));
    };
    if value.is_empty() || value.trim() != value {
        return Err(FeaturePackError::new("production_trust_not_configured"));
    }
    Ok(value)
}

fn exact_list(value: Option<&str>) -> Result<Vec<String>, FeaturePackError> {
    let value = exact_required(value)?;
    let mut seen = HashSet::new();
    let mut output = Vec::new();
    for item in value.split(',') {
        if item.is_empty() || item.trim() != item || !seen.insert(item) {
            return Err(FeaturePackError::new("production_trust_not_configured"));
        }
        output.push(item.to_string());
    }
    if output.is_empty() {
        return Err(FeaturePackError::new("production_trust_not_configured"));
    }
    Ok(output)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlaywrightFeaturePackCommandDiagnosis {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    installation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    manifest_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    playwright_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    browser_revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    measured_bytes: Option<u64>,
    production_trust_configured: bool,
    repair_artifact_configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    external_prerequisite: Option<String>,
}

fn diagnosis_status(status: &FeaturePackDiagnosisStatus) -> &'static str {
    match status {
        FeaturePackDiagnosisStatus::Absent => "absent",
        FeaturePackDiagnosisStatus::Healthy => "healthy",
        FeaturePackDiagnosisStatus::Corrupt => "corrupt",
        FeaturePackDiagnosisStatus::Unsupported => "unsupported",
    }
}

fn configured_diagnosis(
    diagnosis: FeaturePackDiagnosis,
    repair_artifact_configured: bool,
) -> PlaywrightFeaturePackCommandDiagnosis {
    PlaywrightFeaturePackCommandDiagnosis {
        status: diagnosis_status(&diagnosis.status),
        reason: diagnosis.reason.map(str::to_string),
        installation_id: diagnosis.installation_id,
        manifest_sha256: diagnosis.manifest_sha256,
        playwright_version: diagnosis.playwright_version,
        browser_revision: diagnosis.browser_revision,
        measured_bytes: diagnosis.measured_bytes,
        production_trust_configured: true,
        repair_artifact_configured,
        external_prerequisite: (!repair_artifact_configured)
            .then(|| EXTERNAL_ARTIFACT_PREREQUISITE.to_string()),
    }
}

fn external_prerequisite_diagnosis() -> PlaywrightFeaturePackCommandDiagnosis {
    PlaywrightFeaturePackCommandDiagnosis {
        status: "unsupported",
        reason: Some("production_trust_not_configured".to_string()),
        installation_id: None,
        manifest_sha256: None,
        playwright_version: None,
        browser_revision: None,
        measured_bytes: None,
        production_trust_configured: false,
        repair_artifact_configured: false,
        external_prerequisite: Some(EXTERNAL_TRUST_PREREQUISITE.to_string()),
    }
}

fn fixed_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "app_data_unavailable".to_string())
}

fn production_configuration() -> Result<ProductionFeaturePackConfiguration, String> {
    ProductionFeaturePackConfiguration::production().map_err(|error| error.code.to_string())
}

#[tauri::command]
pub(crate) fn playwright_feature_pack_diagnose(
    app: AppHandle,
) -> PlaywrightFeaturePackCommandDiagnosis {
    let Ok(configuration) = ProductionFeaturePackConfiguration::production() else {
        return external_prerequisite_diagnosis();
    };
    let Ok(app_data_dir) = fixed_app_data_dir(&app) else {
        return PlaywrightFeaturePackCommandDiagnosis {
            status: "corrupt",
            reason: Some("app_data_unavailable".to_string()),
            installation_id: None,
            manifest_sha256: None,
            playwright_version: None,
            browser_revision: None,
            measured_bytes: None,
            production_trust_configured: true,
            repair_artifact_configured: configuration.repair_artifact_root.is_some(),
            external_prerequisite: None,
        };
    };
    let repair_artifact_configured = configuration.repair_artifact_root.is_some();
    let diagnosis = configuration
        .lifecycle(app_data_dir)
        .diagnose()
        .unwrap_or_else(|error| FeaturePackDiagnosis {
            status: FeaturePackDiagnosisStatus::Corrupt,
            reason: Some(error.code),
            installation_id: None,
            manifest_sha256: None,
            playwright_version: None,
            browser_revision: None,
            measured_bytes: None,
        });
    configured_diagnosis(diagnosis, repair_artifact_configured)
}

fn with_lifecycle<T>(
    app: &AppHandle,
    operation: impl FnOnce(
        &PlaywrightFeaturePackLifecycle<'_, MinisignManifestVerifier>,
        &ProductionFeaturePackConfiguration,
    ) -> Result<T, FeaturePackError>,
) -> Result<T, String> {
    let configuration = production_configuration()?;
    let app_data_dir = fixed_app_data_dir(app)?;
    operation(&configuration.lifecycle(app_data_dir), &configuration)
        .map_err(|error| error.code.to_string())
}

#[tauri::command]
pub(crate) fn playwright_feature_pack_install_or_update(
    app: AppHandle,
    artifact_root: String,
) -> Result<FeaturePackMutationReceipt, String> {
    with_lifecycle(&app, |lifecycle, _| {
        lifecycle.install(Path::new(&artifact_root))
    })
}

#[tauri::command]
pub(crate) fn playwright_feature_pack_repair(
    app: AppHandle,
    artifact_root: String,
) -> Result<FeaturePackMutationReceipt, String> {
    with_lifecycle(&app, |lifecycle, _| {
        lifecycle.repair(Path::new(&artifact_root))
    })
}

#[tauri::command]
pub(crate) fn playwright_feature_pack_repair_configured(
    app: AppHandle,
) -> Result<FeaturePackMutationReceipt, String> {
    with_lifecycle(&app, |lifecycle, configuration| {
        let artifact_root = configuration
            .repair_artifact_root
            .as_deref()
            .ok_or_else(|| FeaturePackError::new("production_artifact_not_configured"))?;
        lifecycle.repair(artifact_root)
    })
}

#[tauri::command]
pub(crate) fn playwright_feature_pack_rollback(
    app: AppHandle,
) -> Result<FeaturePackMutationReceipt, String> {
    with_lifecycle(&app, |lifecycle, _| lifecycle.rollback())
}

#[tauri::command]
pub(crate) fn playwright_feature_pack_measure(
    app: AppHandle,
) -> Result<FeaturePackMeasurement, String> {
    with_lifecycle(&app, |lifecycle, _| lifecycle.measure())
}

#[tauri::command]
pub(crate) fn playwright_feature_pack_uninstall(
    app: AppHandle,
) -> Result<FeaturePackMutationReceipt, String> {
    with_lifecycle(&app, |lifecycle, _| lifecycle.uninstall())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    const PUBLIC_KEY_RECORD: &str = "untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";

    fn configured_values<'a>() -> CompileTimeFeaturePackValues<'a> {
        CompileTimeFeaturePackValues {
            public_key: Some(Box::leak(
                base64::engine::general_purpose::STANDARD
                    .encode(PUBLIC_KEY_RECORD)
                    .into_boxed_str(),
            )),
            manifest_sha256: Some(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            ),
            browser_revision: Some("1234567"),
            repair_artifact_root: None,
        }
    }

    #[test]
    fn missing_or_partial_compile_time_trust_is_an_exact_external_prerequisite() {
        let missing = ProductionFeaturePackConfiguration::from_values(
            CompileTimeFeaturePackValues::default(),
        )
        .unwrap_err();
        assert_eq!(missing.code, "production_trust_not_configured");

        let mut partial = configured_values();
        partial.browser_revision = None;
        assert_eq!(
            ProductionFeaturePackConfiguration::from_values(partial)
                .unwrap_err()
                .code,
            "production_trust_not_configured"
        );

        let diagnosis = external_prerequisite_diagnosis();
        assert_eq!(diagnosis.status, "unsupported");
        assert_eq!(
            diagnosis.reason.as_deref(),
            Some("production_trust_not_configured")
        );
        assert_eq!(
            diagnosis.external_prerequisite.as_deref(),
            Some("production-trust-and-signed-artifact")
        );
        assert!(!diagnosis.production_trust_configured);
        assert!(!diagnosis.repair_artifact_configured);
    }

    #[test]
    fn configured_trust_derives_key_identity_and_never_invents_a_repair_artifact() {
        let configuration = ProductionFeaturePackConfiguration::from_values(configured_values())
            .expect("complete compile-time trust");
        assert_eq!(configuration.trust.expected_key_id, "E7620F1842B4E81F");
        assert_eq!(
            configuration.trust.target_platform,
            current_target_platform()
        );
        assert_eq!(configuration.trust.allowed_manifest_sha256.len(), 1);
        assert_eq!(configuration.trust.allowed_browser_revisions, ["1234567"]);
        assert!(configuration.repair_artifact_root.is_none());
    }
}
