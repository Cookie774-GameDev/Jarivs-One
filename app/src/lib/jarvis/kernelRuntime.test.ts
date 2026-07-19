import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import {
  fromJarvisApprovalRow,
  fromJarvisRunRow,
  toJarvisEventRow,
  toJarvisRunRow,
} from '@/lib/db/jarvisMappers';
import { createJarvisRepositories } from '@/lib/db/jarvisRepositories';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import { useAuthStore } from '@/stores/auth';
import type { Agent, ChatId, WorkspaceId } from '@/types';
import type { JarvisResponseEnvelope, JarvisRun } from './contracts';
import {
  createJarvisActionLiveEvidenceVerifiers,
  jarvisTerminalHandoffReceiptBrand,
} from './approvalEngine';
import type {
  CreateJarvisApprovalInput,
  JarvisApprovalActionBinder,
  JarvisApprovalActionCapability,
  JarvisIssuedApprovalLifecycle,
  JarvisTerminalOwnedExecution,
} from './approvalEngine';
import type { JarvisKernelTurnInput } from './kernel';
import { createJarvisKernelRuntime } from './kernelRuntime';

const NOW = 1_786_300_100_000;

function artifactAuthorities() {
  const ready = (producerId: string) =>
    Object.freeze({
      state: 'ready' as const,
      producerId,
      authority: Object.freeze({ verify: vi.fn(async (value: unknown) => value) }),
    });
  return Object.freeze({
    provider: ready('provider_response'),
    fileAction: ready('file_action_result'),
    terminal: ready('terminal_exit'),
    plugin: ready('plugin_result'),
    mcp: ready('mcp_result'),
    schedule: Object.freeze({
      state: 'unavailable' as const,
      producerId: 'schedule_result',
      reason: 'producer_task_not_landed' as const,
    }),
  });
}

function unavailableVerifiers() {
  const unavailable = <K extends string>(producerKind: K) =>
    Object.freeze({
      state: 'unavailable' as const,
      producerKind,
      reason: 'producer_task_not_landed' as const,
    });
  return Object.freeze({
    provider: unavailable('provider'),
    action: unavailable('action'),
    fileAction: unavailable('file_action'),
    terminal: unavailable('terminal'),
    plugin: unavailable('plugin'),
    mcp: unavailable('mcp'),
    voice: unavailable('voice'),
    schedule: unavailable('schedule'),
    hive: unavailable('hive'),
  });
}

function actionReadyVerifiers(db: JarvisDexie) {
  const repositories = createJarvisRepositories(db);
  const action = createJarvisActionLiveEvidenceVerifiers({
    runs: repositories.run,
    events: repositories.event,
  });
  return Object.freeze({
    ...unavailableVerifiers(),
    action: Object.freeze({ state: 'ready' as const, verifier: action.action }),
    fileAction: Object.freeze({ state: 'ready' as const, verifier: action.fileAction }),
    terminal: Object.freeze({ state: 'ready' as const, verifier: action.terminal }),
    plugin: Object.freeze({ state: 'ready' as const, verifier: action.plugin }),
    mcp: Object.freeze({ state: 'ready' as const, verifier: action.mcp }),
  });
}

function kernelRun(): JarvisRun {
  return {
    id: 'run-runtime-kernel',
    accountId: 'account-kernel',
    workspaceId: 'workspace-kernel',
    chatId: 'chat-runtime-kernel',
    source: 'typed_chat',
    status: 'queued',
    agentId: 'agent-runtime-jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-runtime-kernel',
    model: {
      connectionId: 'connection-runtime-kernel',
      providerId: 'provider-kernel',
      modelId: 'model-kernel',
      connectionMode: 'native-api',
      capabilities: { tools: true, vision: false },
      capturedAt: NOW - 10,
    },
    createdAt: NOW - 20,
    updatedAt: NOW - 20,
  };
}

function kernelTurn(): JarvisKernelTurnInput {
  const current = kernelRun();
  const protectedJarvis: Agent = {
    id: 'agent-runtime-jarvis' as Agent['id'],
    slug: 'jarvis',
    name: 'Jarvis',
    description: 'Protected Jarvis',
    system_prompt: 'Legacy prompt.',
    model: { provider: 'mock', model: 'mock-default' },
    tools_allowed: [],
    memory_scope: 'workspace',
    capabilities: [],
    builtin: true,
    created_at: NOW - 20,
    updated_at: NOW - 20,
  };
  return {
    run: current,
    attempt: {
      kind: 'initial',
      requestId: 'request-runtime-kernel',
      runId: current.id,
      attemptNumber: 1,
    },
    accountId: current.accountId,
    workspaceId: current.workspaceId,
    chatId: current.chatId!,
    userMessageId: 'message-runtime-user',
    agent: protectedJarvis,
    surface: 'typed_chat',
    interactionMode: 'ask',
    userText: 'Give me the runtime answer.',
    messageHistory: [{ role: 'user', content: 'Give me the runtime answer.' }],
    model: current.model,
    identity: {
      identityVersion: 1,
      coreHash: 'core-runtime-kernel',
      responseContractHash: 'response-runtime-kernel',
    },
    profile: {
      profileId: 'profile-runtime-kernel',
      revisionId: 'profile-runtime-kernel',
      customInstructions: '',
      memoryScope: 'profile',
    },
    capabilities: {
      capturedAt: NOW - 10,
      tools: [],
      plugins: [],
      mcps: [],
      terminals: [],
      agents: [],
      entitlements: { source: 'local_development', capabilities: [] },
    },
    context: { items: [], budget: { maxChars: 4_000, usedChars: 0 }, exclusions: [] },
    outputContract: {
      preserveStructuredBlocks: true,
      allowActionBlocks: true,
      allowPlanBlocks: true,
      allowQuestionBlocks: true,
      allowPermissionBlocks: true,
      voiceDelivery: 'validated_stream',
    },
  };
}

describe('createJarvisKernelRuntime primary-host lifecycle', () => {
  let db: JarvisDexie;

  beforeEach(async () => {
    db = createJarvisDb(uniqueTestDbName('kernel-runtime-host'), TEST_INDEXED_DB);
    await db.open();
    useAuthStore.setState({ cloudSession: null, localUserId: 'account-kernel' });
  });

  afterEach(async () => {
    await db.delete();
  });

  function runtime() {
    return createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: {
        allocateRun: vi.fn(),
        getRun: vi.fn(),
      } as never,
      cancellationDeliveryAuthority: {} as never,
      abortRegistrationAuthority: {} as never,
      bindKernelActions: vi.fn() as never,
      liveEvidenceVerifiers: unavailableVerifiers() as never,
      prepareProvider: vi.fn() as never,
      processResponse: vi.fn() as never,
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-uuid',
      now: () => NOW,
    });
  }

  it('returns exactly feature-facing kernel and primary-host lifecycle members', () => {
    const composition = runtime();

    expect(Object.keys(composition).sort()).toEqual(['kernel', 'liveEvidenceHost']);
    expect(composition.kernel).not.toHaveProperty('read');
    expect(composition.kernel).not.toHaveProperty('ownerMaintenance');
    expect(composition.liveEvidenceHost).not.toHaveProperty('invalidateAccount');
    expect(composition.liveEvidenceHost).not.toHaveProperty('invalidateAll');
  });

  it('opens an account only after reconstruction and returns an account-bound read port', async () => {
    const { liveEvidenceHost } = runtime();

    const session = await liveEvidenceHost.openAccount('account-alpha');

    expect(Object.keys(session).sort()).toEqual(['accountId', 'assertCurrent', 'dispose', 'read']);
    expect(session.accountId).toBe('account-alpha');
    expect(session.read.accountId).toBe('account-alpha');
    expect(Object.keys(session.read).sort()).toEqual(['accountId', 'snapshot', 'subscribe']);
    expect(await session.read.snapshot('run-missing')).toBeUndefined();
    expect(session.assertCurrent()).toBeUndefined();
  });

  it('revokes the previous epoch before replacing it, including the same account', async () => {
    const { liveEvidenceHost } = runtime();
    const first = await liveEvidenceHost.openAccount('account-alpha');
    const firstListener = vi.fn();
    const unsubscribe = first.read.subscribe('run-alpha', firstListener);

    const second = await liveEvidenceHost.openAccount('account-alpha');

    expect(() => first.assertCurrent()).toThrow('kernel_host_session_stale');
    await expect(first.read.snapshot('run-alpha')).rejects.toThrow('kernel_host_session_stale');
    expect(() => first.read.subscribe('run-alpha', vi.fn())).toThrow('kernel_host_session_stale');
    expect(() => second.assertCurrent()).not.toThrow();
    unsubscribe();
  });

  it('serializes concurrent account replacement and leaves only the last session current', async () => {
    const { liveEvidenceHost } = runtime();

    const [first, second] = await Promise.all([
      liveEvidenceHost.openAccount('account-alpha'),
      liveEvidenceHost.openAccount('account-beta'),
    ]);

    expect(() => first.assertCurrent()).toThrow('kernel_host_session_stale');
    expect(() => second.assertCurrent()).not.toThrow();
    expect(second.accountId).toBe('account-beta');
  });

  it('makes session and host disposal idempotent and rejects future opens', async () => {
    const { liveEvidenceHost } = runtime();
    const session = await liveEvidenceHost.openAccount('account-alpha');

    session.dispose();
    session.dispose();
    expect(() => session.assertCurrent()).toThrow('kernel_host_session_stale');

    liveEvidenceHost.dispose();
    liveEvidenceHost.dispose();
    await expect(liveEvidenceHost.openAccount('account-beta')).rejects.toThrow(
      'kernel_host_disposed',
    );
  });

  it('opens one process-local recovery handle and commits the fixed recovered partial terminal', async () => {
    const current = {
      ...kernelRun(),
      source: 'voice' as const,
      status: 'running' as const,
    };
    await db.jarvis_runs.add(toJarvisRunRow(current));
    await db.chats.add({
      id: current.chatId as ChatId,
      workspace_id: current.workspaceId as WorkspaceId,
      title: 'Runtime voice recovery',
      mode: 'chat',
      active_agent_ids: [current.agentId as Agent['id']],
      created_at: NOW - 20,
      updated_at: NOW - 20,
    });
    await db.messages.add({
      id: 'message-runtime-recovery' as never,
      chat_id: current.chatId as ChatId,
      role: 'assistant',
      parts: [{ kind: 'text', text: 'Saved before restart.' }],
      created_at: NOW - 5,
      updated_at: NOW - 5,
    });
    const providerStartEvent = {
      runId: current.id,
      seq: 1,
      idempotencyKey: 'kernel-provider-start:request-runtime-current:1',
      type: 'model' as const,
      status: 'started',
      title: 'Provider started',
      safeSummary: 'The protected provider dispatch started.',
      sourceRefs: [],
      artifactIds: [],
      createdAt: NOW - 6,
      producerSourceEvidence: {
        schemaVersion: 1 as const,
        accountId: current.accountId,
        runId: current.id,
        requestId: 'request-runtime-current',
        attemptNumber: 1,
        producerKind: 'provider' as const,
        producerIdentity: {
          producerKind: 'provider' as const,
          providerId: 'provider-kernel',
          modelId: 'model-kernel',
          modelSnapshotRef: 'provider-kernel:model-kernel',
        },
        resultRef: 'jprovider_start_runtime_recovery',
        observedAt: NOW - 6,
        phase: 'start' as const,
        state: 'started' as const,
      },
    };
    await db.jarvis_events.add(toJarvisEventRow(providerStartEvent));
    await db.jarvis_events.add(
      toJarvisEventRow({
        runId: current.id,
        seq: 2,
        idempotencyKey: `voice-response-ready:${current.id}:message-runtime-recovery`,
        type: 'message',
        status: 'response_ready',
        title: 'Voice response ready',
        safeSummary: 'The validated response is saved and awaiting playback outcome.',
        sourceRefs: [],
        artifactIds: [],
        createdAt: NOW - 5,
        producerSourceEvidence: {
          schemaVersion: 1,
          accountId: current.accountId,
          runId: current.id,
          requestId: 'request-runtime-recovery',
          attemptNumber: 1,
          producerKind: 'provider',
          producerIdentity: {
            producerKind: 'provider',
            providerId: 'provider-kernel',
            modelId: 'model-kernel',
            modelSnapshotRef: 'provider-kernel:model-kernel',
          },
          resultRef: 'jprovider_result_runtime_recovery',
          observedAt: NOW - 5,
          phase: 'result',
          state: 'completed',
        },
      }),
    );
    const { kernel } = runtime();

    await expect(
      kernel.openVoiceRecovery({ accountId: current.accountId, runId: current.id }),
    ).rejects.toThrow('voice_recovery_evidence_invalid');
    await db.jarvis_events.put(
      toJarvisEventRow({
        ...providerStartEvent,
        producerSourceEvidence: {
          ...providerStartEvent.producerSourceEvidence,
          requestId: 'request-runtime-recovery',
        },
      }),
    );

    const opened = await kernel.openVoiceRecovery({
      accountId: current.accountId,
      runId: current.id,
    });
    expect(opened).toMatchObject({ kind: 'committed', value: expect.any(Object) });
    if (opened.kind !== 'committed') throw new Error('expected recovery handle');
    expect(Object.isFrozen(opened.value)).toBe(true);
    const clone = { ...opened.value } as typeof opened.value;
    await expect(clone.commitRecoveredPartial()).rejects.toThrow('voice_recovery_handle_invalid');

    await expect(opened.value.commitRecoveredPartial()).resolves.toMatchObject({
      kind: 'committed',
      value: {
        committed: true,
        run: { status: 'partial', completedAt: NOW },
        event: {
          idempotencyKey: `voice-recovery:${current.id}`,
          title: 'Voice response recovered',
          safeSummary:
            'The response was saved, but playback completion could not be verified after restart.',
        },
      },
    });
    await expect(opened.value.commitRecoveredPartial()).rejects.toThrow(
      'voice_recovery_handle_invalid',
    );
    expect(await db.messages.count()).toBe(1);
    expect(await db.jarvis_events.count()).toBe(3);
    await expect(
      kernel.openVoiceRecovery({ accountId: current.accountId, runId: current.id }),
    ).rejects.toThrow('voice_recovery_evidence_invalid');
  });

  it('binds a protected turn through real lifecycle, live-evidence, and terminal transactions', async () => {
    const turn = kernelTurn();
    await db.jarvis_runs.add(toJarvisRunRow(turn.run));
    await db.chats.add({
      id: turn.chatId as ChatId,
      workspace_id: turn.workspaceId as WorkspaceId,
      title: 'Runtime kernel',
      mode: 'chat',
      active_agent_ids: [turn.agent.id],
      created_at: NOW - 20,
      updated_at: NOW - 20,
    });
    const providerVerifier = Object.freeze({
      state: 'ready' as const,
      producerKind: 'provider' as const,
      verifier: Object.freeze({ verify: vi.fn(async (value: unknown) => value) }),
    });
    const liveEvidenceVerifiers = {
      ...unavailableVerifiers(),
      provider: providerVerifier,
    };
    const processed: JarvisResponseEnvelope = {
      schemaVersion: 1,
      requestId: turn.attempt.requestId,
      runId: turn.run.id,
      mode: 'direct_answer',
      displayText: 'Runtime verified answer.',
      spokenText: 'Runtime verified answer.',
      parts: [{ kind: 'text', text: 'Runtime verified answer.' }],
      artifactIds: [],
      sourceRefs: [],
      executionState: { status: 'completed', verifiedBy: 'journal', lastEventSeq: 4 },
      provider: turn.model,
      enforcement: {
        linted: true,
        violations: [],
        repairAttempted: false,
        repairSucceeded: false,
        fallbackUsed: false,
      },
      completedAt: NOW + 10,
    };
    const start = vi.fn(() => ({
      receipt: {
        providerId: 'provider-kernel',
        modelId: 'model-kernel',
        modelSnapshotRef: 'provider-kernel:model-kernel',
        operations: ['generate'] as const,
        startedAt: NOW + 5,
      },
      response: Promise.resolve({
        text: 'Runtime verified answer.',
        provider: turn.model,
        verifiedFacts: {
          executionState: {
            status: 'completed' as const,
            verifiedBy: 'journal' as const,
            lastEventSeq: 4,
          },
          modelState: 'authenticated' as const,
          plugins: [],
          mcps: [],
        },
        completedAt: NOW + 10,
      }),
      abortAfterStart: vi.fn(),
    }));
    const runtime = createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: {
        allocateRun: vi.fn(),
        getRun: vi.fn(async () => turn.run),
      },
      cancellationDeliveryAuthority: {} as never,
      abortRegistrationAuthority: {
        registerIssuedOwner: vi.fn(() => vi.fn()),
      },
      bindKernelActions: vi.fn() as never,
      liveEvidenceVerifiers: liveEvidenceVerifiers as never,
      prepareProvider: vi.fn(async () => ({
        resolveConfiguration: vi.fn(async () => ({ start, dispose: vi.fn() })),
        dispose: vi.fn(),
      })),
      processResponse: vi.fn(async () => processed),
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-kernel-uuid',
      now: () => NOW,
    });

    const result = await runtime.kernel.runInitialTurn(turn);

    expect(result).toMatchObject({
      kind: 'committed',
      value: { response: processed },
    });
    expect(start).toHaveBeenCalledOnce();
    expect(fromJarvisRunRow((await db.jarvis_runs.get(turn.run.id))!)).toMatchObject({
      status: 'completed',
      completedAt: NOW + 10,
    });
    expect(await db.messages.count()).toBe(1);
    expect(await db.sync_queue.count()).toBe(2);
    expect(await db.jarvis_events.count()).toBe(6);
  });

  it('issues one opaque voice handle and keeps the run nonterminal through response-ready commit', async () => {
    const base = kernelTurn();
    const turn: JarvisKernelTurnInput & { surface: 'voice' } = {
      ...base,
      run: { ...base.run, source: 'voice' },
      surface: 'voice',
    };
    await db.jarvis_runs.add(toJarvisRunRow(turn.run));
    await db.chats.add({
      id: turn.chatId as ChatId,
      workspace_id: turn.workspaceId as WorkspaceId,
      title: 'Runtime voice kernel',
      mode: 'chat',
      active_agent_ids: [turn.agent.id],
      created_at: NOW - 20,
      updated_at: NOW - 20,
    });
    const providerVerifier = Object.freeze({
      state: 'ready' as const,
      producerKind: 'provider' as const,
      verifier: Object.freeze({ verify: vi.fn(async (value: unknown) => value) }),
    });
    const releaseVoiceStarts = [vi.fn(), vi.fn()];
    const authorizeVoiceStart = vi
      .fn()
      .mockImplementationOnce(() => releaseVoiceStarts[0])
      .mockImplementationOnce(() => releaseVoiceStarts[1]);
    const voiceVerifier = Object.freeze({
      state: 'ready' as const,
      producerKind: 'voice' as const,
      verifier: Object.freeze({
        verify: vi.fn(async (value: unknown) => value),
        authorizeStart: authorizeVoiceStart,
      }),
    });
    const playbackResult = Object.freeze({
      tts: Object.freeze({
        state: 'degraded' as const,
        reason: 'stopped' as const,
        resultRef: 'voice-tts-result-runtime',
        observedAt: NOW + 13,
      }),
      playback: Object.freeze({
        state: 'degraded' as const,
        reason: 'stopped' as const,
        resultRef: 'voice-playback-result-runtime',
        observedAt: NOW + 14,
      }),
      terminalStatus: 'partial' as const,
    });
    let resolvePlayback!: (value: typeof playbackResult) => void;
    const playbackSettlement = new Promise<typeof playbackResult>((resolve) => {
      resolvePlayback = resolve;
    });
    let abortDelivered = false;
    const voiceController = Object.freeze({
      receipt: Object.freeze({
        sessionId: 'vsession-runtime',
        engineId: 'system:jarvis-prime',
        ttsExecutionId: 'voice-tts-runtime',
        playbackExecutionId: 'voice-playback-runtime',
        ttsStartedAt: NOW + 11,
        playbackStartedAt: NOW + 12,
      }),
      start: vi.fn(() => playbackSettlement),
      verify: vi.fn((candidate: unknown) => candidate === playbackResult),
      abort: vi.fn(() => {
        if (abortDelivered) return 'already_exited' as const;
        abortDelivered = true;
        resolvePlayback(playbackResult);
        return 'signal_delivered' as const;
      }),
      dispose: vi.fn(),
    });
    const voicePlaybackAdapter = Object.freeze({
      prepare: vi.fn(() => voiceController),
    });
    const registeredOwners = new Map<string, { abort(): unknown | Promise<unknown> }>();
    const registerIssuedOwner = vi.fn(
      (registration: { registrationId: string; abort(): unknown | Promise<unknown> }) => {
        registeredOwners.set(registration.registrationId, registration);
        return () => registeredOwners.delete(registration.registrationId);
      },
    );
    const cancellationPlan = Object.freeze({
      accountId: turn.accountId,
      runId: turn.run.id,
      cancellationRequestId: 'voice-cancel-runtime',
    });
    const prepareCancellation = vi.fn(async () => ({
      kind: 'prepared' as const,
      plan: cancellationPlan,
    }));
    let releaseCancellationDelivery!: () => void;
    const cancellationDeliveryGate = new Promise<void>((resolve) => {
      releaseCancellationDelivery = resolve;
    });
    const deliverCancellation = vi.fn(async () => {
      const outcomes = await Promise.all(
        [...registeredOwners.entries()]
          .filter(([ownerId]) => ownerId.endsWith(':tts') || ownerId.endsWith(':playback'))
          .map(([, registration]) => registration.abort()),
      );
      await cancellationDeliveryGate;
      return {
        kind: 'signal_delivered' as const,
        cancellationRequestId: cancellationPlan.cancellationRequestId,
        ownerIds: outcomes
          .filter(
            (outcome): outcome is { kind: 'signal_delivered'; ownerId: string } =>
              typeof outcome === 'object' &&
              outcome !== null &&
              'kind' in outcome &&
              outcome.kind === 'signal_delivered' &&
              'ownerId' in outcome,
          )
          .map((outcome) => outcome.ownerId),
      };
    });
    const sealCancellation = vi.fn(async () => ({
      kind: 'sealed' as const,
      cancellationRequestId: cancellationPlan.cancellationRequestId,
      ownerIds: [`${turn.run.id}:tts`, `${turn.run.id}:playback`],
    }));
    const releaseVoiceHandle = vi.fn();
    const processed: JarvisResponseEnvelope = {
      schemaVersion: 1,
      requestId: turn.attempt.requestId,
      runId: turn.run.id,
      mode: 'direct_answer',
      displayText: 'Runtime voice answer.',
      spokenText: 'Runtime voice answer.',
      parts: [{ kind: 'text', text: 'Runtime voice answer.' }],
      artifactIds: [],
      sourceRefs: [],
      executionState: { status: 'completed', verifiedBy: 'journal', lastEventSeq: 4 },
      provider: turn.model,
      enforcement: {
        linted: true,
        violations: [],
        repairAttempted: false,
        repairSucceeded: false,
        fallbackUsed: false,
      },
      completedAt: NOW + 10,
    };
    const runtime = createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: {
        allocateRun: vi.fn(),
        getRun: vi.fn(async () => turn.run),
      },
      cancellationDeliveryAuthority: {
        prepare: prepareCancellation,
        deliver: deliverCancellation,
        current: vi.fn(),
        sealWorkflowQuiescence: sealCancellation,
        abandonBeforeDelivery: vi.fn(),
      } as never,
      abortRegistrationAuthority: { registerIssuedOwner },
      bindKernelActions: vi.fn() as never,
      liveEvidenceVerifiers: {
        ...unavailableVerifiers(),
        provider: providerVerifier,
        voice: voiceVerifier,
      } as never,
      voiceLiveEvidenceStartAuthority: voiceVerifier.verifier,
      voicePlaybackAdapter,
      onVoiceTurnHandleIssued: () => releaseVoiceHandle,
      prepareProvider: vi.fn(async () => ({
        resolveConfiguration: vi.fn(async () => ({
          start: vi.fn(() => ({
            receipt: {
              providerId: 'provider-kernel',
              modelId: 'model-kernel',
              modelSnapshotRef: 'provider-kernel:model-kernel',
              operations: ['generate'] as const,
              startedAt: NOW + 5,
            },
            response: Promise.resolve({
              text: 'Runtime voice answer.',
              provider: turn.model,
              verifiedFacts: {
                executionState: {
                  status: 'completed' as const,
                  verifiedBy: 'journal' as const,
                  lastEventSeq: 4,
                },
                modelState: 'authenticated' as const,
                plugins: [],
                mcps: [],
              },
              completedAt: NOW + 10,
            }),
            abortAfterStart: vi.fn(),
          })),
          dispose: vi.fn(),
        })),
        dispose: vi.fn(),
      })),
      processResponse: vi.fn(async () => processed),
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-voice-uuid',
      now: () => NOW,
    });

    const started = await runtime.kernel.startVoiceTurn(turn);
    expect(started).toMatchObject({
      kind: 'committed',
      value: { result: { response: processed }, handle: expect.any(Object) },
    });
    if (started.kind !== 'committed') throw new Error('expected voice turn');
    const voiceHandle = started.value.handle;
    expect(Object.isFrozen(started.value.handle)).toBe(true);
    expect(await db.messages.count()).toBe(0);
    expect(fromJarvisRunRow((await db.jarvis_runs.get(turn.run.id))!)).toMatchObject({
      status: 'running',
    });

    const messageReads = vi.spyOn(db.messages, 'get');
    const eventAdd = vi
      .spyOn(db.jarvis_events, 'add')
      .mockRejectedValueOnce(new Error('injected response-ready transaction failure'));
    await expect(started.value.handle.runValidatedPlayback()).rejects.toThrow(
      'voice_handle_phase_conflict',
    );
    const commitWithInjectedPayload = started.value.handle.commitResponseReady as (
      injected: unknown,
    ) => ReturnType<typeof voiceHandle.commitResponseReady>;
    const commitPromise = commitWithInjectedPayload.call(started.value.handle, {
      assistantMessage: { id: 'forged-message' },
      spokenText: 'Forged speech.',
    });
    const concurrentCommit = started.value.handle.commitResponseReady();
    await expect(started.value.handle.runValidatedPlayback()).rejects.toThrow(
      'voice_handle_phase_conflict',
    );
    const committed = await commitPromise;
    await expect(concurrentCommit).resolves.toBe(committed);
    expect(committed).toMatchObject({
      kind: 'committed',
      value: {
        committed: true,
        run: { status: 'running' },
        event: { status: 'response_ready' },
        message: { chat_id: turn.chatId },
      },
    });
    expect(await db.messages.count()).toBe(1);
    expect(eventAdd).toHaveBeenCalledTimes(3);
    expect(fromJarvisRunRow((await db.jarvis_runs.get(turn.run.id))!)).toMatchObject({
      status: 'running',
    });
    const providerVerificationOrder = providerVerifier.verifier.verify.mock.invocationCallOrder[0];
    expect(providerVerificationOrder).toBeTypeOf('number');
    expect(
      messageReads.mock.invocationCallOrder.some((order) => order > providerVerificationOrder!),
    ).toBe(true);
    await expect(started.value.handle.commitResponseReady()).resolves.toBe(committed);
    expect(await db.messages.count()).toBe(1);

    const clone = { ...started.value.handle } as typeof started.value.handle;
    await expect(clone.commitResponseReady()).rejects.toThrow('voice_handle_invalid');
    const playback = started.value.handle.runValidatedPlayback();
    await vi.waitFor(() => expect(voiceController.start).toHaveBeenCalledOnce());
    await expect(started.value.handle.runValidatedPlayback()).rejects.toThrow(
      'voice_handle_phase_conflict',
    );
    const cancellation = started.value.handle.requestCancellation();
    await vi.waitFor(() => expect(deliverCancellation).toHaveBeenCalledOnce());
    expect(voiceController.abort).toHaveBeenCalledOnce();
    expect(releaseVoiceHandle).not.toHaveBeenCalled();
    releaseCancellationDelivery();
    await expect(cancellation).resolves.toMatchObject({
      kind: 'intent_committed',
      cancellationRequestId: cancellationPlan.cancellationRequestId,
      aggregate: { kind: 'signal_delivered' },
    });
    await expect(playback).resolves.toMatchObject({
      kind: 'committed',
      value: { committed: true, run: { status: 'cancelled' } },
    });
    expect(sealCancellation).toHaveBeenCalledWith(
      turn.accountId,
      turn.run.id,
      cancellationPlan.cancellationRequestId,
    );
    expect(releaseVoiceHandle).toHaveBeenCalledOnce();
    expect(voicePlaybackAdapter.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: turn.accountId,
        runId: turn.run.id,
        requestId: turn.attempt.requestId,
        attemptNumber: turn.attempt.attemptNumber,
        spokenText: processed.spokenText,
      }),
    );
    expect(voiceController.start).toHaveBeenCalledOnce();
    expect(voiceController.verify).toHaveBeenCalledWith(playbackResult);
    expect(
      authorizeVoiceStart.mock.calls.map(([source]) => source.producerIdentity.engineKind),
    ).toEqual(['tts', 'playback']);
    for (const release of releaseVoiceStarts) expect(release).toHaveBeenCalledOnce();
    expect(
      registerIssuedOwner.mock.calls.map(([registration]) => registration.registrationId),
    ).toEqual(
      expect.arrayContaining([
        `${turn.run.id}:provider`,
        `${turn.run.id}:tts`,
        `${turn.run.id}:playback`,
      ]),
    );
    const voiceSourceRows = (await db.jarvis_events.toArray()).filter(
      (row) => row.producer_source_evidence?.producerKind === 'voice',
    );
    const voiceSourceLineage = voiceSourceRows.map((row) => {
      const source = row.producer_source_evidence;
      if (source?.producerKind !== 'voice') throw new Error('expected voice source');
      return [source.producerIdentity.engineKind, source.phase];
    });
    expect(voiceSourceLineage).toEqual([
      ['tts', 'start'],
      ['playback', 'start'],
      ['tts', 'result'],
      ['playback', 'result'],
      ['playback', 'result'],
    ]);
    expect(voiceSourceRows.at(-1)?.producer_source_evidence).toEqual(
      voiceSourceRows.at(-2)?.producer_source_evidence,
    );
    expect(JSON.stringify(voiceSourceRows)).not.toMatch(/Runtime voice answer|spokenText|audio/i);
    expect(fromJarvisRunRow((await db.jarvis_runs.get(turn.run.id))!)).toMatchObject({
      status: 'cancelled',
    });
    started.value.handle.dispose();
    started.value.handle.dispose();
    await expect(started.value.handle.commitResponseReady()).rejects.toThrow(
      'voice_handle_phase_conflict',
    );
  });

  it('revokes on an account switch after configuration and never starts the provider', async () => {
    const turn = kernelTurn();
    await db.jarvis_runs.add(toJarvisRunRow(turn.run));
    await db.chats.add({
      id: turn.chatId as ChatId,
      workspace_id: turn.workspaceId as WorkspaceId,
      title: 'Runtime kernel revoked',
      mode: 'chat',
      active_agent_ids: [turn.agent.id],
      created_at: NOW - 20,
      updated_at: NOW - 20,
    });
    const start = vi.fn();
    const processResponse = vi.fn();
    const runtime = createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: {
        allocateRun: vi.fn(),
        getRun: vi.fn(async () => turn.run),
      },
      cancellationDeliveryAuthority: {} as never,
      abortRegistrationAuthority: {
        registerIssuedOwner: vi.fn(() => vi.fn()),
      },
      bindKernelActions: vi.fn() as never,
      liveEvidenceVerifiers: unavailableVerifiers() as never,
      prepareProvider: vi.fn(async () => ({
        resolveConfiguration: vi.fn(async () => {
          useAuthStore.setState({ localUserId: 'account-other' });
          return { start, dispose: vi.fn() };
        }),
        dispose: vi.fn(),
      })),
      processResponse,
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-kernel-revoked-uuid',
      now: () => NOW,
    });

    await expect(runtime.kernel.runInitialTurn(turn)).resolves.toEqual({
      kind: 'account_authority_revoked',
    });

    expect(start).not.toHaveBeenCalled();
    expect(processResponse).not.toHaveBeenCalled();
    expect(fromJarvisRunRow((await db.jarvis_runs.get(turn.run.id))!)).toMatchObject({
      status: 'running',
    });
    expect(await db.jarvis_events.count()).toBe(2);
    expect(await db.messages.count()).toBe(0);
    expect(await db.sync_queue.count()).toBe(0);
    expect(await db.jarvis_artifacts.count()).toBe(0);
  });

  it('derives a fresh private action lifecycle from the canonical parent and disposes it after success', async () => {
    const parentRun: JarvisRun = {
      ...kernelRun(),
      source: 'schedule',
      status: 'running',
      updatedAt: NOW - 5,
      transportAttempts: [
        {
          schemaVersion: 1,
          attemptNumber: 1,
          kind: 'initial',
          requestId: 'request-runtime-action',
          state: 'provider_in_flight',
          startedEventSeq: 1,
          effectBarrier: { state: 'open', version: 0, updatedAt: NOW - 5 },
          createdAt: NOW - 5,
          updatedAt: NOW - 5,
        },
      ],
    };
    await db.jarvis_runs.add(toJarvisRunRow(parentRun));
    const expectedApproval = { id: 'jappr_runtime_action' };
    let issued: JarvisIssuedApprovalLifecycle | undefined;
    let abortedDuringCall = true;
    const capability: JarvisApprovalActionCapability = {
      create: vi.fn(async () => {
        abortedDuringCall = issued!.revocationSignal.aborted;
        return expectedApproval as never;
      }),
      decide: vi.fn() as never,
      execute: vi.fn() as never,
      executeAutoApprovedSafe: vi.fn() as never,
    };
    const bindKernelActions: JarvisApprovalActionBinder = vi.fn((lifecycle) => {
      issued = lifecycle;
      return capability;
    });
    const runtime = createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: { allocateRun: vi.fn(), getRun: vi.fn() } as never,
      cancellationDeliveryAuthority: {} as never,
      abortRegistrationAuthority: {} as never,
      bindKernelActions,
      liveEvidenceVerifiers: unavailableVerifiers() as never,
      prepareProvider: vi.fn() as never,
      processResponse: vi.fn() as never,
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-action-uuid',
      now: () => NOW,
    });
    const createInput: CreateJarvisApprovalInput = {
      parentRun,
      attempt: {
        kind: 'initial',
        requestId: 'request-runtime-action',
        runId: parentRun.id,
        attemptNumber: 1,
      },
      actionId: 'notes.create',
      actionVersion: 1,
      params: { title: 'Runtime action' },
      expiresAt: NOW + 60_000,
    };

    await expect(runtime.kernel.actions.create(createInput)).resolves.toEqual({
      kind: 'committed',
      value: expectedApproval,
    });

    expect(bindKernelActions).toHaveBeenCalledOnce();
    expect(issued).toMatchObject({
      accountId: parentRun.accountId,
      runId: parentRun.id,
      requestId: 'request-runtime-action',
      attemptNumber: 1,
    });
    expect(abortedDuringCall).toBe(false);
    expect(issued!.revocationSignal.aborted).toBe(true);
  });

  it('denies stale request scope before binding an action capability', async () => {
    const parentRun: JarvisRun = {
      ...kernelRun(),
      source: 'schedule',
      status: 'running',
      updatedAt: NOW - 5,
      transportAttempts: [
        {
          schemaVersion: 1,
          attemptNumber: 1,
          kind: 'initial',
          requestId: 'request-runtime-current',
          state: 'provider_in_flight',
          startedEventSeq: 1,
          effectBarrier: { state: 'open', version: 0, updatedAt: NOW - 5 },
          createdAt: NOW - 5,
          updatedAt: NOW - 5,
        },
      ],
    };
    await db.jarvis_runs.add(toJarvisRunRow(parentRun));
    const bindKernelActions = vi.fn() as JarvisApprovalActionBinder;
    const runtime = createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: { allocateRun: vi.fn(), getRun: vi.fn() } as never,
      cancellationDeliveryAuthority: {} as never,
      abortRegistrationAuthority: {} as never,
      bindKernelActions,
      liveEvidenceVerifiers: unavailableVerifiers() as never,
      prepareProvider: vi.fn() as never,
      processResponse: vi.fn() as never,
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-action-stale-uuid',
      now: () => NOW,
    });

    await expect(
      runtime.kernel.actions.create({
        parentRun,
        attempt: {
          kind: 'initial',
          requestId: 'request-runtime-stale',
          runId: parentRun.id,
          attemptNumber: 1,
        },
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'Stale' },
        expiresAt: NOW + 60_000,
      }),
    ).rejects.toThrow('kernel_action_scope_mismatch');
    expect(bindKernelActions).not.toHaveBeenCalled();
  });

  it('maps genuine account revocation during an action and releases the lifecycle once', async () => {
    const parentRun: JarvisRun = {
      ...kernelRun(),
      source: 'schedule',
      status: 'running',
      updatedAt: NOW - 5,
      transportAttempts: [
        {
          schemaVersion: 1,
          attemptNumber: 1,
          kind: 'initial',
          requestId: 'request-runtime-revoked-action',
          state: 'provider_in_flight',
          startedEventSeq: 1,
          effectBarrier: { state: 'open', version: 0, updatedAt: NOW - 5 },
          createdAt: NOW - 5,
          updatedAt: NOW - 5,
        },
      ],
    };
    await db.jarvis_runs.add(toJarvisRunRow(parentRun));
    let issued: JarvisIssuedApprovalLifecycle | undefined;
    let abortCount = 0;
    const bindKernelActions: JarvisApprovalActionBinder = vi.fn((lifecycle) => {
      issued = lifecycle;
      lifecycle.revocationSignal.addEventListener('abort', () => {
        abortCount += 1;
      });
      return {
        create: vi.fn(async () => {
          useAuthStore.setState({ localUserId: 'account-other' });
          return { id: 'must-not-escape-after-revocation' } as never;
        }),
        decide: vi.fn() as never,
        execute: vi.fn() as never,
        executeAutoApprovedSafe: vi.fn() as never,
      };
    });
    const runtime = createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: { allocateRun: vi.fn(), getRun: vi.fn() } as never,
      cancellationDeliveryAuthority: {} as never,
      abortRegistrationAuthority: {} as never,
      bindKernelActions,
      liveEvidenceVerifiers: unavailableVerifiers() as never,
      prepareProvider: vi.fn() as never,
      processResponse: vi.fn() as never,
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-action-revoked-uuid',
      now: () => NOW,
    });

    await expect(
      runtime.kernel.actions.create({
        parentRun,
        attempt: {
          kind: 'initial',
          requestId: 'request-runtime-revoked-action',
          runId: parentRun.id,
          attemptNumber: 1,
        },
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'Revoked' },
        expiresAt: NOW + 60_000,
      }),
    ).resolves.toEqual({ kind: 'account_authority_revoked' });
    expect(issued!.revocationSignal.aborted).toBe(true);
    expect(abortCount).toBe(1);
  });

  it('persists prepared approval creation and decision through fresh signal-bound lifecycles', async () => {
    const parentRun: JarvisRun = {
      ...kernelRun(),
      source: 'schedule',
      status: 'running',
      updatedAt: NOW - 5,
      transportAttempts: [
        {
          schemaVersion: 1,
          attemptNumber: 1,
          kind: 'initial',
          requestId: 'request-runtime-persisted-approval',
          state: 'provider_in_flight',
          startedEventSeq: 1,
          effectBarrier: { state: 'open', version: 0, updatedAt: NOW - 5 },
          createdAt: NOW - 5,
          updatedAt: NOW - 5,
        },
      ],
    };
    await db.jarvis_runs.add(toJarvisRunRow(parentRun));
    const approvalId = 'jappr_runtime_persisted';
    const bindKernelActions: JarvisApprovalActionBinder = (lifecycle) => ({
      async create(createInput) {
        const result = await lifecycle.putPreparedApproval({
          ...createInput,
          secretHandleRefs: [],
          approvalId,
          paramsHash: 'params-hash-runtime-persisted',
          targetSnapshot: {
            kind: 'app_resource',
            namespace: 'notes',
            resourceId: 'runtime-persisted',
          },
          risk: 'confirm',
          capabilityId: 'capability.notes.write',
          capabilitySnapshotHash: 'capability-hash-runtime-persisted',
          expectedEffect: 'Create the persisted runtime note.',
          createdAt: NOW,
        } as never);
        if (result.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        return result.value;
      },
      async decide(decideInput) {
        const result = await lifecycle.decidePreparedApproval({
          approvalId: decideInput.approvalId,
          decision: decideInput.decision,
        });
        if (result.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        return result.value;
      },
      execute: vi.fn() as never,
      executeAutoApprovedSafe: vi.fn() as never,
    });
    const runtime = createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: { allocateRun: vi.fn(), getRun: vi.fn() } as never,
      cancellationDeliveryAuthority: {} as never,
      abortRegistrationAuthority: {} as never,
      bindKernelActions,
      liveEvidenceVerifiers: unavailableVerifiers() as never,
      prepareProvider: vi.fn() as never,
      processResponse: vi.fn() as never,
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-persisted-approval-uuid',
      now: () => NOW,
    });
    const createInput: CreateJarvisApprovalInput = {
      parentRun,
      attempt: {
        kind: 'initial',
        requestId: 'request-runtime-persisted-approval',
        runId: parentRun.id,
        attemptNumber: 1,
      },
      actionId: 'notes.create',
      actionVersion: 1,
      params: { title: 'Persisted runtime approval' },
      expiresAt: NOW + 60_000,
    };

    await expect(runtime.kernel.actions.create(createInput)).resolves.toMatchObject({
      kind: 'committed',
      value: { id: approvalId, status: 'pending' },
    });
    await expect(
      runtime.kernel.actions.decide({
        parentRun,
        approvalId,
        decision: 'approve',
      }),
    ).resolves.toMatchObject({
      kind: 'committed',
      value: { id: approvalId, status: 'approved' },
    });

    expect(fromJarvisApprovalRow((await db.jarvis_approvals.get(approvalId))!)).toMatchObject({
      id: approvalId,
      status: 'approved',
      requestId: 'request-runtime-persisted-approval',
      attemptNumber: 1,
    });
    expect(fromJarvisRunRow((await db.jarvis_runs.get(parentRun.id))!)).toMatchObject({
      status: 'awaiting_approval',
    });
    expect(await db.jarvis_events.count()).toBe(3);
  });

  it('claims and settles an approved action with durable start, result, and live evidence', async () => {
    const parentRun: JarvisRun = {
      ...kernelRun(),
      source: 'schedule',
      status: 'running',
      updatedAt: NOW - 5,
      transportAttempts: [
        {
          schemaVersion: 1,
          attemptNumber: 1,
          kind: 'initial',
          requestId: 'request-runtime-action-result',
          state: 'provider_in_flight',
          startedEventSeq: 1,
          effectBarrier: { state: 'open', version: 0, updatedAt: NOW - 5 },
          createdAt: NOW - 5,
          updatedAt: NOW - 5,
        },
      ],
    };
    await db.jarvis_runs.add(toJarvisRunRow(parentRun));
    const approvalId = 'jappr_runtime_action_result';
    let effectSignal: AbortSignal | undefined;
    const bindKernelActions: JarvisApprovalActionBinder = (lifecycle) => ({
      async create(createInput) {
        const result = await lifecycle.putPreparedApproval({
          ...createInput,
          secretHandleRefs: [],
          approvalId,
          paramsHash: 'params-hash-runtime-action-result',
          targetSnapshot: {
            kind: 'app_resource',
            namespace: 'notes',
            resourceId: 'runtime-action-result',
          },
          risk: 'confirm',
          capabilityId: 'capability.notes.write',
          capabilitySnapshotHash: 'capability-hash-runtime-action-result',
          expectedEffect: 'Create the runtime action result note.',
          createdAt: NOW,
        } as never);
        if (result.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        return result.value;
      },
      async decide(decideInput) {
        const result = await lifecycle.decidePreparedApproval({
          approvalId: decideInput.approvalId,
          decision: decideInput.decision,
        });
        if (result.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        return result.value;
      },
      async execute(executeInput) {
        const claim = await lifecycle.claimApprovedExecution({
          approvalId: executeInput.approvalId,
          producerKind: 'action',
          ownerId: `approval:${executeInput.approvalId}`,
          evidenceRef: `approval:${executeInput.approvalId}:claim`,
          startedAt: NOW + 1,
        });
        if (claim.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        const execution = claim.value;
        const started = execution.beginExternalEffect((signal) => {
          effectSignal = signal;
          return { completion: Promise.resolve('created') };
        });
        if (started.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        await started.value.completion;
        const settled = await execution.recordResult({
          state: 'completed',
          resultRef: 'jresult_runtime_action_result',
          completedAt: NOW + 2,
        });
        execution.dispose();
        if (settled.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        return { kind: 'settled' as const, result: { ok: true as const, summary: 'created' } };
      },
      executeAutoApprovedSafe: vi.fn() as never,
    });
    const runtime = createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: { allocateRun: vi.fn(), getRun: vi.fn() } as never,
      cancellationDeliveryAuthority: {} as never,
      abortRegistrationAuthority: {} as never,
      bindKernelActions,
      liveEvidenceVerifiers: actionReadyVerifiers(db) as never,
      prepareProvider: vi.fn() as never,
      processResponse: vi.fn() as never,
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-action-result-uuid',
      now: () => NOW,
    });
    const createInput: CreateJarvisApprovalInput = {
      parentRun,
      attempt: {
        kind: 'initial',
        requestId: 'request-runtime-action-result',
        runId: parentRun.id,
        attemptNumber: 1,
      },
      actionId: 'notes.create',
      actionVersion: 1,
      params: { title: 'Runtime action result' },
      expiresAt: NOW + 60_000,
    };
    await runtime.kernel.actions.create(createInput);
    await runtime.kernel.actions.decide({ parentRun, approvalId, decision: 'approve' });

    await expect(
      runtime.kernel.actions.execute({
        parentRun,
        approvalId,
        context: { source: 'ai' },
      }),
    ).resolves.toEqual({
      kind: 'committed',
      value: { kind: 'settled', result: { ok: true, summary: 'created' } },
    });

    expect(effectSignal).toBeDefined();
    expect(effectSignal!.aborted).toBe(true);
    expect(fromJarvisApprovalRow((await db.jarvis_approvals.get(approvalId))!)).toMatchObject({
      status: 'consumed',
      consumedAt: NOW + 1,
    });
    const events = await db.jarvis_events.orderBy('[run_id+seq]').toArray();
    expect(events.map((event) => event.status)).toEqual([
      'awaiting_approval',
      'pending',
      'approved',
      'consequential_effect_claimed',
      'ready',
      'completed',
      'completed',
    ]);
  });

  it('retains terminal ownership through cancellation intent and native verification', async () => {
    const parentRun: JarvisRun = {
      ...kernelRun(),
      source: 'schedule',
      status: 'running',
      updatedAt: NOW - 5,
      transportAttempts: [
        {
          schemaVersion: 1,
          attemptNumber: 1,
          kind: 'initial',
          requestId: 'request-runtime-terminal-cancel',
          state: 'provider_in_flight',
          startedEventSeq: 1,
          effectBarrier: { state: 'open', version: 0, updatedAt: NOW - 5 },
          createdAt: NOW - 5,
          updatedAt: NOW - 5,
        },
      ],
    };
    await db.jarvis_runs.add(toJarvisRunRow(parentRun));
    const approvalId = 'jappr_runtime_terminal_cancel';
    let ownedExecution: JarvisTerminalOwnedExecution | undefined;
    const bindKernelActions: JarvisApprovalActionBinder = (lifecycle) => ({
      async create(createInput) {
        const result = await lifecycle.putPreparedApproval({
          ...createInput,
          secretHandleRefs: [],
          approvalId,
          paramsHash: 'params-hash-runtime-terminal-cancel',
          targetSnapshot: {
            kind: 'app_resource',
            namespace: 'terminal',
            resourceId: 'runtime-terminal-cancel',
          },
          risk: 'dangerous',
          capabilityId: 'capability.terminal.execute',
          capabilitySnapshotHash: 'capability-hash-runtime-terminal-cancel',
          expectedEffect: 'Run the approved terminal command.',
          createdAt: NOW,
        } as never);
        if (result.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        return result.value;
      },
      async decide(decideInput) {
        const result = await lifecycle.decidePreparedApproval({
          approvalId: decideInput.approvalId,
          decision: decideInput.decision,
        });
        if (result.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        return result.value;
      },
      async execute(executeInput) {
        const claim = await lifecycle.claimApprovedExecution({
          approvalId: executeInput.approvalId,
          producerKind: 'terminal',
          ownerId: `approval:${executeInput.approvalId}`,
          evidenceRef: `approval:${executeInput.approvalId}:terminal-claim`,
          startedAt: NOW + 3,
        });
        if (claim.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        const executionId = 'jterminal_execution_runtime_cancel';
        const handoff = claim.value.transferTerminalOwnership({
          executionId,
          acceptor: {
            acceptIssuedExecution(input) {
              ownedExecution = input.execution;
              return Object.freeze({
                executionId,
                ownerId: input.ownerId,
                [jarvisTerminalHandoffReceiptBrand]: true as const,
              });
            },
          },
        });
        if (handoff.kind !== 'committed') throw new Error('unexpected_authority_revocation');
        return {
          kind: 'handoff_pending' as const,
          executorKind: 'terminal' as const,
          ownerId: claim.value.ownerId,
          result: { ok: true as const, summary: 'terminal started' },
        };
      },
      executeAutoApprovedSafe: vi.fn() as never,
    });
    const cancellationPlan = {
      accountId: parentRun.accountId,
      runId: parentRun.id,
      cancellationRequestId: 'jcancel_runtime_terminal',
    };
    const runtime = createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: { allocateRun: vi.fn(), getRun: vi.fn() } as never,
      cancellationDeliveryAuthority: {
        prepare: vi.fn(async () => ({
          kind: 'prepared' as const,
          plan: cancellationPlan as never,
        })),
        deliver: vi.fn(async () => ({
          kind: 'signal_delivered' as const,
          cancellationRequestId: cancellationPlan.cancellationRequestId,
          ownerIds: ['terminal-owner-runtime'],
        })),
        current: vi.fn() as never,
        sealWorkflowQuiescence: vi.fn() as never,
        abandonBeforeDelivery: vi.fn(),
      },
      abortRegistrationAuthority: {} as never,
      bindKernelActions,
      liveEvidenceVerifiers: actionReadyVerifiers(db) as never,
      prepareProvider: vi.fn() as never,
      processResponse: vi.fn() as never,
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-terminal-cancel-uuid',
      now: () => NOW + 2,
    });
    const createInput: CreateJarvisApprovalInput = {
      parentRun,
      attempt: {
        kind: 'initial',
        requestId: 'request-runtime-terminal-cancel',
        runId: parentRun.id,
        attemptNumber: 1,
      },
      actionId: 'terminal.execute',
      actionVersion: 1,
      params: { commandRef: 'approved-command-ref' },
      expiresAt: NOW + 60_000,
    };
    await runtime.kernel.actions.create(createInput);
    await runtime.kernel.actions.decide({ parentRun, approvalId, decision: 'approve' });
    await expect(
      runtime.kernel.actions.execute({
        parentRun,
        approvalId,
        context: { source: 'ai' },
      }),
    ).resolves.toMatchObject({
      kind: 'committed',
      value: { kind: 'handoff_pending', executorKind: 'terminal' },
    });

    expect(ownedExecution).toBeDefined();
    await expect(ownedExecution!.requestCancellation()).resolves.toMatchObject({
      kind: 'intent_committed',
      cancellationRequestId: cancellationPlan.cancellationRequestId,
    });
    await expect(
      ownedExecution!.recordCancellationVerified({
        cancellationRequestId: cancellationPlan.cancellationRequestId,
        resultRef: 'jresult_runtime_terminal_cancelled',
        verifiedAt: NOW + 4,
      }),
    ).resolves.toMatchObject({
      kind: 'committed',
      value: { run: { status: 'cancelled' }, event: { status: 'cancelled' } },
    });
    ownedExecution!.dispose();

    expect(fromJarvisRunRow((await db.jarvis_runs.get(parentRun.id))!)).toMatchObject({
      status: 'cancelled',
      completedAt: NOW + 4,
    });
    const events = await db.jarvis_events.orderBy('[run_id+seq]').toArray();
    expect(events.map((event) => event.status)).toEqual([
      'awaiting_approval',
      'pending',
      'approved',
      'consequential_effect_claimed',
      'ready',
      'cancellation_requested',
      'degraded',
      'cancelled',
      'degraded',
    ]);
  });

  it('commits a signal-bound cancellation intent before delivering it to the run owner', async () => {
    const turn = kernelTurn();
    await db.jarvis_runs.add(toJarvisRunRow(turn.run));
    const plan = Object.freeze({
      accountId: turn.accountId,
      runId: turn.run.id,
      cancellationRequestId: 'cancel-runtime-kernel',
    });
    const prepare = vi.fn(async () => ({ kind: 'prepared' as const, plan: plan as never }));
    const deliver = vi.fn(async () => {
      const rows = await db.jarvis_events.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        run_id: turn.run.id,
        status: 'cancellation_requested',
        idempotency_key: plan.cancellationRequestId,
      });
      return {
        kind: 'signal_delivered' as const,
        cancellationRequestId: plan.cancellationRequestId,
        ownerIds: [`${turn.run.id}:provider`],
      };
    });
    const runtime = createJarvisKernelRuntime({
      db,
      artifactEvidenceAuthorities: artifactAuthorities() as never,
      journal: {
        allocateRun: vi.fn(),
        getRun: vi.fn(async () => turn.run),
      },
      cancellationDeliveryAuthority: {
        prepare,
        deliver,
        current: vi.fn(),
        sealWorkflowQuiescence: vi.fn() as never,
        abandonBeforeDelivery: vi.fn(),
      },
      abortRegistrationAuthority: {
        registerIssuedOwner: vi.fn(() => vi.fn()),
      },
      bindKernelActions: vi.fn() as never,
      liveEvidenceVerifiers: unavailableVerifiers() as never,
      prepareProvider: vi.fn() as never,
      processResponse: vi.fn() as never,
      takeProviderArtifactDrafts: vi.fn(() => []),
      randomUUID: () => 'runtime-kernel-cancel-uuid',
      now: () => NOW,
    });

    await expect(
      runtime.kernel.requestCancellation({
        accountId: turn.accountId,
        runId: turn.run.id,
      }),
    ).resolves.toEqual({
      kind: 'intent_committed',
      requestState: 'new',
      authorityState: 'current',
      cancellationRequestId: plan.cancellationRequestId,
      aggregate: {
        kind: 'signal_delivered',
        ownerIds: [`${turn.run.id}:provider`],
      },
    });
    expect(prepare).toHaveBeenCalledWith(turn.accountId, turn.run.id);
    expect(deliver).toHaveBeenCalledWith(plan);
  });
});
