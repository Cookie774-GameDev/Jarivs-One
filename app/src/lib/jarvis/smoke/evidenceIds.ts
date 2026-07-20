export const SIK_EVIDENCE = Object.freeze({
  smokeBinding: 'smoke.binding',
  voiceOpen: 'voice.open',
  voiceTranscript: 'voice.transcript',
  voiceSttFixture: 'voice.stt-fixture',
  voiceSttState: 'voice.stt-state',
  voiceState: 'voice.state',
  voiceStop: 'voice.stop',
  chatRunShell: 'chat.run-shell',
  approvalCard: 'approval.card',
  runStatus: 'run.status',
  outputsTab: 'outputs.tab',
  liveSystemsTab: 'live.systems-tab',
  terminalExecution: 'terminal.execution',
  cancellationDelivery: 'cancellation.delivery',
  errorState: 'run.error',
  partialState: 'run.partial',
} as const);

export const SIK_CONTROL = Object.freeze({
  approvalConfirm: 'approval.confirm',
  approvalConfirmDangerous: 'approval.confirm-dangerous',
  commandCenterDisclosure: 'command-center.disclosure',
  commandCenterSurface: 'command-center.surface',
  retryTransport: 'Retry transport',
  liveSystemNode: 'live.system.node',
  outputsState: 'outputs.state',
} as const);

export type SikEvidenceId = (typeof SIK_EVIDENCE)[keyof typeof SIK_EVIDENCE];
