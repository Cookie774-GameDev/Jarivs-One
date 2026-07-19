import { describe, expect, it, vi } from 'vitest';

import { createTaskApprovalCallId } from '@/features/jarvis-runs/approvalBridge';
import { autoApprovePendingActions, createCanonicalAutoApprovalAdapter } from './autoApprove';

describe('canonical auto approval adapter', () => {
  it('keeps the compatibility entrypoint inert without canonical injection', async () => {
    await expect(autoApprovePendingActions('message-1' as never, 'chat-1')).resolves.toBe(0);
  });

  it('routes only canonical safe/never requests through the injected kernel port', async () => {
    const executeAutoApprovedSafe = vi.fn(async () => ({
      kind: 'committed' as const,
      value: { kind: 'settled' as const, result: { ok: true as const, summary: 'done' } },
    }));
    const registrations = new Map([
      [
        'status.read',
        { id: 'status.read', version: 1, risk: 'read-only', approval: 'never' } as const,
      ],
      [
        'notes.write',
        { id: 'notes.write', version: 1, risk: 'safe-write', approval: 'always' } as const,
      ],
    ]);
    const adapter = createCanonicalAutoApprovalAdapter({
      actions: { executeAutoApprovedSafe } as never,
      catalog: { resolve: (id: string) => registrations.get(id as never) } as never,
    });
    const parentRun = { id: 'jrun_1', accountId: 'account-a' } as never;
    const attempt = {
      kind: 'initial' as const,
      runId: 'jrun_1',
      requestId: 'request-1',
      attemptNumber: 1 as const,
    };

    await expect(
      adapter.execute({
        callId: 'jarvisrun:legacy-run:legacy-step',
        parentRun,
        attempt,
        actionId: 'status.read',
        actionVersion: 1,
        params: {},
        expiresAt: 20_000,
        context: { source: 'ai' },
      }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'legacy_or_unknown' });
    await expect(
      adapter.execute({
        callId: createTaskApprovalCallId('jappr_write'),
        parentRun,
        attempt,
        actionId: 'notes.write',
        actionVersion: 1,
        params: {},
        expiresAt: 20_000,
        context: { source: 'ai' },
      }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'approval_required' });
    expect(executeAutoApprovedSafe).not.toHaveBeenCalled();

    await expect(
      adapter.execute({
        callId: createTaskApprovalCallId('jappr_read'),
        parentRun,
        attempt,
        actionId: 'status.read',
        actionVersion: 1,
        params: {},
        expiresAt: 20_000,
        context: { source: 'ai' },
      }),
    ).resolves.toMatchObject({ kind: 'committed' });
    expect(executeAutoApprovedSafe).toHaveBeenCalledOnce();
  });
});
