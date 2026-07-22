use serde_json::json;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

const MAX_PROMPT_BYTES: u64 = 128_000;
const MODEL_ID: &str = "kernel-smoke-v1";

const FIXTURES: &[(&str, &str)] = &[
    (
        "transport_provider_success",
        "Verify the provider transport smoke fixture.",
    ),
    (
        "transport_cli_success",
        "Verify the CLI transport smoke fixture.",
    ),
    ("voice_turn_stop", "Stop this fixed voice smoke turn."),
    (
        "native_stt_voice_turn",
        "Transcribe the fixed native audio fixture.",
    ),
    ("approval_safe_auto", "Search for the fixed smoke fixture."),
    ("approval_confirm", "Create one fixed smoke terminal."),
    (
        "approval_dangerous",
        "Cancel the selected fixed smoke task.",
    ),
    ("artifact_provider", "Produce the fixed provider artifact."),
    (
        "artifact_file_action",
        "Produce the fixed file action artifact.",
    ),
    ("artifact_terminal", "Produce the fixed terminal artifact."),
    ("schedule_dispatch", "Dispatch the fixed smoke schedule."),
    (
        "schedule_transport_retry",
        "Retry the fixed scheduled transport.",
    ),
    (
        "live_evidence_restart",
        "Verify fixed live evidence across restart.",
    ),
    (
        "command_center_reduced_motion",
        "Verify the fixed reduced motion controls.",
    ),
    ("hive_dispatch", "Dispatch the fixed Hive smoke fixture."),
    (
        "partial_response",
        "Return the fixed partial smoke response.",
    ),
    ("provider_failure", "Return the fixed provider failure."),
    (
        "cancel_before_claim",
        "Cancel the fixed turn before an effect claim.",
    ),
    ("cancel_running", "Cancel the fixed running turn."),
    (
        "cancel_completion_race",
        "Resolve the fixed cancellation completion race.",
    ),
];

fn expected_executable() -> PathBuf {
    let name = if cfg!(windows) {
        "vibespace_kernel_smoke_cli.exe"
    } else {
        "vibespace_kernel_smoke_cli"
    };
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("debug")
        .join("examples")
        .join(name)
}

fn fail_closed(message: &str) -> ! {
    eprintln!("{message}");
    std::process::exit(2)
}

fn assert_gate() {
    if !cfg!(debug_assertions) || std::env::var("VIBESPACE_SIK_SMOKE").as_deref() != Ok("1") {
        fail_closed("kernel_smoke_cli_disabled");
    }
    let current = std::env::current_exe()
        .and_then(std::fs::canonicalize)
        .unwrap_or_else(|_| fail_closed("kernel_smoke_cli_path_unavailable"));
    let expected = std::fs::canonicalize(expected_executable())
        .unwrap_or_else(|_| fail_closed("kernel_smoke_cli_fixture_unavailable"));
    if current != expected {
        fail_closed("kernel_smoke_cli_path_mismatch");
    }
}

fn write_record(value: serde_json::Value) {
    println!("{value}");
}

fn selected_scenario(prompt: &str) -> Option<&'static str> {
    const OPEN: &str = "<VIBESPACE_MESSAGES>\n";
    const CLOSE: &str = "\n</VIBESPACE_MESSAGES>";
    if prompt.matches(OPEN).count() != 1 || prompt.matches(CLOSE).count() != 1 {
        return None;
    }
    let (_, after_open) = prompt.split_once(OPEN)?;
    let (serialized_messages, after_close) = after_open.split_once(CLOSE)?;
    if !after_close.is_empty() {
        return None;
    }
    let messages: Vec<serde_json::Value> = serde_json::from_str(serialized_messages).ok()?;
    let current_user = messages
        .iter()
        .rev()
        .find(|message| message.get("role").and_then(serde_json::Value::as_str) == Some("user"))?;
    let current_text = current_user
        .get("content")
        .and_then(serde_json::Value::as_str)?;
    FIXTURES
        .iter()
        .find_map(|(id, fixture)| (*fixture == current_text).then_some(*id))
}

fn action_block(id: &str, params: serde_json::Value) -> String {
    format!(
        "```action\n{}\n```",
        json!({
            "id": id,
            "params": params,
            "rationale": "Execute the fixed development smoke fixture."
        })
    )
}

fn response_text(scenario: &str) -> Option<String> {
    match scenario {
        "approval_safe_auto" => Some(action_block(
            "file.search",
            json!({ "query": "smoke fixture", "maxResults": 1 }),
        )),
        "artifact_file_action" => Some(action_block(
            "file.search",
            json!({ "query": "smoke fixture", "maxResults": 1 }),
        )),
        "approval_confirm" => Some(action_block("terminal.create", json!({}))),
        "approval_dangerous" => Some(action_block("task.cancel", json!({}))),
        "artifact_terminal" => Some(action_block(
            "terminal.run",
            json!({
                "command": "Write-Output 'VibeSpace kernel terminal fixture'; exit",
                "label": "Kernel smoke fixture",
                "timeoutMs": 15000
            }),
        )),
        "schedule_dispatch" => Some("Scheduled smoke response.".into()),
        "schedule_transport_retry" => Some("Scheduled retry succeeded.".into()),
        "live_evidence_restart" => Some("Completed live smoke response.".into()),
        "hive_dispatch" => Some("Hive smoke response.".into()),
        "partial_response" => Some("Fixed partial response.".into()),
        "cancel_completion_race" => Some("Completion race response.".into()),
        "artifact_provider" | "cancel_before_claim" => None,
        _ => Some("Deterministic smoke response.".into()),
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--version"] {
        assert_gate();
        println!("vibespace-kernel-smoke 1");
        return;
    }
    assert_gate();
    if args != ["--model", MODEL_ID] {
        fail_closed("kernel_smoke_cli_arguments_invalid");
    }

    let mut prompt = String::new();
    io::stdin()
        .take(MAX_PROMPT_BYTES + 1)
        .read_to_string(&mut prompt)
        .unwrap_or_else(|_| fail_closed("kernel_smoke_cli_prompt_unreadable"));
    if prompt.len() as u64 > MAX_PROMPT_BYTES {
        fail_closed("kernel_smoke_cli_prompt_too_large");
    }
    let scenario = selected_scenario(&prompt)
        .unwrap_or_else(|| fail_closed("kernel_smoke_cli_scenario_unrecognized"));

    if scenario == "provider_failure" {
        write_record(json!({ "type": "error", "message": "kernel_smoke_provider_failure" }));
        return;
    }
    if scenario == "schedule_transport_retry" && prompt.contains("\"attemptNumber\":1") {
        write_record(json!({
            "type": "error",
            "message": "kernel_smoke_transport_failure_before_first_response_byte"
        }));
        return;
    }
    if matches!(
        scenario,
        "voice_turn_stop" | "cancel_before_claim" | "cancel_running"
    ) {
        loop {
            thread::sleep(Duration::from_secs(1));
        }
    }
    if let Some(delta) = response_text(scenario) {
        write_record(json!({ "type": "text", "delta": delta }));
    }
    write_record(json!({
        "type": "done",
        "finish_reason": if scenario == "partial_response" { "length" } else { "stop" }
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn protected_prompt(messages: serde_json::Value) -> String {
        format!(
            "<VIBESPACE_SYSTEM_CONTRACT schema=\"1\" sha256=\"{}\">\ncontract\n</VIBESPACE_SYSTEM_CONTRACT>\n<VIBESPACE_MESSAGES>\n{}\n</VIBESPACE_MESSAGES>",
            "a".repeat(64),
            messages
        )
    }

    #[test]
    fn selects_the_exact_last_user_fixture_from_shared_history() {
        let prompt = protected_prompt(json!([
            { "role": "user", "content": "Verify the provider transport smoke fixture." },
            { "role": "assistant", "content": "Deterministic smoke response." },
            { "role": "user", "content": "Verify the CLI transport smoke fixture." }
        ]));

        assert_eq!(selected_scenario(&prompt), Some("transport_cli_success"));
    }

    #[test]
    fn rejects_missing_or_duplicate_message_envelopes() {
        assert_eq!(
            selected_scenario("Verify the CLI transport smoke fixture."),
            None
        );
        let duplicated = format!(
            "{}\n<VIBESPACE_MESSAGES>\n[]\n</VIBESPACE_MESSAGES>",
            protected_prompt(json!([{
                "role": "user",
                "content": "Verify the CLI transport smoke fixture."
            }]))
        );
        assert_eq!(selected_scenario(&duplicated), None);
    }

    #[test]
    fn rejects_inexact_or_non_string_current_user_content() {
        assert_eq!(
            selected_scenario(&protected_prompt(json!([{
                "role": "user",
                "content": "Verify the CLI transport smoke fixture. "
            }]))),
            None
        );
        assert_eq!(
            selected_scenario(&protected_prompt(json!([{
                "role": "user",
                "content": [{ "type": "text", "text": "Verify the CLI transport smoke fixture." }]
            }]))),
            None
        );
    }
}
