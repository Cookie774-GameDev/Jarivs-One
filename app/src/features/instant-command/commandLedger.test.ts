import { describe, expect, it, vi } from 'vitest';
import { InstantCommandLedger } from './commandLedger';

const binding = {
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
  commandId: 'terminal.close',
  targetIds: ['pane-a'],
  argumentDigest: 'digest-a',
} as const;

describe('InstantCommandLedger', () => {
  it('executes one correlation/fingerprint exactly once and replays its receipt', async () => {
    const ledger = new InstantCommandLedger({ now: () => 100, createToken: () => 'token-a' });
    const effect = vi.fn(async () => ({ status: 'queued' as const }));

    const first = ledger.runOnce('corr-a', binding, effect);
    const second = ledger.runOnce('corr-a', binding, effect);

    await expect(first).resolves.toEqual({ status: 'queued' });
    await expect(second).resolves.toEqual({ status: 'queued' });
    expect(effect).toHaveBeenCalledOnce();
  });

  it('rejects correlation reuse with a different exact scope or arguments', async () => {
    const ledger = new InstantCommandLedger({ now: () => 100, createToken: () => 'token-a' });
    await ledger.runOnce('corr-a', binding, async () => ({ status: 'queued' as const }));
    await expect(
      ledger.runOnce('corr-a', { ...binding, projectId: 'project-b' }, async () => ({
        status: 'queued' as const,
      })),
    ).rejects.toThrow(/correlation/i);
  });

  it('canonicalizes target order while rejecting duplicate or invalid bindings pre-operation', async () => {
    const ledger = new InstantCommandLedger({ now: () => 100, createToken: () => 'token-a' });
    const effect = vi.fn(async () => ({ status: 'queued' as const }));
    const first = { ...binding, targetIds: ['pane-b', 'pane-a'] };
    const reordered = { ...binding, targetIds: ['pane-a', 'pane-b'] };

    await ledger.runOnce('corr-order', first, effect);
    await ledger.runOnce('corr-order', reordered, effect);
    expect(effect).toHaveBeenCalledOnce();

    expect(() =>
      ledger.runOnce('corr-duplicate', { ...binding, targetIds: ['pane-a', 'pane-a'] }, effect),
    ).toThrow(/target/i);
    expect(() =>
      ledger.runOnce('corr-control', { ...binding, argumentDigest: 'bad\ndigest' }, effect),
    ).toThrow(/binding/i);
    expect(effect).toHaveBeenCalledOnce();
  });

  it('binds one confirmation to exact scope, target, arguments, expiry, and one use', () => {
    let now = 100;
    const ledger = new InstantCommandLedger({ now: () => now, createToken: () => 'token-a' });
    const token = ledger.issueConfirmation(binding, 50);

    expect(ledger.consumeConfirmation(token, { ...binding, targetIds: ['pane-b'] })).toBe(false);
    expect(ledger.consumeConfirmation(token, binding)).toBe(true);
    expect(ledger.consumeConfirmation(token, binding)).toBe(false);

    const expired = ledger.issueConfirmation(binding, 50);
    now = 151;
    expect(ledger.consumeConfirmation(expired, binding)).toBe(false);
  });

  it('fails closed on a live token collision and releases a token only after consumption', () => {
    const ledger = new InstantCommandLedger({ now: () => 100, createToken: () => 'token-a' });
    expect(ledger.issueConfirmation(binding, 50)).toBe('token-a');
    expect(() => ledger.issueConfirmation(binding, 50)).toThrow(/collision/i);
    expect(ledger.consumeConfirmation('token-a', binding)).toBe(true);
    expect(ledger.issueConfirmation(binding, 50)).toBe('token-a');
  });

  it('rejects invalid correlation identities before invoking the operation', () => {
    const ledger = new InstantCommandLedger();
    const effect = vi.fn(async () => ({ status: 'queued' as const }));

    for (const correlationId of ['', 'bad id', 'bad\ncorrelation', 'x'.repeat(257)]) {
      expect(() => ledger.runOnce(correlationId, binding, effect)).toThrow(/correlation/i);
    }
    expect(effect).not.toHaveBeenCalled();
  });

  it('never evicts active execution authority and reclaims only settled records', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const effect = vi.fn(async () => {
      await pending;
      return { status: 'queued' as const };
    });
    const ledger = new InstantCommandLedger({ maxExecutions: 2 });
    const first = ledger.runOnce('corr-a', binding, effect);
    const second = ledger.runOnce('corr-b', { ...binding, commandId: 'terminal.stop' }, effect);

    await expect(
      ledger.runOnce('corr-c', { ...binding, commandId: 'terminal.restart' }, effect),
    ).rejects.toThrow(/capacity/i);
    expect(ledger.runOnce('corr-a', binding, effect)).toBe(first);
    expect(effect).toHaveBeenCalledTimes(2);

    release();
    await Promise.all([first, second]);
    await expect(
      ledger.runOnce('corr-c', { ...binding, commandId: 'terminal.restart' }, async () => ({
        status: 'queued' as const,
      })),
    ).resolves.toEqual({ status: 'queued' });
  });

  it('bounds live confirmations, prunes expiry, and rejects invalid tokens safely', () => {
    let now = 100;
    let token = 0;
    const ledger = new InstantCommandLedger({
      now: () => now,
      createToken: () => `token-${++token}`,
      maxConfirmations: 2,
    });

    ledger.issueConfirmation(binding, 50);
    ledger.issueConfirmation({ ...binding, commandId: 'terminal.stop' }, 50);
    expect(() =>
      ledger.issueConfirmation({ ...binding, commandId: 'terminal.restart' }, 50),
    ).toThrow(/capacity/i);
    expect(ledger.consumeConfirmation('bad token', binding)).toBe(false);
    expect(() => ledger.issueConfirmation(binding, 300_001)).toThrow(/expiry/i);

    now = 151;
    expect(ledger.issueConfirmation({ ...binding, commandId: 'terminal.restart' }, 50)).toBe(
      'token-3',
    );
  });
});
