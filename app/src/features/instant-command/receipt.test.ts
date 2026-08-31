import { describe, expect, it } from 'vitest';
import { createInstantCommandReceipt } from './receipt';

describe('createInstantCommandReceipt', () => {
  it('creates a compact immutable receipt without raw command content', () => {
    const receipt = createInstantCommandReceipt({
      commandId: 'terminal.message',
      correlationId: 'corr-1',
      status: 'queued',
      acceptedAtMs: 123,
      targetIds: ['pane-1'],
    });

    expect(receipt).toEqual({
      commandId: 'terminal.message',
      correlationId: 'corr-1',
      status: 'queued',
      acceptedAtMs: 123,
      targetIds: ['pane-1'],
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain('rawText');
  });

  it('rejects invalid identifiers, time, targets, and follow-up/status mismatches', () => {
    expect(() =>
      createInstantCommandReceipt({
        commandId: '',
        correlationId: 'corr-1',
        status: 'queued',
        acceptedAtMs: 1,
        targetIds: [],
      }),
    ).toThrow(/command/i);
    expect(() =>
      createInstantCommandReceipt({
        commandId: 'terminal.message',
        correlationId: 'corr-1',
        status: 'queued',
        acceptedAtMs: 1,
        targetIds: [],
        followUp: { kind: 'confirmation', prompt: 'Confirm?' },
      }),
    ).toThrow(/follow-up/i);
  });

  it('rejects duplicate or excessive targets and unbounded follow-up prompts', () => {
    const base = {
      commandId: 'terminal.close',
      correlationId: 'corr-1',
      acceptedAtMs: 1,
    } as const;
    expect(() =>
      createInstantCommandReceipt({
        ...base,
        status: 'queued',
        targetIds: ['pane-1', 'pane-1'],
      }),
    ).toThrow(/target/i);
    expect(() =>
      createInstantCommandReceipt({
        ...base,
        status: 'queued',
        targetIds: Array.from({ length: 129 }, (_, index) => `pane-${index}`),
      }),
    ).toThrow(/target/i);
    expect(() =>
      createInstantCommandReceipt({
        ...base,
        status: 'needs_confirmation',
        targetIds: ['pane-1'],
        followUp: { kind: 'confirmation', prompt: 'x'.repeat(201) },
      }),
    ).toThrow(/prompt/i);
    expect(() =>
      createInstantCommandReceipt({
        ...base,
        status: 'needs_confirmation',
        targetIds: ['pane-1'],
        followUp: { kind: 'confirmation', prompt: 'Confirm\nnow' },
      }),
    ).toThrow(/prompt/i);
  });
});
