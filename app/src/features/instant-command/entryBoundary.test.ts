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

  it('never evicts an active interaction at capacity or executes its retry twice', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(async (_command: InstantCommand, context: { correlationId: string }) => {
      await pending;
      return {
        commandId: 'terminal.open',
        correlationId: context.correlationId,
        status: 'queued' as const,
        acceptedAtMs: 1,
        targetIds: ['opencode'],
      };
    });
    const boundary = new InstantCommandEntryBoundary({
      classify: () => ({ status: 'matched', command }),
      execute,
    });
    const submit = (index: number) =>
      boundary.submit({
        interactionId: `interaction_${index}`,
        trigger: 'typed',
        source: 'open OpenCode',
        context: {
          correlationId: `interaction_${index}`,
          accountId: 'account_1',
          workspaceId: 'workspace_1',
          projectId: 'project_1',
        },
      });

    const active = Array.from({ length: 256 }, (_, index) => submit(index));
    const firstRetry = submit(0);
    await expect(submit(256)).resolves.toEqual({
      kind: 'rejected',
      reason: 'Too many Instant Commands are active.',
    });
    expect(execute).toHaveBeenCalledTimes(256);

    release();
    const [first, retried] = await Promise.all([active[0], firstRetry]);
    expect(retried).toBe(first);
    expect(execute).toHaveBeenCalledTimes(256);
    await Promise.all(active);
  });

  it('rejects malformed identity, trigger, and source before classification or model dispatch', async () => {
    const classify = vi.fn(() => ({ status: 'unmatched' as const }));
    const sendToModel = vi.fn();
    const boundary = new InstantCommandEntryBoundary({ classify, sendToModel });
    const base = {
      interactionId: 'interaction_1',
      trigger: 'typed' as const,
      source: 'ordinary chat',
      context: {
        correlationId: 'interaction_1',
        accountId: 'account_1',
        workspaceId: 'workspace_1',
        projectId: 'project_1',
      },
    };

    await expect(
      boundary.submit({
        ...base,
        interactionId: 'bad id',
        context: { ...base.context, correlationId: 'bad id' },
      }),
    ).resolves.toMatchObject({ kind: 'rejected' });
    await expect(
      boundary.submit({ ...base, trigger: 'invalid' as typeof base.trigger }),
    ).resolves.toMatchObject({ kind: 'rejected' });
    await expect(boundary.submit({ ...base, source: '\u0000hidden' })).resolves.toMatchObject({
      kind: 'rejected',
    });
    await expect(
      boundary.submit({ ...base, context: { ...base.context, accountId: 'x'.repeat(201) } }),
    ).resolves.toMatchObject({ kind: 'rejected' });
    expect(classify).not.toHaveBeenCalled();
    expect(sendToModel).not.toHaveBeenCalled();
  });

  it('contains classifier, executor, and model failures without exposing private details', async () => {
    const input = {
      interactionId: 'interaction_failure',
      trigger: 'typed' as const,
      source: 'open OpenCode',
      context: {
        correlationId: 'interaction_failure',
        accountId: 'account_1',
        workspaceId: 'workspace_1',
        projectId: 'project_1',
      },
    };
    const failures = [
      new InstantCommandEntryBoundary({
        classify: () => {
          throw new Error('private classifier');
        },
      }),
      new InstantCommandEntryBoundary({
        classify: () => ({ status: 'matched', command }),
        execute: async () => {
          throw new Error('private executor');
        },
      }),
      new InstantCommandEntryBoundary({
        classify: () => ({ status: 'unmatched' }),
        sendToModel: async () => {
          throw new Error('private model');
        },
      }),
      new InstantCommandEntryBoundary({
        classify: () => ({ status: 'rejected', reason: 'private\nclassifier detail' }),
      }),
    ];

    for (const boundary of failures) {
      const outcome = await boundary.submit(input);
      expect(outcome).toEqual({
        kind: 'rejected',
        reason: 'Instant Command processing failed safely.',
      });
      expect(JSON.stringify(outcome)).not.toContain('private');
    }
  });

  it('binds an interaction id to the exact source and authority context', async () => {
    const sendToModel = vi.fn(async () => 'sent');
    const boundary = new InstantCommandEntryBoundary({
      classify: () => ({ status: 'unmatched' }),
      sendToModel,
    });
    const input = {
      interactionId: 'interaction_bound',
      trigger: 'typed' as const,
      source: 'first message',
      context: {
        correlationId: 'interaction_bound',
        accountId: 'account_1',
        workspaceId: 'workspace_1',
        projectId: 'project_1',
      },
    };

    await expect(boundary.submit(input)).resolves.toMatchObject({ kind: 'model' });
    await expect(boundary.submit({ ...input, source: 'changed message' })).resolves.toEqual({
      kind: 'rejected',
      reason: 'That interaction identity is already bound to different input.',
    });
    await expect(
      boundary.submit({ ...input, context: { ...input.context, accountId: 'account_2' } }),
    ).resolves.toEqual({
      kind: 'rejected',
      reason: 'That interaction identity is already bound to different input.',
    });
    expect(sendToModel).toHaveBeenCalledOnce();
  });
});
