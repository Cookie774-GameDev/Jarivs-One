import { describe, expect, it, vi } from 'vitest';
import type { CaoControlRecord } from './controlRuntime';
import { createProductionCaoControlCapabilities } from './productionControlCapabilityPorts';

const record = {
  schemaVersion: 1 as const,
  revision: 3,
  accountId: 'account-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  requestId: 'request-1',
  runId: 'run-1',
  command: {
    action: 'diagnose' as const,
    selectors: [{ kind: 'chat' as const, selector: 'chat-1', by: 'id' as const }],
    source: 'natural-language' as const,
  },
  targets: [{ kind: 'chat' as const, targetId: 'chat-1', revision: 4 }],
  status: 'running' as const,
  leaseId: 'lease-1',
  updatedAt: 10,
} satisfies CaoControlRecord;

describe('production CAO canonical capability ports', () => {
  it('passes exact durable scope, target, run and request identity to the named authority', async () => {
    const diagnose = vi.fn(async () => ({ status: 'completed' as const, receiptId: 'diag-1' }));
    const capabilities = createProductionCaoControlCapabilities({
      chat: { diagnose },
      terminal: {},
    });
    const signal = new AbortController().signal;

    await expect(
      capabilities.diagnose!.chat!.execute({
        record,
        target: record.targets[0],
        signal,
      }),
    ).resolves.toEqual({ status: 'completed', receiptId: 'diag-1' });
    expect(diagnose).toHaveBeenCalledWith({
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      requestId: 'request-1',
      runId: 'run-1',
      target: { kind: 'chat', targetId: 'chat-1', revision: 4 },
      signal,
    });
  });

  it('exports every named action-kind method without inventing absent capabilities', () => {
    const completed = vi.fn(async () => ({ status: 'completed' as const, receiptId: 'receipt-1' }));
    const capabilities = createProductionCaoControlCapabilities({
      chat: {
        supervise: completed,
        diagnose: completed,
        restart: completed,
        verify: completed,
        grade: completed,
        'force-check': completed,
        cancel: completed,
      },
      terminal: { verify: completed },
    });
    expect(Object.keys(capabilities)).toEqual([
      'supervise',
      'diagnose',
      'restart',
      'verify',
      'grade',
      'force-check',
      'cancel',
    ]);
    expect(capabilities.verify).toHaveProperty('terminal');
    expect(capabilities.restart).not.toHaveProperty('terminal');
  });

  it('propagates abort while reducing private throws and malformed receipts to safe failure', async () => {
    const privateFailure = vi.fn(async () => {
      throw new Error('C:\\Users\\private\\token secret=abc');
    });
    const capabilities = createProductionCaoControlCapabilities({
      chat: { diagnose: privateFailure },
      terminal: {},
    });
    const failed = await capabilities.diagnose!.chat!.execute({
      record,
      target: record.targets[0],
      signal: new AbortController().signal,
    });
    expect(failed).toEqual({ status: 'failed' });
    expect(JSON.stringify(failed)).not.toContain('private');

    const controller = new AbortController();
    controller.abort();
    await expect(
      capabilities.diagnose!.chat!.execute({
        record,
        target: record.targets[0],
        signal: controller.signal,
      }),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(privateFailure).toHaveBeenCalledTimes(1);
  });
});
