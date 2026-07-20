import { describe, expect, it } from 'vitest';

import { SIK_CONTROL, SIK_EVIDENCE } from './evidenceIds';

const EXPECTED_EVIDENCE = {
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
} as const;

describe('shared intelligence kernel evidence IDs', () => {
  it('defines the complete fixed selector contract', () => {
    expect(SIK_EVIDENCE).toEqual(EXPECTED_EVIDENCE);
  });

  it('is immutable and globally unique', () => {
    const values = [...Object.values(SIK_EVIDENCE), ...Object.values(SIK_CONTROL)];

    expect(Object.isFrozen(SIK_EVIDENCE)).toBe(true);
    expect(Object.isFrozen(SIK_CONTROL)).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });

  it('contains only fixed opaque selector values and no dynamic or sensitive data', () => {
    for (const value of Object.values(SIK_EVIDENCE)) {
      expect(value).toMatch(/^[a-z][a-z0-9.-]*$/);
      expect(value).not.toMatch(/[{}$]/);
      expect(value).not.toMatch(
        /account|prompt|parameter|result|path|token|secret|password|credential|api[-_.]?key|run[-_.]?id/i,
      );
    }
  });
});
