import { describe, expect, it, vi } from 'vitest';

import type {
  ContextGatewayRequest,
  ContextReceipt,
  ExecutionIdentity,
  PreparedContextTurn,
} from '@/features/context/gateway/contextGatewayContracts';
import { ChatGptAdeAdapter, type ChatGptAdeAdapterDependencies } from './ChatGptAdeAdapter';
import type { ChatGptAdeRunRequest } from './adeContracts';

const scope = Object.freeze({
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
  worktreeId: 'worktree-a',
  revision: 'revision-a',
});

const identity: Readonly<ExecutionIdentity> = Object.freeze({
  transportConnectionId: 'connection-a',
  transportAdapterId: 'opencode',
  upstreamProviderId: 'openai',
  upstreamModelId: 'gpt-5.6-luna',
  providerQualifiedModelId: 'openai/gpt-5.6-luna',
  authBillingRoute: 'chatgpt-subscription',
  effort: 'max',
  fastVariant: 'fast',
  catalogRevision: 'catalog-a',
});

function receipt(overrides: Partial<ContextReceipt> = {}): Readonly<ContextReceipt> {
  return Object.freeze({
    receiptId: 'receipt-a',
    policyVersion: 'vibespace-context-policy-v1',
    route: 'focused',
    decision: 'required-focused',
    required: true,
    decisionReasons: Object.freeze(['write-capable'] as const),
    scopeRevision: scope,
    sourceRevisions: Object.freeze([
      Object.freeze({ sourceId: 'context-map', revision: 'source-revision-a' }),
    ]),
    evidenceHandles: Object.freeze(['secret-handle-a']),
    cacheStatus: 'miss',
    queueDepthAtStart: 0,
    stageTimingsMs: Object.freeze({ retrieval: 12 }),
    cancellationGeneration: 0,
    safeFailure: null,
    executionIdentity: identity,
    ...overrides,
  });
}

function turn(overrides: Partial<PreparedContextTurn> = {}): Readonly<PreparedContextTurn> {
  return Object.freeze({
    promptBlock: '<vibespace-context>grounded evidence</vibespace-context>',
    receipt: receipt(),
    ...overrides,
  });
}

function request(overrides: Partial<ChatGptAdeRunRequest> = {}): ChatGptAdeRunRequest {
  return {
    runId: 'ade-run-a',
    requestId: 'ade-request-a',
    selectedHarness: 'chatgpt',
    instruction: 'Update the project safely.',
    taskKind: 'write',
    access: 'write',
    workingSet: 'incomplete',
    scope,
    executionIdentity: identity,
    performance: 'quality',
    optionalEnrichmentEnabled: true,
    ...overrides,
  };
}

function dependencies(
  prepared: Readonly<PreparedContextTurn> = turn(),
): ChatGptAdeAdapterDependencies & {
  prepareTurn: ReturnType<typeof vi.fn>;
  verifyRequiredReceipt: ReturnType<typeof vi.fn>;
  cancelContext: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
  cancelDispatch: ReturnType<typeof vi.fn>;
  authorizeTerminalSpy: ReturnType<typeof vi.fn>;
  registerTerminalCancellation: ReturnType<typeof vi.fn>;
  recordEvent: ReturnType<typeof vi.fn>;
} {
  const prepareTurn = vi.fn(async (_input: Readonly<ContextGatewayRequest>) => prepared);
  const verifyRequiredReceipt = vi.fn(() => prepared.receipt);
  const cancelContext = vi.fn();
  const dispatch = vi.fn(async () => ({
    output: 'Completed safely.',
    observedExecutionIdentity: identity,
    observedScope: scope,
  }));
  const cancelDispatch = vi.fn();
  const authorizeTerminal = vi.fn(() => null);
  const registerTerminalCancellation = vi.fn(() => vi.fn());
  const recordEvent = vi.fn();
  return {
    gateway: {
      prepareTurn,
      verifyRequiredReceipt,
      cancel: cancelContext,
    },
    dispatcher: { dispatch, cancel: cancelDispatch },
    authorizeTerminalSpy: authorizeTerminal,
    registerTerminalCancellation,
    recordEvent,
    now: () => 1_725_000_000_000,
    prepareTurn,
    verifyRequiredReceipt,
    cancelContext,
    dispatch,
    cancelDispatch,
    authorizeTerminal,
  };
}

describe('ChatGptAdeAdapter', () => {
  it('uses the shared Gateway, verifies required context, and preserves exact dispatch identity', async () => {
    const deps = dependencies();
    const adapter = new ChatGptAdeAdapter(deps);

    const result = await adapter.run(request());

    expect(deps.prepareTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'ade-request-a',
        question: 'Update the project safely.',
        scope,
        executionIdentity: identity,
        taskKind: 'write',
      }),
    );
    expect(deps.verifyRequiredReceipt).toHaveBeenCalledWith({
      receiptId: 'receipt-a',
      requestId: 'ade-request-a',
      scope,
      minimumRoute: 'focused',
    });
    expect(deps.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'ade-run-a',
        selectedHarness: 'chatgpt',
        instruction: 'Update the project safely.',
        contextPromptBlock: '<vibespace-context>grounded evidence</vibespace-context>',
        executionIdentity: identity,
      }),
    );
    expect(result.status).toBe('completed');
    expect(result.executionIdentity).toEqual(identity);
    expect(result.context).toMatchObject({
      receiptId: 'receipt-a',
      route: 'focused',
      status: 'ready',
      sources: [{ sourceId: 'context-map', revision: 'source-revision-a' }],
    });
    expect(JSON.stringify(result)).not.toContain('secret-handle-a');
    expect(JSON.stringify(result)).not.toContain('grounded evidence');
  });

  it('fails closed before a write-capable dispatch when the required receipt is invalid', async () => {
    const deps = dependencies();
    deps.verifyRequiredReceipt.mockReturnValue(null);
    const adapter = new ChatGptAdeAdapter(deps);

    const result = await adapter.run(request());

    expect(result.status).toBe('blocked');
    expect(result.safeFailure).toBe('required-context-invalid');
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('rejects a completion whose observed provider/model identity differs from selection', async () => {
    const deps = dependencies();
    deps.dispatch.mockResolvedValue({
      output: 'wrong route',
      observedExecutionIdentity: { ...identity, upstreamModelId: 'gpt-5.6-sol' },
      observedScope: scope,
    });
    const adapter = new ChatGptAdeAdapter(deps);

    const result = await adapter.run(request());

    expect(result.status).toBe('failed');
    expect(result.safeFailure).toBe('execution-identity-mismatch');
    expect(result.output).toBeNull();
  });

  it('rejects a completion observed outside the selected project/worktree revision', async () => {
    const deps = dependencies();
    deps.dispatch.mockResolvedValue({
      output: 'wrong scope',
      observedExecutionIdentity: identity,
      observedScope: { ...scope, worktreeId: 'worktree-other' },
    });
    const adapter = new ChatGptAdeAdapter(deps);

    const result = await adapter.run(request());

    expect(result.status).toBe('failed');
    expect(result.safeFailure).toBe('context-scope-mismatch');
    expect(result.output).toBeNull();
  });

  it('rejects an optional direct receipt issued for another scope before dispatch', async () => {
    const deps = dependencies(
      turn({
        receipt: receipt({
          route: 'direct',
          decision: 'optional-direct',
          required: false,
          decisionReasons: Object.freeze(['ordinary-known-work']),
          scopeRevision: { ...scope, projectId: 'project-other' },
          sourceRevisions: Object.freeze([]),
          evidenceHandles: Object.freeze([]),
          cacheStatus: 'not-applicable',
        }),
        promptBlock: '',
      }),
    );
    const adapter = new ChatGptAdeAdapter(deps);

    const result = await adapter.run(
      request({ taskKind: 'answer', access: 'read', workingSet: 'complete' }),
    );

    expect(result.status).toBe('failed');
    expect(result.safeFailure).toBe('context-scope-mismatch');
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('accepts only an exact same-scope terminal link within its access ceiling', async () => {
    const deps = dependencies();
    deps.authorizeTerminalSpy.mockReturnValue({
      identityId: 'terminal-identity-a',
      terminalSessionId: 'terminal-session-a',
      paneId: 'pane-a',
      accountId: scope.accountId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      worktreeId: scope.worktreeId,
      access: 'write',
      runGeneration: 3,
    });
    const adapter = new ChatGptAdeAdapter(deps);

    const result = await adapter.run(
      request({
        terminalLink: {
          identityId: 'terminal-identity-a',
          terminalSessionId: 'terminal-session-a',
          paneId: 'pane-a',
        },
      }),
    );

    expect(deps.authorizeTerminalSpy).toHaveBeenCalledWith({
      identityId: 'terminal-identity-a',
      terminalSessionId: 'terminal-session-a',
      paneId: 'pane-a',
      projectId: scope.projectId,
    });
    expect(result.terminalLink).toEqual({
      terminalSessionId: 'terminal-session-a',
      paneId: 'pane-a',
      runGeneration: 3,
    });
    expect(deps.registerTerminalCancellation).toHaveBeenCalledWith(
      'terminal-identity-a',
      'ade-request-a',
      expect.any(Function),
    );
  });

  it('blocks cross-scope or under-privileged terminal links before context or dispatch', async () => {
    const deps = dependencies();
    deps.authorizeTerminalSpy.mockReturnValue({
      identityId: 'terminal-identity-a',
      terminalSessionId: 'terminal-session-a',
      paneId: 'pane-a',
      accountId: scope.accountId,
      workspaceId: scope.workspaceId,
      projectId: 'project-other',
      worktreeId: scope.worktreeId,
      access: 'read',
      runGeneration: 3,
    });
    const adapter = new ChatGptAdeAdapter(deps);

    const result = await adapter.run(
      request({
        terminalLink: {
          identityId: 'terminal-identity-a',
          terminalSessionId: 'terminal-session-a',
          paneId: 'pane-a',
        },
      }),
    );

    expect(result.status).toBe('blocked');
    expect(result.safeFailure).toBe('terminal-link-unauthorized');
    expect(deps.prepareTurn).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('cancels Gateway and dispatcher work and rejects late completion', async () => {
    let resolveDispatch!: (value: {
      output: string;
      observedExecutionIdentity: Readonly<ExecutionIdentity>;
    }) => void;
    const deps = dependencies();
    deps.dispatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDispatch = resolve;
        }),
    );
    const adapter = new ChatGptAdeAdapter(deps);
    const pending = adapter.run(request());
    await vi.waitFor(() => expect(deps.dispatch).toHaveBeenCalledTimes(1));

    expect(adapter.cancel('ade-run-a')).toBe(true);
    resolveDispatch({ output: 'late output', observedExecutionIdentity: identity });
    const result = await pending;

    expect(deps.cancelContext).toHaveBeenCalledWith('ade-request-a');
    expect(deps.cancelDispatch).toHaveBeenCalledWith('ade-run-a');
    expect(result.status).toBe('cancelled');
    expect(result.output).toBeNull();
    expect(deps.recordEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'completed' }),
    );
  });

  it('rejects a duplicate active run ID without replacing the original lifecycle', async () => {
    let resolveDispatch!: (value: {
      output: string;
      observedExecutionIdentity: Readonly<ExecutionIdentity>;
    }) => void;
    const deps = dependencies();
    deps.dispatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDispatch = resolve;
        }),
    );
    const adapter = new ChatGptAdeAdapter(deps);
    const first = adapter.run(request());
    await vi.waitFor(() => expect(deps.dispatch).toHaveBeenCalledTimes(1));

    await expect(adapter.run(request())).rejects.toThrow('ade_run_conflict');
    expect(adapter.getRun('ade-run-a')?.status).toBe('dispatching');

    adapter.cancel('ade-run-a');
    resolveDispatch({ output: 'late output', observedExecutionIdentity: identity });
    expect((await first).status).toBe('cancelled');
  });

  it('never reuses a published run ID for a second context or model dispatch', async () => {
    const deps = dependencies();
    const adapter = new ChatGptAdeAdapter(deps);
    expect((await adapter.run(request())).status).toBe('completed');

    await expect(adapter.run(request({ requestId: 'ade-request-replay' }))).rejects.toThrow(
      'ade_run_conflict',
    );

    expect(deps.prepareTurn).toHaveBeenCalledTimes(1);
    expect(deps.dispatch).toHaveBeenCalledTimes(1);
    expect(adapter.getRun('ade-run-a')).toMatchObject({
      requestId: 'ade-request-a',
      status: 'completed',
    });
  });

  it('streams safe run snapshots to ADE UI subscribers and replays only current state', async () => {
    const deps = dependencies();
    const adapter = new ChatGptAdeAdapter(deps);
    const statuses: string[] = [];
    const unsubscribe = adapter.subscribe('ade-run-a', (snapshot) => {
      statuses.push(snapshot.status);
      if (snapshot.status === 'dispatching') throw new Error('broken UI listener');
    });

    const result = await adapter.run(request());
    expect(result.status).toBe('completed');
    expect(statuses).toEqual(['preparing-context', 'dispatching', 'completed']);
    unsubscribe();

    const replayed: string[] = [];
    adapter.subscribe('ade-run-a', (snapshot) => replayed.push(snapshot.status))();
    expect(replayed).toEqual(['completed']);
  });
});
