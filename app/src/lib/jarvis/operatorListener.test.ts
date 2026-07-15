import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ActionDef } from '@/lib/actions/types';
import { useJarvisTaskRunStore } from '@/features/jarvis-runs/taskRunStore';
import { startJarvisOperatorListener } from './operatorListener';

type AppendedMessage = Parameters<Parameters<typeof startJarvisOperatorListener>[0]['appendMessage']>[0];

function fakeAction(id: string): ActionDef {
  const params = id === 'chat.rename'
    ? [{ key: 'title', label: 'Title', type: 'string' as const, required: true }]
    : id === 'terminal.ensure_total'
      ? [
          { key: 'count', label: 'Count', type: 'number' as const, required: true },
          { key: 'cli', label: 'CLI', type: 'string' as const },
        ]
      : id === 'file.search'
        ? [
            { key: 'query', label: 'Query', type: 'string' as const, required: true },
            { key: 'maxResults', label: 'Maximum results', type: 'number' as const },
          ]
        : id === 'file.attach'
          ? [{ key: 'path', label: 'Path', type: 'string' as const, required: true }]
          : id === 'mcp.start'
            ? [{ key: 'serverId', label: 'Server id', type: 'string' as const, required: true }]
            : id === 'mcp.invoke'
              ? [
                  { key: 'serverId', label: 'Server id', type: 'string' as const, required: true },
                  { key: 'toolName', label: 'Tool name', type: 'string' as const, required: true },
                  { key: 'inputJson', label: 'Input JSON', type: 'string' as const },
                ]
          : [];
  return {
    id,
    category: 'custom',
    label: id,
    description: id,
    params,
    autoApprove: id === 'settings.jarvisactions',
    run: vi.fn(async () => ({ ok: true as const, summary: `${id} verified` })),
  };
}

describe('Jarvis operator listener', () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    useJarvisTaskRunStore.getState().clearForTests();
  });

  it('executes a safe registered action once and prevents provider duplication', async () => {
    const action = fakeAction('settings.jarvisactions');
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    const provider = vi.fn();
    stop = startJarvisOperatorListener({
      appendMessage,
      resolveAction: (id) => id === action.id ? action : undefined,
      runAction: async (id, params, context) => action.run(params, context),
    });
    window.addEventListener('jarvis:send', provider);

    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId: 'chat-1', text: 'Open Jarvis Actions.' },
    }));

    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalled());
    expect(action.run).toHaveBeenCalledTimes(1);
    expect(action.run).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ callId: expect.stringMatching(/^jarvisrun:/) }),
    );
    expect(provider).not.toHaveBeenCalled();
    expect(appendMessage.mock.calls[0]?.[0].parts[0]).toMatchObject({
      kind: 'text',
      text: 'settings.jarvisactions verified',
    });
    window.removeEventListener('jarvis:send', provider);
  });

  it('creates an approval card instead of running a first-time mutation', async () => {
    const action = fakeAction('chat.rename');
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    stop = startJarvisOperatorListener({
      appendMessage,
      resolveAction: (id) => id === action.id ? action : undefined,
      runAction: vi.fn(),
    });

    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId: 'chat-1', text: 'Rename this chat to Agent Testing.' },
    }));

    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalled());
    expect(action.run).not.toHaveBeenCalled();
    expect(appendMessage.mock.calls[0]?.[0].parts[1]).toMatchObject({
      kind: 'action_proposal',
      action_id: 'chat.rename',
      params: { title: 'Agent Testing' },
      status: 'pending',
    });
    expect(Object.values(useJarvisTaskRunStore.getState().runs)[0]).toMatchObject({
      status: 'waiting-for-approval',
      steps: [expect.objectContaining({ action: 'chat.rename' })],
    });
  });

  it('blocks invented destructive execution with a scoped approval explanation', async () => {
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    stop = startJarvisOperatorListener({
      appendMessage,
      resolveAction: () => undefined,
      runAction: vi.fn(),
    });

    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId: 'chat-1', text: 'Delete every project.' },
    }));

    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalled());
    const firstPart = appendMessage.mock.calls[0]?.[0].parts[0];
    expect(firstPart?.kind).toBe('text');
    expect(firstPart?.kind === 'text' ? firstPart.text : '').toMatch(/explicit scoped approval/i);
  });

  it('turns terminal orchestration into one real approval instead of provider prose', async () => {
    const action = fakeAction('terminal.ensure_total');
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    const provider = vi.fn();
    stop = startJarvisOperatorListener({
      appendMessage,
      resolveAction: (id) => id === action.id ? action : undefined,
      runAction: vi.fn(),
    });
    window.addEventListener('jarvis:send', provider);
    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: {
        chatId: 'chat-1',
        text: 'Open 10 terminals in my current project and start Claude in every safe new terminal.',
      },
    }));

    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalled());
    expect(provider).not.toHaveBeenCalled();
    expect(appendMessage.mock.calls[0]?.[0].parts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'action_proposal',
        action_id: 'terminal.ensure_total',
        params: { count: 10, cli: 'claude' },
      }),
    ]));
    window.removeEventListener('jarvis:send', provider);
  });

  it('searches real files before proposing verified paths for attachment', async () => {
    const search = fakeAction('file.search');
    const attach = fakeAction('file.attach');
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    const runAction = vi.fn(async () => ({
      ok: true as const,
      summary: 'Found 2 files.',
      data: { results: [{ path: 'C:\\repo\\terminalStore.ts' }, { path: 'C:\\repo\\terminalRepo.ts' }] },
    }));
    const provider = vi.fn();
    stop = startJarvisOperatorListener({
      appendMessage,
      resolveAction: (id) => [search, attach].find((action) => action.id === id),
      runAction,
    });
    window.addEventListener('jarvis:send', provider);
    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId: 'chat-1', text: 'Find the terminal persistence files and add them as context.' },
    }));

    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalled());
    expect(provider).not.toHaveBeenCalled();
    expect(runAction).toHaveBeenCalledWith('file.search', expect.any(Object), expect.any(Object));
    const proposals = appendMessage.mock.calls[0]?.[0].parts.filter((part) => part.kind === 'action_proposal');
    expect(proposals).toEqual([
      expect.objectContaining({ action_id: 'file.attach', params: { path: 'C:\\repo\\terminalStore.ts' } }),
      expect.objectContaining({ action_id: 'file.attach', params: { path: 'C:\\repo\\terminalRepo.ts' } }),
    ]);
    window.removeEventListener('jarvis:send', provider);
  });

  it('asks for missing plugin inputs instead of invoking an invented tool', async () => {
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    const provider = vi.fn();
    stop = startJarvisOperatorListener({ appendMessage, resolveAction: () => undefined, runAction: vi.fn() });
    window.addEventListener('jarvis:send', provider);
    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId: 'chat-1', text: 'Run the plugin tool with a timeout.' },
    }));
    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalled());
    expect(provider).not.toHaveBeenCalled();
    const part = appendMessage.mock.calls[0]?.[0].parts[0];
    expect(part?.kind === 'text' ? part.text : '').toMatch(/which connected plugin and declared tool/i);
    window.removeEventListener('jarvis:send', provider);
  });

  it('executes the exact read-only Supabase request through start and list_tables', async () => {
    const actions = [fakeAction('mcp.start'), fakeAction('mcp.invoke')];
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    const runAction = vi.fn(async (
      id: string,
      _params: Record<string, unknown>,
      _context: Parameters<NonNullable<Parameters<typeof startJarvisOperatorListener>[0]['runAction']>>[2],
    ) => ({
      ok: true as const,
      summary: id === 'mcp.start'
        ? 'Supabase MCP is healthy.'
        : 'Returned 2 visible tables.',
    }));
    stop = startJarvisOperatorListener({
      appendMessage,
      resolveAction: (id) => actions.find((action) => action.id === id),
      runAction,
    });

    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: {
        chatId: 'chat-1',
        text: 'Use the Supabase plugin to list my tables without changing anything.',
      },
    }));

    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalled());
    expect(runAction.mock.calls.map(([id]) => id)).toEqual(['mcp.start', 'mcp.invoke']);
    expect(runAction.mock.calls[1]?.[1]).toEqual({
      serverId: 'supabase',
      toolName: 'list_tables',
      inputJson: '{}',
    });
    expect(Object.values(useJarvisTaskRunStore.getState().runs)[0]).toMatchObject({
      status: 'completed',
      progress: 100,
    });
  });

  it('lets the memory listener persist an explicit preference without adding a chat reply', async () => {
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    const provider = vi.fn();
    stop = startJarvisOperatorListener({ appendMessage });
    window.addEventListener('jarvis:send', provider);

    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId: 'chat-1', text: 'Remember that I prefer concise answers.' },
    }));

    await Promise.resolve();
    expect(appendMessage).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    window.removeEventListener('jarvis:send', provider);
  });
});
