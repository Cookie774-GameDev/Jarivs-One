import { describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/lib/actions/types';
import type { JarvisApprovalRepository, JarvisRunRepository } from '@/lib/db/jarvisRepositories';
import type {
  JarvisApprovalV1,
  JarvisAuthorityBoundResult,
  JarvisCapabilitySnapshot,
  JarvisEntitlementSnapshot,
  JarvisRun,
} from '@/lib/jarvis/contracts';
import {
  createJarvisActionCatalog,
  type JarvisRegisteredActionDefinition,
} from '@/lib/jarvis/actions/catalog';
import type { JarvisRequestAttempt } from '@/lib/jarvis/requestEnvelope';
import {
  createJarvisApprovalBindingSelectors,
  createJarvisApprovalEngine,
  JarvisApprovalError,
  jarvisIssuedActionExecutionBrand,
  jarvisIssuedApprovalLifecycleBrand,
  type JarvisIssuedActionExecution,
  type JarvisIssuedApprovalLifecycle,
} from './approvalEngine';

const now = 10_000;
const expectedNoteEffect =
  'Create one note at the registered target. Target: {"kind":"app_resource","namespace":"notes","resourceId":"hello"}';

function parentRun(overrides: Partial<JarvisRun> = {}): JarvisRun {
  const run: JarvisRun = {
    id: 'jrun_1',
    accountId: 'account-a',
    source: 'typed_chat',
    status: 'running',
    agentId: 'jarvis',
    identityVersion: 1,
    profileRevisionId: 'jprofile_1',
    model: {
      providerId: 'test',
      modelId: 'test-model',
      connectionMode: 'local',
      capabilities: {},
      capturedAt: 1,
    },
    createdAt: 1,
    updatedAt: 2,
  };
  return { ...run, ...overrides };
}

function requestAttempt(): JarvisRequestAttempt {
  return { kind: 'initial', requestId: 'request-1', runId: 'jrun_1', attemptNumber: 1 };
}

function capabilitySnapshot(): JarvisCapabilitySnapshot {
  return {
    capturedAt: 9_000,
    tools: [
      {
        id: 'capability.notes.write',
        state: 'available',
        operations: ['execute'],
        evidenceRef: 'evidence-capability',
        lastVerifiedAt: 9_000,
      },
    ],
    plugins: [],
    mcps: [],
    terminals: [],
    agents: [],
    entitlements: entitlementSnapshot(),
  };
}

function entitlementSnapshot(): JarvisEntitlementSnapshot {
  return {
    source: 'server',
    capabilities: ['entitlement.notes'],
    verifiedAt: 9_000,
    expiresAt: 20_000,
  };
}

function registration(
  overrides: Partial<JarvisRegisteredActionDefinition> = {},
): JarvisRegisteredActionDefinition {
  return {
    id: 'notes.create',
    version: 1,
    title: 'Create note',
    description: 'Creates one note.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object', additionalProperties: true },
    requiredCapabilities: ['capability.notes.write'],
    requiredEntitlements: ['entitlement.notes'],
    risk: 'safe-write',
    approval: 'always',
    expectedEffect: 'Create one note at the registered target.',
    exposeToAI: true,
    executor: { kind: 'builtin', registryActionId: 'notes.create' },
    credentialBindings: [],
    validateParameters(input) {
      if (
        Object.keys(input).length !== 1 ||
        typeof input.title !== 'string' ||
        !input.title.trim()
      ) {
        throw new Error('invalid');
      }
      return { title: input.title.trim() };
    },
    deriveTarget({ params }) {
      return { kind: 'app_resource', namespace: 'notes', resourceId: String(params.title) };
    },
    ...overrides,
  };
}

function lifecycle(
  overrides: Partial<JarvisIssuedApprovalLifecycle> = {},
): JarvisIssuedApprovalLifecycle {
  const revocation = new AbortController();
  return {
    accountId: 'account-a',
    runId: 'jrun_1',
    requestId: 'request-1',
    attemptNumber: 1,
    revocationSignal: revocation.signal,
    [jarvisIssuedApprovalLifecycleBrand]: true,
    putPreparedApproval: vi.fn(),
    decidePreparedApproval: vi.fn(),
    claimApprovedExecution: vi.fn(),
    claimAutoApprovedExecution: vi.fn(),
    dispose: vi.fn(() => revocation.abort()),
    ...overrides,
  };
}

function fixture(actionRegistration: JarvisRegisteredActionDefinition = registration()) {
  const run = parentRun();
  const catalog = createJarvisActionCatalog([actionRegistration]);
  const approvals = new Map<string, JarvisApprovalV1>();
  const runs: Pick<JarvisRunRepository, 'getById'> = {
    getById: vi.fn(async () => structuredClone(run)),
  };
  const approvalRepository: Pick<JarvisApprovalRepository, 'getById' | 'listByRun'> = {
    getById: vi.fn(async (_accountId, approvalId) => {
      const approval = approvals.get(approvalId);
      return approval ? structuredClone(approval) : undefined;
    }),
    listByRun: vi.fn(async () => [...approvals.values()].map((value) => structuredClone(value))),
  };
  const capabilitySnapshots = { getForAccount: vi.fn(async () => capabilitySnapshot()) };
  const entitlementSnapshots = { getForAccount: vi.fn(async () => entitlementSnapshot()) };
  const bindingSelectors = createJarvisApprovalBindingSelectors({
    catalog,
    capabilitySnapshots,
    entitlementSnapshots,
  });
  const executeRegisteredAction = vi.fn(
    async (): Promise<{ kind: 'executor_returned'; result: ActionResult }> => ({
      kind: 'executor_returned',
      result: { ok: true, summary: 'created' },
    }),
  );
  const secretHandles = {
    validate: vi.fn(async () => ({ valid: true as const })),
    resolveOnce: vi.fn(async () => 'synthetic-unit-test-value'),
  };
  const engine = createJarvisApprovalEngine({
    runs,
    approvals: approvalRepository,
    catalog,
    bindingSelectors,
    secretHandles,
    executeRegisteredAction,
    newApprovalId: () => 'jappr_1',
    now: () => now,
    canonicalizeJson: JSON.stringify,
    hashCanonicalJson: async (value) => `hash:${JSON.stringify(value)}`,
  });

  return {
    run,
    approvals,
    runs,
    approvalRepository,
    capabilitySnapshots,
    entitlementSnapshots,
    executeRegisteredAction,
    secretHandles,
    engine,
  };
}

function expectApprovalError(error: unknown, code: string): boolean {
  expect(error).toBeInstanceOf(JarvisApprovalError);
  expect((error as JarvisApprovalError).code).toBe(code);
  expect(String((error as Error).message)).not.toContain('synthetic-unit-test-value');
  return true;
}

describe('createJarvisApprovalBindingSelectors', () => {
  it('uses only the registered version and account-scoped providers', async () => {
    const catalog = createJarvisActionCatalog([registration()]);
    const capabilitySnapshots = { getForAccount: vi.fn(async () => capabilitySnapshot()) };
    const entitlementSnapshots = { getForAccount: vi.fn(async () => entitlementSnapshot()) };
    const selectors = createJarvisApprovalBindingSelectors({
      catalog,
      capabilitySnapshots,
      entitlementSnapshots,
    });
    await expect(
      selectors.deriveTargetSnapshot({
        accountId: 'account-a',
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'hello' },
      }),
    ).resolves.toEqual({ kind: 'app_resource', namespace: 'notes', resourceId: 'hello' });
    expect(capabilitySnapshots.getForAccount).toHaveBeenCalledWith('account-a');
    expect(entitlementSnapshots.getForAccount).toHaveBeenCalledWith('account-a');

    await expect(
      selectors.deriveTargetSnapshot({
        accountId: 'account-a',
        actionId: 'notes.create',
        actionVersion: 2,
        params: { title: 'hello' },
      }),
    ).rejects.toSatisfy((error: unknown) => expectApprovalError(error, 'action_version_changed'));
  });
});

describe('createJarvisApprovalEngine', () => {
  it('derives and submits one non-secret pending approval through the issued lifecycle', async () => {
    const setup = fixture();
    const putPreparedApproval = vi.fn(
      async (input): Promise<JarvisAuthorityBoundResult<JarvisApprovalV1>> => ({
        kind: 'committed',
        value: {
          id: 'jappr_1',
          runId: input.parentRun.id,
          actionId: input.actionId,
          actionVersion: input.actionVersion,
          params: input.params,
          secretHandleRefs: [...input.secretHandleRefs],
          paramsHash: `hash:${JSON.stringify(input.params)}`,
          targetSnapshot: {
            kind: 'app_resource',
            namespace: 'notes',
            resourceId: 'hello',
          },
          risk: 'confirm',
          status: 'pending',
          createdAt: now,
          schemaVersion: 1,
          requestId: 'request-1',
          attemptNumber: 1,
          capabilityId: 'capability.notes.write',
          capabilitySnapshotHash: input.parentRun.id.startsWith('jrun_') ? expect.any(String) : '',
          expectedEffect: input.expectedEffect,
          expiresAt: now + 1_000,
        } as unknown as JarvisApprovalV1,
      }),
    );
    const issued = lifecycle({ putPreparedApproval });

    const result = await setup.engine.bindIssuedLifecycle(issued).create({
      parentRun: setup.run,
      attempt: requestAttempt(),
      actionId: 'notes.create',
      actionVersion: 1,
      params: { title: ' hello ' },
      expiresAt: now + 1_000,
    });

    expect(result).toMatchObject({
      id: 'jappr_1',
      requestId: 'request-1',
      attemptNumber: 1,
      actionId: 'notes.create',
      params: { title: 'hello' },
      risk: 'confirm',
      capabilityId: 'capability.notes.write',
      expectedEffect: expectedNoteEffect,
    });
    expect(result).not.toHaveProperty('accountId');
    expect(putPreparedApproval).toHaveBeenCalledOnce();
    expect(putPreparedApproval.mock.calls[0]![0]).toMatchObject({
      parentRun: { accountId: 'account-a', id: 'jrun_1' },
      attempt: { requestId: 'request-1', attemptNumber: 1 },
      params: { title: 'hello' },
      secretHandleRefs: [],
    });
  });

  it('rejects raw secret-shaped input before lifecycle mutation', async () => {
    const setup = fixture();
    const putPreparedApproval = vi.fn();
    const capability = setup.engine.bindIssuedLifecycle(lifecycle({ putPreparedApproval }));

    await expect(
      capability.create({
        parentRun: setup.run,
        attempt: requestAttempt(),
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'sk-test-unit-secret' },
        expiresAt: now + 1_000,
      }),
    ).rejects.toSatisfy((error: unknown) => expectApprovalError(error, 'secret_value_rejected'));
    expect(putPreparedApproval).not.toHaveBeenCalled();
  });

  it('rejects undeclared authority-bearing properties at the create boundary', async () => {
    const setup = fixture();
    const putPreparedApproval = vi.fn();
    const capability = setup.engine.bindIssuedLifecycle(lifecycle({ putPreparedApproval }));

    await expect(
      capability.create({
        parentRun: setup.run,
        attempt: requestAttempt(),
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'hello' },
        expiresAt: now + 1_000,
        credentialLocator: { pluginId: 'foreign', fieldId: 'token' },
      } as never),
    ).rejects.toSatisfy((error: unknown) =>
      expectApprovalError(error, 'caller_secret_resolver_rejected'),
    );
    expect(setup.runs.getById).not.toHaveBeenCalled();
    expect(putPreparedApproval).not.toHaveBeenCalled();
  });

  it('requires executable operation authority for every required capability', async () => {
    const setup = fixture();
    setup.capabilitySnapshots.getForAccount.mockResolvedValue({
      ...capabilitySnapshot(),
      tools: [
        {
          id: 'capability.notes.write',
          state: 'available',
          operations: ['inspect'],
        },
      ],
    });
    const putPreparedApproval = vi.fn();

    await expect(
      setup.engine.bindIssuedLifecycle(lifecycle({ putPreparedApproval })).create({
        parentRun: setup.run,
        attempt: requestAttempt(),
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'hello' },
        expiresAt: now + 1_000,
      }),
    ).rejects.toSatisfy((error: unknown) => expectApprovalError(error, 'capability_changed'));
    expect(putPreparedApproval).not.toHaveBeenCalled();
  });

  it('binds human-readable expected effects to the canonical target', async () => {
    const setup = fixture();
    const prepared: Array<{ expectedEffect: string }> = [];
    const putPreparedApproval = vi.fn(async (input) => {
      prepared.push(input);
      return { kind: 'committed' as const, value: input as unknown as JarvisApprovalV1 };
    });
    const capability = setup.engine.bindIssuedLifecycle(lifecycle({ putPreparedApproval }));

    await capability.create({
      parentRun: setup.run,
      attempt: requestAttempt(),
      actionId: 'notes.create',
      actionVersion: 1,
      params: { title: 'first' },
      expiresAt: now + 1_000,
    });
    await capability.create({
      parentRun: setup.run,
      attempt: requestAttempt(),
      actionId: 'notes.create',
      actionVersion: 1,
      params: { title: 'second' },
      expiresAt: now + 1_000,
    });

    expect(prepared[0]!.expectedEffect).toContain('Create one note at the registered target.');
    expect(prepared[0]!.expectedEffect).toContain('first');
    expect(prepared[1]!.expectedEffect).toContain('second');
    expect(prepared[0]!.expectedEffect).not.toBe(prepared[1]!.expectedEffect);
  });

  it('does not forward auto-approval context or cast authority into lifecycle input', async () => {
    const setup = fixture(registration({ risk: 'read-only', approval: 'never' }));
    const claimAutoApprovedExecution = vi.fn(async () => ({
      kind: 'account_authority_revoked' as const,
    }));
    const capability = setup.engine.bindIssuedLifecycle(
      lifecycle({ claimAutoApprovedExecution }),
    );

    await expect(
      capability.executeAutoApprovedSafe({
        parentRun: setup.run,
        attempt: requestAttempt(),
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'hello' },
        expiresAt: now + 1_000,
        context: {
          source: 'ai',
          authorizationProof: { trusted: true },
        },
      } as never),
    ).rejects.toSatisfy((error: unknown) =>
      expectApprovalError(error, 'caller_secret_resolver_rejected'),
    );
    expect(setup.runs.getById).not.toHaveBeenCalled();
    expect(claimAutoApprovedExecution).not.toHaveBeenCalled();

    await expect(
      capability.executeAutoApprovedSafe({
        parentRun: setup.run,
        attempt: requestAttempt(),
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'hello' },
        expiresAt: now + 1_000,
        context: { source: 'ai', chatId: 'chat-1' },
      }),
    ).rejects.toThrow(/authority|revoked/i);
    expect(claimAutoApprovedExecution).toHaveBeenCalledOnce();
    expect(claimAutoApprovedExecution.mock.calls[0]![0].approval).not.toHaveProperty('context');
  });

  it('fails closed when the current run or lifecycle binding differs', async () => {
    const setup = fixture();
    const foreign = lifecycle({ accountId: 'account-b' });

    await expect(
      setup.engine.bindIssuedLifecycle(foreign).create({
        parentRun: setup.run,
        attempt: requestAttempt(),
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'hello' },
        expiresAt: now + 1_000,
      }),
    ).rejects.toSatisfy((error: unknown) => expectApprovalError(error, 'run_scope_mismatch'));
  });

  it('revokes a capability immediately when a frozen issued lifecycle is disposed', async () => {
    const setup = fixture();
    const putPreparedApproval = vi.fn(async (input) => ({
      kind: 'committed' as const,
      value: input as unknown as JarvisApprovalV1,
    }));
    const issued = Object.freeze(lifecycle({ putPreparedApproval }));
    const capability = setup.engine.bindIssuedLifecycle(issued);

    issued.dispose();

    await expect(
      capability.create({
        parentRun: setup.run,
        attempt: requestAttempt(),
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'hello' },
        expiresAt: now + 1_000,
      }),
    ).rejects.toThrow(/authority|revoked/i);
    expect(setup.runs.getById).not.toHaveBeenCalled();
    expect(putPreparedApproval).not.toHaveBeenCalled();
  });

  it('claims before dispatch, records immutable result evidence, and disposes the execution', async () => {
    const setup = fixture();
    const sequence: string[] = [];
    const approval: JarvisApprovalV1 = {
      id: 'jappr_1',
      runId: setup.run.id,
      actionId: 'notes.create',
      actionVersion: 1,
      params: { title: 'hello' },
      secretHandleRefs: [],
      paramsHash: 'hash:{"title":"hello"}',
      targetSnapshot: { kind: 'app_resource', namespace: 'notes', resourceId: 'hello' },
      risk: 'confirm',
      status: 'approved',
      createdAt: now - 100,
      decidedAt: now - 50,
      schemaVersion: 1,
      requestId: 'request-1',
      attemptNumber: 1,
      capabilityId: 'capability.notes.write',
      capabilitySnapshotHash: '',
      expectedEffect: expectedNoteEffect,
      expiresAt: now + 1_000,
    };
    setup.approvals.set(approval.id, approval);

    const recordResult = vi.fn(async () => {
      sequence.push('record-result');
      return { kind: 'committed' as const, value: {} as never };
    });
    const execution: JarvisIssuedActionExecution = {
      approval,
      producerKind: 'action',
      ownerId: 'approval:jappr_1',
      startEvent: {} as never,
      initialLiveProof: {} as never,
      [jarvisIssuedActionExecutionBrand]: true,
      beginExternalEffect: vi.fn(),
      transferTerminalOwnership: vi.fn(),
      recordResult,
      recordCancellationVerified: vi.fn(),
      requestCancellation: vi.fn(),
      dispose: vi.fn(() => sequence.push('dispose')),
    };
    setup.executeRegisteredAction.mockImplementation(async () => {
      sequence.push('dispatch');
      return { kind: 'executor_returned', result: { ok: true, summary: 'created' } };
    });
    const claimApprovedExecution = vi.fn(async () => {
      sequence.push('claim');
      return { kind: 'committed' as const, value: execution };
    });
    const issued = lifecycle({ claimApprovedExecution });

    // First obtain the exact canonical authorization hash produced by creation.
    const probePut = vi.fn(async (input) => {
      approval.capabilitySnapshotHash = String(input.capabilitySnapshotHash);
      return { kind: 'committed' as const, value: approval };
    });
    await setup.engine.bindIssuedLifecycle(lifecycle({ putPreparedApproval: probePut })).create({
      parentRun: setup.run,
      attempt: requestAttempt(),
      actionId: 'notes.create',
      actionVersion: 1,
      params: { title: 'hello' },
      expiresAt: approval.expiresAt,
    });

    const capability = setup.engine.bindIssuedLifecycle(issued);
    await expect(
      capability.execute({
        parentRun: setup.run,
        approvalId: approval.id,
        context: {
          source: 'ai',
          alternateCredentialResolver: () => 'synthetic-unit-test-value',
        },
      } as never),
    ).rejects.toSatisfy((error: unknown) =>
      expectApprovalError(error, 'caller_secret_resolver_rejected'),
    );
    expect(claimApprovedExecution).not.toHaveBeenCalled();

    setup.capabilitySnapshots.getForAccount.mockResolvedValue({
      ...capabilitySnapshot(),
      tools: [
        {
          id: 'capability.notes.write',
          state: 'available',
          operations: ['inspect'],
        },
      ],
    });
    await expect(
      capability.execute({
        parentRun: setup.run,
        approvalId: approval.id,
        context: { source: 'ai' },
      }),
    ).rejects.toSatisfy((error: unknown) => expectApprovalError(error, 'capability_changed'));
    expect(claimApprovedExecution).not.toHaveBeenCalled();
    setup.capabilitySnapshots.getForAccount.mockResolvedValue(capabilitySnapshot());

    const result = await capability.execute({
      parentRun: setup.run,
      approvalId: approval.id,
      context: { source: 'ai' },
    });

    expect(result).toEqual({ kind: 'settled', result: { ok: true, summary: 'created' } });
    expect(sequence).toEqual(['claim', 'dispatch', 'record-result', 'dispose']);
    expect(setup.secretHandles.resolveOnce).not.toHaveBeenCalled();
    expect(claimApprovedExecution).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: approval.id, producerKind: 'action' }),
    );
  });

  it('does not dispatch when the issued lifecycle revokes the claim', async () => {
    const setup = fixture();
    const approval = {
      id: 'jappr_1',
      runId: setup.run.id,
      actionId: 'notes.create',
      actionVersion: 1,
      params: { title: 'hello' },
      secretHandleRefs: [],
      paramsHash: 'hash:{"title":"hello"}',
      targetSnapshot: { kind: 'app_resource', namespace: 'notes', resourceId: 'hello' },
      risk: 'confirm',
      status: 'approved',
      createdAt: now - 100,
      decidedAt: now - 50,
      schemaVersion: 1,
      requestId: 'request-1',
      attemptNumber: 1,
      capabilityId: 'capability.notes.write',
      capabilitySnapshotHash: '',
      expectedEffect: expectedNoteEffect,
      expiresAt: now + 1_000,
    } as JarvisApprovalV1;
    setup.approvals.set(approval.id, approval);

    const probePut = vi.fn(async (input) => {
      approval.capabilitySnapshotHash = String(input.capabilitySnapshotHash);
      return { kind: 'committed' as const, value: approval };
    });
    await setup.engine.bindIssuedLifecycle(lifecycle({ putPreparedApproval: probePut })).create({
      parentRun: setup.run,
      attempt: requestAttempt(),
      actionId: 'notes.create',
      actionVersion: 1,
      params: { title: 'hello' },
      expiresAt: approval.expiresAt,
    });

    await expect(
      setup.engine
        .bindIssuedLifecycle(
          lifecycle({
            claimApprovedExecution: vi.fn(async () => ({
              kind: 'account_authority_revoked' as const,
            })),
          }),
        )
        .execute({
          parentRun: setup.run,
          approvalId: approval.id,
          context: { source: 'ai' },
        }),
    ).rejects.toThrow(/authority/i);
    expect(setup.executeRegisteredAction).not.toHaveBeenCalled();
  });

  it('recovery verifies the same current run, registration, target, and authority binding', async () => {
    const setup = fixture();
    const putPreparedApproval = vi.fn(async (prepared) => {
      const approval = {
        id: prepared.approvalId,
        runId: prepared.parentRun.id,
        actionId: prepared.actionId,
        actionVersion: prepared.actionVersion,
        params: prepared.params,
        secretHandleRefs: prepared.secretHandleRefs,
        paramsHash: prepared.paramsHash,
        targetSnapshot: prepared.targetSnapshot,
        risk: prepared.risk,
        status: 'pending',
        createdAt: prepared.createdAt,
        schemaVersion: 1,
        requestId: prepared.attempt.requestId,
        attemptNumber: prepared.attempt.attemptNumber,
        capabilityId: prepared.capabilityId,
        capabilitySnapshotHash: prepared.capabilitySnapshotHash,
        expectedEffect: prepared.expectedEffect,
        expiresAt: prepared.expiresAt,
      } as JarvisApprovalV1;
      setup.approvals.set(approval.id, approval);
      return { kind: 'committed' as const, value: approval };
    });
    const approval = await setup.engine
      .bindIssuedLifecycle(lifecycle({ putPreparedApproval }))
      .create({
        parentRun: setup.run,
        attempt: requestAttempt(),
        actionId: 'notes.create',
        actionVersion: 1,
        params: { title: 'hello' },
        expiresAt: now + 1_000,
      });
    setup.run.status = 'awaiting_approval';
    setup.run.transportAttempts = [
      {
        schemaVersion: 1,
        attemptNumber: 1,
        kind: 'initial',
        requestId: 'request-1',
        state: 'provider_in_flight',
        startedEventSeq: 1,
        effectBarrier: { state: 'dirty', version: 1, updatedAt: now - 10 },
        createdAt: now - 100,
        updatedAt: now - 10,
      },
    ];
    const events = [
      {
        runId: setup.run.id,
        seq: 2,
        idempotencyKey: approval.id,
        type: 'approval' as const,
        status: 'pending',
        title: 'Approval required',
        safeSummary: 'Review the registered action before it runs.',
        sourceRefs: [],
        artifactIds: [],
        createdAt: now - 10,
      },
    ];

    await expect(
      setup.engine.recoveryVerifier.verifyPendingApproval({
        accountId: 'account-a',
        run: structuredClone(setup.run),
        events,
      }),
    ).resolves.toEqual({ valid: true, approvalId: approval.id });

    setup.capabilitySnapshots.getForAccount.mockResolvedValue({
      ...capabilitySnapshot(),
      tools: [
        {
          id: 'capability.notes.write',
          state: 'available',
          operations: ['inspect'],
        },
      ],
    });
    const decidePreparedApproval = vi.fn();
    await expect(
      setup.engine.bindIssuedLifecycle(lifecycle({ decidePreparedApproval })).decide({
        parentRun: setup.run,
        approvalId: approval.id,
        decision: 'approve',
      }),
    ).rejects.toSatisfy((error: unknown) => expectApprovalError(error, 'capability_changed'));
    expect(decidePreparedApproval).not.toHaveBeenCalled();
    await expect(
      setup.engine.recoveryVerifier.verifyPendingApproval({
        accountId: 'account-a',
        run: structuredClone(setup.run),
        events,
      }),
    ).resolves.toEqual({ valid: false, reason: 'approval_binding_mismatch' });
    setup.capabilitySnapshots.getForAccount.mockResolvedValue(capabilitySnapshot());

    const currentAttempts = setup.run.transportAttempts;
    setup.run.transportAttempts = undefined;
    await expect(
      setup.engine.recoveryVerifier.verifyPendingApproval({
        accountId: 'account-a',
        run: structuredClone(setup.run),
        events,
      }),
    ).resolves.toEqual({ valid: false, reason: 'approval_binding_mismatch' });
    setup.run.transportAttempts = currentAttempts;

    await expect(
      setup.engine.recoveryVerifier.verifyPendingApproval({
        accountId: 'account-a',
        run: structuredClone(setup.run),
        events: events.map((event) => ({ ...event, runId: 'jrun_foreign' })),
      }),
    ).resolves.toEqual({ valid: false, reason: 'approval_missing' });

    approval.targetSnapshot = {
      kind: 'app_resource',
      namespace: 'notes',
      resourceId: 'different',
    };
    await expect(
      setup.engine.recoveryVerifier.verifyPendingApproval({
        accountId: 'account-a',
        run: structuredClone(setup.run),
        events,
      }),
    ).resolves.toEqual({ valid: false, reason: 'approval_binding_mismatch' });
  });
});
