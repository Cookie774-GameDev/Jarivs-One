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

  it('rejects invalid runtime status and non-integer or unsafe accepted times', () => {
    const base = {
      commandId: 'terminal.close',
      correlationId: 'corr-1',
      status: 'queued' as const,
      targetIds: [],
    };
    expect(() =>
      createInstantCommandReceipt({
        ...base,
        status: 'success' as typeof base.status,
        acceptedAtMs: 1,
      }),
    ).toThrow(/status/i);
    expect(() => createInstantCommandReceipt({ ...base, acceptedAtMs: 1.5 })).toThrow(/time/i);
    expect(() =>
      createInstantCommandReceipt({ ...base, acceptedAtMs: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow(/time/i);
  });

  it('canonicalizes target order into an immutable receipt snapshot', () => {
    const targets = ['pane-b', 'pane-a'];
    const receipt = createInstantCommandReceipt({
      commandId: 'terminal.broadcast',
      correlationId: 'corr-1',
      status: 'queued',
      acceptedAtMs: 1,
      targetIds: targets,
    });

    targets[0] = 'pane-secret';
    expect(receipt.targetIds).toEqual(['pane-a', 'pane-b']);
    expect(Object.isFrozen(receipt.targetIds)).toBe(true);
  });
});
