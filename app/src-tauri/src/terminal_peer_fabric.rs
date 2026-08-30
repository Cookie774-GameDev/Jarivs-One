//! Minimal native authority for the preloaded Terminal Peer Fabric seam.
//!
//! This is deliberately not a second terminal bus. It owns only an atomic,
//! in-memory membership handshake and a status operation so the renderer can
//! distinguish a callable bundled seam from an absent or stale build.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::State;

const CAPABILITY_VERSION: &str = "1.0.0";
const MAX_PEERS: usize = 8;
const MAX_IDENTIFIER_BYTES: usize = 128;

#[derive(Default)]
pub struct TerminalPeerFabricState(Mutex<Option<ConnectedTeam>>);

#[derive(Clone)]
struct ConnectedTeam {
    peer_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum TerminalPeerFabricRequest {
    Capability,
    Connect {
        correlation_id: String,
        peer_ids: Vec<String>,
    },
    Command {
        command_id: String,
        correlation_id: String,
        target_ids: Vec<String>,
        #[serde(default)]
        arguments: Option<serde_json::Value>,
    },
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum TerminalPeerFabricResponse {
    Capability {
        available: bool,
        version: &'static str,
        operations: [&'static str; 2],
    },
    Receipt {
        #[serde(rename = "correlationId")]
        correlation_id: String,
        status: &'static str,
        #[serde(rename = "targetIds")]
        target_ids: Vec<String>,
    },
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_IDENTIFIER_BYTES
        && value == value.trim()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
}

fn validated_unique_ids(ids: Vec<String>, minimum: usize) -> Result<Vec<String>, String> {
    if ids.len() < minimum || ids.len() > MAX_PEERS {
        return Err("terminal_peer_fabric_invalid_membership".to_string());
    }
    let mut unique = HashSet::with_capacity(ids.len());
    if ids
        .iter()
        .any(|id| !valid_identifier(id) || !unique.insert(id.as_str()))
    {
        return Err("terminal_peer_fabric_invalid_membership".to_string());
    }
    Ok(ids)
}

fn connect(
    state: &TerminalPeerFabricState,
    correlation_id: String,
    peer_ids: Vec<String>,
) -> Result<TerminalPeerFabricResponse, String> {
    if !valid_identifier(&correlation_id) {
        return Err("terminal_peer_fabric_invalid_correlation".to_string());
    }
    let peer_ids = validated_unique_ids(peer_ids, 2)?;
    let mut team = state
        .0
        .lock()
        .map_err(|_| "terminal_peer_fabric_state_unavailable".to_string())?;
    *team = Some(ConnectedTeam {
        peer_ids: peer_ids.clone(),
    });
    Ok(TerminalPeerFabricResponse::Receipt {
        correlation_id,
        status: "completed",
        target_ids: peer_ids,
    })
}

fn status(
    state: &TerminalPeerFabricState,
    correlation_id: String,
    target_ids: Vec<String>,
    arguments: Option<serde_json::Value>,
) -> Result<TerminalPeerFabricResponse, String> {
    if !valid_identifier(&correlation_id) || arguments.is_some() {
        return Err("terminal_peer_fabric_invalid_command".to_string());
    }
    let team = state
        .0
        .lock()
        .map_err(|_| "terminal_peer_fabric_state_unavailable".to_string())?;
    let team = team
        .as_ref()
        .ok_or_else(|| "terminal_peer_fabric_team_unavailable".to_string())?;
    let targets = if target_ids.is_empty() {
        team.peer_ids.clone()
    } else {
        let targets = validated_unique_ids(target_ids, 1)?;
        if targets.iter().any(|id| !team.peer_ids.contains(id)) {
            return Err("terminal_peer_fabric_target_unavailable".to_string());
        }
        targets
    };
    Ok(TerminalPeerFabricResponse::Receipt {
        correlation_id,
        status: "completed",
        target_ids: targets,
    })
}

#[tauri::command]
pub fn terminal_peer_fabric(
    state: State<'_, TerminalPeerFabricState>,
    request: TerminalPeerFabricRequest,
) -> Result<TerminalPeerFabricResponse, String> {
    match request {
        TerminalPeerFabricRequest::Capability => Ok(TerminalPeerFabricResponse::Capability {
            available: true,
            version: CAPABILITY_VERSION,
            operations: ["connect", "team.status"],
        }),
        TerminalPeerFabricRequest::Connect {
            correlation_id,
            peer_ids,
        } => connect(&state, correlation_id, peer_ids),
        TerminalPeerFabricRequest::Command {
            command_id,
            correlation_id,
            target_ids,
            arguments,
        } if command_id == "team.status" => status(&state, correlation_id, target_ids, arguments),
        TerminalPeerFabricRequest::Command { .. } => {
            Err("terminal_peer_fabric_command_unsupported".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_advertises_only_the_callable_connect_and_status_seam() {
        let response = TerminalPeerFabricResponse::Capability {
            available: true,
            version: CAPABILITY_VERSION,
            operations: ["connect", "team.status"],
        };

        assert_eq!(
            serde_json::to_value(response).unwrap(),
            serde_json::json!({
                "available": true,
                "version": "1.0.0",
                "operations": ["connect", "team.status"],
            })
        );
    }

    #[test]
    fn connect_is_atomic_and_status_rejects_foreign_or_unsupported_targets() {
        let state = TerminalPeerFabricState::default();
        let connected = connect(
            &state,
            "corr-1".to_string(),
            vec!["tty-1".to_string(), "tty-2".to_string()],
        )
        .unwrap();
        assert!(matches!(
            connected,
            TerminalPeerFabricResponse::Receipt {
                status: "completed",
                ..
            }
        ));

        assert_eq!(
            status(
                &state,
                "corr-2".to_string(),
                vec!["tty-foreign".to_string()],
                None,
            )
            .unwrap_err(),
            "terminal_peer_fabric_target_unavailable"
        );
        assert_eq!(
            connect(
                &state,
                "corr-3".to_string(),
                vec!["tty-1".to_string(), "tty-1".to_string()],
            )
            .unwrap_err(),
            "terminal_peer_fabric_invalid_membership"
        );
    }
}
