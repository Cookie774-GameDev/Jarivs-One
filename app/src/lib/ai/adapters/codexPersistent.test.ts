import { describe, expect, it, vi } from 'vitest';
import type { ProviderConnection } from './types';
import { createCodexPersistentAdapter } from './codexPersistent';

const connection: ProviderConnection = {
  id: 'openai-codex',
  adapterId: 'codex-app-server',
  providerId: 'opencode-go',
  displayName: 'Codex via OpenCodex',
  mode: 'external-cli',
  authSource: 'opencode-provider-session',
  promptTransport: 'native-system',
  enabled: true,
  capabilities: {
    text: true,
    images: false,
    files: true,
    tools: true,
    modelSelection: true,
    structuredOutput: true,
    streaming: true,
    cancellation: true,
    resumeSession: true,
    systemPrompt: true,
    workingDirectory: true,
    usage: true,
    subscriptionQuota: false,
    localOnly: false,
  },
};

async function* frames() {
  yield {
    id: 'request_1_model_1',
    result: {
      data: [
        {
          model: 'opencode-go/deepseek-v4-flash-vision-exp',
          supportedReasoningEfforts: [],
          serviceTiers: [],
        },
      ],
      nextCursor: null,
    },
  };
  yield {
    id: 'request_1_thread',
    result: {
      thread: { id: 'thread_native_1' },
      model: 'opencode-go/deepseek-v4-flash-vision-exp',
      modelProvider: 'openai',
      serviceTier: null,
      cwd: 'C:\\workspace',
      approvalPolicy: 'never',
      approvalsReviewer: 'user',
      sandbox: { type: 'readOnly', networkAccess: false },
      reasoningEffort: null,
    },
  };
  yield {
    method: 'turn/started',
    params: {
      threadId: 'thread_native_1',
      turn: { id: 'turn_native_1' },
    },
  };
  yield {
    method: 'item/agentMessage/delta',
    params: {
      threadId: 'thread_native_1',
      turnId: 'turn_native_1',
      itemId: 'message_native_1',
      delta: 'Working on it.',
    },
  };
  yield {
    method: 'item/completed',
    params: {
      threadId: 'thread_native_1',
      turnId: 'turn_native_1',
      item: {
        id: 'command_native_1',
        type: 'commandExecution',
        status: 'completed',
        commandActions: [{ type: 'read', path: 'C:\\workspace\\game.js' }],
        exitCode: 0,
      },
    },
  };
  yield {
    method: 'turn/completed',
    params: {
      threadId: 'thread_native_1',
      turnId: 'turn_native_1',
      turn: { id: 'turn_native_1', status: 'completed' },
    },
  };
}

describe('persistent Codex app-server adapter', () => {
  it('subscribes before dispatch and projects the exact OpenCodex model incrementally', async () => {
    const calls: string[] = [];
    const writes: Array<Record<string, unknown>> = [];
    const adapter = createCodexPersistentAdapter({
      findExecutable: async () => ({ executableId: 'trusted-codex', executablePath: 'codex.exe' }),
      start: async (_executableId, _ownerId, modelId) => {
        calls.push('start');
        expect(modelId).toBe('opencode-go/deepseek-v4-flash-vision-exp');
        return { generation: 'codex-generation-1' };
      },
      frames: () => {
        calls.push('stream');
        return {
          stream: frames(),
          ready: Promise.resolve().then(() => {
            calls.push('subscribed');
          }),
        };
      },
      write: async (_generation, message) => {
        calls.push('write');
        writes.push(message);
      },
      stop: async () => true,
    });
    const events = [];
    for await (const event of adapter.send!({
      requestId: 'request_1',
      connection,
      chatId: 'chat_1',
      prompt: 'Please read game.js and report what it does.',
      modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
      workingDirectory: 'C:\\workspace',
      interactionMode: 'ask',
    })) {
      events.push(event);
    }

    expect(calls.slice(0, 4)).toEqual(['start', 'stream', 'subscribed', 'write']);
    expect(writes.map((message) => message.method)).toEqual([
      'model/list',
      'thread/start',
      'turn/start',
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'session', sessionId: 'thread_native_1' },
        {
          type: 'text',
          delta: 'Working on it.',
          streamPartId: 'message_native_1',
        },
        {
          type: 'tool',
          name: 'read',
          status: 'completed',
          callId: 'command_native_1',
          fileLabel: 'game.js',
          result: { exitCode: 0 },
        },
        { type: 'done', finishReason: 'completed' },
      ]),
    );
    expect(writes[0]).toMatchObject({
      method: 'model/list',
      params: { includeHidden: true },
    });
    expect(writes[1]).toMatchObject({
      method: 'thread/start',
      params: {
        model: 'opencode-go/deepseek-v4-flash-vision-exp',
        modelProvider: 'openai',
        cwd: 'C:\\workspace',
        approvalPolicy: 'never',
        sandbox: 'read-only',
      },
    });
  });

  it('fails closed instead of substituting another model', async () => {
    async function* wrongModelFrames() {
      yield {
        id: 'request_1_model_1',
        result: {
          data: [
            { model: 'different/model', supportedReasoningEfforts: [], serviceTiers: [] },
          ],
          nextCursor: null,
        },
      };
    }
    const adapter = createCodexPersistentAdapter({
      findExecutable: async () => ({ executableId: 'trusted-codex', executablePath: 'codex.exe' }),
      start: async () => ({ generation: 'codex-generation-1' }),
      frames: () => ({ stream: wrongModelFrames(), ready: Promise.resolve() }),
      write: vi.fn(async () => undefined),
      stop: async () => true,
    });

    const consume = async () => {
      for await (const _event of adapter.send!({
        requestId: 'request_1',
        connection,
        chatId: 'chat_1',
        prompt: 'Hello',
        modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
        workingDirectory: 'C:\\workspace',
        interactionMode: 'ask',
      })) {
        // No event is accepted before exact model capability validation.
      }
    };
    await expect(consume()).rejects.toThrow(/model capability mismatch/u);
  });
});
