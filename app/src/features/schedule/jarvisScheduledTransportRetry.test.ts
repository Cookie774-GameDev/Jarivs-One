import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { JarvisKernelTurnResult } from '@/lib/jarvis/kernel';
import type { ScheduledJarvisDispatchDeps } from './jarvisScheduleDispatch';
import {
  createJarvisScheduledLogicalRetryPort,
  createJarvisScheduledTransportRetryPort,
} from './jarvisScheduledTransportRetry';

function harness() {
  const calls: string[] = [];
  const allocation = Object.freeze({ allocation: true });
  const prepared = Object.freeze({ prepared: true });
  const handle = Object.freeze({ handle: true });
  const result = Object.freeze({ result: true }) as unknown as JarvisKernelTurnResult;
  const kernel = {
    allocateScheduledOccurrence: vi.fn(),
    loadScheduledRun: vi.fn(async () => {
      calls.push('load');
      return { kind: 'committed' as const, value: allocation };
    }),
    allocateScheduledLogicalRetry: vi.fn(async () => {
      calls.push('logical');
      return { kind: 'committed' as const, value: allocation };
    }),
    prepareScheduledAttempt: vi.fn(async () => {
      calls.push('prepare');
      return prepared;
    }),
    beginPreparedScheduledAttempt: vi.fn(async () => {
      calls.push('begin');
      return { kind: 'committed' as const, value: handle };
    }),
    dispatchPreparedScheduledAttempt: vi.fn(async () => {
      calls.push('dispatch');
      return { kind: 'committed' as const, value: { kind: 'committed' as const, result } };
    }),
    settleScheduledTransportFailure: vi.fn(),
    disposeScheduledAttempt: vi.fn(() => calls.push('dispose')),
  } as unknown as ScheduledJarvisDispatchDeps['kernel'];
  return { calls, allocation, prepared, handle, result, kernel };
}

describe('Jarvis scheduled retry ports', () => {
  it('loads only the exact account/run and dispatches the registered transport retry', async () => {
    const setup = harness();
    const port = createJarvisScheduledTransportRetryPort({ kernel: setup.kernel });

    await expect(port.retry({ accountId: 'account-1', runId: 'run-1' })).resolves.toEqual({
      kind: 'committed',
      result: setup.result,
    });

    expect(setup.kernel.loadScheduledRun).toHaveBeenCalledWith({
      accountId: 'account-1',
      runId: 'run-1',
    });
    expect(setup.calls).toEqual(['load', 'prepare', 'begin', 'dispatch']);
    expect(setup.kernel.allocateScheduledOccurrence).not.toHaveBeenCalled();
    expect(setup.kernel.allocateScheduledLogicalRetry).not.toHaveBeenCalled();
  });

  it('allocates a logical retry only from account and previous run', async () => {
    const setup = harness();
    const port = createJarvisScheduledLogicalRetryPort({ kernel: setup.kernel });

    await port.retry({ accountId: 'account-1', previousRunId: 'run-parent' });

    expect(setup.kernel.allocateScheduledLogicalRetry).toHaveBeenCalledWith({
      accountId: 'account-1',
      previousRunId: 'run-parent',
    });
    expect(setup.calls).toEqual(['logical', 'prepare', 'begin', 'dispatch']);
    expect(setup.kernel.loadScheduledRun).not.toHaveBeenCalled();
  });

  it('fails closed when the exact scheduled run is unavailable', async () => {
    const setup = harness();
    vi.mocked(setup.kernel.loadScheduledRun).mockResolvedValueOnce({
      kind: 'committed',
      value: undefined,
    });

    await expect(
      createJarvisScheduledTransportRetryPort({ kernel: setup.kernel }).retry({
        accountId: 'account-1',
        runId: 'run-missing',
      }),
    ).rejects.toThrow('scheduled_transport_retry_unavailable');
    expect(setup.calls).toEqual([]);
  });

  it.each(['loadScheduledRun', 'allocateScheduledLogicalRetry'] as const)(
    'passes through account revocation from %s without preparing',
    async (method) => {
      const setup = harness();
      vi.mocked(setup.kernel[method]).mockResolvedValueOnce({
        kind: 'account_authority_revoked',
      });
      const result =
        method === 'loadScheduledRun'
          ? await createJarvisScheduledTransportRetryPort({ kernel: setup.kernel }).retry({
              accountId: 'account-1',
              runId: 'run-1',
            })
          : await createJarvisScheduledLogicalRetryPort({ kernel: setup.kernel }).retry({
              accountId: 'account-1',
              previousRunId: 'run-parent',
            });

      expect(result).toEqual({ kind: 'account_authority_revoked' });
      expect(setup.kernel.prepareScheduledAttempt).not.toHaveBeenCalled();
    },
  );

  it('exposes only closed two-field retry inputs and one kernel dependency', () => {
    type TransportInput = Parameters<
      ReturnType<typeof createJarvisScheduledTransportRetryPort>['retry']
    >[0];
    type LogicalInput = Parameters<
      ReturnType<typeof createJarvisScheduledLogicalRetryPort>['retry']
    >[0];
    expectTypeOf<TransportInput>().toEqualTypeOf<{ accountId: string; runId: string }>();
    expectTypeOf<LogicalInput>().toEqualTypeOf<{
      accountId: string;
      previousRunId: string;
    }>();
  });
});
