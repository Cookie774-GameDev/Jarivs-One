import { describe, expect, it } from 'vitest';
import {
  acquireJarvisFileLock,
  createEmptyJarvisCoordinationSnapshot,
  registerJarvisChatAgent,
  releaseJarvisAgentLocks,
  updateJarvisAgentStatus,
} from './coordination';

describe('Jarvis chat-agent coordination', () => {
  it('registers chat-native agents with unique ids and task metadata', () => {
    const initial = createEmptyJarvisCoordinationSnapshot('C:/repo', '2026-06-24T12:00:00.000Z');
    const first = registerJarvisChatAgent(initial, {
      agentId: 'ja_1',
      name: 'Planner A',
      modelLabel: 'openai/gpt-4o',
      chatId: 'chat_1',
      task: 'Plan auth',
      now: '2026-06-24T12:00:01.000Z',
    });
    const second = registerJarvisChatAgent(first, {
      agentId: 'ja_2',
      name: 'Planner B',
      modelLabel: 'openai/gpt-4o',
      chatId: 'chat_2',
      task: 'Plan billing',
      now: '2026-06-24T12:00:02.000Z',
    });

    expect(second.agents.map((agent) => agent.agentId)).toEqual(['ja_1', 'ja_2']);
    expect(second.agents[0]).toMatchObject({ status: 'queued', task: 'Plan auth' });
  });

  it('prevents two active agents from locking the same file', () => {
    let snapshot = createEmptyJarvisCoordinationSnapshot('C:/repo', '2026-06-24T12:00:00.000Z');
    snapshot = registerJarvisChatAgent(snapshot, {
      agentId: 'ja_1',
      name: 'Builder A',
      modelLabel: 'google/gemini',
      chatId: 'chat_1',
      task: 'Edit composer',
      now: '2026-06-24T12:00:01.000Z',
    });
    snapshot = registerJarvisChatAgent(snapshot, {
      agentId: 'ja_2',
      name: 'Builder B',
      modelLabel: 'google/gemini',
      chatId: 'chat_2',
      task: 'Edit composer too',
      now: '2026-06-24T12:00:02.000Z',
    });

    const first = acquireJarvisFileLock(snapshot, {
      agentId: 'ja_1',
      filePath: 'app/src/features/chat/Composer.tsx',
      reason: 'Mode chip edit',
      now: '2026-06-24T12:00:03.000Z',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected first lock');

    const conflict = acquireJarvisFileLock(first.snapshot, {
      agentId: 'ja_2',
      filePath: 'app\\src\\features\\chat\\Composer.tsx',
      reason: 'Slash command edit',
      now: '2026-06-24T12:00:04.000Z',
    });

    expect(conflict.ok).toBe(false);
    if (conflict.ok) throw new Error('expected conflict');
    expect(conflict.conflict.lockedByAgentId).toBe('ja_1');
  });

  it('releases active locks when an agent finishes, fails, or is cancelled', () => {
    let snapshot = createEmptyJarvisCoordinationSnapshot('C:/repo', '2026-06-24T12:00:00.000Z');
    snapshot = registerJarvisChatAgent(snapshot, {
      agentId: 'ja_1',
      name: 'Builder A',
      modelLabel: 'google/gemini',
      chatId: 'chat_1',
      task: 'Edit runtime',
      now: '2026-06-24T12:00:01.000Z',
    });
    const locked = acquireJarvisFileLock(snapshot, {
      agentId: 'ja_1',
      filePath: 'app/src/lib/ai/runtime.ts',
      reason: 'Runtime mode overlay',
      now: '2026-06-24T12:00:02.000Z',
    });
    if (!locked.ok) throw new Error('expected lock');

    const done = updateJarvisAgentStatus(locked.snapshot, {
      agentId: 'ja_1',
      status: 'done',
      now: '2026-06-24T12:00:03.000Z',
    });
    const released = releaseJarvisAgentLocks(done, {
      agentId: 'ja_1',
      now: '2026-06-24T12:00:04.000Z',
    });

    expect(released.locks.every((lock) => lock.status === 'released')).toBe(true);
    expect(released.agents[0]?.lockedFiles).toEqual([]);
  });
});
