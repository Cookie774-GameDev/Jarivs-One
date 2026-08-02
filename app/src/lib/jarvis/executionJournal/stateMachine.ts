import type { JarvisRunStatus } from '@/lib/jarvis/contracts/execution';

export const JARVIS_RUN_TRANSITIONS = {
  queued: ['compiling', 'running', 'awaiting_approval', 'failed', 'cancelled', 'timed_out'],
  compiling: ['running', 'awaiting_approval', 'failed', 'cancelled', 'timed_out'],
  running: ['awaiting_approval', 'partial', 'completed', 'failed', 'cancelled', 'timed_out'],
  awaiting_approval: ['queued', 'running', 'failed', 'cancelled', 'timed_out'],
  partial: [],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
} as const satisfies Record<JarvisRunStatus, readonly JarvisRunStatus[]>;

export class JarvisRunTransitionError extends Error {
  readonly code = 'invalid_run_transition' as const;
  readonly currentStatus: JarvisRunStatus;
  readonly nextStatus: JarvisRunStatus;

  constructor(currentStatus: JarvisRunStatus, nextStatus: JarvisRunStatus) {
    super(`Invalid Jarvis run transition: ${currentStatus} -> ${nextStatus}`);
    this.name = 'JarvisRunTransitionError';
    this.currentStatus = currentStatus;
    this.nextStatus = nextStatus;
  }
}

export function isJarvisRunTransitionAllowed(
  currentStatus: JarvisRunStatus,
  nextStatus: JarvisRunStatus,
): boolean {
  return (JARVIS_RUN_TRANSITIONS[currentStatus] as readonly JarvisRunStatus[]).includes(nextStatus);
}

export function assertJarvisRunTransition(
  currentStatus: JarvisRunStatus,
  nextStatus: JarvisRunStatus,
): void {
  if (!isJarvisRunTransitionAllowed(currentStatus, nextStatus)) {
    throw new JarvisRunTransitionError(currentStatus, nextStatus);
  }
}
