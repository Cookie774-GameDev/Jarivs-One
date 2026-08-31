import { describe, expect, it, vi } from 'vitest';
import type { JarvisDexie } from '@/lib/db/database';
import { createProductionCaoControlComposition } from './productionControlComposition';

function dependencies() {
  const recordsTable = { get: vi.fn(), add: vi.fn(), put: vi.fn() };
  return {
    database: {
      transaction: vi.fn(),
      cao_control_records: recordsTable,
    } as unknown as JarvisDexie,
    journal: { getRun: vi.fn(), appendEvent: vi.fn() },
    events: { listByRun: vi.fn() },
    approvals: { getById: vi.fn() },
    requestApproval: vi.fn(),
    cancelRun: vi.fn(),
    authorities: { chat: {}, terminal: {} },
    now: () => 1_000,
    newRunId: () => 'run-1',
    newLeaseId: () => 'lease-1',
    leaseMs: 30_000,
  };
}

describe('production CAO control composition', () => {
  it('fails closed without the canonical durable control-record repository', () => {
    const deps = dependencies();
    const database = { transaction: vi.fn() } as unknown as JarvisDexie;
    expect(() => createProductionCaoControlComposition({ ...deps, database })).toThrow(
      'cao_control_record_repository_unavailable',
    );
  });

  it('fails closed without the canonical cancellation authority', () => {
    const deps = dependencies();
    expect(() => createProductionCaoControlComposition({ ...deps, cancelRun: undefined })).toThrow(
      'cao_control_cancellation_authority_unavailable',
    );
  });

  it('rejects a missing exact action-kind capability before persistence or target claims', async () => {
    const deps = dependencies();
    const composition = createProductionCaoControlComposition(deps);
    await expect(
      composition.run({
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        requestId: 'request-1',
        command: {
          action: 'verify',
          selectors: [{ kind: 'chat', selector: 'chat-1', by: 'id' }],
          source: 'natural-language',
        },
        targets: [{ kind: 'chat', targetId: 'chat-1', revision: 1 }],
      }),
    ).rejects.toThrow('cao_control_verify_chat_unavailable');
    expect(deps.database.transaction).not.toHaveBeenCalled();
  });
});
