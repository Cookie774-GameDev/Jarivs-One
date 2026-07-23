import { describe, expect, it } from 'vitest';
import type {
  JarvisCapabilitySnapshot,
  JarvisContextPack,
  JarvisModelSnapshot,
  JarvisOutputContract,
} from '@/lib/jarvis/contracts';
import type { JarvisRequestInput } from '@/lib/jarvis/requestEnvelope';
import {
  JarvisRequestAttemptError,
  JarvisRequestEnvelopeValidationError,
  createJarvisRequestEnvelope,
  deepFreezeJarvisCopy,
  validateJarvisRequestAttempt,
} from '@/lib/jarvis/requestEnvelope';

function capabilities(): JarvisCapabilitySnapshot {
  return {
    capturedAt: 100,
    tools: [
      {
        id: 'tool-1',
        state: 'authenticated',
        operations: ['read'],
        evidenceRef: 'evidence-1',
        lastVerifiedAt: 99,
      },
    ],
    plugins: [],
    mcps: [],
    terminals: [],
    agents: [],
    entitlements: {
      source: 'server',
      planId: 'plan-1',
      capabilities: ['kernel.read'],
      verifiedAt: 98,
      expiresAt: 198,
    },
  };
}

function context(): JarvisContextPack {
  return {
    items: [
      {
        source: {
          id: 'source-1',
          kind: 'project_file',
          label: 'notes.txt',
          uri: 'C:\\workspace\\notes.txt',
          accountId: 'account-1',
          projectId: 'project-1',
          trust: 'app_verified',
          origin: 'model_inference',
          sensitivity: 'private',
          observedAt: 80,
          contentHash: 'hash-1',
        },
        purpose: 'answer',
        excerpt: 'context body',
        score: 0.9,
        freshness: 'stale',
        conflict: {
          groupId: 'release-version',
          status: 'resolved',
          sourceIds: ['source-1', 'source-2'],
          winnerSourceId: 'source-1',
          basis: 'user_selected',
        },
        truncated: false,
      },
      {
        source: {
          id: 'source-2',
          kind: 'project_file',
          label: 'older-notes.txt',
          uri: 'C:\\workspace\\older-notes.txt',
          accountId: 'account-1',
          projectId: 'project-1',
          trust: 'app_verified',
          origin: 'user_authored',
          sensitivity: 'private',
          observedAt: 70,
          contentHash: 'hash-2',
        },
        purpose: 'answer',
        excerpt: 'older context body',
        score: 0.8,
        freshness: 'current',
        conflict: {
          groupId: 'release-version',
          status: 'resolved',
          sourceIds: ['source-1', 'source-2'],
          winnerSourceId: 'source-1',
          basis: 'user_selected',
        },
        truncated: false,
      },
    ],
    budget: { maxChars: 1_000, usedChars: 30 },
    exclusions: [],
  };
}

function model(): JarvisModelSnapshot {
  return {
    connectionId: 'connection-1',
    providerId: 'provider-1',
    modelId: 'model-1',
    connectionMode: 'native-api',
    capabilities: { tools: true, vision: false },
    effectiveTemperature: 0.2,
    capturedAt: 110,
  };
}

function outputContract(): JarvisOutputContract {
  return {
    preserveStructuredBlocks: true,
    allowActionBlocks: true,
    allowPlanBlocks: true,
    allowQuestionBlocks: true,
    allowPermissionBlocks: true,
    voiceDelivery: 'validated_stream',
  };
}

function requestInput(overrides: Partial<JarvisRequestInput> = {}): JarvisRequestInput {
  return {
    attempt: {
      kind: 'initial',
      requestId: 'request-1',
      runId: 'run-1',
      attemptNumber: 1,
    },
    accountId: 'account-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    chatId: 'chat-1',
    parentRunId: 'parent-run-1',
    agent: { id: 'agent-1', slug: 'jarvis', builtin: true },
    surface: 'typed_chat',
    interactionMode: 'ask',
    responseModeHint: 'direct_answer',
    identity: {
      identityVersion: 1,
      coreHash: 'core-hash',
      responseContractHash: 'response-hash',
    },
    profile: {
      profileId: 'profile-1',
      revisionId: 'profile-revision-1',
      soulRevisionId: 'soul-revision-1',
      customInstructions: 'Be concise.',
      memoryScope: 'profile',
    },
    model: model(),
    capabilities: capabilities(),
    context: context(),
    outputContract: outputContract(),
    userText: 'Help me.',
    messageHistory: [
      { role: 'user', content: 'Earlier question' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Earlier answer' }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'image',
            data: 'aW1hZ2U=',
            mimeType: 'image/png',
            name: 'image.png',
          },
        ],
      },
    ],
    createdAt: 120,
    ...overrides,
  };
}

describe('validateJarvisRequestAttempt', () => {
  it.each([
    [
      'initial',
      { kind: 'initial', requestId: 'request-1', runId: 'run-1', attemptNumber: 1 },
      { requestId: 'request-1', runId: 'run-1', attemptNumber: 1 },
    ],
    [
      'transport retry',
      {
        kind: 'transport_retry',
        requestId: 'request-2',
        runId: 'run-1',
        attemptNumber: 2,
        previousRequestId: 'request-1',
        previousRunId: 'run-1',
        previousAttemptNumber: 1,
      },
      { requestId: 'request-2', runId: 'run-1', attemptNumber: 2 },
    ],
    [
      'logical retry',
      {
        kind: 'logical_retry',
        requestId: 'request-2',
        runId: 'run-2',
        attemptNumber: 1,
        previousRequestId: 'request-1',
        previousRunId: 'run-1',
        previousAttemptNumber: 4,
      },
      { requestId: 'request-2', runId: 'run-2', attemptNumber: 1 },
    ],
  ] as const)('accepts %s identity', (_name, attempt, expected) => {
    expect(validateJarvisRequestAttempt(attempt)).toEqual(expected);
  });

  it.each([
    [
      'blank current request',
      { kind: 'initial', requestId: ' ', runId: 'run-1', attemptNumber: 1 },
    ],
    ['blank current run', { kind: 'initial', requestId: 'request-1', runId: '', attemptNumber: 1 }],
    [
      'initial attempt zero',
      { kind: 'initial', requestId: 'request-1', runId: 'run-1', attemptNumber: 0 },
    ],
    [
      'initial attempt two',
      { kind: 'initial', requestId: 'request-1', runId: 'run-1', attemptNumber: 2 },
    ],
    [
      'reused transport request',
      {
        kind: 'transport_retry',
        requestId: 'request-1',
        runId: 'run-1',
        attemptNumber: 2,
        previousRequestId: 'request-1',
        previousRunId: 'run-1',
        previousAttemptNumber: 1,
      },
    ],
    [
      'changed transport run',
      {
        kind: 'transport_retry',
        requestId: 'request-2',
        runId: 'run-2',
        attemptNumber: 2,
        previousRequestId: 'request-1',
        previousRunId: 'run-1',
        previousAttemptNumber: 1,
      },
    ],
    [
      'skipped transport attempt',
      {
        kind: 'transport_retry',
        requestId: 'request-2',
        runId: 'run-1',
        attemptNumber: 3,
        previousRequestId: 'request-1',
        previousRunId: 'run-1',
        previousAttemptNumber: 1,
      },
    ],
    [
      'reused transport attempt number',
      {
        kind: 'transport_retry',
        requestId: 'request-2',
        runId: 'run-1',
        attemptNumber: 1,
        previousRequestId: 'request-1',
        previousRunId: 'run-1',
        previousAttemptNumber: 1,
      },
    ],
    [
      'negative previous attempt',
      {
        kind: 'transport_retry',
        requestId: 'request-2',
        runId: 'run-1',
        attemptNumber: 0,
        previousRequestId: 'request-1',
        previousRunId: 'run-1',
        previousAttemptNumber: -1,
      },
    ],
    [
      'reused logical run',
      {
        kind: 'logical_retry',
        requestId: 'request-2',
        runId: 'run-1',
        attemptNumber: 1,
        previousRequestId: 'request-1',
        previousRunId: 'run-1',
        previousAttemptNumber: 1,
      },
    ],
    [
      'reused logical request',
      {
        kind: 'logical_retry',
        requestId: 'request-1',
        runId: 'run-2',
        attemptNumber: 1,
        previousRequestId: 'request-1',
        previousRunId: 'run-1',
        previousAttemptNumber: 1,
      },
    ],
    [
      'logical attempt two',
      {
        kind: 'logical_retry',
        requestId: 'request-2',
        runId: 'run-2',
        attemptNumber: 2,
        previousRequestId: 'request-1',
        previousRunId: 'run-1',
        previousAttemptNumber: 1,
      },
    ],
    [
      'blank previous id',
      {
        kind: 'logical_retry',
        requestId: 'request-2',
        runId: 'run-2',
        attemptNumber: 1,
        previousRequestId: '',
        previousRunId: 'run-1',
        previousAttemptNumber: 1,
      },
    ],
    [
      'blank previous run id',
      {
        kind: 'logical_retry',
        requestId: 'request-2',
        runId: 'run-2',
        attemptNumber: 1,
        previousRequestId: 'request-1',
        previousRunId: ' ',
        previousAttemptNumber: 1,
      },
    ],
  ])('rejects %s', (_name, invalid) => {
    expect(() => validateJarvisRequestAttempt(invalid as never)).toThrow(JarvisRequestAttemptError);
  });
});

describe('deepFreezeJarvisCopy', () => {
  it('detaches and freezes nested cycles without mutating the caller graph', () => {
    type CyclicFixture = {
      nested: { values: Array<{ enabled: boolean }> };
      self?: CyclicFixture;
    };
    const caller: CyclicFixture = {
      nested: { values: [{ enabled: true }] },
    };
    caller.self = caller;

    const frozen = deepFreezeJarvisCopy(caller);

    expect(frozen).not.toBe(caller);
    expect(frozen.self).toBe(frozen);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.nested)).toBe(true);
    expect(Object.isFrozen(frozen.nested.values)).toBe(true);
    expect(Object.isFrozen(frozen.nested.values[0])).toBe(true);
    expect(Object.isFrozen(caller)).toBe(false);
    expect(Object.isFrozen(caller.nested.values)).toBe(false);
  });
});

describe('createJarvisRequestEnvelope', () => {
  it('uses the supplied persisted run exactly once and exposes only current attempt identity', async () => {
    const envelope = await createJarvisRequestEnvelope(
      requestInput({
        attempt: {
          kind: 'transport_retry',
          requestId: 'request-2',
          runId: 'persisted-run-1',
          attemptNumber: 2,
          previousRequestId: 'request-1',
          previousRunId: 'persisted-run-1',
          previousAttemptNumber: 1,
        },
      }),
    );

    expect(envelope.requestId).toBe('request-2');
    expect(envelope.runId).toBe('persisted-run-1');
    expect(JSON.stringify(envelope).match(/persisted-run-1/g)).toHaveLength(1);
    expect(envelope).not.toHaveProperty('attemptNumber');
    expect(envelope).not.toHaveProperty('previousRequestId');
  });

  it('deeply freezes detached copies while leaving caller data unchanged and unfrozen', async () => {
    const caller = requestInput();
    const original = structuredClone(caller);
    const envelope = await createJarvisRequestEnvelope(caller);

    expect(caller).toEqual(original);
    expect(Object.isFrozen(caller)).toBe(false);
    expect(Object.isFrozen(caller.agent)).toBe(false);
    expect(Object.isFrozen(caller.messageHistory)).toBe(false);
    expect(Object.isFrozen(caller.capabilities.tools)).toBe(false);
    expect(Object.isFrozen(caller.context.items[0]!.source)).toBe(false);

    const frozenValues = [
      envelope,
      envelope.agent,
      envelope.identity,
      envelope.profile,
      envelope.model,
      envelope.model.capabilities,
      envelope.capabilities,
      envelope.capabilities.tools,
      envelope.capabilities.tools[0],
      envelope.capabilities.tools[0]!.operations,
      envelope.capabilities.entitlements,
      envelope.capabilities.entitlements.capabilities,
      envelope.context,
      envelope.context.items,
      envelope.context.items[0],
      envelope.context.items[0]!.source,
      envelope.context.items[0]!.conflict,
      envelope.context.items[0]!.conflict?.sourceIds,
      envelope.context.exclusions,
      envelope.context.budget,
      envelope.outputContract,
      envelope.messageHistory,
      envelope.messageHistory[0],
      envelope.messageHistory[1],
      envelope.messageHistory[1]!.content,
      (envelope.messageHistory[1]!.content as Array<unknown>)[0],
    ];
    expect(frozenValues.every(Object.isFrozen)).toBe(true);
    expect(envelope.agent).not.toBe(caller.agent);
    expect(envelope.context.items[0]!.source).not.toBe(caller.context.items[0]!.source);
    expect(envelope.context.items[0]!.source.origin).toBe('model_inference');
    expect(envelope.context.items[0]!.freshness).toBe('stale');
    expect(envelope.context.items[0]!.conflict).toEqual({
      groupId: 'release-version',
      status: 'resolved',
      sourceIds: ['source-1', 'source-2'],
      winnerSourceId: 'source-1',
      basis: 'user_selected',
    });
    expect(envelope.context.items[0]!.conflict).not.toBe(caller.context.items[0]!.conflict);
  });

  it('prevents mutations to profile, model, message parts, capabilities, and sources', async () => {
    const envelope = await createJarvisRequestEnvelope(requestInput());

    expect(() => {
      (envelope.profile as { customInstructions: string }).customInstructions = 'Changed';
    }).toThrow();
    expect(() => {
      (envelope.model.capabilities as Record<string, boolean>).tools = false;
    }).toThrow();
    expect(() => {
      (envelope.messageHistory as unknown[]).push({ role: 'user', content: 'Changed' });
    }).toThrow();
    expect(() => {
      const parts = envelope.messageHistory[1]!.content as Array<{ text: string }>;
      parts[0]!.text = 'Changed';
    }).toThrow();
    expect(() => {
      (envelope.capabilities.tools as unknown[]).push({});
    }).toThrow();
    expect(() => {
      (envelope.context.items[0]!.source as { label: string }).label = 'Changed';
    }).toThrow();
  });

  it('fails validation rather than returning an invalid envelope', async () => {
    const invalid = requestInput({
      outputContract: {
        ...outputContract(),
        preserveStructuredBlocks: false,
      } as unknown as JarvisOutputContract,
    });

    await expect(createJarvisRequestEnvelope(invalid)).rejects.toBeInstanceOf(
      JarvisRequestEnvelopeValidationError,
    );
  });
});
