import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { fromJarvisApprovalRow, fromJarvisRunRow, toJarvisRunRow } from '@/lib/db/jarvisMappers';
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
