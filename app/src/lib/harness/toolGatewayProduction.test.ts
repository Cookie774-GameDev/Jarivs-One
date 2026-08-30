import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTerminalTranscriptStore } from '@/features/terminals/transcriptStore';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { usePluginStore } from '@/features/plugins';
import * as mcpGatewayModule from '@/lib/mcp/vibeSpaceGateway';
import type { ProjectId, WorkspaceId } from '@/types/common';
import {
  clearToolGatewayMutationGrants,
  consumeToolGatewayContextCitationItems,
  createProductionToolGatewayDependencies,
  grantNextToolGatewayMutation,
  grantToolGatewayMutation,
  installToolGatewayRlmContextPort,
  installToolGatewayPluginReadPort,
} from './toolGatewayProduction';
import {
  bindToolGatewayObservedExecutionAuthority,
  bindToolGatewaySessionAuthority,
  captureToolGatewayAuthorityClaim,
} from './toolGatewayAuthority';
import { parseToolGatewayRequest } from './toolGatewayProtocol';
import { productionContextGateway } from '@/features/context/gateway/productionContextGateway';

const observedIdentity = Object.freeze({
  transportConnectionId: 'opencode-cli',
  transportAdapterId: 'opencode-persistent',
  upstreamProviderId: 'opencode-go',
  upstreamModelId: 'deepseek-v4-flash-vision-exp',
  providerQualifiedModelId: 'opencode-go/deepseek-v4-flash-vision-exp',
  authBillingRoute: 'opencode-provider-session',
  effort: 'high',
  fastVariant: 'standard',
  catalogRevision: 'catalog-verified-7',
  observedProviderIdentity: 'opencode-go/deepseek-v4-flash-vision-exp',
});

function mutation() {
  return parseToolGatewayRequest({
    protocolVersion: 1,
    requestId: 'request-1',
    sessionId: 'session-1',
    messageId: 'message-1',
    tool: 'app.navigate',
    args: { route: '/terminal' },
    directory: 'C:\\work\\project',
  });
}

describe('production tool gateway dependencies', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearToolGatewayMutationGrants();
    usePluginStore.setState({
      connectionsByAccount: {
        'account-a': {
          github: {
            accountId: 'account-a',
            pluginId: 'github',
            state: 'connected',
            enabled: true,
            enabledProjectIds: ['project-a'],
            configuredFields: [],
            updatedAt: 1,
          },
        },
      },
    });
    useAuthStore.setState({
      localUserId: 'account-a',
      cloudSession: null,
      workspaceId: 'workspace-a' as WorkspaceId,
      projectId: 'project-a' as ProjectId,
    });
    const authority = captureToolGatewayAuthorityClaim()!;
    bindToolGatewaySessionAuthority('session-1', authority);
    bindToolGatewaySessionAuthority('different-session', authority);
  });

  it('consumes an exact short-lived session grant once', async () => {
    const deps = createProductionToolGatewayDependencies();
    await expect(Promise.resolve(deps.authorizeMutation(mutation()))).resolves.toBe(false);
    grantNextToolGatewayMutation('different-session');
    await expect(Promise.resolve(deps.authorizeMutation(mutation()))).resolves.toBe(false);
    grantNextToolGatewayMutation('session-1');
    await expect(Promise.resolve(deps.authorizeMutation(mutation()))).resolves.toBe(true);
    await expect(Promise.resolve(deps.authorizeMutation(mutation()))).resolves.toBe(false);
  });

  it('binds once and always grants to the exact semantic capability', async () => {
    const deps = createProductionToolGatewayDependencies();
    const navigation = mutation();
    const terminalWrite = parseToolGatewayRequest({
      ...navigation,
      requestId: 'request-2',
      tool: 'terminal.write',
      args: { terminal: 4, command: 'git status' },
    });

    grantToolGatewayMutation('session-1', 'app.navigate', 'once');
    await expect(Promise.resolve(deps.authorizeMutation(terminalWrite))).resolves.toBe(false);
    await expect(Promise.resolve(deps.authorizeMutation(navigation))).resolves.toBe(true);
    await expect(Promise.resolve(deps.authorizeMutation(navigation))).resolves.toBe(false);

    grantToolGatewayMutation('session-1', 'app.navigate', 'always');
    await expect(Promise.resolve(deps.authorizeMutation(navigation))).resolves.toBe(true);
    await expect(Promise.resolve(deps.authorizeMutation(navigation))).resolves.toBe(true);
  });

  it.each([
    ['account', () => useAuthStore.setState({ localUserId: 'account-b' })],
    ['workspace', () => useAuthStore.setState({ workspaceId: 'workspace-b' as WorkspaceId })],
    ['project', () => useAuthStore.setState({ projectId: 'project-b' as ProjectId })],
  ])('revokes an approval when the %s authority changes', async (_label, transition) => {
    const deps = createProductionToolGatewayDependencies();
    const navigation = mutation();

    grantToolGatewayMutation('session-1', 'app.navigate', 'always');
    await expect(Promise.resolve(deps.authorizeMutation(navigation))).resolves.toBe(true);

    transition();
    await expect(Promise.resolve(deps.authorizeMutation(navigation))).resolves.toBe(false);
  });

  it('binds reads to one scope and rejects the session after a scope transition', async () => {
    const deps = createProductionToolGatewayDependencies();
    const read = parseToolGatewayRequest({
      ...mutation(),
      requestId: 'request-read',
      tool: 'app.getState',
      args: {},
    });

    await expect(Promise.resolve(deps.authorizeRequest(read))).resolves.toBe(true);
    useAuthStore.setState({ workspaceId: 'workspace-b' as WorkspaceId });
    await expect(Promise.resolve(deps.authorizeRequest(read))).resolves.toBe(false);
    useAuthStore.setState({ workspaceId: 'workspace-a' as WorkspaceId });
    await expect(Promise.resolve(deps.authorizeRequest(read))).resolves.toBe(false);
  });

  it('reads bounded visible terminal and app state without mutation authority', async () => {
    useTerminalTranscriptStore.setState({ sessions: {} });
    useTerminalTranscriptStore.getState().registerSession('tty-1', {
      paneId: 'pane-1',
      projectId: null,
      command: 'pwsh',
    });
    useTerminalTranscriptStore.getState().appendOutput('tty-1', 'ready');
    useUIStore.getState().setRoute('chat');
    const deps = createProductionToolGatewayDependencies();

    await expect(Promise.resolve(deps.terminal.list({}, {} as never))).resolves.toEqual([
      expect.objectContaining({ sessionId: 'tty-1', outputChars: 5 }),
    ]);
    await expect(Promise.resolve(deps.app.getState({}, {} as never))).resolves.toEqual(
      expect.objectContaining({ route: 'chat', terminalCount: 1 }),
    );
  });

  it('delegates a fixed plugin operation through the live read-only security port', async () => {
    const run = vi.fn(async () => ({
      ok: true as const,
      summary: 'Fixed plugin tool completed.',
      data: { login: 'octocat' },
    }));
    const dispose = installToolGatewayPluginReadPort({ run });
    const deps = createProductionToolGatewayDependencies();
    const context = {
      requestId: 'request-1',
      sessionId: 'session-1',
      messageId: 'message-1',
      mutationApproved: false,
    };

    await expect(
      Promise.resolve(
        deps.plugins.run(
          {
            pluginId: 'github',
            operation: 'identity',
            input: { owner: 'vibespace' },
          },
          context,
        ),
      ),
    ).resolves.toEqual({
      summary: 'Fixed plugin tool completed.',
      data: { login: 'octocat' },
    });
    expect(run).toHaveBeenCalledWith({
      pluginId: 'github',
      operation: 'identity',
      params: { owner: 'vibespace' },
      context,
    });
    dispose();
    await expect(
      Promise.resolve(
        deps.plugins.run({ pluginId: 'github', operation: 'identity', input: {} }, context),
      ),
    ).rejects.toThrow('plugin_operation_unavailable');
  });

  it('lists only plugins connected and enabled for the exact local account and project', async () => {
    usePluginStore.setState({
      connectionsByAccount: {
        'account-a': {
          github: {
            accountId: 'account-a',
            pluginId: 'github',
            state: 'connected',
            enabled: true,
            enabledProjectIds: ['project-a'],
            configuredFields: [],
            updatedAt: 1,
          },
          gmail: {
            accountId: 'account-a',
            pluginId: 'gmail',
            state: 'connected',
            enabled: true,
            enabledProjectIds: ['different-project'],
            configuredFields: [],
            updatedAt: 1,
          },
        },
      },
    });

    const listed = await Promise.resolve(
      createProductionToolGatewayDependencies().plugins.list({}, {} as never),
    );
    expect(listed).toEqual([expect.objectContaining({ id: 'github', connected: true })]);
  });

  it('restores approved MCPs automatically and exposes only connected approved tools', async () => {
    const restoreApprovedConnections = vi.fn(async () => ({
      restoredIds: ['docs-server'],
      skippedIds: [],
      failedIds: [],
    }));
    const getSnapshot = vi.fn(() => [
      {
        id: 'docs-server',
        endpoint: 'https://mcp.example.test',
        state: 'connected',
        trust: 'approved',
        durableApproval: true,
        schemaDigest: 'schema-1',
        reconnectAttempt: 0,
        exposedTools: ['search'],
        tools: [
          {
            name: 'search',
            description: 'Search project documentation.',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                apiKey: { type: 'string' },
              },
              required: ['query', 'apiKey'],
            },
            exposed: true,
            classification: 'read',
          },
          {
            name: 'hidden',
            description: 'Must stay hidden.',
            inputSchema: { type: 'object' },
            exposed: false,
            classification: 'read',
          },
        ],
      },
      {
        id: 'changed-server',
        endpoint: 'https://changed.example.test',
        state: 'connected',
        trust: 'changed',
        durableApproval: true,
        schemaDigest: 'schema-2',
        reconnectAttempt: 0,
        exposedTools: ['unsafe'],
        tools: [],
      },
    ]);
    vi.spyOn(mcpGatewayModule, 'getVibeSpaceMcpGateway').mockReturnValue({
      restoreApprovedConnections,
      getSnapshot,
    } as never);

    const result = await Promise.resolve(
      createProductionToolGatewayDependencies().mcp.list({}, {} as never),
    );

    expect(restoreApprovedConnections).toHaveBeenCalledOnce();
    expect(result).toEqual([
      {
        connectionId: 'docs-server',
        tools: [
          {
            name: 'search',
            description: 'Search project documentation.',
            classification: 'read',
            inputSchema: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          },
        ],
      },
    ]);
  });

  it('invokes the exact restored MCP tool with project scope, classification, and approval', async () => {
    const invoke = vi.fn(async () => ({
      result: { matches: 2 },
      receipt: { receiptId: 'mcpinv-1', status: 'succeeded' },
    }));
    const gateway = {
      restoreApprovedConnections: vi.fn(async () => ({
        restoredIds: [],
        skippedIds: ['docs-server'],
        failedIds: [],
      })),
      getSnapshot: vi.fn(() => [
        {
          id: 'docs-server',
          state: 'connected',
          trust: 'approved',
          durableApproval: true,
          schemaDigest: 'schema-1',
          exposedTools: ['search'],
          tools: [
            {
              name: 'search',
              description: 'Search project documentation.',
              inputSchema: { type: 'object' },
              exposed: true,
              classification: 'write',
            },
          ],
        },
      ]),
      invoke,
    };
    vi.spyOn(mcpGatewayModule, 'getVibeSpaceMcpGateway').mockReturnValue(gateway as never);
    const context = {
      requestId: 'request-mcp',
      sessionId: 'session-1',
      messageId: 'message-1',
      mutationApproved: true,
    };

    await expect(
      Promise.resolve(
        createProductionToolGatewayDependencies().mcp.run(
          {
            connectionId: 'docs-server',
            toolName: 'search',
            classification: 'write',
            input: { query: 'VibeSpace' },
          },
          context,
        ),
      ),
    ).resolves.toEqual({
      result: { matches: 2 },
      receipt: { receiptId: 'mcpinv-1', status: 'succeeded' },
    });
    expect(gateway.restoreApprovedConnections).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith({
      accountId: 'account-a',
      projectId: 'project-a',
      taskId: 'request-mcp',
      connectionId: 'docs-server',
      toolName: 'search',
      arguments: { query: 'VibeSpace' },
      allowedTools: ['docs-server.search'],
      classification: 'write',
      approval: { confirmedByUser: true },
    });
  });

  it('does not let a stale plugin-port disposer revoke a newer host', async () => {
    const first = installToolGatewayPluginReadPort({
      run: vi.fn(async () => ({ ok: true as const, data: 'first' })),
    });
    const secondRun = vi.fn(async () => ({ ok: true as const, data: 'second' }));
    const second = installToolGatewayPluginReadPort({ run: secondRun });
    first();

    await expect(
      Promise.resolve(
        createProductionToolGatewayDependencies().plugins.run(
          { pluginId: 'github', operation: 'identity', input: {} },
          {
            requestId: 'request-2',
            sessionId: 'session-2',
            messageId: 'message-2',
            mutationApproved: false,
          },
        ),
      ),
    ).resolves.toEqual({ summary: undefined, data: 'second' });
    expect(secondRun).toHaveBeenCalledOnce();
    second();
  });

  it('binds the RLM context port to the current account, project, worktree, and session', async () => {
    const execute = vi.fn(async () => ({ mode: 'rlm', bounded: true }));
    const dispose = installToolGatewayRlmContextPort({ execute });
    const deps = createProductionToolGatewayDependencies();
    const context = {
      requestId: 'request-rlm',
      sessionId: 'session-1',
      messageId: 'message-1',
      directory: 'C:\\work\\project',
      worktree: 'C:\\work\\project\\.worktrees\\feature',
      mutationApproved: false,
    };

    await expect(
      Promise.resolve(deps.context.rlm({ operation: 'describe' }, context)),
    ).resolves.toEqual({ mode: 'rlm', bounded: true });
    expect(execute).toHaveBeenCalledWith(
      { operation: 'describe' },
      expect.objectContaining({
        sessionId: 'session-1',
        accountId: 'account-a',
        projectId: 'project-a',
        worktreeId: 'C:\\work\\project\\.worktrees\\feature',
      }),
    );
    dispose();
  });

  it('fails a high-level Context query closed until the exact session has observed execution identity', async () => {
    const execute = vi.fn(async () => ({ mode: 'legacy' }));
    const dispose = installToolGatewayRlmContextPort({ execute });
    const deps = createProductionToolGatewayDependencies();

    await expect(
      Promise.resolve().then(() =>
        deps.context.rlm(
          { operation: 'query', query: 'Find the exact project context.' },
          {
            requestId: 'request-unobserved',
            sessionId: 'different-session',
            messageId: 'message-1',
            worktree: 'C:\\work\\project\\.worktrees\\feature',
            mutationApproved: false,
          },
        ),
      ),
    ).rejects.toThrow('gateway_execution_identity_unavailable');
    expect(execute).not.toHaveBeenCalled();
    dispose();
  });

  it('routes an observed high-level Context query through the shared Gateway with exact identity', async () => {
    const authority = captureToolGatewayAuthorityClaim()!;
    expect(
      bindToolGatewayObservedExecutionAuthority('session-1', authority, {
        executionIdentity: observedIdentity,
        performance: 'quality',
      }),
    ).toBe(true);
    const execute = vi.fn(async () => ({ mode: 'legacy' }));
    const dispose = installToolGatewayRlmContextPort({ execute });
    const gatewayResult = Object.freeze({
      promptBlock: '<vibespace_context>grounded</vibespace_context>',
      receipt: Object.freeze({ receiptId: 'context-receipt-1' }),
    });
    const ask = vi.spyOn(productionContextGateway, 'ask').mockResolvedValue(gatewayResult as never);
    const deps = createProductionToolGatewayDependencies();

    await expect(
      Promise.resolve(
        deps.context.rlm(
          { operation: 'query', query: 'Find the exact project context.' },
          {
            requestId: 'request-gateway',
            sessionId: 'session-1',
            messageId: 'message-1',
            directory: 'C:\\work\\project',
            worktree: 'C:\\work\\project\\.worktrees\\feature',
            mutationApproved: false,
          },
        ),
      ),
    ).resolves.toBe(gatewayResult);
    expect(ask).toHaveBeenCalledWith({
      requestId: 'request-gateway',
      question: 'Find the exact project context.',
      scope: {
        accountId: 'account-a',
        workspaceId: 'workspace-a',
        projectId: 'project-a',
        worktreeId: 'C:\\work\\project\\.worktrees\\feature',
        revision: 'session-1:0',
      },
      taskKind: 'answer',
      access: 'read',
      workingSet: 'incomplete',
      userIntent: { context: true },
      optionalEnrichmentEnabled: true,
      executionIdentity: observedIdentity,
      performance: 'quality',
      activePaths: ['C:\\work\\project'],
    });
    expect(execute).not.toHaveBeenCalled();
    ask.mockRestore();
    dispose();
  });

  it('routes the generated-schema investigate alias through the shared Gateway', async () => {
    const authority = captureToolGatewayAuthorityClaim()!;
    expect(
      bindToolGatewayObservedExecutionAuthority('session-1', authority, {
        executionIdentity: observedIdentity,
        performance: 'quality',
      }),
    ).toBe(true);
    const execute = vi.fn(async () => ({ mode: 'rlm', bounded: true }));
    const dispose = installToolGatewayRlmContextPort({ execute });
    const gatewayResult = Object.freeze({
      promptBlock: '<vibespace_context>grounded alias</vibespace_context>',
      receipt: Object.freeze({
        receiptId: 'context-receipt-investigate',
        scopeRevision: Object.freeze({
          accountId: 'account-a',
          workspaceId: 'workspace-a',
          projectId: 'project-a',
          worktreeId: 'C:\\work\\project\\.worktrees\\feature',
          revision: 'session-1:0',
        }),
        sourceRevisions: Object.freeze([
          Object.freeze({ sourceId: 'rlm-source:source-1', revision: `sha256:${'a'.repeat(64)}` }),
        ]),
        evidenceHandles: Object.freeze(['ptr:rlm:record-1:0:512:expand:6144:6144']),
        safeFailure: null,
      }),
    });
    const ask = vi.spyOn(productionContextGateway, 'ask').mockResolvedValue(gatewayResult as never);
    const receiptUri = `vibespace:context/receipt/${[
      ...new TextEncoder().encode('context-receipt-investigate'),
    ]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')}`;

    const result = await Promise.resolve(
      createProductionToolGatewayDependencies().context.rlm(
        { operation: 'investigate', query: 'Trace the cross-source decision.' },
        {
          requestId: 'request-investigate',
          sessionId: 'session-1',
          messageId: 'message-1',
          worktree: 'C:\\work\\project\\.worktrees\\feature',
          mutationApproved: false,
        },
      ),
    );
    expect(result).toMatchObject({ receipt: gatewayResult.receipt });
    expect((result as { promptBlock: string }).promptBlock).toContain(receiptUri);
    expect((result as { promptBlock: string }).promptBlock).toContain(
      'vibespace:context/source/rlm-source%3Asource-1',
    );
    expect((result as { promptBlock: string }).promptBlock).toContain(
      'vibespace:context/evidence/ptr%3Arlm%3Arecord-1%3A0%3A512%3Aexpand%3A6144%3A6144',
    );
    expect(consumeToolGatewayContextCitationItems('session-1')).toEqual([
      expect.objectContaining({
        purpose: 'citation',
        source: expect.objectContaining({
          id: 'context-receipt-investigate',
          uri: receiptUri,
          trust: 'app_verified',
        }),
      }),
      expect.objectContaining({
        source: expect.objectContaining({
          id: 'rlm-source:source-1',
          uri: 'vibespace:context/source/rlm-source%3Asource-1',
        }),
      }),
      expect.objectContaining({
        source: expect.objectContaining({
          id: 'ptr:rlm:record-1:0:512:expand:6144:6144',
          uri: 'vibespace:context/evidence/ptr%3Arlm%3Arecord-1%3A0%3A512%3Aexpand%3A6144%3A6144',
        }),
      }),
    ]);
    expect(consumeToolGatewayContextCitationItems('session-1')).toEqual([]);
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-investigate',
        question: 'Trace the cross-source decision.',
        executionIdentity: observedIdentity,
        performance: 'quality',
        userIntent: { context: true, deep: true },
      }),
    );
    expect(execute).not.toHaveBeenCalled();
    ask.mockRestore();
    dispose();
  });

  it('rejects low-level recursive investigate without observed session identity', async () => {
    const execute = vi.fn(async () => ({ mode: 'legacy' }));
    const dispose = installToolGatewayRlmContextPort({ execute });

    await expect(
      Promise.resolve().then(() =>
        createProductionToolGatewayDependencies().context.rlm(
          { operation: 'investigate', query: 'Trace the cross-source decision.' },
          {
            requestId: 'request-unbound-investigate',
            sessionId: 'different-session',
            messageId: 'message-1',
            worktree: 'C:\\work\\project\\.worktrees\\feature',
            mutationApproved: false,
          },
        ),
      ),
    ).rejects.toThrow('gateway_execution_identity_unavailable');
    expect(execute).not.toHaveBeenCalled();
    dispose();
  });

  it('rejects investigate without observed identity before checking the optional RLM port', async () => {
    await expect(
      Promise.resolve().then(() =>
        createProductionToolGatewayDependencies().context.rlm(
          { operation: 'investigate', query: 'Trace the cross-source decision.' },
          {
            requestId: 'request-unbound-no-port',
            sessionId: 'different-session',
            messageId: 'message-1',
            worktree: 'C:\\work\\project\\.worktrees\\feature',
            mutationApproved: false,
          },
        ),
      ),
    ).rejects.toThrow('gateway_execution_identity_unavailable');
  });

  it('rejects an observed high-level query when worktree scope is incomplete', async () => {
    const authority = captureToolGatewayAuthorityClaim()!;
    expect(
      bindToolGatewayObservedExecutionAuthority('session-1', authority, {
        executionIdentity: observedIdentity,
        performance: 'balanced',
      }),
    ).toBe(true);
    const execute = vi.fn(async () => ({ mode: 'legacy' }));
    const dispose = installToolGatewayRlmContextPort({ execute });

    await expect(
      Promise.resolve().then(() =>
        createProductionToolGatewayDependencies().context.rlm(
          { operation: 'query', query: 'Find the exact project context.' },
          {
            requestId: 'request-incomplete-scope',
            sessionId: 'session-1',
            messageId: 'message-1',
            mutationApproved: false,
          },
        ),
      ),
    ).rejects.toThrow('gateway_scope_unavailable');
    expect(execute).not.toHaveBeenCalled();
    dispose();
  });
});
