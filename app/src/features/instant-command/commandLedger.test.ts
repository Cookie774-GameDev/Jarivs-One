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
});
