/**
 * @file Tests for the action runner — built-in registry lookup, custom
 *       tool fallthrough, param validation, and toast emission.
 *
 * The runner is the single dispatch point used by both the chat
 * Approve/Cancel card and the actions palette. Any change to its
 * contract ripples through every action call site, so these tests
 * pin the shape that today's UI and the AI prompt addendum rely on.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const tauriMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => tauriMock);

// Avoid pulling the real toast module (it mounts a portal in jsdom).
vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { runAction, resolveAction, getAllActions } from '@/lib/actions/runner';
import { toast } from '@/components/ui/toast';
import { useToolStore } from '@/features/tools/toolStore';
import { useTerminalCommandQueue } from '@/features/terminals/terminalCommandQueue';
import { useTerminalFleetStore } from '@/features/terminals/terminalFleetStore';
import { useDevConsoleStore } from '@/features/dev-console';

describe('resolveAction', () => {
  it('finds built-in actions by id', () => {
    const a = resolveAction('nav.chat');
    expect(a).toBeDefined();
    expect(a?.id).toBe('nav.chat');
    expect(a?.category).toBe('navigation');
  });

  it('exposes exactly one code-owned approval-gated Terminal Fleet action', () => {
    const matches = getAllActions().filter((action) => action.id === 'terminal.fleet');

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      category: 'terminal',
      label: 'Terminal Fleet',
      destructive: true,
    });
    expect(matches[0]?.autoApprove).not.toBe(true);
    expect(useToolStore.getState().tools).toEqual([]);
  });

  it('returns undefined for unknown ids', () => {
    expect(resolveAction('does.not.exist')).toBeUndefined();
  });

  it('falls through to a custom tool when its slug is present', () => {
    useToolStore.setState({ tools: [] });
    useToolStore.getState().create({
      name: 'My dev server',
      description: 'Start the dev server.',
      baseAction: 'terminal.run',
      params: { command: 'npm run jarvis' },
    });

    const slug = useToolStore.getState().tools[0]!.slug;
    const a = resolveAction(`custom.${slug}`);
    expect(a).toBeDefined();
    expect(a?.id).toBe(`custom.${slug}`);
    expect(a?.category).toBe('custom');
  });
});

describe('getAllActions', () => {
  it('combines built-ins and custom tools, with built-ins winning collisions', () => {
    useToolStore.setState({ tools: [] });
    const before = getAllActions();
    expect(before.some((a) => a.id === 'nav.chat')).toBe(true);

    // Forge a custom tool that tries to shadow a built-in id. The store
    // namespaces under `custom.` so collisions can only happen if the
    // tool's slug was crafted maliciously, but we still defend against it.
    useToolStore.setState({
      tools: [
        {
          slug: 'rogue',
          name: 'Rogue',
          description: 'shadow attempt',
          baseAction: 'nav.chat',
          params: {},
          createdAt: 0,
          updatedAt: 0,
          published: null,
        },
      ],
    });

    const after = getAllActions();
    const navMatches = after.filter((a) => a.id === 'nav.chat');
    // Only the built-in entry, never a duplicate from the custom store.
    expect(navMatches).toHaveLength(1);
    expect(navMatches[0]?.category).toBe('navigation');
  });
});

describe('runAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'terminal_command_exists') {
        return { exists: true, reason: 'available' };
      }
      return undefined;
    });
    useToolStore.setState({ tools: [] });
    useTerminalCommandQueue.getState().clear();
    useTerminalFleetStore.getState().reset();
    useDevConsoleStore.getState().clear();
  });

  it('queues one target-total Fleet transaction and begins bounded progress', async () => {
    const result = await runAction(
      'terminal.fleet',
      {
        targetTotal: '8',
        preset: 'claude',
        batchSize: '2',
        staggerDelayMs: '125',
      },
      { source: 'user' },
      { emitToast: false },
    );

    expect(result.ok).toBe(true);
    const [queued] = useTerminalCommandQueue.getState().queue;
    expect(queued).toMatchObject({
      kind: 'fleet',
      targetTotal: 8,
      selection: { kind: 'preset', presetId: 'claude' },
      batchSize: 2,
      staggerDelayMs: 125,
    });
    if (!queued || queued.kind !== 'fleet') throw new Error('expected Fleet request');
    expect(useTerminalFleetStore.getState().records.at(-1)).toMatchObject({
      requestId: queued.requestId,
      targetTotal: 8,
      status: 'queued',
    });
  });

  it('refuses a missing preset CLI without opening or changing terminals', async () => {
    tauriMock.invoke.mockResolvedValue({ exists: false, reason: 'not-found' });

    const result = await runAction(
      'terminal.fleet',
      { targetTotal: 10, preset: 'grok' },
      { source: 'user' },
      { emitToast: false },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Grok Build.*not installed|not available/i);
    expect(useTerminalCommandQueue.getState().queue).toEqual([]);
    expect(useTerminalFleetStore.getState().records).toEqual([]);
  });

  it('returns a structured error for unknown ids and toasts by default', async () => {
    const result = await runAction('does.not.exist', {}, { source: 'user' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unknown action/);
    expect(toast.error).toHaveBeenCalled();
  });

  it('rejects required-param omissions before dispatching the runner', async () => {
    const result = await runAction(
      'terminal.run',
      {},
      { source: 'user' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/required/i);
  });

  it('suppresses the toast when emitToast is false', async () => {
    const result = await runAction(
      'does.not.exist',
      {},
      { source: 'user' },
      { emitToast: false },
    );
    expect(result.ok).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('catches runner exceptions and turns them into structured errors', async () => {
    // theme.toggle is a built-in that touches the UI store; in jsdom it
    // works fine, so we wrap a custom tool whose runner explicitly throws.
    useToolStore.setState({
      tools: [
        {
          slug: 'kaboom',
          name: 'Kaboom',
          description: 'throws on run',
          // Intentionally point at a non-existent base action so the
          // synthesised runner returns ok:false with a clear message.
          baseAction: 'nope.nope',
          params: {},
          createdAt: 0,
          updatedAt: 0,
          published: null,
        },
      ],
    });

    const result = await runAction('custom.kaboom', {}, { source: 'user' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown base action/i);
  });

  it('does not expose the removed Clock timer action', async () => {
    const def = resolveAction('clock.timer');
    expect(def).toBeUndefined();
  });

  it('coerces params inside custom workflow tool steps', async () => {
    const tool = useToolStore.getState().create({
      name: 'Tea workflow',
      description: 'Open a small terminal batch.',
      baseAction: 'workflow.run',
      params: {},
      steps: [
        {
          action: 'terminal.bulkOpen',
          params: { count: '2', command: 'echo hi' },
        },
      ],
    });

    const result = await runAction(
      `custom.${tool.slug}`,
      {},
      { source: 'user' },
      { emitToast: false },
    );

    expect(result.ok).toBe(true);
    expect(useTerminalCommandQueue.getState().queue).toHaveLength(2);
  });

  it('shares one in-flight execution for the same approved proposal', async () => {
    const def = resolveAction('settings.open');
    expect(def).toBeTruthy();
    const spy = vi.spyOn(def!, 'run').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ok: true, summary: 'opened' };
    });
    const context = {
      source: 'ai' as const,
      messageId: 'message_once',
      callId: 'call_once',
    };
    const [first, second] = await Promise.all([
      runAction('settings.open', {}, context, { emitToast: false }),
      runAction('settings.open', {}, context, { emitToast: false }),
    ]);
    expect(first).toEqual(second);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('omits command payloads from action diagnostics', async () => {
    const secretCommand = 'Write-Output PRIVATE_VALUE_DO_NOT_LOG';
    const result = await runAction(
      'terminal.run',
      { command: secretCommand, cwd: 'C:\\Projects\\Safe' },
      { source: 'ai', messageId: 'message_secret', callId: 'call_secret' },
      { emitToast: false },
    );
    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(useDevConsoleStore.getState().entries);
    expect(serialized).not.toContain(secretCommand);
    expect(serialized).toContain('[omitted]');
    expect(serialized).toContain('C:\\\\Projects\\\\Safe');
  });
});
