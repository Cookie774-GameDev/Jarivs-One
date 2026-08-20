//! Typed Tauri command boundary. Operational commands remain inaccessible until the native
//! supervisor reports both feature and packaged-payload readiness for the requested project.

use super::client::{
    Block, BlockSummary, ClientError, Notebook, RuntimeStatus, RuntimeVersion, SiyuanClient,
};
use super::manifest::{SIYUAN_UPSTREAM_COMMIT, SIYUAN_UPSTREAM_TAG};
use super::supervisor::{SiyuanRuntimeState, SupervisorError};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiyuanNotebooksResponse {
    notebooks: Vec<Notebook>,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiyuanSearchResponse {
    blocks: Vec<BlockSummary>,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiyuanBlockResponse {
    block: Block,
}

fn public_error(error: SupervisorError) -> String {
    error.public_code().to_owned()
}

fn client_error(error: ClientError) -> String {
    error.to_string()
}

#[tauri::command]
pub fn siyuan_status(state: State<'_, SiyuanRuntimeState>) -> Result<RuntimeStatus, String> {
    state.status().map_err(public_error)
}

#[tauri::command]
pub fn siyuan_version() -> RuntimeVersion {
    RuntimeVersion {
        version: SIYUAN_UPSTREAM_TAG.trim_start_matches('v').to_owned(),
        commit: SIYUAN_UPSTREAM_COMMIT.to_owned(),
    }
}

#[tauri::command]
pub fn siyuan_list_notebooks(
    project_id: String,
    state: State<'_, SiyuanRuntimeState>,
) -> Result<SiyuanNotebooksResponse, String> {
    let transport = state.runtime_transport(&project_id).map_err(public_error)?;
    SiyuanClient::new(true, transport)
        .list_notebooks()
        .map(|notebooks| SiyuanNotebooksResponse { notebooks })
        .map_err(client_error)
}

#[tauri::command]
pub fn siyuan_search_blocks(
    project_id: String,
    query: String,
    limit: u16,
    state: State<'_, SiyuanRuntimeState>,
) -> Result<SiyuanSearchResponse, String> {
    let transport = state.runtime_transport(&project_id).map_err(public_error)?;
    SiyuanClient::new(true, transport)
        .search_blocks(&query, limit)
        .map(|blocks| SiyuanSearchResponse { blocks })
        .map_err(client_error)
}

#[tauri::command]
pub fn siyuan_get_block(
    project_id: String,
    id: String,
    state: State<'_, SiyuanRuntimeState>,
) -> Result<SiyuanBlockResponse, String> {
    let transport = state.runtime_transport(&project_id).map_err(public_error)?;
    SiyuanClient::new(true, transport)
        .get_block(&id)
        .map(|block| SiyuanBlockResponse { block })
        .map_err(client_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_pinned_metadata_without_runtime_or_token_material() {
        let version = siyuan_version();
        assert_eq!(version.version, "3.8.1");
        assert_eq!(version.commit, SIYUAN_UPSTREAM_COMMIT);
        let serialized = serde_json::to_string(&version).unwrap();
        assert!(!serialized.contains("token"));
        assert!(!serialized.contains("127.0.0.1"));
    }

    #[test]
    fn public_errors_are_stable_redacted_codes() {
        for error in [
            SupervisorError::FeatureDisabled,
            SupervisorError::PayloadUnavailable,
            SupervisorError::RuntimeNotReady,
            SupervisorError::ProjectUnauthorized,
            SupervisorError::WorkspaceUnavailable,
            SupervisorError::StateUnavailable,
            SupervisorError::LifecycleInvalid,
            SupervisorError::ProcessUnavailable,
        ] {
            let rendered = public_error(error);
            assert!(rendered.starts_with("siyuan_"));
            assert!(!rendered.contains("token"));
            assert!(!rendered.contains("http"));
            assert!(!rendered.contains('\\'));
        }
    }
}
