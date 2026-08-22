import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ContextReceipt,
  ExecutionIdentity,
  PreparedContextTurn,
} from '@/features/context/gateway/contextGatewayContracts';
import {
  bindTerminalContextBridgeIdentity,
  mintTerminalContextBridgeIdentity,
  resetTerminalContextBridgeIdentitiesForTests,
  revokeTerminalContextBridgeIdentity,
} from '@/features/terminals/terminalContextBridgeIdentity';
import { createProductionChatGptAdeAdapter } from './productionChatGptAde';

const now = 1_725_000_000_000;
const scope = Object.freeze({
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
  worktreeId: 'worktree-a',
  revision: 'revision-a',
});
const executionIdentity: Readonly<ExecutionIdentity> = Object.freeze({
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

function preparedTurn(): Readonly<PreparedContextTurn> {
  const receipt: Readonly<ContextReceipt> = Object.freeze({
    receiptId: 'receipt-a',
    policyVersion: 'vibespace-context-policy-v1',
    route: 'focused',
    decision: 'required-focused',
    required: true,
    decisionReasons: Object.freeze(['write-capable'] as const),
    scopeRevision: scope,
    sourceRevisions: Object.freeze([]),
    evidenceHandles: Object.freeze([]),
    cacheStatus: 'miss',
    queueDepthAtStart: 0,
    stageTimingsMs: Object.freeze({ retrieval: 1 }),
    cancellationGeneration: 0,
    safeFailure: null,
    executionIdentity,
  });
  return Object.freeze({ promptBlock: 'safe context', receipt });
}

afterEach(() => resetTerminalContextBridgeIdentitiesForTests());

describe('createProductionChatGptAdeAdapter', () => {
  it('reuses the app-minted terminal authority and the supplied shared Gateway', async () => {
    const minted = mintTerminalContextBridgeIdentity(
      {
        accountId: scope.accountId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        worktreeId: scope.worktreeId,
        paneId: 'pane-a',
        access: 'write',
      },
      { now: () => now, createId: () => 'terminal-identity-a' },
    );
    bindTerminalContextBridgeIdentity(
      minted.identityId,
      { terminalSessionId: 'terminal-session-a', paneId: 'pane-a', projectId: scope.projectId },
      now,
    );
    const prepared = preparedTurn();
    const gateway = {
      prepareTurn: vi.fn(async () => prepared),
      verifyRequiredReceipt: vi.fn(() => prepared.receipt),
      cancel: vi.fn(),
    };
    const dispatch = vi.fn(async () => ({
      output: 'done',
      observedExecutionIdentity: executionIdentity,
    }));
    const adapter = createProductionChatGptAdeAdapter({
      gateway,
      dispatcher: { dispatch, cancel: vi.fn() },
      recordEvent: vi.fn(),
      now: () => now,
    });

    const result = await adapter.run({
      runId: 'ade-run-a',
      requestId: 'ade-request-a',
      selectedHarness: 'chatgpt',
      instruction: 'Write a safe change.',
      taskKind: 'write',
      access: 'write',
      workingSet: 'incomplete',
      scope,
      executionIdentity,
      performance: 'quality',
      optionalEnrichmentEnabled: true,
      terminalLink: {
        identityId: minted.identityId,
        terminalSessionId: 'terminal-session-a',
        paneId: 'pane-a',
      },
    });

    expect(result.status).toBe('completed');
    expect(result.terminalLink).toEqual({
      terminalSessionId: 'terminal-session-a',
      paneId: 'pane-a',
      runGeneration: 0,
    });
    expect(gateway.prepareTurn).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a terminal identity was revoked before the ADE run', async () => {
    const prepared = preparedTurn();
    const gateway = {
      prepareTurn: vi.fn(async () => prepared),
      verifyRequiredReceipt: vi.fn(() => prepared.receipt),
      cancel: vi.fn(),
    };
    const dispatch = vi.fn();
    const adapter = createProductionChatGptAdeAdapter({
      gateway,
      dispatcher: { dispatch, cancel: vi.fn() },
      recordEvent: vi.fn(),
      now: () => now,
    });

    const result = await adapter.run({
      runId: 'ade-run-a',
      requestId: 'ade-request-a',
      selectedHarness: 'chatgpt',
      instruction: 'Write a safe change.',
      taskKind: 'write',
      access: 'write',
      workingSet: 'incomplete',
      scope,
      executionIdentity,
      performance: 'quality',
      optionalEnrichmentEnabled: true,
      terminalLink: {
        identityId: 'revoked-terminal-identity',
        terminalSessionId: 'terminal-session-a',
        paneId: 'pane-a',
      },
    });

    expect(result.status).toBe('blocked');
    expect(result.safeFailure).toBe('terminal-link-unauthorized');
    expect(gateway.prepareTurn).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('cancels context and dispatch when the linked terminal identity is revoked', async () => {
    const minted = mintTerminalContextBridgeIdentity(
      {
        accountId: scope.accountId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        worktreeId: scope.worktreeId,
        paneId: 'pane-a',
        access: 'write',
      },
      { now: () => now, createId: () => 'terminal-identity-a' },
    );
    bindTerminalContextBridgeIdentity(
      minted.identityId,
      { terminalSessionId: 'terminal-session-a', paneId: 'pane-a', projectId: scope.projectId },
      now,
    );
    const prepared = preparedTurn();
    const gateway = {
      prepareTurn: vi.fn(async () => prepared),
      verifyRequiredReceipt: vi.fn(() => prepared.receipt),
      cancel: vi.fn(),
    };
    let resolveDispatch!: (value: {
      output: string;
      observedExecutionIdentity: Readonly<ExecutionIdentity>;
    }) => void;
    const dispatch = vi.fn(
      () =>
        new Promise<{
          output: string;
          observedExecutionIdentity: Readonly<ExecutionIdentity>;
        }>((resolve) => {
          resolveDispatch = resolve;
        }),
    );
    const cancelDispatch = vi.fn();
    const adapter = createProductionChatGptAdeAdapter({
      gateway,
      dispatcher: { dispatch, cancel: cancelDispatch },
      recordEvent: vi.fn(),
      now: () => now,
    });
    const pending = adapter.run({
      runId: 'ade-run-a',
      requestId: 'ade-request-a',
      selectedHarness: 'chatgpt',
      instruction: 'Write a safe change.',
      taskKind: 'write',
      access: 'write',
      workingSet: 'incomplete',
      scope,
      executionIdentity,
      performance: 'quality',
      optionalEnrichmentEnabled: true,
      terminalLink: {
        identityId: minted.identityId,
        terminalSessionId: 'terminal-session-a',
        paneId: 'pane-a',
      },
    });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));

    revokeTerminalContextBridgeIdentity(minted.identityId);
    resolveDispatch({ output: 'late output', observedExecutionIdentity: executionIdentity });
    const result = await pending;

    expect(gateway.cancel).toHaveBeenCalledWith('ade-request-a');
    expect(cancelDispatch).toHaveBeenCalledWith('ade-run-a');
    expect(result.status).toBe('cancelled');
    expect(result.output).toBeNull();
  });
});
