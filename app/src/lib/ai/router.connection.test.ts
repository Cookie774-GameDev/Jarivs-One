import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAdapter, ProviderConnection, ProviderEvent } from './adapters/types';
import { runExternalConnection } from './router';

const connection: ProviderConnection = {
  id: 'openai-codex',
  adapterId: 'codex-cli',
  providerId: 'openai',
  displayName: 'Codex CLI',
  mode: 'external-cli',
  authSource: 'codex-cli-session',
  enabled: true,
  promptTransport: 'prefixed-preamble',
  capabilities: {
    text: true,
    images: false,
    files: false,
    tools: false,
    modelSelection: true,
    structuredOutput: true,
    streaming: true,
    cancellation: true,
    resumeSession: false,
    systemPrompt: false,
    workingDirectory: true,
    usage: true,
    subscriptionQuota: false,
    localOnly: false,
  },
};

async function* events(): AsyncGenerator<ProviderEvent> {
  yield { type: 'text', delta: 'hello' };
  yield {
    type: 'usage',
    usage: {
      capturedAt: 1,
      inputTokens: { value: 2, provenance: 'provider-reported' },
      outputTokens: { value: 1, provenance: 'provider-reported' },
    },
  };
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
      connection,
      adapter,
      prompt: 'hi',
      modelId: 'gpt-5.6-sol',
      requestId: 'req-1',
    });
    expect(adapter.send).toHaveBeenCalledOnce();
    expect(response.text).toBe('hello');
  });

  it('rejects unsupported attachments before detecting or spawning', async () => {
    await expect(
      runExternalConnection({
        connection,
        adapter,
        prompt: 'look',
        modelId: 'gpt-5.6-sol',
        requestId: 'req-2',
        requirements: { images: true },
      }),
    ).rejects.toThrow('does not support image attachments');
    expect(adapter.detect).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('rejects models outside the exact connection catalog before any provider work', async () => {
    await expect(
      runExternalConnection({
        connection,
        adapter,
        prompt: 'hi',
        modelId: 'gpt-4o',
        requestId: 'req-legacy-model',
      }),
    ).rejects.toThrow('is unavailable for Codex CLI');
    expect(adapter.detect).not.toHaveBeenCalled();
    expect(adapter.probeAuth).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('rejects signed-out and unavailable connections before send', async () => {
    vi.mocked(adapter.probeAuth!).mockResolvedValue({ status: 'unauthenticated' });
    await expect(
      runExternalConnection({ connection, adapter, prompt: 'hi', requestId: 'req-3' }),
    ).rejects.toThrow('is signed out');
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('requires positively authenticated status before send', async () => {
    vi.mocked(adapter.probeAuth!).mockResolvedValue({ status: 'unknown' });
    await expect(
      runExternalConnection({ connection, adapter, prompt: 'hi', requestId: 'req-unknown-auth' }),
    ).rejects.toThrow('authentication could not be verified');
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('rejects an already-aborted request before detection or authentication', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runExternalConnection({
        connection,
        adapter,
        prompt: 'hi',
        requestId: 'req-aborted',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(adapter.detect).not.toHaveBeenCalled();
    expect(adapter.probeAuth).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('rejects unsupported transport before detection or authentication', async () => {
    const unsupported = { ...connection, promptTransport: 'unsupported' as const };

    await expect(
      runExternalConnection({
        connection: unsupported,
        adapter,
        prompt: 'hi',
        requestId: 'req-unsupported',
      }),
    ).rejects.toThrow('cannot preserve the protected prompt contract');
    expect(adapter.detect).not.toHaveBeenCalled();
    expect(adapter.probeAuth).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('forwards the exact signal and protected observation hooks to the adapter', async () => {
    const controller = new AbortController();
    const onResponseObservation = vi.fn();
    const onActionDispatch = vi.fn();

    await runExternalConnection({
      connection,
      adapter,
      prompt: 'hi',
      requestId: 'req-hooks',
      signal: controller.signal,
      onResponseObservation,
      onActionDispatch,
    });

    expect(adapter.send).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
        onResponseObservation,
        onActionDispatch,
      }),
    );
  });

  it('stops before forwarding an adapter event observed after midstream abort', async () => {
    const controller = new AbortController();
    const onChunk = vi.fn();
    adapter.send = vi.fn(() =>
      (async function* () {
        controller.abort();
        yield { type: 'text', delta: 'must not escape after abort' } as const;
      })(),
    );

    await expect(
      runExternalConnection({
        connection,
        adapter,
        prompt: 'hi',
        requestId: 'req-midstream-abort',
        signal: controller.signal,
        onChunk,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(onChunk).not.toHaveBeenCalled();
  });
});
