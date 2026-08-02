import { describe, expect, it } from 'vitest';

import type {
  JarvisArtifactV1,
  JarvisEvent,
  JarvisRun,
  JarvisRunStatus,
  JarvisTransportAttemptV1,
} from '@/lib/jarvis/contracts/execution';

import { projectJarvisRunForLegacyUi } from './legacyTaskRunAdapter';

const NOW = 1_784_435_200_000;

function run(status: JarvisRunStatus, overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'jrun_alpha',
    accountId: 'account-alpha',
    chatId: 'chat-alpha',
    source: 'typed_chat',
    status,
    agentId: 'jarvis-protected',
    identityVersion: 3,
    profileRevisionId: 'profile-revision',
    model: {
      providerId: 'openai',
      modelId: 'gpt-test',
      connectionMode: 'native-api',
      capabilities: {},
      capturedAt: NOW,
    },
    createdAt: NOW,
    updatedAt: NOW + 5_000,
    ...overrides,
  };
}

function event(seq: number, overrides: Partial<JarvisEvent> = {}): JarvisEvent {
  return {
    runId: 'jrun_alpha',
    seq,
    idempotencyKey: `event-${seq}`,
    type: 'run_state',
    status: 'running',
    title: `unsafe title ${seq}`,
    safeSummary: `Safe summary ${seq}`,
    sourceRefs: [],
    artifactIds: [],
    createdAt: NOW + seq,
    ...overrides,
  };
}

function artifact(overrides: Partial<JarvisArtifactV1> = {}): JarvisArtifactV1 {
  return {
    schemaVersion: 1,
    id: 'jartifact_alpha',
    runId: 'jrun_alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    state: 'ready',
    kind: 'text',
    title: 'unsafe artifact title',
    safeSummary: 'Verified artifact ready.',
    sourceRefs: [],
    createdAt: NOW + 100,
    ...overrides,
  };
}

function attempt(
  attemptNumber: number,
  state: JarvisTransportAttemptV1['state'],
): JarvisTransportAttemptV1 {
  return {
    schemaVersion: 1,
    attemptNumber,
    kind: attemptNumber === 1 ? 'initial' : 'transport_retry',
    requestId: `request-${attemptNumber}`,
    state,
    startedEventSeq: attemptNumber,
    effectBarrier: {
      state: state === 'retryable_failed' ? 'sealed_for_retry' : 'open',
      version: state === 'retryable_failed' ? 1 : 0,
      updatedAt: NOW + attemptNumber,
    },
    createdAt: NOW + attemptNumber,
    updatedAt: NOW + attemptNumber,
  };
}

describe('projectJarvisRunForLegacyUi', () => {
  it.each([
    ['queued', 'planning'],
    ['compiling', 'planning'],
    ['running', 'running'],
    ['awaiting_approval', 'waiting-for-approval'],
    ['partial', 'waiting-for-input'],
    ['completed', 'completed'],
    ['failed', 'failed'],
    ['timed_out', 'failed'],
    ['cancelled', 'cancelled'],
  ] as const)(
    'maps canonical %s to legacy %s without changing canonical truth',
    (canonical, legacy) => {
      const canonicalRun = run(canonical);
      const projection = projectJarvisRunForLegacyUi({
        run: canonicalRun,
        events: [event(1, { status: canonical })],
        artifacts: [],
      });

      expect(projection).toMatchObject({
        canonical: true,
        runId: canonicalRun.id,
        chatId: canonicalRun.chatId,
        status: legacy,
        transportRetryAvailable: false,
      });
      expect(canonicalRun.status).toBe(canonical);
    },
  );

  it('projects only the exact latest retryable failed schedule attempt as retry available', () => {
    const projection = projectJarvisRunForLegacyUi({
      run: run('running', {
        source: 'schedule',
        transportAttempts: [attempt(1, 'completed'), attempt(2, 'retryable_failed')],
      }),
      events: [event(1)],
      artifacts: [],
    });

    expect(projection).toMatchObject({
      status: 'waiting-for-input',
      userVisibleSummary: 'Transport retry available.',
      cancellable: false,
      transportRetryAvailable: true,
      transportRetryAttemptNumber: 2,
    });
  });

  it.each([
    ['provider in flight', 'schedule', [attempt(1, 'provider_in_flight')]],
    ['effect uncertain', 'schedule', [attempt(1, 'effect_uncertain')]],
    [
      'stale retryable attempt',
      'schedule',
      [attempt(1, 'retryable_failed'), attempt(2, 'provider_in_flight')],
    ],
    ['non-schedule retryable attempt', 'typed_chat', [attempt(1, 'retryable_failed')]],
  ] as const)('does not invent retry availability for %s', (_case, source, attempts) => {
    const projection = projectJarvisRunForLegacyUi({
      run: run('running', { source, transportAttempts: attempts }),
      events: [event(1)],
      artifacts: [],
    });

    expect(projection).toMatchObject({
      status: 'running',
      transportRetryAvailable: false,
    });
    expect(projection).not.toHaveProperty('transportRetryAttemptNumber');
  });

  it('uses ordered in-scope canonical events and safe summaries without elapsed-time progress', () => {
    const canonicalRun = run('running', { updatedAt: NOW + 999_999_999 });
    const projection = projectJarvisRunForLegacyUi({
      run: canonicalRun,
      events: [
        event(3, { safeSummary: 'Latest safe summary.' }),
        event(1, { safeSummary: 'First safe goal.' }),
        event(2, { runId: 'jrun_foreign', safeSummary: 'Foreign account secret.' }),
      ],
      artifacts: [
        artifact(),
        artifact({
          id: 'jartifact_foreign',
          runId: 'jrun_foreign',
          safeSummary: 'Foreign artifact.',
        }),
      ],
    });
    const sameEventsDifferentClock = projectJarvisRunForLegacyUi({
      run: { ...canonicalRun, updatedAt: canonicalRun.updatedAt + 5_000_000 },
      events: [
        event(1, { safeSummary: 'First safe goal.' }),
        event(3, { safeSummary: 'Latest safe summary.' }),
      ],
      artifacts: [artifact()],
    });

    expect(projection.goal).toBe('First safe goal.');
    expect(projection.userVisibleSummary).toBe('Verified artifact ready.');
    expect(JSON.stringify(projection)).not.toMatch(
      /unsafe title|Foreign account secret|Foreign artifact/,
    );
    expect(projection.progress).toBe(sameEventsDifferentClock.progress);
    expect(projection.updatedAt).toBe(new Date(canonicalRun.updatedAt).toISOString());
  });

  it('derives bounded active owners only from canonical live evidence', () => {
    const events = Array.from({ length: 510 }, (_, index) =>
      event(index + 1, {
        type: 'tool',
        liveEvidence: {
          schemaVersion: 1,
          accountId: 'account-alpha',
          runId: 'jrun_alpha',
          requestId: 'request-alpha',
          attemptNumber: 1,
          registrationId: `registration-${index}`,
          producerKind: 'hive',
          producerIdentity: {
            producerKind: 'hive',
            stackId: 'stack-alpha',
            stepId: `step-${index}`,
            workerId: `worker-${index}`,
          },
          transition: 'busy',
          operations: ['agent.run'],
          resultRef: `result-${index}`,
          resultEventSeq: index + 1,
          observedAt: NOW + index,
          kind: 'capability',
          category: 'agent',
          capabilityId: `agent-${index}`,
        },
      }),
    );
    events.push(
      event(511, {
        type: 'terminal',
        liveEvidence: {
          schemaVersion: 1,
          accountId: 'account-alpha',
          runId: 'jrun_alpha',
          requestId: 'request-alpha',
          attemptNumber: 1,
          registrationId: 'terminal-registration',
          producerKind: 'terminal',
          producerIdentity: {
            producerKind: 'terminal',
            sessionId: 'session-alpha',
            executionId: 'execution-alpha',
          },
          transition: 'busy',
          operations: ['terminal.execute'],
          resultRef: 'terminal-result',
          resultEventSeq: 511,
          observedAt: NOW + 511,
          kind: 'capability',
          category: 'terminal',
          capabilityId: 'terminal-alpha',
        },
      }),
    );

    const projection = projectJarvisRunForLegacyUi({
      run: run('running'),
      events,
      artifacts: [],
    });

    expect(projection.activeAgents).toHaveLength(499);
    expect(projection.activeTerminals).toEqual(['session-alpha']);
    expect(projection.activeAgents[0]).toBe('worker-11');
    expect(projection.activeAgents.at(-1)).toBe('worker-509');
  });
});
