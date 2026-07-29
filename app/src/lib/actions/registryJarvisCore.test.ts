import { describe, expect, it, vi } from 'vitest';

import type { ActionDef } from './types';
import {
  CORE_ACTION_IDS,
  cancelTerminalExecutionsAfterObserverCancellation,
  createJarvisCoreActions,
  createJarvisTerminalRegisteredActionDispatcher,
  parseAgentBatch,
  waitForAgentBatch,
  waitForTerminalExecutions,
} from './registryJarvisCore';
import {
  jarvisIssuedActionExecutionBrand,
  jarvisTerminalHandoffReceiptBrand,
  type JarvisTerminalOwnedExecution,
} from '@/lib/jarvis/approvalEngine';

const mcpMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@/lib/mcp/serverManager', () => ({
  jarvisMcpServerManager: {
    invoke: mcpMocks.invoke,
  },
}));

function action(
  id: string,
  run = vi.fn(async () => ({ ok: true as const, summary: 'done' })),
): ActionDef {
  return {
    id,
    category: 'custom',
    label: id,
    description: id,
    params: [],
    run,
  };
}

describe('Jarvis canonical core actions', () => {
  it('routes canonical theme settings without exposing retired Light', async () => {
    const resolvedIds: string[] = [];
    const routed = createJarvisCoreActions((id) => {
      resolvedIds.push(id);
      return action(id);
    }).find((item) => item.id === 'settings.update')!;
    await routed.run({ setting: 'theme', value: 'monochrome' }, { source: 'ai' });
    expect(resolvedIds).toContain('theme.monochrome');

    const result = await routed.run({ setting: 'theme', value: 'light' }, { source: 'ai' });
    expect(result.ok).toBe(false);
  });

  it('registers every stable action id exactly once', () => {
    const actions = createJarvisCoreActions(() => undefined);
    expect(actions.map((item) => item.id)).toEqual(CORE_ACTION_IDS);
    expect(new Set(actions.map((item) => item.id)).size).toBe(actions.length);
    expect(actions.map((item) => item.id)).not.toContain('plugin.invoke');
    const modelParameterKeys = actions.flatMap((item) => item.params.map((param) => param.key));
    expect(modelParameterKeys).not.toContain('approvalId');
    expect(modelParameterKeys).not.toContain('secretHandleRefs');
    expect(modelParameterKeys).not.toContain('resolveSecret');
  });

  it('never exposes a model-controlled filesystem root on automatic file search', () => {
    const search = createJarvisCoreActions(() => undefined).find(
      (item) => item.id === 'file.search',
    )!;

    expect(search.autoApprove).toBe(true);
    expect(search.params.map((param) => param.key)).toEqual(['query', 'maxResults']);
  });

  it('maps terminal.create_many onto the real terminal queue action', async () => {
    const run = vi.fn(async () => ({ ok: true as const, summary: 'queued' }));
    const legacy = [action('terminal.bulkOpen', run)];
    const actions = createJarvisCoreActions((id) => legacy.find((item) => item.id === id));

    const result = await actions
      .find((item) => item.id === 'terminal.create_many')!
      .run({ count: 3, cwd: 'C:\\work' }, { source: 'ai', chatId: 'chat-1' });

    expect(result.ok).toBe(true);
    expect(run).toHaveBeenCalledWith(
      { count: 3, cwd: 'C:\\work', command: '' },
      { source: 'ai', chatId: 'chat-1' },
    );
  });

  it('fails truthfully when a required host action is unavailable', async () => {
    const action = createJarvisCoreActions(() => undefined).find(
      (item) => item.id === 'terminal.create',
    )!;

    await expect(action.run({}, { source: 'ai' })).resolves.toEqual({
      ok: false,
      error: 'Required host action terminal.bulkOpen is unavailable.',
    });
  });

  it('does not claim legacy task cancellation before canonical kernel injection', async () => {
    const cancel = createJarvisCoreActions(() => undefined).find(
      (item) => item.id === 'task.cancel',
    )!;

    expect(cancel.autoApprove).not.toBe(true);
    expect(cancel.destructive).toBe(true);
    await expect(cancel.run({ runId: 'legacy-run' }, { source: 'ai' })).resolves.toEqual({
      ok: false,
      error: 'Canonical task cancellation is unavailable until the kernel port is connected.',
    });
  });

  it('invokes only the exact approved MCP target and sanitizes provider failures', async () => {
    const invoke = createJarvisCoreActions(() => undefined).find(
      (item) => item.id === 'mcp.invoke',
    )!;
    mcpMocks.invoke.mockResolvedValueOnce({
      contentTrust: 'external_untrusted',
      summary: 'Repository read.',
    });

    await expect(
      invoke.run(
        {
          serverId: 'github',
          toolName: 'repo.read',
          inputJson: '{"owner":"openai"}',
          timeoutMs: 2_000,
        },
        { source: 'ai' },
      ),
    ).resolves.toMatchObject({
      ok: true,
      summary: 'MCP tool github.repo.read completed.',
    });
    expect(mcpMocks.invoke).toHaveBeenLastCalledWith(
      'github',
      'repo.read',
      { owner: 'openai' },
      { timeoutMs: 2_000 },
    );

    mcpMocks.invoke.mockRejectedValueOnce(new Error('Bearer live-secret-provider-detail'));
    const failed = await invoke.run(
      { serverId: 'github', toolName: 'repo.read', inputJson: '{}' },
      { source: 'ai' },
    );
    expect(failed).toEqual({ ok: false, error: 'MCP tool invocation failed.' });
    expect(JSON.stringify(failed)).not.toContain('live-secret');
  });

  it('hands the exact canonical terminal controller to the private acceptor before success', async () => {
    const owned: JarvisTerminalOwnedExecution = {
      recordResult: vi.fn(),
      recordCancellationVerified: vi.fn(),
      requestCancellation: vi.fn(),
      dispose: vi.fn(),
    };
    const acceptIssuedExecution = vi.fn(({ executionId, ownerId }) =>
      Object.freeze({
        executionId,
        ownerId,
        [jarvisTerminalHandoffReceiptBrand]: true as const,
      }),
    );
    const createAcceptor = vi.fn(() => ({ acceptIssuedExecution }));
    const transferTerminalOwnership = vi.fn(({ executionId, acceptor }) => ({
      kind: 'committed' as const,
      value: acceptor.acceptIssuedExecution({
        executionId,
        ownerId: 'approval:jappr_1',
        execution: owned,
      }),
    }));
    const dispatcher = createJarvisTerminalRegisteredActionDispatcher({
      newExecutionId: () => 'jterm_1',
      newCancellationToken: () => 'jcancel_native_1',
      createAcceptor,
    });

    const outcome = await dispatcher({
      registration: {
        id: 'terminal.create',
        version: 1,
        executor: { kind: 'builtin', registryActionId: 'terminal.create' },
      } as never,
      params: {},
      context: {
        source: 'ai',
        accountId: 'account-a',
        runId: 'jrun_1',
        approvalId: 'jappr_1',
        requestId: 'request-1',
        attemptNumber: 1,
      },
      execution: {
        producerKind: 'terminal',
        ownerId: 'approval:jappr_1',
        [jarvisIssuedActionExecutionBrand]: true,
        transferTerminalOwnership,
      } as never,
    });

    expect(createAcceptor).toHaveBeenCalledWith({
      accountId: 'account-a',
      runId: 'jrun_1',
      executionId: 'jterm_1',
      cancellationToken: 'jcancel_native_1',
      command: '',
    });
    expect(acceptIssuedExecution).toHaveBeenCalledWith({
      executionId: 'jterm_1',
      ownerId: 'approval:jappr_1',
      execution: owned,
    });
    expect(outcome).toMatchObject({
      kind: 'terminal_handoff_accepted',
      executorKind: 'terminal',
      ownerId: 'approval:jappr_1',
      result: { ok: true, data: { state: 'queued', executionId: 'jterm_1' } },
    });
    expect(JSON.stringify(outcome)).not.toContain('jcancel_native_1');
  });

  it('hands an approved terminal.run command and bounded metadata to the canonical acceptor', async () => {
    const owned: JarvisTerminalOwnedExecution = {
      recordResult: vi.fn(),
      recordCancellationVerified: vi.fn(),
      requestCancellation: vi.fn(),
      dispose: vi.fn(),
    };
    const acceptIssuedExecution = vi.fn(({ executionId, ownerId }) =>
      Object.freeze({
        executionId,
        ownerId,
        [jarvisTerminalHandoffReceiptBrand]: true as const,
      }),
    );
    const createAcceptor = vi.fn(() => ({ acceptIssuedExecution }));
    const transferTerminalOwnership = vi.fn(({ executionId, acceptor }) => ({
      kind: 'committed' as const,
      value: acceptor.acceptIssuedExecution({
        executionId,
        ownerId: 'approval:jappr_run',
        execution: owned,
      }),
    }));
    const dispatcher = createJarvisTerminalRegisteredActionDispatcher({
      newExecutionId: () => 'jterm_run',
      newCancellationToken: () => 'jcancel_native_run',
      createAcceptor,
    });

    const outcome = await dispatcher({
      registration: {
        id: 'terminal.run',
        version: 1,
        executor: { kind: 'builtin', registryActionId: 'terminal.run' },
      } as never,
      params: {
        command: "Write-Output 'VibeSpace kernel terminal fixture'; exit",
        label: 'Kernel smoke fixture',
        cwd: 'C:\\work',
        timeoutMs: 15_000,
      },
      context: {
        source: 'ai',
        accountId: 'account-a',
        runId: 'jrun_run',
        approvalId: 'jappr_run',
        requestId: 'request-run',
        attemptNumber: 1,
      },
      execution: {
        producerKind: 'terminal',
        ownerId: 'approval:jappr_run',
        [jarvisIssuedActionExecutionBrand]: true,
        transferTerminalOwnership,
      } as never,
    });

    expect(createAcceptor).toHaveBeenCalledWith({
      accountId: 'account-a',
      runId: 'jrun_run',
      executionId: 'jterm_run',
      cancellationToken: 'jcancel_native_run',
      command: "Write-Output 'VibeSpace kernel terminal fixture'; exit",
      label: 'Kernel smoke fixture',
      cwd: 'C:\\work',
      timeoutMs: 15_000,
    });
    expect(outcome).toMatchObject({
      kind: 'terminal_handoff_accepted',
      executorKind: 'terminal',
      ownerId: 'approval:jappr_run',
      result: { ok: true, data: { state: 'queued', executionId: 'jterm_run' } },
    });
  });

  it('verifies every queued terminal actually reaches a started state', async () => {
    let reads = 0;
    const result = await waitForTerminalExecutions(['one', 'two'], {
      timeoutMs: 100,
      read: () => {
        reads += 1;
        return reads === 1
          ? { one: { status: 'queued' }, two: { status: 'starting' } }
          : {
              one: { status: 'running', sessionId: 's1' },
              two: { status: 'running', sessionId: 's2' },
            };
      },
      sleep: async () => undefined,
      now: (() => {
        let now = 0;
        return () => ++now;
      })(),
    });
    expect(result).toEqual({ ok: true, sessionIds: ['s1', 's2'] });
  });

  it('does not report failed or timed-out terminal launches as complete', async () => {
    await expect(
      waitForTerminalExecutions(['one'], {
        timeoutMs: 100,
        read: () => ({ one: { status: 'failed' } }),
        sleep: async () => undefined,
        now: () => 0,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/failed/i) });

    let now = 0;
    await expect(
      waitForTerminalExecutions(['one'], {
        timeoutMs: 2,
        read: () => ({ one: { status: 'queued' } }),
        sleep: async () => undefined,
        now: () => ++now,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/within/i) });
  });

  it('stops terminal and agent observers when their parent run is cancelled', async () => {
    await expect(
      waitForTerminalExecutions(['one'], {
        timeoutMs: 50,
        read: () => ({ one: { status: 'queued' } }),
        cancelled: () => true,
        sleep: async () => undefined,
        now: () => 0,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/cancelled/i) });

    await expect(
      waitForAgentBatch(['a'], {
        timeoutMs: 50,
        read: () => ({ a: { status: 'running' } }),
        cancelled: () => true,
        sleep: async () => undefined,
        now: () => 0,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/cancelled/i) });
  });

  it('routes canonical observer cleanup through Task 18 and never tokenless native kill', async () => {
    const requestCanonical = vi.fn(async () => null);
    const cancelQueued = vi.fn(() => false);
    const killManual = vi.fn(async () => undefined);
    const markLegacyFailed = vi.fn();

    await cancelTerminalExecutionsAfterObserverCancellation(['jterm_1'], {
      isCanonical: () => true,
      requestCanonical,
      cancelQueued,
      readSessionId: () => 'pty_1',
      killManual,
      markLegacyFailed,
    });

    expect(requestCanonical).toHaveBeenCalledWith('jterm_1');
    expect(cancelQueued).not.toHaveBeenCalled();
    expect(killManual).not.toHaveBeenCalled();
    expect(markLegacyFailed).not.toHaveBeenCalled();
  });

  it('validates bounded multi-agent task batches and observes completion', async () => {
    expect(
      parseAgentBatch(
        JSON.stringify([
          { task: 'Inspect chat files only.' },
          { task: 'Inspect terminal files only.' },
        ]),
      ),
    ).toEqual([{ task: 'Inspect chat files only.' }, { task: 'Inspect terminal files only.' }]);
    expect(parseAgentBatch(JSON.stringify([{ task: '' }]))).toBeNull();

    const result = await waitForAgentBatch(['a', 'b'], {
      timeoutMs: 50,
      read: () => ({
        a: { status: 'done', summary: 'Chat inspected.' },
        b: { status: 'done', summary: 'Terminals inspected.' },
      }),
      sleep: async () => undefined,
      now: () => 0,
    });
    expect(result).toEqual({ ok: true, summaries: ['Chat inspected.', 'Terminals inspected.'] });
  });

  it('surfaces blocked child agents instead of claiming batch completion', async () => {
    await expect(
      waitForAgentBatch(['a'], {
        timeoutMs: 50,
        read: () => ({ a: { status: 'blocked', error: 'Needs a decision.' } }),
        sleep: async () => undefined,
        now: () => 0,
      }),
    ).resolves.toEqual({ ok: false, error: 'Agent a is blocked: Needs a decision.' });
  });
});
