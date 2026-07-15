import { afterEach, describe, expect, it, vi } from 'vitest';

import { McpServerManager, type McpServerAdapter } from './serverManager';

describe('MCP server lifecycle manager', () => {
  const managers: McpServerManager[] = [];
  afterEach(async () => {
    await Promise.all(managers.map((manager) => manager.stopAll()));
    vi.useRealTimers();
  });

  it('deduplicates concurrent starts and exposes health and tools', async () => {
    const start = vi.fn(async () => ({
      listTools: async () => [{ name: 'repo.read', description: 'Read repository state' }],
      invoke: async () => ({ ok: true }),
      health: async () => true,
      stop: async () => undefined,
    }));
    const manager = new McpServerManager({ idleTimeoutMs: 60_000 });
    managers.push(manager);
    manager.register({ id: 'github', start });

    await Promise.all([manager.start('github'), manager.start('github')]);

    expect(start).toHaveBeenCalledTimes(1);
    expect(manager.status('github')).toMatchObject({ state: 'running', healthy: true });
    expect(await manager.listTools('github')).toEqual([
      { name: 'repo.read', description: 'Read repository state' },
    ]);
  });

  it('restarts once only when an idempotent caller explicitly opts in', async () => {
    let attempts = 0;
    const adapter: McpServerAdapter = {
      id: 'recovering',
      start: vi.fn(async () => ({
        listTools: async () => [],
        invoke: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('transport closed');
          return { recovered: true };
        },
        health: async () => true,
        stop: async () => undefined,
      })),
    };
    const manager = new McpServerManager();
    managers.push(manager);
    manager.register(adapter);

    await expect(manager.invoke('recovering', 'repo.read', {}, { restartOnFailure: true }))
      .resolves.toEqual({ recovered: true });
    expect(adapter.start).toHaveBeenCalledTimes(2);
  });

  it('does not retry an ambiguous invocation failure by default', async () => {
    const invoke = vi.fn(async () => { throw new Error('transport closed after send'); });
    const start = vi.fn(async () => ({
      listTools: async () => [],
      invoke,
      health: async () => true,
      stop: async () => undefined,
    }));
    const manager = new McpServerManager();
    managers.push(manager);
    manager.register({ id: 'write-once', start });

    await expect(manager.invoke('write-once', 'message.send', {}))
      .rejects.toThrow('transport closed after send');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('times out stalled calls and reports an unhealthy server', async () => {
    const manager = new McpServerManager({ invocationTimeoutMs: 20 });
    managers.push(manager);
    manager.register({
      id: 'stalled',
      start: async () => ({
        listTools: async () => [],
        invoke: async () => new Promise(() => undefined),
        health: async () => true,
        stop: async () => undefined,
      }),
    });

    await expect(manager.invoke('stalled', 'slow', {}, { restartOnFailure: false }))
      .rejects.toThrow('timed out');
    expect(manager.status('stalled')).toMatchObject({ state: 'unhealthy', healthy: false });
  });

  it('stops an unhealthy client before replacing it', async () => {
    const firstStop = vi.fn(async () => undefined);
    let starts = 0;
    let firstHealthChecks = 0;
    const manager = new McpServerManager();
    managers.push(manager);
    manager.register({
      id: 'replace-unhealthy',
      start: async () => {
        starts += 1;
        const first = starts === 1;
        return {
          listTools: async () => [],
          invoke: async () => ({}),
          health: async () => !first || firstHealthChecks++ === 0,
          stop: first ? firstStop : async () => undefined,
        };
      },
    });

    await manager.start('replace-unhealthy');
    await manager.health('replace-unhealthy');
    expect(manager.status('replace-unhealthy').state).toBe('unhealthy');
    await manager.start('replace-unhealthy');

    expect(firstStop).toHaveBeenCalledTimes(1);
    expect(manager.status('replace-unhealthy')).toMatchObject({ state: 'running', healthy: true });
  });

  it('does not resurrect a server stopped while startup is in flight', async () => {
    let releaseStart: (() => void) | undefined;
    const stopClient = vi.fn(async () => undefined);
    const manager = new McpServerManager();
    managers.push(manager);
    manager.register({
      id: 'slow-start',
      start: async () => {
        await new Promise<void>((resolve) => { releaseStart = resolve; });
        return {
          listTools: async () => [],
          invoke: async () => ({}),
          health: async () => true,
          stop: stopClient,
        };
      },
    });

    const starting = manager.start('slow-start');
    await vi.waitFor(() => expect(releaseStart).toBeTypeOf('function'));
    const stopping = manager.stop('slow-start');
    releaseStart?.();
    await Promise.all([starting, stopping]);

    expect(stopClient).toHaveBeenCalledTimes(1);
    expect(manager.status('slow-start')).toMatchObject({ state: 'stopped', healthy: false });
  });
});
