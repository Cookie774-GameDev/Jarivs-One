export type KernelSmokeScenarioId =
  | 'transport_provider_success'
  | 'transport_cli_success'
  | 'voice_turn_stop'
  | 'native_stt_voice_turn'
  | 'approval_safe_auto'
  | 'approval_confirm'
  | 'approval_dangerous'
  | 'artifact_provider'
  | 'artifact_file_action'
  | 'artifact_terminal'
  | 'schedule_dispatch'
  | 'schedule_transport_retry'
  | 'live_evidence_restart'
  | 'command_center_reduced_motion'
  | 'hive_dispatch'
  | 'partial_response'
  | 'provider_failure'
  | 'cancel_before_claim'
  | 'cancel_running'
  | 'cancel_completion_race';

export type KernelSmokeTransportIdentity = 'provider' | 'cli';

export type KernelSmokeSemanticEvent =
  | Readonly<{ kind: 'run_started'; canonicalState: 'running' }>
  | Readonly<{ kind: 'text_delta'; text: string }>
  | Readonly<{
      kind: 'action_requested';
      actionId: string;
      actionVersion: number;
      parameters: Readonly<Record<string, unknown>>;
    }>
  | Readonly<{
      kind: 'artifact_produced';
      producer: 'provider' | 'file_action' | 'terminal';
      safeName: string;
    }>
  | Readonly<{ kind: 'schedule_dispatched'; canonicalState: 'running' }>
  | Readonly<{ kind: 'hive_dispatched'; canonicalState: 'running' }>
  | Readonly<{ kind: 'abort_wait_started'; canonicalState: 'running' }>
  | Readonly<{ kind: 'cancel_requested'; canonicalState: 'cancelling' }>
  | Readonly<{ kind: 'run_cancelled'; canonicalState: 'cancelled' }>
  | Readonly<{ kind: 'run_completed'; canonicalState: 'completed' }>
  | Readonly<{
      kind: 'run_partial';
      canonicalState: 'partial';
      boundary: 'provider_stream_ended';
    }>
  | Readonly<{
      kind: 'run_failed';
      canonicalState: 'failed';
      boundary: 'before_first_response_byte' | 'provider_failure';
      retryable: boolean;
    }>;

export type KernelSmokeTransportStream = Readonly<{
  transportIdentity: KernelSmokeTransportIdentity;
  semanticEvents: readonly KernelSmokeSemanticEvent[];
}>;

export type KernelSmokeUiInput = Readonly<{
  control: string;
  action: 'click' | 'fill' | 'submit' | 'press' | 'emulate_media';
  value?: string;
}>;

export type KernelSmokeActionFixture = Readonly<{
  id: 'file.search' | 'terminal.create' | 'terminal.run' | 'task.cancel';
  version: 1;
  parameters: Readonly<Record<string, unknown>>;
}>;

export type KernelSmokeScheduleTransportRetry = Readonly<{
  attempt1: Readonly<{
    attemptNumber: 1;
    failureBoundary: 'before_first_response_byte';
    responseBytes: 0;
    responseChunks: 0;
    effectClaims: 0;
    result: 'retryable_failed';
  }>;
  restart: Readonly<{
    sameRun: true;
    sameSnapshot: true;
    automaticDispatch: false;
    retryControl: 'Retry transport';
  }>;
  attempt2: Readonly<{
    attemptNumber: 2;
    requestIdentity: 'new_for_attempt';
    result: 'canonical_success';
  }>;
}>;

export type KernelSmokeVoiceStop = Readonly<{
  submissionPath: 'flushUtterance';
  providerStateBeforeStop: 'running';
  waitFor: 'request_abort_signal';
  stopMatch: 'current_protected_voice_turn';
  emitsSuccessAfterAbort: false;
}>;

export type KernelSmokeLiveEvidenceRestart = Readonly<{
  completedNodeAfterRestart: 'present_after_source_and_live_row_revalidation';
  completedProofReference: 'preserve_existing_opaque_jlive_reference';
  orphanedActiveNodeAfterRestart: 'absent';
  automaticResume: false;
}>;

export type KernelSmokeNativeStt = Readonly<{
  fixtureSource: 'gated_native_fixture_bytes';
  transcriptionPath: 'real_faster_whisper_engine';
  sessionBinding: 'current_protected_voice_session';
  transcriptInjection: false;
  arbitraryAudioPath: false;
  releaseRawAudioBeforeKernelDispatch: true;
}>;

export type KernelSmokeScenario = Readonly<{
  id: KernelSmokeScenarioId;
  executionPath:
    | 'task13_provider_transport'
    | 'task13_cli_transport'
    | 'voice_flush_utterance'
    | 'native_stt_then_voice'
    | 'task19_approval'
    | 'task20b_artifact_producer'
    | 'task17_schedule_dispatcher'
    | 'live_boot_reconstruction'
    | 'command_center_controls'
    | 'task17_hive_dispatcher'
    | 'task13_provider_boundary'
    | 'task18_19c_cancellation';
  safeTextFixture: string;
  uiInputSequence: readonly KernelSmokeUiInput[];
  streams: Readonly<{
    provider: KernelSmokeTransportStream;
    cli: KernelSmokeTransportStream;
  }>;
  action?: KernelSmokeActionFixture;
  scheduleTransportRetry?: KernelSmokeScheduleTransportRetry;
  voiceStop?: KernelSmokeVoiceStop;
  liveEvidenceRestart?: KernelSmokeLiveEvidenceRestart;
  nativeStt?: KernelSmokeNativeStt;
}>;

export const KERNEL_SMOKE_SCENARIO_IDS = Object.freeze([
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
] as const satisfies readonly KernelSmokeScenarioId[]);

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepClone(entry)]),
    ) as T;
  }
  return value;
}

function makeStreams(
  semanticEvents: readonly KernelSmokeSemanticEvent[],
): Readonly<{ provider: KernelSmokeTransportStream; cli: KernelSmokeTransportStream }> {
  return deepFreeze({
    provider: {
      transportIdentity: 'provider' as const,
      semanticEvents: deepClone(semanticEvents),
    },
    cli: {
      transportIdentity: 'cli' as const,
      semanticEvents: deepClone(semanticEvents),
    },
  });
}

function sequence(...inputs: readonly KernelSmokeUiInput[]): readonly KernelSmokeUiInput[] {
  return deepFreeze([...inputs]);
}

function scenario(
  value: Omit<KernelSmokeScenario, 'streams'> & {
    semanticEvents: readonly KernelSmokeSemanticEvent[];
  },
): KernelSmokeScenario {
  const { semanticEvents, ...fixture } = value;
  return deepFreeze({ ...fixture, streams: makeStreams(semanticEvents) });
}

const SUCCESS_EVENTS = [
  { kind: 'run_started', canonicalState: 'running' },
  { kind: 'text_delta', text: 'Deterministic smoke response.' },
  { kind: 'run_completed', canonicalState: 'completed' },
] as const satisfies readonly KernelSmokeSemanticEvent[];

export const KERNEL_SMOKE_SCENARIOS = deepFreeze({
  transport_provider_success: scenario({
    id: 'transport_provider_success',
    executionPath: 'task13_provider_transport',
    safeTextFixture: 'Verify the provider transport smoke fixture.',
    uiInputSequence: sequence(
      {
        control: 'chat.composer',
        action: 'fill',
        value: 'Verify the provider transport smoke fixture.',
      },
      { control: 'chat.submit', action: 'click' },
    ),
    semanticEvents: SUCCESS_EVENTS,
  }),
  transport_cli_success: scenario({
    id: 'transport_cli_success',
    executionPath: 'task13_cli_transport',
    safeTextFixture: 'Verify the CLI transport smoke fixture.',
    uiInputSequence: sequence(
      {
        control: 'chat.composer',
        action: 'fill',
        value: 'Verify the CLI transport smoke fixture.',
      },
      { control: 'chat.submit', action: 'click' },
    ),
    semanticEvents: SUCCESS_EVENTS,
  }),
  voice_turn_stop: scenario({
    id: 'voice_turn_stop',
    executionPath: 'voice_flush_utterance',
    safeTextFixture: 'Stop this fixed voice smoke turn.',
    uiInputSequence: sequence(
      { control: 'voice.open', action: 'click' },
      { control: 'voice.transcript', action: 'click' },
      { control: 'voice.stop', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      { kind: 'abort_wait_started', canonicalState: 'running' },
      { kind: 'cancel_requested', canonicalState: 'cancelling' },
      { kind: 'run_cancelled', canonicalState: 'cancelled' },
    ],
    voiceStop: {
      submissionPath: 'flushUtterance',
      providerStateBeforeStop: 'running',
      waitFor: 'request_abort_signal',
      stopMatch: 'current_protected_voice_turn',
      emitsSuccessAfterAbort: false,
    },
  }),
  native_stt_voice_turn: scenario({
    id: 'native_stt_voice_turn',
    executionPath: 'native_stt_then_voice',
    safeTextFixture: 'Transcribe the fixed native audio fixture.',
    uiInputSequence: sequence(
      { control: 'voice.open', action: 'click' },
      { control: 'voice.stt-fixture', action: 'click' },
    ),
    semanticEvents: SUCCESS_EVENTS,
    nativeStt: {
      fixtureSource: 'gated_native_fixture_bytes',
      transcriptionPath: 'real_faster_whisper_engine',
      sessionBinding: 'current_protected_voice_session',
      transcriptInjection: false,
      arbitraryAudioPath: false,
      releaseRawAudioBeforeKernelDispatch: true,
    },
  }),
  approval_safe_auto: scenario({
    id: 'approval_safe_auto',
    executionPath: 'task19_approval',
    safeTextFixture: 'Search for the fixed smoke fixture.',
    uiInputSequence: sequence(
      { control: 'chat.composer', action: 'fill', value: 'Search for the fixed smoke fixture.' },
      { control: 'chat.submit', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      {
        kind: 'action_requested',
        actionId: 'file.search',
        actionVersion: 1,
        parameters: { query: 'smoke fixture', maxResults: 1 },
      },
      { kind: 'run_completed', canonicalState: 'completed' },
    ],
    action: {
      id: 'file.search',
      version: 1,
      parameters: { query: 'smoke fixture', maxResults: 1 },
    },
  }),
  approval_confirm: scenario({
    id: 'approval_confirm',
    executionPath: 'task19_approval',
    safeTextFixture: 'Create one fixed smoke terminal.',
    uiInputSequence: sequence(
      { control: 'chat.composer', action: 'fill', value: 'Create one fixed smoke terminal.' },
      { control: 'chat.submit', action: 'click' },
      { control: 'approval.confirm', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      { kind: 'action_requested', actionId: 'terminal.create', actionVersion: 1, parameters: {} },
      { kind: 'run_completed', canonicalState: 'completed' },
    ],
    action: { id: 'terminal.create', version: 1, parameters: {} },
  }),
  approval_dangerous: scenario({
    id: 'approval_dangerous',
    executionPath: 'task19_approval',
    safeTextFixture: 'Cancel the selected fixed smoke task.',
    uiInputSequence: sequence(
      {
        control: 'chat.composer',
        action: 'fill',
        value: 'Cancel the selected fixed smoke task.',
      },
      { control: 'chat.submit', action: 'click' },
      { control: 'approval.confirm-dangerous', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      { kind: 'action_requested', actionId: 'task.cancel', actionVersion: 1, parameters: {} },
      { kind: 'run_completed', canonicalState: 'completed' },
    ],
    action: { id: 'task.cancel', version: 1, parameters: {} },
  }),
  artifact_provider: scenario({
    id: 'artifact_provider',
    executionPath: 'task20b_artifact_producer',
    safeTextFixture: 'Produce the fixed provider artifact.',
    uiInputSequence: sequence(
      { control: 'chat.composer', action: 'fill', value: 'Produce the fixed provider artifact.' },
      { control: 'chat.submit', action: 'click' },
      { control: 'command-center.disclosure', action: 'click' },
      { control: 'outputs.tab', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      { kind: 'artifact_produced', producer: 'provider', safeName: 'smoke-provider-output.txt' },
      { kind: 'run_completed', canonicalState: 'completed' },
    ],
  }),
  artifact_file_action: scenario({
    id: 'artifact_file_action',
    executionPath: 'task20b_artifact_producer',
    safeTextFixture: 'Produce the fixed file action artifact.',
    uiInputSequence: sequence(
      {
        control: 'chat.composer',
        action: 'fill',
        value: 'Produce the fixed file action artifact.',
      },
      { control: 'chat.submit', action: 'click' },
      { control: 'command-center.disclosure', action: 'click' },
      { control: 'outputs.tab', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      {
        kind: 'action_requested',
        actionId: 'file.search',
        actionVersion: 1,
        parameters: { query: 'smoke fixture', maxResults: 1 },
      },
      { kind: 'artifact_produced', producer: 'file_action', safeName: 'smoke-file-output.txt' },
      { kind: 'run_completed', canonicalState: 'completed' },
    ],
    action: {
      id: 'file.search',
      version: 1,
      parameters: { query: 'smoke fixture', maxResults: 1 },
    },
  }),
  artifact_terminal: scenario({
    id: 'artifact_terminal',
    executionPath: 'task20b_artifact_producer',
    safeTextFixture: 'Produce the fixed terminal artifact.',
    uiInputSequence: sequence(
      { control: 'chat.composer', action: 'fill', value: 'Produce the fixed terminal artifact.' },
      { control: 'chat.submit', action: 'click' },
      { control: 'approval.confirm-dangerous', action: 'click' },
      { control: 'chat.return', action: 'click' },
      { control: 'command-center.disclosure', action: 'click' },
      { control: 'outputs.tab', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      {
        kind: 'action_requested',
        actionId: 'terminal.run',
        actionVersion: 1,
        parameters: {
          command: "Write-Output 'VibeSpace kernel terminal fixture'; exit",
          label: 'Kernel smoke fixture',
          timeoutMs: 15_000,
        },
      },
      { kind: 'artifact_produced', producer: 'terminal', safeName: 'smoke-terminal-output.txt' },
      { kind: 'run_completed', canonicalState: 'completed' },
    ],
    action: {
      id: 'terminal.run',
      version: 1,
      parameters: {
        command: "Write-Output 'VibeSpace kernel terminal fixture'; exit",
        label: 'Kernel smoke fixture',
        timeoutMs: 15_000,
      },
    },
  }),
  schedule_dispatch: scenario({
    id: 'schedule_dispatch',
    executionPath: 'task17_schedule_dispatcher',
    safeTextFixture: 'Dispatch the fixed smoke schedule.',
    uiInputSequence: sequence(
      { control: 'schedule.fixture', action: 'click' },
      { control: 'schedule.dispatch', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'schedule_dispatched', canonicalState: 'running' },
      { kind: 'text_delta', text: 'Scheduled smoke response.' },
      { kind: 'run_completed', canonicalState: 'completed' },
    ],
  }),
  schedule_transport_retry: scenario({
    id: 'schedule_transport_retry',
    executionPath: 'task17_schedule_dispatcher',
    safeTextFixture: 'Retry the fixed scheduled transport.',
    uiInputSequence: sequence(
      { control: 'schedule.fixture', action: 'click' },
      { control: 'schedule.retry-fixture', action: 'click' },
      { control: 'Retry transport', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'schedule_dispatched', canonicalState: 'running' },
      {
        kind: 'run_failed',
        canonicalState: 'failed',
        boundary: 'before_first_response_byte',
        retryable: true,
      },
      { kind: 'schedule_dispatched', canonicalState: 'running' },
      { kind: 'text_delta', text: 'Scheduled retry succeeded.' },
      { kind: 'run_completed', canonicalState: 'completed' },
    ],
    scheduleTransportRetry: {
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
    },
  }),
  live_evidence_restart: scenario({
    id: 'live_evidence_restart',
    executionPath: 'live_boot_reconstruction',
    safeTextFixture: 'Verify fixed live evidence across restart.',
    uiInputSequence: sequence(
      {
        control: 'chat.composer',
        action: 'fill',
        value: 'Verify fixed live evidence across restart.',
      },
      { control: 'chat.submit', action: 'click' },
      {
        control: 'chat.composer',
        action: 'fill',
        value: 'Verify fixed live evidence across restart.',
      },
      { control: 'chat.submit', action: 'click' },
      { control: 'live.systems-tab', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      { kind: 'text_delta', text: 'Completed live smoke response.' },
      { kind: 'run_completed', canonicalState: 'completed' },
      { kind: 'run_started', canonicalState: 'running' },
    ],
    liveEvidenceRestart: {
      completedNodeAfterRestart: 'present_after_source_and_live_row_revalidation',
      completedProofReference: 'preserve_existing_opaque_jlive_reference',
      orphanedActiveNodeAfterRestart: 'absent',
      automaticResume: false,
    },
  }),
  command_center_reduced_motion: scenario({
    id: 'command_center_reduced_motion',
    executionPath: 'command_center_controls',
    safeTextFixture: 'Verify the fixed reduced motion controls.',
    uiInputSequence: sequence(
      { control: 'page.media', action: 'emulate_media', value: 'reducedMotion:reduce' },
      {
        control: 'chat.composer',
        action: 'fill',
        value: 'Verify the fixed reduced motion controls.',
      },
      { control: 'chat.submit', action: 'click' },
      { control: 'command-center.disclosure', action: 'press', value: 'Enter' },
      { control: 'outputs.tab', action: 'press', value: 'ArrowRight' },
    ),
    semanticEvents: SUCCESS_EVENTS,
  }),
  hive_dispatch: scenario({
    id: 'hive_dispatch',
    executionPath: 'task17_hive_dispatcher',
    safeTextFixture: 'Dispatch the fixed Hive smoke fixture.',
    uiInputSequence: sequence(
      { control: 'hive.fixture', action: 'click' },
      { control: 'hive.dispatch', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'hive_dispatched', canonicalState: 'running' },
      { kind: 'text_delta', text: 'Hive smoke response.' },
      { kind: 'run_completed', canonicalState: 'completed' },
    ],
  }),
  partial_response: scenario({
    id: 'partial_response',
    executionPath: 'task13_provider_boundary',
    safeTextFixture: 'Return the fixed partial smoke response.',
    uiInputSequence: sequence(
      {
        control: 'chat.composer',
        action: 'fill',
        value: 'Return the fixed partial smoke response.',
      },
      { control: 'chat.submit', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      { kind: 'text_delta', text: 'Fixed partial response.' },
      { kind: 'run_partial', canonicalState: 'partial', boundary: 'provider_stream_ended' },
    ],
  }),
  provider_failure: scenario({
    id: 'provider_failure',
    executionPath: 'task13_provider_boundary',
    safeTextFixture: 'Return the fixed provider failure.',
    uiInputSequence: sequence(
      { control: 'chat.composer', action: 'fill', value: 'Return the fixed provider failure.' },
      { control: 'chat.submit', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      {
        kind: 'run_failed',
        canonicalState: 'failed',
        boundary: 'provider_failure',
        retryable: false,
      },
    ],
  }),
  cancel_before_claim: scenario({
    id: 'cancel_before_claim',
    executionPath: 'task18_19c_cancellation',
    safeTextFixture: 'Cancel the fixed turn before an effect claim.',
    uiInputSequence: sequence(
      {
        control: 'chat.composer',
        action: 'fill',
        value: 'Cancel the fixed turn before an effect claim.',
      },
      { control: 'chat.submit', action: 'click' },
      { control: 'cancellation.delivery', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      { kind: 'abort_wait_started', canonicalState: 'running' },
      { kind: 'cancel_requested', canonicalState: 'cancelling' },
      { kind: 'run_cancelled', canonicalState: 'cancelled' },
    ],
  }),
  cancel_running: scenario({
    id: 'cancel_running',
    executionPath: 'task18_19c_cancellation',
    safeTextFixture: 'Cancel the fixed running turn.',
    uiInputSequence: sequence(
      { control: 'chat.composer', action: 'fill', value: 'Cancel the fixed running turn.' },
      { control: 'chat.submit', action: 'click' },
      { control: 'cancellation.delivery', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      { kind: 'abort_wait_started', canonicalState: 'running' },
      { kind: 'cancel_requested', canonicalState: 'cancelling' },
      { kind: 'run_cancelled', canonicalState: 'cancelled' },
    ],
  }),
  cancel_completion_race: scenario({
    id: 'cancel_completion_race',
    executionPath: 'task18_19c_cancellation',
    safeTextFixture: 'Resolve the fixed cancellation completion race.',
    uiInputSequence: sequence(
      {
        control: 'chat.composer',
        action: 'fill',
        value: 'Resolve the fixed cancellation completion race.',
      },
      { control: 'chat.submit', action: 'click' },
      { control: 'cancellation.delivery', action: 'click' },
    ),
    semanticEvents: [
      { kind: 'run_started', canonicalState: 'running' },
      { kind: 'text_delta', text: 'Completion race response.' },
      { kind: 'cancel_requested', canonicalState: 'cancelling' },
      { kind: 'run_completed', canonicalState: 'completed' },
    ],
  }),
} satisfies Record<KernelSmokeScenarioId, KernelSmokeScenario>);

export function getKernelSmokeScenario(id: KernelSmokeScenarioId): KernelSmokeScenario {
  return KERNEL_SMOKE_SCENARIOS[id];
}
