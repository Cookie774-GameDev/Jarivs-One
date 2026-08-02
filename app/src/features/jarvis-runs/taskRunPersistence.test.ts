import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JarvisTaskRun } from './taskRunStore';
import { readLegacyJarvisTaskRunsOnce } from './taskRunPersistence';

const accountStorage = vi.hoisted(() => ({
  privateAccountDirectory: vi.fn(async (accountId: string) => `scope-${accountId}`),
}));

vi.mock('@/features/jarvis-memory/accountStorage', () => ({
  privateAccountDirectory: accountStorage.privateAccountDirectory,
}));

const NOW = '2026-07-19T07:00:00.000Z';

function legacyRun(id: string): JarvisTaskRun {
  return {
    id,
    chatId: 'chat-alpha',
    goal: `Historical ${id}`,
    status: 'waiting-for-input',
    steps: [
      {
        id: 'step-one',
        action: 'status.read',
        label: 'Read',
        input: {},
        recoverable: true,
        status: 'waiting',
      },
    ],
    progress: 50,
    activeAgents: [],
    activeTerminals: [],
    userVisibleSummary: 'Historical summary',
    startedAt: NOW,
    updatedAt: NOW,
  };
}

describe('readLegacyJarvisTaskRunsOnce', () => {
  beforeEach(() => {
    accountStorage.privateAccountDirectory.mockClear();
    localStorage.clear();
  });

  it('requires a nonblank canonical account and never hashes a fallback identity', async () => {
    await expect(readLegacyJarvisTaskRunsOnce({ accountId: '   ' })).rejects.toThrow(
      /account id is required/i,
    );
    expect(accountStorage.privateAccountDirectory).not.toHaveBeenCalled();
    expect(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)),
    ).not.toContain('jarvis-task-runs-v2:local-unassigned');
  });

  it('reads the hashed V2 scope once with zero writes, removals, or subscriptions', async () => {
    const stored = legacyRun('v2-run');
    localStorage.setItem(
      'jarvis-task-runs-v2:scope-account-alpha',
      JSON.stringify({ version: 2, runs: [stored] }),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const addEventListener = vi.spyOn(window, 'addEventListener');

    const result = await readLegacyJarvisTaskRunsOnce({ accountId: 'account-alpha' });

    expect(accountStorage.privateAccountDirectory).toHaveBeenCalledOnce();
    expect(result.map((item) => item.id)).toEqual(['v2-run']);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
    setItem.mockRestore();
    removeItem.mockRestore();
    addEventListener.mockRestore();
  });

  it('uses V1 only when V2 has no valid historical rows and never migrates or deletes it', async () => {
    localStorage.setItem(
      'jarvis-task-runs-v2:scope-account-alpha',
      JSON.stringify({ version: 2, runs: [{ malformed: true }] }),
    );
    localStorage.setItem(
      'jarvis-task-runs-v1',
      JSON.stringify({ version: 1, state: { runs: { legacy: legacyRun('legacy') } } }),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

    const result = await readLegacyJarvisTaskRunsOnce({ accountId: 'account-alpha' });

    expect(result.map((item) => item.id)).toEqual(['legacy']);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(localStorage.getItem('jarvis-task-runs-v1')).not.toBeNull();
    setItem.mockRestore();
    removeItem.mockRestore();
  });

  it('never reads V1 when V2 contains at least one valid row', async () => {
    localStorage.setItem(
      'jarvis-task-runs-v2:scope-account-alpha',
      JSON.stringify({ version: 2, runs: [legacyRun('v2')] }),
    );
    localStorage.setItem(
      'jarvis-task-runs-v1',
      JSON.stringify({ version: 1, runs: [legacyRun('v1')] }),
    );
    const getItem = vi.spyOn(Storage.prototype, 'getItem');

    const result = await readLegacyJarvisTaskRunsOnce({ accountId: 'account-alpha' });

    expect(result.map((item) => item.id)).toEqual(['v2']);
    expect(getItem.mock.calls.map(([key]) => key)).not.toContain('jarvis-task-runs-v1');
    getItem.mockRestore();
  });

  it('returns at most 100 sanitized detached historical rows', async () => {
    const runs = Array.from({ length: 105 }, (_, index) => legacyRun(`run-${index}`));
    runs[0]!.goal = 'Use password=never-return-this';
    runs[0]!.steps[0]!.input = { apiKey: 'sk-private-credential', query: 'safe' };
    localStorage.setItem(
      'jarvis-task-runs-v2:scope-account-alpha',
      JSON.stringify({ version: 2, runs }),
    );

    const result = await readLegacyJarvisTaskRunsOnce({ accountId: 'account-alpha' });

    expect(result).toHaveLength(100);
    expect(JSON.stringify(result)).not.toMatch(/never-return-this|sk-private-credential/);
    expect(result[0]?.steps[0]?.input).toEqual({ apiKey: '[redacted]', query: 'safe' });
    (result[0] as JarvisTaskRun).goal = 'mutated detached view';
    expect(
      JSON.parse(localStorage.getItem('jarvis-task-runs-v2:scope-account-alpha') ?? '{}').runs[0]
        .goal,
    ).toBe('Use password=never-return-this');
  });
});
