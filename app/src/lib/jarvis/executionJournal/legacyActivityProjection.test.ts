import { describe, expect, it } from 'vitest';

import type { JarvisEvent, JarvisRun } from '@/lib/jarvis/contracts/execution';

import { projectJarvisEventsForLegacyActivity } from './legacyActivityProjection';

const NOW = 1_784_435_200_000;

function run(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'jrun_alpha',
    accountId: 'account-alpha',
    chatId: 'chat-alpha',
    source: 'typed_chat',
    status: 'running',
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
    updatedAt: NOW,
    ...overrides,
  };
}

function event(seq: number, overrides: Partial<JarvisEvent> = {}): JarvisEvent {
  return {
    runId: 'jrun_alpha',
    seq,
    idempotencyKey: `event-${seq}`,
    type: 'tool',
    status: 'running',
    title: `PRIVATE ROW TITLE ${seq}`,
    safeSummary: `Safe activity ${seq}`,
    sourceRefs: [],
    artifactIds: [],
    createdAt: NOW + seq,
    ...overrides,
  };
}

describe('projectJarvisEventsForLegacyActivity', () => {
  it('orders exact-run events and preserves source/artifact identity only in internal keys', () => {
    const projected = projectJarvisEventsForLegacyActivity({
      run: run(),
      events: [
        event(3, { runId: 'jrun_foreign', safeSummary: 'Foreign summary.' }),
        event(2, {
          type: 'artifact',
          sourceRefs: [
            {
              id: 'source-alpha',
              kind: 'project_file',
              label: 'PRIVATE SOURCE LABEL',
              uri: 'file:///private/path',
              accountId: 'account-alpha',
              trust: 'app_verified',
              sensitivity: 'private',
            },
            {
              id: 'source-foreign',
              kind: 'project_file',
              label: 'FOREIGN LABEL',
              accountId: 'account-foreign',
              trust: 'app_verified',
              sensitivity: 'private',
            },
          ],
          artifactIds: ['artifact-alpha'],
        }),
        event(1, { type: 'run_state', status: 'queued' }),
      ],
    });

    expect(projected.map((item) => item.ts)).toEqual([NOW + 1, NOW + 2]);
    expect(projected[1]?.id).toContain('run:jrun_alpha');
    expect(projected[1]?.id).toContain('source:source-alpha');
    expect(projected[1]?.id).toContain('artifact:artifact-alpha');
    expect(projected[1]?.id).not.toContain('source-foreign');
    expect(projected[1]).toMatchObject({
      chatId: 'chat-alpha',
      kind: 'file',
      detail: 'Safe activity 2',
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /PRIVATE ROW TITLE|PRIVATE SOURCE LABEL|FOREIGN LABEL|file:\/\/\/private\/path|Foreign summary/,
    );
  });

  it('clamps explicit and default limits to 1 through 500', () => {
    const events = Array.from({ length: 510 }, (_, index) => event(index + 1));

    expect(projectJarvisEventsForLegacyActivity({ run: run(), events })).toHaveLength(500);
    expect(projectJarvisEventsForLegacyActivity({ run: run(), events, limit: 0 })).toHaveLength(1);
    expect(projectJarvisEventsForLegacyActivity({ run: run(), events, limit: 900 })).toHaveLength(
      500,
    );
    expect(
      projectJarvisEventsForLegacyActivity({ run: run(), events, limit: Number.NaN }),
    ).toHaveLength(500);
  });

  it('uses canonical status truth and never creates activity without canonical events', () => {
    const projected = projectJarvisEventsForLegacyActivity({
      run: run({ status: 'cancelled' }),
      events: [
        event(1, { type: 'run_state', status: 'queued' }),
        event(2, { type: 'run_state', status: 'cancelled' }),
        event(3, { type: 'error', status: 'failed' }),
      ],
    });

    expect(projected.map((item) => item.status)).toEqual(['pending', 'cancelled', 'error']);
    expect(projectJarvisEventsForLegacyActivity({ run: run(), events: [] })).toEqual([]);
  });

  it('projects canonical event types into structured activity categories', () => {
    const projected = projectJarvisEventsForLegacyActivity({
      run: run(),
      events: [
        event(1, { type: 'run_state' }),
        event(2, { type: 'context' }),
        event(3, { type: 'retrieval' }),
        event(4, { type: 'tool' }),
        event(5, { type: 'terminal' }),
        event(6, { type: 'artifact' }),
        event(7, { type: 'message' }),
      ],
    });

    expect(projected.map(({ category }) => category)).toEqual([
      'thinking',
      'context',
      'file',
      'thinking',
      'thinking',
      'file',
      'response',
    ]);
  });

  it('preserves structured terminal and tool operation identity without raw private evidence', () => {
    const projected = projectJarvisEventsForLegacyActivity({
      run: run(),
      events: [
        event(1, { type: 'terminal', safeSummary: 'Ran npm run typecheck.' }),
        event(2, {
          type: 'tool',
          safeSummary: 'Deployed the public worker.',
          producerSourceEvidence: {
            schemaVersion: 1,
            accountId: 'account-alpha',
            runId: 'jrun_alpha',
            requestId: 'request-tool',
            attemptNumber: 1,
            producerKind: 'mcp',
            producerIdentity: {
              producerKind: 'mcp',
              serverId: 'cloudflare',
              toolName: 'deploy_worker',
              invocationId: 'invocation-tool',
            },
            resultRef: 'private-result-ref',
            observedAt: NOW,
            phase: 'result',
            state: 'completed',
          },
        }),
      ],
    });

    expect(projected).toEqual([
      expect.objectContaining({
        title: 'Jarvis terminal activity',
        subtitle: 'terminal',
        detail: 'Ran npm run typecheck.',
      }),
      expect.objectContaining({
        title: 'Jarvis tool activity',
        subtitle: 'deploy_worker',
        detail: 'Deployed the public worker.',
      }),
    ]);
    expect(JSON.stringify(projected)).not.toContain('private-result-ref');
  });

  it('projects mail and launch intent only from canonical plugin or MCP producer identity', () => {
    const projected = projectJarvisEventsForLegacyActivity({
      run: run(),
      events: [
        event(1, {
          title: 'PRIVATE GENERIC TOOL',
          liveEvidence: {
            schemaVersion: 1,
            kind: 'capability',
            accountId: 'account-alpha',
            runId: 'jrun_alpha',
            requestId: 'request-1',
            attemptNumber: 1,
            registrationId: 'registration-1',
            producerKind: 'plugin',
            producerIdentity: {
              producerKind: 'plugin',
              pluginId: 'gmail',
              invocationId: 'invocation-1',
            },
            transition: 'busy',
            operations: ['draft_email'],
            resultRef: 'result-1',
            resultEventSeq: 1,
            observedAt: NOW,
            category: 'plugin',
            capabilityId: 'gmail.draft',
          },
        }),
        event(2, {
          producerSourceEvidence: {
            schemaVersion: 1,
            accountId: 'account-alpha',
            runId: 'jrun_alpha',
            requestId: 'request-2',
            attemptNumber: 1,
            producerKind: 'mcp',
            producerIdentity: {
              producerKind: 'mcp',
              serverId: 'cloudflare',
              toolName: 'deploy_worker',
              invocationId: 'invocation-2',
            },
            resultRef: 'result-2',
            observedAt: NOW,
            phase: 'result',
            state: 'completed',
          },
        }),
        event(3, {
          title: 'Send email and ship release',
          safeSummary: 'Mail, deploy, launch, and publish are mentioned only in prose.',
        }),
        event(4, {
          liveEvidence: {
            schemaVersion: 1,
            kind: 'capability',
            accountId: 'account-alpha',
            runId: 'jrun_alpha',
            requestId: 'request-4',
            attemptNumber: 1,
            registrationId: 'registration-4',
            producerKind: 'plugin',
            producerIdentity: {
              producerKind: 'plugin',
              pluginId: 'gmail',
              invocationId: 'invocation-4',
            },
            transition: 'busy',
            operations: ['list_messages'],
            resultRef: 'result-4',
            resultEventSeq: 4,
            observedAt: NOW,
            category: 'plugin',
            capabilityId: 'gmail.read',
          },
        }),
      ],
    });

    expect(projected.map(({ semanticIntent }) => semanticIntent)).toEqual([
      'mail',
      'ship',
      undefined,
      undefined,
    ]);
  });
});
