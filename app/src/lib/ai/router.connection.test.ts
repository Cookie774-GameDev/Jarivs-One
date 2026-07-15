import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAdapter, ProviderConnection, ProviderEvent } from './adapters/types';
import { runExternalConnection } from './router';

const connection: ProviderConnection = {
  id: 'openai-codex', adapterId: 'codex-cli', providerId: 'openai',
  displayName: 'Codex CLI', mode: 'external-cli', authSource: 'codex-cli-session', enabled: true,
  capabilities: {
    text: true, images: false, files: false, tools: false, modelSelection: true,
    structuredOutput: true, streaming: true, cancellation: true, resumeSession: false,
    systemPrompt: false, workingDirectory: true, usage: true, subscriptionQuota: false, localOnly: false,
  },
};

async function* events(): AsyncGenerator<ProviderEvent> {
  yield { type: 'text', delta: 'hello' };
  yield { type: 'usage', usage: { capturedAt: 1, inputTokens: { value: 2, provenance: 'provider-reported' }, outputTokens: { value: 1, provenance: 'provider-reported' } } };
  yield { type: 'done' };
}

describe('connection routing', () => {
  let adapter: ProviderAdapter;
  beforeEach(() => {
    adapter = {
      id: 'codex-cli',
      detect: vi.fn(async () => ({ status: 'available' as const })),
      probeAuth: vi.fn(async () => ({ status: 'authenticated' as const })),
      send: vi.fn(() => events()),
    };
  });

  it('routes an external selection only through its exact adapter', async () => {
    const response = await runExternalConnection({
      connection, adapter, prompt: 'hi', modelId: 'gpt-5', requestId: 'req-1',
    });
    expect(adapter.send).toHaveBeenCalledOnce();
    expect(response.text).toBe('hello');
  });

  it('rejects unsupported attachments before detecting or spawning', async () => {
    await expect(runExternalConnection({
      connection, adapter, prompt: 'look', modelId: 'gpt-5', requestId: 'req-2',
      requirements: { images: true },
    })).rejects.toThrow('does not support image attachments');
    expect(adapter.detect).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('rejects signed-out and unavailable connections before send', async () => {
    vi.mocked(adapter.probeAuth!).mockResolvedValue({ status: 'unauthenticated' });
    await expect(runExternalConnection({ connection, adapter, prompt: 'hi', requestId: 'req-3' }))
      .rejects.toThrow('is signed out');
    expect(adapter.send).not.toHaveBeenCalled();
  });
});
