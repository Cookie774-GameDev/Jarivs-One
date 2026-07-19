import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Part } from '@/types/chat';
import {
  ActionApprovalCard,
  actionStatusForCanonicalExecution,
  createCanonicalApprovalCardController,
} from './ActionApprovalCard';

vi.mock('@/lib/actions', () => ({
  resolveAction: vi.fn(() => ({ id: 'terminal.run', label: 'Run command' })),
}));

function part(callId: string): Extract<Part, { kind: 'action_proposal' }> {
  return {
    kind: 'action_proposal',
    call_id: callId,
    action_id: 'terminal.run',
    params: { command: 'raw-secret-command' },
    rationale: 'Unbounded legacy rationale',
    status: 'pending',
  };
}

function renderCard(
  actionPart: Extract<Part, { kind: 'action_proposal' }>,
  presentation?: {
    actionId: string;
    expectedEffect: string;
    risk: 'safe' | 'confirm' | 'dangerous';
    parameters: readonly { field: string; safeValue: string }[];
  },
) {
  return render(
    <ActionApprovalCard
      part={actionPart}
      allParts={[actionPart]}
      messageId={'message_1' as never}
      chatId="chat_1"
      presentation={presentation}
    />,
  );
}

describe('ActionApprovalCard canonical adapter', () => {
  it('renders historical cards as view-only without raw params or execution controls', () => {
    const { container } = renderCard(part('jarvisrun:legacy:step'));

    expect(screen.getByText(/historical action card is view-only/i)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('raw-secret-command')).toBeNull();
    expect(screen.queryByText('Unbounded legacy rationale')).toBeNull();
    expect(container.firstElementChild?.getAttribute('data-approval-kind')).toBe('legacy');
  });

  it('renders only bounded canonical presentation data', () => {
    const { container } = renderCard(part('jarvisapproval:jappr_1'), {
      actionId: 'terminal.run',
      expectedEffect: 'Run the approved test command.',
      risk: 'confirm',
      parameters: [{ field: 'command', safeValue: '[redacted]' }],
    });

    expect(screen.getByText('Run the approved test command.')).toBeTruthy();
    expect(screen.getByText('[redacted]')).toBeTruthy();
    expect(screen.queryByText('raw-secret-command')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.firstElementChild?.getAttribute('data-approval-kind')).toBe('canonical');
  });

  it('uses canonical decide readback before execution and preserves handoff truth', async () => {
    const parentRun = { id: 'jrun_1', accountId: 'account-a' } as never;
    const approved = { id: 'jappr_1', runId: 'jrun_1', status: 'approved' } as never;
    const decide = vi.fn(async () => ({ kind: 'committed' as const, value: approved }));
    const execute = vi.fn(async () => ({
      kind: 'committed' as const,
      value: {
        kind: 'handoff_pending' as const,
        executorKind: 'terminal' as const,
        ownerId: 'approval:jappr_1',
        result: { ok: true as const, summary: 'Execution handed off' },
      },
    }));
    const controller = createCanonicalApprovalCardController({ decide, execute } as never);

    await expect(
      controller.approve({
        parentRun,
        callId: 'jarvisapproval:jappr_1',
        context: { source: 'user' },
      }),
    ).resolves.toEqual({
      kind: 'committed',
      value: expect.objectContaining({ kind: 'handoff_pending' }),
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(
      actionStatusForCanonicalExecution({
        kind: 'handoff_pending',
        executorKind: 'terminal',
        ownerId: 'approval:jappr_1',
        result: { ok: true, summary: 'Execution handed off' },
      }),
    ).toBe('queued');
  });

  it('rejects mismatched deny readback and historical calls', async () => {
    const parentRun = { id: 'jrun_1', accountId: 'account-a' } as never;
    const decide = vi.fn(async () => ({
      kind: 'committed' as const,
      value: { id: 'jappr_other', runId: 'jrun_1', status: 'pending' } as never,
    }));
    const execute = vi.fn();
    const controller = createCanonicalApprovalCardController({ decide, execute } as never);

    await expect(controller.deny({ parentRun, callId: 'jarvisapproval:jappr_1' })).resolves.toEqual(
      { kind: 'approval_state_mismatch' },
    );
    await expect(controller.deny({ parentRun, callId: 'jarvisrun:legacy:step' })).resolves.toEqual({
      kind: 'invalid_approval_call',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('stops approve-all at the first failed canonical execution', async () => {
    const parentRun = { id: 'jrun_1', accountId: 'account-a' } as never;
    const decide = vi.fn(async ({ approvalId }: { approvalId: string }) => ({
      kind: 'committed' as const,
      value: { id: approvalId, runId: 'jrun_1', status: 'approved' } as never,
    }));
    const execute = vi.fn(async () => ({
      kind: 'committed' as const,
      value: {
        kind: 'settled' as const,
        result: { ok: false as const, error: 'stale_capability' },
      },
    }));
    const controller = createCanonicalApprovalCardController({ decide, execute } as never);

    const outcomes = await controller.approveAll([
      { parentRun, callId: 'jarvisapproval:jappr_1', context: { source: 'user' as const } },
      { parentRun, callId: 'jarvisapproval:jappr_2', context: { source: 'user' as const } },
    ]);

    expect(outcomes).toHaveLength(1);
    expect(decide).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });
});
