import type {
  JarvisCancellationAggregate,
  JarvisCancellationRequestResult,
} from '@/lib/jarvis/contracts/execution';
import type { ScheduledJarvisAttemptResult } from '@/features/schedule/jarvisScheduleDispatch';

function assertNever(value: never): never {
  throw new Error(`Unexpected Command Center result: ${String(value)}`);
}

export function mapJarvisCancellationAggregate(aggregate: JarvisCancellationAggregate): string {
  switch (aggregate.kind) {
    case 'delivery_pending':
    case 'handoff_pending':
      return 'Waiting for the execution owner';
    case 'queued_cancelled':
      return 'Queued work cancelled';
    case 'signal_delivered':
      return 'Cancellation requested';
    case 'unsupported':
      return 'The execution owner does not support cancellation';
    case 'executor_missing':
      return 'The execution owner is unavailable; cancellation is pending';
    case 'delivery_rejected':
      return 'The execution owner rejected cancellation delivery';
    case 'delivery_error':
      return 'Cancellation delivery failed; the run is not confirmed cancelled';
    default:
      return assertNever(aggregate);
  }
}

function terminalStatusCopy(
  status: Extract<JarvisCancellationRequestResult, { kind: 'already_terminal' }>['terminalStatus'],
): string {
  switch (status) {
    case 'partial':
      return 'partial';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'timed_out':
      return 'timed_out';
    default:
      return assertNever(status);
  }
}

export function mapJarvisCancellationRequestResult(
  result: JarvisCancellationRequestResult,
): string {
  switch (result.kind) {
    case 'authority_revoked_before_intent':
      return 'Account changed; cancellation was not requested.';
    case 'already_terminal':
      return `Run is already ${terminalStatusCopy(result.terminalStatus)}`;
    case 'intent_committed': {
      const aggregate = mapJarvisCancellationAggregate(result.aggregate);
      return aggregate === 'Cancellation requested'
        ? aggregate
        : `Cancellation requested. ${aggregate}`;
    }
    default:
      return assertNever(result);
  }
}

export function mapScheduledJarvisAttemptResult(result: ScheduledJarvisAttemptResult): string {
  switch (result.kind) {
    case 'committed':
      return 'Scheduled run committed';
    case 'transport_retry_available':
      return 'Retry transport is available';
    case 'terminal_transport_failure':
      return 'Transport failed; the run is terminal';
    case 'account_authority_revoked':
      return 'Account changed; retry was not started';
    default:
      return assertNever(result);
  }
}
