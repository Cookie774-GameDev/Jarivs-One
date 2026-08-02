import { describe, expect, it } from 'vitest';
import type { JarvisRunStatus } from '@/lib/jarvis/contracts/execution';
import {
  assertJarvisRunTransition,
  isJarvisRunTransitionAllowed,
  JARVIS_RUN_TRANSITIONS,
  JarvisRunTransitionError,
} from './stateMachine';

const STATUSES: readonly JarvisRunStatus[] = [
  'queued',
  'compiling',
  'running',
  'awaiting_approval',
  'partial',
  'completed',
  'failed',
  'cancelled',
  'timed_out',
];

const EXPECTED_TRANSITIONS = {
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

describe('Jarvis execution state machine', () => {
  it('exposes the exact closed legal transition matrix', () => {
    expect(JARVIS_RUN_TRANSITIONS).toEqual(EXPECTED_TRANSITIONS);
  });

  for (const current of STATUSES) {
    for (const next of STATUSES) {
      const legal = EXPECTED_TRANSITIONS[current].some(
        (candidate: JarvisRunStatus) => candidate === next,
      );

      it(`${legal ? 'accepts' : 'rejects'} ${current} -> ${next}`, () => {
        expect(isJarvisRunTransitionAllowed(current, next)).toBe(legal);
        if (legal) {
          expect(() => assertJarvisRunTransition(current, next)).not.toThrow();
          return;
        }

        let failure: unknown;
        try {
          assertJarvisRunTransition(current, next);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeInstanceOf(JarvisRunTransitionError);
        expect(failure).toMatchObject({
          name: 'JarvisRunTransitionError',
          code: 'invalid_run_transition',
          currentStatus: current,
          nextStatus: next,
        });
      });
    }
  }

  it.each(STATUSES)('rejects the %s self-transition', (status) => {
    expect(() => assertJarvisRunTransition(status, status)).toThrow(JarvisRunTransitionError);
  });

  it.each(['partial', 'completed', 'failed', 'cancelled', 'timed_out'] as const)(
    'keeps terminal status %s immutable',
    (terminalStatus) => {
      for (const nextStatus of STATUSES) {
        expect(isJarvisRunTransitionAllowed(terminalStatus, nextStatus)).toBe(false);
        expect(() => assertJarvisRunTransition(terminalStatus, nextStatus)).toThrow(
          JarvisRunTransitionError,
        );
      }
    },
  );
});
