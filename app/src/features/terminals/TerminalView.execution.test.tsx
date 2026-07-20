import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  attachTerminalViewExecution,
  canonicalTerminalSpawnToken,
  createTerminalExitLatch,
  settleTerminalInitializationFailure,
} from './TerminalView';

describe('TerminalView canonical execution truth', () => {
  it('gates the terminal execution evidence selector behind the smoke contract', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/terminals/TerminalView.tsx'),
      'utf8',
    );

    expect(source).toContain('KERNEL_SMOKE_ENABLED ? SIK_EVIDENCE.terminalExecution : undefined');
    expect(source).not.toContain('data-sik-evidence="terminal.execution"');
  });

  it('refuses to spawn a canonical terminal after restart without its private token owner', () => {
    const readToken = vi.fn(() => undefined);

    expect(() =>
      canonicalTerminalSpawnToken('jterm_restart', {
        isCanonical: () => true,
        readToken,
      }),
    ).toThrow('canonical_terminal_handle_unavailable_after_restart');
    expect(readToken).toHaveBeenCalledWith('jterm_restart');
  });

  it('keeps manual terminal spawns tokenless without consulting canonical storage', () => {
    const readToken = vi.fn(() => 'unexpected');

    expect(
      canonicalTerminalSpawnToken('manual_terminal', {
        isCanonical: () => false,
        readToken,
      }),
    ).toBeUndefined();
    expect(readToken).not.toHaveBeenCalled();
  });

  it('settles spawn rejection through the bound degraded-result owner', async () => {
    const failBeforeNativeExit = vi.fn(async () => true);
    const killManual = vi.fn(async () => undefined);

    await settleTerminalInitializationFailure(
      {
        executionId: 'jterm_1',
        sessionId: '',
        nativeSessionStarted: false,
        executionAttached: false,
      },
      {
        isCanonical: () => true,
        failBeforeNativeExit,
        requestCancellation: vi.fn(),
        killManual,
      },
    );

    expect(failBeforeNativeExit).toHaveBeenCalledWith('jterm_1', 'native_spawn_failed');
    expect(killManual).not.toHaveBeenCalled();
  });

  it('settles attach failure and manually stops the unbound native session', async () => {
    const failBeforeNativeExit = vi.fn(async () => true);
    const killManual = vi.fn(async () => undefined);

    await settleTerminalInitializationFailure(
      {
        executionId: 'jterm_1',
        sessionId: 'pty_unbound',
        nativeSessionStarted: true,
        executionAttached: false,
      },
      {
        isCanonical: () => true,
        failBeforeNativeExit,
        requestCancellation: vi.fn(),
        killManual,
      },
    );

    expect(failBeforeNativeExit).toHaveBeenCalledWith('jterm_1', 'native_attach_failed');
    expect(killManual).toHaveBeenCalledWith('pty_unbound');
  });

  it('attaches the exact canonical session before releasing an early native exit', async () => {
    const order: string[] = [];
    const payload = {
      sessionId: 'pty_early',
      code: 0,
      reason: 'natural_exit' as const,
    };
    const latch = createTerminalExitLatch((exit) => {
      order.push(`exit:${exit.sessionId}`);
    });
    const attach = vi.fn(async () => {
      order.push('attach');
      return true;
    });

    latch.observe(payload);
    await expect(
      attachTerminalViewExecution('jterm_1', payload.sessionId, {
        isCanonical: () => true,
        attach,
      }),
    ).resolves.toBe(true);
    expect(latch.bind(payload.sessionId)).toBe(true);

    expect(attach).toHaveBeenCalledWith('jterm_1', 'pty_early');
    expect(order).toEqual(['attach', 'exit:pty_early']);
  });

  it('delivers only the first exact native exit after binding a session', () => {
    const delivered = vi.fn();
    const latch = createTerminalExitLatch(delivered);

    latch.observe({ sessionId: 'pty_other', code: 1, reason: 'natural_exit' });
    expect(latch.bind('pty_exact')).toBe(false);
    latch.observe({ sessionId: 'pty_exact', code: 0, reason: 'natural_exit' });
    latch.observe({ sessionId: 'pty_exact', code: 1, reason: 'natural_exit' });

    expect(delivered).toHaveBeenCalledOnce();
    expect(delivered).toHaveBeenCalledWith({
      sessionId: 'pty_exact',
      code: 0,
      reason: 'natural_exit',
    });
  });
});
