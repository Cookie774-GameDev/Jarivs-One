import { describe, expect, it, vi } from 'vitest';
import type { InstantCommand } from './types';
import { InstantCommandEntryBoundary } from './entryBoundary';

const command: InstantCommand = { kind: 'open-agent-cli', provider: 'opencode', count: 1 };

describe('InstantCommandEntryBoundary', () => {
  it('deduplicates phrase commit, voice final, and retry for one interaction', async () => {
    const classify = vi.fn(() => ({ status: 'matched' as const, command }));
    const execute = vi.fn(async () => ({
      commandId: 'terminal.open',
      correlationId: 'interaction_1',
      status: 'queued' as const,
      acceptedAtMs: 1,
      targetIds: ['opencode'],
    }));
    const boundary = new InstantCommandEntryBoundary({ classify, execute });
    const input = {
      interactionId: 'interaction_1',
      source: 'open OpenCode',
      context: { correlationId: 'interaction_1', accountId: 'a', workspaceId: 'w', projectId: 'p' },
    };

    const outcomes = await Promise.all([
      boundary.submit({ ...input, trigger: 'phrase_commit' }),
      boundary.submit({ ...input, trigger: 'voice_final' }),
      boundary.submit({ ...input, trigger: 'retry' }),
    ]);
    expect(outcomes.every((outcome) => outcome.kind === 'command')).toBe(true);
    expect(classify).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('leaves unmatched input on the selected model path and never sends rejected commands', async () => {
    const sendToModel = vi.fn(async () => 'model-result');
    const execute = vi.fn();
    const unmatched = new InstantCommandEntryBoundary({
      classify: vi.fn(() => ({ status: 'unmatched' as const })),
      execute,
      sendToModel,
    });
    await expect(
      unmatched.submit({
        interactionId: 'chat_1',
        trigger: 'typed',
        source: 'explain this code',
        context: { correlationId: 'chat_1', accountId: 'a', workspaceId: 'w', projectId: 'p' },
      }),
    ).resolves.toEqual({ kind: 'model', value: 'model-result' });
    expect(sendToModel).toHaveBeenCalledWith('explain this code');
    expect(execute).not.toHaveBeenCalled();
  });
});
