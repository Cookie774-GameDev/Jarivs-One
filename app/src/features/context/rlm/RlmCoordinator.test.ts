import { describe, expect, it, vi } from 'vitest';
import type { ContextPointer, ContextScope } from './pointerAuthority';
import { RlmCoordinator, type ContextQueryService, type EvidenceSpan } from './RlmCoordinator';

const scope: ContextScope = Object.freeze({
  accountId: 'account-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  worktreeId: 'worktree-1',
});

function pointer(index: number): ContextPointer {
  return Object.freeze({
    pointerId: `pointer-${index}`,
    leaseId: 'lease-1',
    accountId: scope.accountId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    worktreeId: scope.worktreeId,
    repositoryGeneration: 'generation-1',
    sourceId: `source-${index}`,
    recordId: `record-${index}`,
    sourceVersion: '1',
    contentHash: `hash-${index}`,
    byteStart: '0',
    byteEnd: '4',
    issuedAt: 0,
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve,
  };
}

describe('RlmCoordinator ranked evidence hydration', () => {
  it('opens ranked retrieval evidence with bounded concurrency and preserves ranked order', async () => {
    const pointers = [pointer(1), pointer(2), pointer(3), pointer(4)];
    const gates = pointers.map((item) => ({ item, gate: deferred<EvidenceSpan>() }));
    let active = 0;
    let maxActive = 0;
    const context: ContextQueryService = {
      search: vi.fn(async () =>
        pointers.map((item, index) => ({
          pointer: item,
          preview: `hit-${index}`,
          score: 1 - index / 10,
        })),
      ),
      open: vi.fn(async ({ pointer: opened }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const span = await gates.find(({ item }) => item.pointerId === opened.pointerId)!.gate
          .promise;
        active -= 1;
        return span;
      }),
    };
    const coordinator = new RlmCoordinator(context, {
      investigate: vi.fn(async () => {
        throw new Error('deep worker must not run');
      }),
    });

    const pending = coordinator.query({
      question: 'Find the previous decision.',
      scope,
      signals: { enabled: true, requestedRoute: 'retrieval' },
      performance: 'quality',
    });

    try {
      await vi.waitFor(() => expect(context.open).toHaveBeenCalledTimes(2));
      expect(maxActive).toBe(2);

      gates[1]!.gate.resolve({ pointer: pointers[1]!, text: 'two', truncated: false });
      gates[0]!.gate.resolve({ pointer: pointers[0]!, text: 'one', truncated: false });
      await vi.waitFor(() => expect(context.open).toHaveBeenCalledTimes(4));
      expect(maxActive).toBe(2);

      gates[3]!.gate.resolve({ pointer: pointers[3]!, text: 'four', truncated: false });
      gates[2]!.gate.resolve({ pointer: pointers[2]!, text: 'three', truncated: false });
      const result = await pending;

      expect(result.answerSupport.map((span) => span.text)).toEqual([
        'one',
        'two',
        'three',
        'four',
      ]);
      expect(maxActive).toBe(2);
    } finally {
      for (const { item, gate } of gates) {
        gate.resolve({ pointer: item, text: item.pointerId, truncated: false });
      }
    }
  });

  it('rejects late evidence after cancellation while concurrent opens are active', async () => {
    const pointers = [pointer(1), pointer(2)];
    const gates = pointers.map((item) => ({ item, gate: deferred<EvidenceSpan>() }));
    const controller = new AbortController();
    const context: ContextQueryService = {
      search: vi.fn(async () =>
        pointers.map((item) => ({ pointer: item, preview: item.pointerId })),
      ),
      open: vi.fn(
        async ({ pointer: opened }) =>
          gates.find(({ item }) => item.pointerId === opened.pointerId)!.gate.promise,
      ),
    };
    const coordinator = new RlmCoordinator(context, {
      investigate: vi.fn(async () => {
        throw new Error('deep worker must not run');
      }),
    });
    const pending = coordinator.query({
      question: 'Find the previous decision.',
      scope,
      signals: { enabled: true, requestedRoute: 'retrieval' },
      performance: 'quality',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(context.open).toHaveBeenCalledTimes(2));

    controller.abort();
    for (const { item, gate } of gates) {
      gate.resolve({ pointer: item, text: 'late evidence', truncated: false });
    }

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('fails closed when a concurrent open exceeds its allocated byte budget', async () => {
    const pointers = [pointer(1), pointer(2)];
    const context: ContextQueryService = {
      search: vi.fn(async () =>
        pointers.map((item) => ({ pointer: item, preview: item.pointerId })),
      ),
      open: vi.fn(async ({ pointer: opened, maxBytes }) => ({
        pointer: opened,
        text: 'x'.repeat(maxBytes + 1),
        truncated: false,
      })),
    };
    const coordinator = new RlmCoordinator(context, {
      investigate: vi.fn(async () => {
        throw new Error('deep worker must not run');
      }),
    });

    await expect(
      coordinator.query({
        question: 'Find the previous decision.',
        scope,
        signals: { enabled: true, requestedRoute: 'retrieval' },
        performance: 'responsive',
      }),
    ).rejects.toThrow('RLM_BUDGET_EXHAUSTED');
  });
});
