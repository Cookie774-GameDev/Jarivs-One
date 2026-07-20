import type {
  JarvisAllocatedScheduledOccurrence,
  ScheduledJarvisAttemptResult,
  ScheduledJarvisDispatchDeps,
} from './jarvisScheduleDispatch';

export interface JarvisScheduledTransportRetryPort {
  retry(input: { accountId: string; runId: string }): Promise<ScheduledJarvisAttemptResult>;
}

export interface JarvisScheduledLogicalRetryPort {
  retry(input: { accountId: string; previousRunId: string }): Promise<ScheduledJarvisAttemptResult>;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected scheduled retry result: ${String(value)}`);
}

async function dispatchAllocation(
  allocation: JarvisAllocatedScheduledOccurrence,
  deps: Pick<ScheduledJarvisDispatchDeps, 'kernel'>,
): Promise<ScheduledJarvisAttemptResult> {
  const prepared = await deps.kernel.prepareScheduledAttempt({ allocation });
  const begun = await deps.kernel.beginPreparedScheduledAttempt({ prepared });
  if (begun.kind === 'account_authority_revoked') return begun;
  const handle = begun.value;
  let resolvedByKernel = false;
  try {
    const dispatched = await deps.kernel.dispatchPreparedScheduledAttempt({ prepared, handle });
    if (dispatched.kind === 'account_authority_revoked') return dispatched;
    switch (dispatched.value.kind) {
      case 'committed':
        resolvedByKernel = true;
        return dispatched.value;
      case 'pre_effect_transport_failure': {
        const settled = await deps.kernel.settleScheduledTransportFailure({ handle });
        if (settled.kind === 'account_authority_revoked') return settled;
        switch (settled.value.kind) {
          case 'retryable': {
            const attempt = settled.value.run.transportAttempts?.at(-1);
            if (!attempt || attempt.state !== 'retryable_failed') {
              throw new Error('scheduled_transport_retry_attempt_missing');
            }
            resolvedByKernel = true;
            return {
              kind: 'transport_retry_available',
              run: settled.value.run,
              attempt,
            };
          }
          case 'terminal_failed':
            resolvedByKernel = true;
            return { kind: 'terminal_transport_failure', run: settled.value.run };
          default:
            return assertNever(settled.value);
        }
      }
      default:
        return assertNever(dispatched.value);
    }
  } finally {
    if (!resolvedByKernel) deps.kernel.disposeScheduledAttempt(handle);
  }
}

export function createJarvisScheduledTransportRetryPort(
  deps: Pick<ScheduledJarvisDispatchDeps, 'kernel'>,
): JarvisScheduledTransportRetryPort {
  return Object.freeze({
    async retry(input: { accountId: string; runId: string }) {
      const allocation = await deps.kernel.loadScheduledRun(input);
      if (allocation.kind === 'account_authority_revoked') return allocation;
      if (!allocation.value) throw new Error('scheduled_transport_retry_unavailable');
      return dispatchAllocation(allocation.value, deps);
    },
  });
}

export function createJarvisScheduledLogicalRetryPort(
  deps: Pick<ScheduledJarvisDispatchDeps, 'kernel'>,
): JarvisScheduledLogicalRetryPort {
  return Object.freeze({
    async retry(input: { accountId: string; previousRunId: string }) {
      const allocation = await deps.kernel.allocateScheduledLogicalRetry(input);
      if (allocation.kind === 'account_authority_revoked') return allocation;
      return dispatchAllocation(allocation.value, deps);
    },
  });
}
