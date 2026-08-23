import { describe, expect, it, vi } from 'vitest';
import type { LiveModelRuntimeMetadata } from '@/features/chat/runtime/runtimeModelControls';
import { OpenCodeTurnCoordinator } from '../OpenCodeTurnCoordinator';
import type { OpenCodeSessionPool } from '../OpenCodeSessionPool';

const metadata: LiveModelRuntimeMetadata = {
  connectionId: 'openai-chatgpt-pro',
  modelId: 'gpt-5.6-sol',
  variants: [
    { id: 'high', kind: 'reasoning', reasoningEffort: 'high' },
    { id: 'high-fast', kind: 'combined', reasoningEffort: 'high', fast: true },
  ],
};

describe('OpenCodeTurnCoordinator', () => {
  it('consumes VibeSpace runtime commands without sending them to OpenCode', async () => {
    const sendAsync = vi.fn();
    const sessions = {
      sessionForChat: vi.fn(async () => ({
        sessionId: 'session',
        runtimeGeneration: 'generation',
        client: { createSession: vi.fn(), abort: vi.fn(), sendAsync },
      })),
    } as unknown as OpenCodeSessionPool;
    const coordinator = new OpenCodeTurnCoordinator(sessions);
    const result = await coordinator.dispatch({
      scope: { accountId: 'account', projectId: 'project' },
      chatId: 'chat',
      text: '/rlm off',
      selection: {
        connectionId: 'openai-chatgpt-pro', providerId: 'openai', modelId: 'gpt-5.6-sol', metadata,
      },
      policy: { mode: 'ask', access: 'read-only', approveAllForRun: false, projectRoot: 'C:/project' },
    });
    expect(result.kind).toBe('command');
    expect(sendAsync).not.toHaveBeenCalled();
    expect(sessions.sessionForChat).not.toHaveBeenCalled();
  });

  it('validates exact controls and dispatches through the persistent session client', async () => {
    const sendAsync = vi.fn(async () => undefined);
    const sessions = {
      sessionForChat: vi.fn(async () => ({
        sessionId: 'session',
        runtimeGeneration: 'generation',
        client: { createSession: vi.fn(), abort: vi.fn(), sendAsync },
      })),
    } as unknown as OpenCodeSessionPool;
    const coordinator = new OpenCodeTurnCoordinator(sessions);
    const result = await coordinator.dispatch({
      scope: { accountId: 'account', projectId: 'project' },
      chatId: 'chat',
      text: 'Reply with READY.',
      settings: { effort: 'high', fastMode: 'on', performance: 'quality', rlmEnabled: true },
      selection: {
        connectionId: 'openai-chatgpt-pro', providerId: 'openai', modelId: 'gpt-5.6-sol', metadata,
      },
      policy: { mode: 'agent', access: 'full', approveAllForRun: true, projectRoot: 'C:/project' },
    });
    expect(result).toMatchObject({
      kind: 'dispatched', sessionId: 'session', runtimeGeneration: 'generation',
      controls: { connectionId: 'openai-chatgpt-pro', modelId: 'gpt-5.6-sol', variant: 'high-fast' },
      permissions: { gateway: { mutationAuthority: 'autonomous' } },
    });
    expect(sendAsync).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session',
      text: 'Reply with READY.',
      controls: expect.objectContaining({ modelId: 'gpt-5.6-sol', variant: 'high-fast' }),
    }));
  });

  it('sends Codex Spark even when leftover max effort is unsupported', async () => {
    const sendAsync = vi.fn(async () => undefined);
    const sessions = {
      sessionForChat: vi.fn(async () => ({
        sessionId: 'session-spark',
        runtimeGeneration: 'gen-1',
        client: { sendAsync },
      })),
    } as unknown as OpenCodeSessionPool;
    const coordinator = new OpenCodeTurnCoordinator(sessions);
    const result = await coordinator.dispatch({
      scope: { accountId: 'account' },
      chatId: 'chat',
      text: 'hello',
      settings: { effort: 'max', fastMode: 'off', performance: 'quality', rlmEnabled: true },
      selection: {
        connectionId: 'openai-chatgpt-pro', providerId: 'openai', modelId: 'gpt-5.3-codex-spark',
        metadata: {
          connectionId: 'openai-chatgpt-pro',
          modelId: 'gpt-5.3-codex-spark',
          variants: [{ id: 'medium' }],
        },
      },
      policy: { mode: 'ask', access: 'read-only', approveAllForRun: false, projectRoot: 'C:/project' },
    });
    expect(result.kind).toBe('dispatched');
    expect(sessions.sessionForChat).toHaveBeenCalledOnce();
    expect(sendAsync).toHaveBeenCalledOnce();
  });

  it('rejects a changed protected session before sending the follow-up prompt', async () => {
    const sendAsync = vi.fn(async () => undefined);
    const sessions = {
      sessionForChat: vi.fn(async () => ({
        sessionId: 'session-restored-different',
        runtimeGeneration: 'gen-2',
        client: { sendAsync },
      })),
    } as unknown as OpenCodeSessionPool;
    const coordinator = new OpenCodeTurnCoordinator(sessions);

    await expect(
      coordinator.dispatch({
        scope: { accountId: 'account' },
        chatId: 'chat',
        text: 'synthesize existing evidence',
        expectedSessionId: 'session-evidence',
        requireExactRuntimeControls: true,
        selection: {
          connectionId: 'openai-chatgpt-pro',
          providerId: 'openai',
          modelId: 'gpt-5.6-sol',
          metadata,
        },
        policy: {
          mode: 'ask',
          access: 'read-only',
          approveAllForRun: false,
          projectRoot: 'C:/project',
        },
      }),
    ).rejects.toThrow('kernel_explicit_root_session_changed_before_dispatch');
    expect(sendAsync).not.toHaveBeenCalled();
  });

  it('does not downgrade unsupported controls for an exact protected phase', async () => {
    const sendAsync = vi.fn(async () => undefined);
    const sessions = {
      sessionForChat: vi.fn(async () => ({
        sessionId: 'session',
        runtimeGeneration: 'generation',
        client: { sendAsync },
      })),
    } as unknown as OpenCodeSessionPool;
    const coordinator = new OpenCodeTurnCoordinator(sessions);
    const result = await coordinator.dispatch({
      scope: { accountId: 'account' },
      chatId: 'chat',
      text: 'collect evidence',
      requireExactRuntimeControls: true,
      settings: { effort: 'max', fastMode: 'off', performance: 'quality', rlmEnabled: false },
      selection: {
        connectionId: 'openai-chatgpt-pro',
        providerId: 'openai',
        modelId: 'gpt-5.3-codex-spark',
        metadata: {
          connectionId: 'openai-chatgpt-pro',
          modelId: 'gpt-5.3-codex-spark',
          variants: [{ id: 'medium' }],
        },
      },
      policy: {
        mode: 'ask',
        access: 'read-only',
        approveAllForRun: false,
        projectRoot: 'C:/project',
      },
    });
    expect(result).toMatchObject({ kind: 'rejected', code: 'MODEL_CONTROL_UNSUPPORTED' });
    expect(sessions.sessionForChat).not.toHaveBeenCalled();
    expect(sendAsync).not.toHaveBeenCalled();
  });
});
