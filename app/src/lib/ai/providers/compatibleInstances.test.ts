import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { QWEN_DEFAULT_MODEL, qwenProvider } from './compatibleInstances';

describe('Qwen compatible provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('streams chat through the official Model Studio US endpoint', async () => {
    useAuthStore.setState({ apiKeys: { qwen: 'qwen-test-key' } });
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      requestInit = init;
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: 'Qwen ready' } }] })}\n\n`,
              ),
            );
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await qwenProvider.run({
      agent: {
        id: 'agent_qwen' as never,
        slug: 'qwen',
        name: 'Qwen',
        description: '',
        system_prompt: '',
        model: { provider: 'qwen', model: QWEN_DEFAULT_MODEL },
        tools_allowed: [],
        memory_scope: 'workspace',
        capabilities: [],
        created_at: 1,
        updated_at: 1,
      },
      systemPrompt: 'Be concise.',
      messages: [{ role: 'user', content: 'Hello' }],
      signal: new AbortController().signal,
      onChunk: vi.fn(),
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
    expect(new Headers(requestInit?.headers).get('Authorization')).toBe('Bearer qwen-test-key');
    expect(JSON.parse(String(requestInit?.body)).model).toBe('qwen3.7-plus');
    expect(response.text).toBe('Qwen ready');
  });
});
