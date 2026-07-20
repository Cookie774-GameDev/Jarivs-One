import { describe, expect, it } from 'vitest';

import {
  getKernelSmokeScenario,
  KERNEL_SMOKE_SCENARIO_IDS,
  KERNEL_SMOKE_SCENARIOS,
  type KernelSmokeScenarioId,
} from './scenarios';

const EXPECTED_IDS = [
  'transport_provider_success',
  'transport_cli_success',
  'voice_turn_stop',
  'native_stt_voice_turn',
  'approval_safe_auto',
  'approval_confirm',
  'approval_dangerous',
  'artifact_provider',
  'artifact_file_action',
  'artifact_terminal',
  'schedule_dispatch',
  'schedule_transport_retry',
  'live_evidence_restart',
  'command_center_reduced_motion',
  'hive_dispatch',
  'partial_response',
  'provider_failure',
  'cancel_before_claim',
  'cancel_running',
  'cancel_completion_race',
] as const satisfies readonly KernelSmokeScenarioId[];

function visit(value: unknown, onEntry: (key: string | undefined, value: unknown) => void): void {
  const seen = new Set<object>();

  function walk(current: unknown, key?: string): void {
    onEntry(key, current);
    if (current === null || typeof current !== 'object' || seen.has(current)) return;
    seen.add(current);
    for (const [childKey, child] of Object.entries(current)) walk(child, childKey);
  }

  walk(value);
}

function expectDeeplyFrozen(value: unknown): void {
  visit(value, (_key, entry) => {
    if (entry !== null && typeof entry === 'object') expect(Object.isFrozen(entry)).toBe(true);
  });
}

describe('kernel smoke scenario catalog', () => {
  it('covers each exact scenario ID once', () => {
    expect(KERNEL_SMOKE_SCENARIO_IDS).toEqual(EXPECTED_IDS);
    expect(new Set(KERNEL_SMOKE_SCENARIO_IDS).size).toBe(20);
    expect(Object.keys(KERNEL_SMOKE_SCENARIOS)).toEqual(EXPECTED_IDS);

    for (const id of EXPECTED_IDS) {
      expect(getKernelSmokeScenario(id)).toBe(KERNEL_SMOKE_SCENARIOS[id]);
      expect(KERNEL_SMOKE_SCENARIOS[id].id).toBe(id);
    }
  });

  it('deeply freezes the catalog, IDs, streams, inputs, and descriptors', () => {
    expectDeeplyFrozen(KERNEL_SMOKE_SCENARIO_IDS);
    expectDeeplyFrozen(KERNEL_SMOKE_SCENARIOS);
  });

  it('owns one nonempty fixed UI sequence and one safe text fixture per scenario', () => {
    const textFixtures = new Set<string>();

    for (const scenario of Object.values(KERNEL_SMOKE_SCENARIOS)) {
      expect(scenario.uiInputSequence.length).toBeGreaterThan(0);
      expect(scenario.safeTextFixture).toMatch(/^[\x20-\x7e]+$/);
      expect(scenario.safeTextFixture.length).toBeGreaterThan(0);
      expect(scenario.safeTextFixture).not.toMatch(
        /(?:sk|pk|api)[-_][a-z0-9]{12,}|bearer\s|password|secret|credential|[a-z]:\\|\/(?:home|users)\//i,
      );
      expect(textFixtures.has(scenario.safeTextFixture)).toBe(false);
      textFixtures.add(scenario.safeTextFixture);
    }
  });

  it('carries the exact safe catalog fixture through every typed UI submission', () => {
    for (const scenario of Object.values(KERNEL_SMOKE_SCENARIOS)) {
      const typedInputs = scenario.uiInputSequence.filter((input) => input.action === 'fill');
      for (const input of typedInputs) expect(input.value).toBe(scenario.safeTextFixture);
    }
  });

  it('preserves provider and CLI transport identity with canonical semantic parity', () => {
    for (const scenario of Object.values(KERNEL_SMOKE_SCENARIOS)) {
      expect(scenario.streams.provider.transportIdentity).toBe('provider');
      expect(scenario.streams.cli.transportIdentity).toBe('cli');
      expect(scenario.streams.provider.semanticEvents).toEqual(scenario.streams.cli.semanticEvents);
      expect(scenario.streams.provider.semanticEvents).not.toBe(
        scenario.streams.cli.semanticEvents,
      );
    }
  });

  it('describes scheduled attempt 1 pre-first-byte failure and attempt 2 success', () => {
    expect(KERNEL_SMOKE_SCENARIOS.schedule_transport_retry.scheduleTransportRetry).toEqual({
      attempt1: {
        attemptNumber: 1,
        failureBoundary: 'before_first_response_byte',
        responseBytes: 0,
        responseChunks: 0,
        effectClaims: 0,
        result: 'retryable_failed',
      },
      restart: {
        sameRun: true,
        sameSnapshot: true,
        automaticDispatch: false,
        retryControl: 'Retry transport',
      },
      attempt2: {
        attemptNumber: 2,
        requestIdentity: 'new_for_attempt',
        result: 'canonical_success',
      },
    });
  });

  it('describes voice stop through the real abort signal with no later success', () => {
    expect(KERNEL_SMOKE_SCENARIOS.voice_turn_stop.voiceStop).toEqual({
      submissionPath: 'flushUtterance',
      providerStateBeforeStop: 'running',
      waitFor: 'request_abort_signal',
      stopMatch: 'current_protected_voice_turn',
      emitsSuccessAfterAbort: false,
    });
  });

  it('describes completed live evidence and omission of orphaned active evidence after restart', () => {
    expect(KERNEL_SMOKE_SCENARIOS.live_evidence_restart.liveEvidenceRestart).toEqual({
      completedNodeAfterRestart: 'present_after_source_and_live_row_revalidation',
      completedProofReference: 'preserve_existing_opaque_jlive_reference',
      orphanedActiveNodeAfterRestart: 'absent',
      automaticResume: false,
    });
  });

  it('requires real native fixture transcription and forbids transcript injection', () => {
    expect(KERNEL_SMOKE_SCENARIOS.native_stt_voice_turn.nativeStt).toEqual({
      fixtureSource: 'gated_native_fixture_bytes',
      transcriptionPath: 'real_faster_whisper_engine',
      sessionBinding: 'current_protected_voice_session',
      transcriptInjection: false,
      arbitraryAudioPath: false,
      releaseRawAudioBeforeKernelDispatch: true,
    });
  });

  it('uses registered approval action versions with safe canonical parameters', () => {
    expect(KERNEL_SMOKE_SCENARIOS.approval_safe_auto.action).toEqual({
      id: 'file.search',
      version: 1,
      parameters: { query: 'smoke fixture', maxResults: 1 },
    });
    expect(KERNEL_SMOKE_SCENARIOS.approval_confirm.action).toEqual({
      id: 'terminal.create',
      version: 1,
      parameters: {},
    });
    expect(KERNEL_SMOKE_SCENARIOS.approval_dangerous.action).toEqual({
      id: 'task.cancel',
      version: 1,
      parameters: {},
    });
    expect(KERNEL_SMOKE_SCENARIOS.artifact_file_action.action).toEqual({
      id: 'file.search',
      version: 1,
      parameters: { query: 'smoke fixture', maxResults: 1 },
    });
    expect(KERNEL_SMOKE_SCENARIOS.artifact_terminal.action).toEqual({
      id: 'terminal.run',
      version: 1,
      parameters: {
        command: "Write-Output 'VibeSpace kernel terminal fixture'; exit",
        label: 'Kernel smoke fixture',
        timeoutMs: 15_000,
      },
    });
  });

  it('routes schedule, Hive, artifact, cancellation, partial, and failure fixtures to real boundaries', () => {
    expect(KERNEL_SMOKE_SCENARIOS.schedule_dispatch.executionPath).toBe(
      'task17_schedule_dispatcher',
    );
    expect(KERNEL_SMOKE_SCENARIOS.schedule_transport_retry.executionPath).toBe(
      'task17_schedule_dispatcher',
    );
    expect(KERNEL_SMOKE_SCENARIOS.hive_dispatch.executionPath).toBe('task17_hive_dispatcher');

    for (const id of ['artifact_provider', 'artifact_file_action', 'artifact_terminal'] as const) {
      expect(KERNEL_SMOKE_SCENARIOS[id].executionPath).toBe('task20b_artifact_producer');
    }
    for (const id of ['cancel_before_claim', 'cancel_running', 'cancel_completion_race'] as const) {
      expect(KERNEL_SMOKE_SCENARIOS[id].executionPath).toBe('task18_19c_cancellation');
    }
    for (const id of ['partial_response', 'provider_failure'] as const) {
      expect(KERNEL_SMOKE_SCENARIOS[id].executionPath).toBe('task13_provider_boundary');
    }
  });

  it('uses named reduced-motion emulation and keyboard controls without generic evaluation', () => {
    const inputs = KERNEL_SMOKE_SCENARIOS.command_center_reduced_motion.uiInputSequence;

    expect(inputs[0]).toEqual({
      control: 'page.media',
      action: 'emulate_media',
      value: 'reducedMotion:reduce',
    });
    expect(inputs.some((input) => input.action === 'press')).toBe(true);
    expect(inputs.some((input) => /evaluate/i.test(input.control))).toBe(false);
  });

  it('keeps helper-owned app restarts outside real UI input sequences', () => {
    for (const scenario of Object.values(KERNEL_SMOKE_SCENARIOS)) {
      expect(scenario.uiInputSequence.map((input) => input.control)).not.toContain(
        'application.restart',
      );
    }
  });

  it('contains no secret-shaped fields, callbacks, direct repository mutation, or terminal assertions', () => {
    visit(KERNEL_SMOKE_SCENARIOS, (key, value) => {
      if (key) {
        expect(key).not.toMatch(
          /apiKey|password|secret|token|credential|repository|repoMutation|assertTerminalState|terminalStateHook/i,
        );
        expect(key).not.toMatch(
          /^(?:timestamp|createdAt|updatedAt|random|uuid|accountId|runId|requestId)$/i,
        );
      }
      expect(typeof value).not.toBe('function');
      if (typeof value === 'string') {
        expect(value).not.toMatch(
          /(?:sk|pk|api)[-_][a-z0-9]{12,}|bearer\s+[a-z0-9._-]+|password\s*[=:]|secret\s*[=:]/i,
        );
        expect(value).not.toMatch(/insert.*(?:run|event|approval|artifact)|write.*repository/i);
      }
    });
  });
});
