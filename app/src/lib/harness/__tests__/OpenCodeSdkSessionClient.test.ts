import { describe, expect, it, vi } from 'vitest';
import {
  CatalogVariantPromptAdapter,
  OpenCodeSdkSessionClient,
  StrictModelControlPromptAdapter,
  toOpenCodePermissionRules,
  toProviderSafeOpenCodeTools,
  type ModelControlPromptAdapter,
  type OpenCodeRawEvent,
} from '../OpenCodeSdkSessionClient';

function asyncEvents(events: readonly OpenCodeRawEvent[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
  };
}

function fakeClient(events: readonly OpenCodeRawEvent[] = []) {
  return {
    global: { health: vi.fn(async () => ({ data: { healthy: true, version: '1.2.3' } })) },
    config: { providers: vi.fn(async () => ({ data: { providers: [] } })) },
    session: {
      create: vi.fn(async () => ({ data: { id: 'session-1' } })),
      get: vi.fn(
        async (): Promise<{ data: { id: string; title?: string } }> => ({
          data: { id: 'session-1' },
        }),
      ),
      update: vi.fn(
        async (_input: {
          path: { id: string };
          body: { title?: string; permission?: readonly unknown[] };
        }) => ({ data: true }),
      ),
      abort: vi.fn(async () => ({ data: true })),
      promptAsync: vi.fn(async () => ({ data: undefined })),
    },
    event: { subscribe: vi.fn(async () => ({ stream: asyncEvents(events) })) },
  };
}

describe('OpenCodeSdkSessionClient', () => {
  it('persists and verifies the deterministic app title before returning a new session', async () => {
    const client = fakeClient();
    let persistedTitle = 'New session - 2026-08-23T12:00:00.000Z';
    client.session.update.mockImplementation(async (input) => {
      if ('title' in input.body && typeof input.body.title === 'string') {
        persistedTitle = input.body.title;
      }
      return { data: true };
    });
    client.session.get.mockImplementation(async () => ({
      data: { id: 'session-1', title: persistedTitle },
    }));
    const sdk = new OpenCodeSdkSessionClient(client);

    await expect(
      sdk.createSession({ scope: { accountId: 'account-1' }, title: 'Jarvis' }),
    ).resolves.toEqual({ id: 'session-1' });
    expect(client.session.update).toHaveBeenCalledWith({
      path: { id: 'session-1' },
      body: { title: 'Jarvis' },
    });
    expect(client.session.create.mock.invocationCallOrder[0]).toBeLessThan(
      client.session.update.mock.invocationCallOrder[0]!,
    );
    expect(client.session.update.mock.invocationCallOrder[0]).toBeLessThan(
      client.session.get.mock.invocationCallOrder[0]!,
    );
  });

  it('fails closed when OpenCode does not persist the deterministic app title', async () => {
    const client = fakeClient();
    client.session.get.mockResolvedValueOnce({
      data: { id: 'session-1', title: 'New session - 2026-08-23T12:00:00.000Z' },
    });
    const sdk = new OpenCodeSdkSessionClient(client);

    await expect(
      sdk.createSession({ scope: { accountId: 'account-1' }, title: 'Jarvis' }),
    ).rejects.toThrow(/SESSION_TITLE_MISMATCH/u);
  });

  it('applies the exact request-scoped permission profile before prompting', async () => {
    const client = fakeClient();
    const sdk = new OpenCodeSdkSessionClient(client);
    const permissions = {
      read: { '*': 'deny', 'C:/project/**': 'allow', '**/.env': 'deny' },
      edit: { '*': 'deny', 'C:/project/**': 'allow' },
      bash: 'allow',
      task: 'allow',
      skill: 'allow',
      webfetch: 'allow',
      websearch: 'allow',
      external_directory: 'deny',
      doom_loop: 'deny',
    } as const;

    await sdk.sendAsync({
      sessionId: 'session-1',
      controls: {
        connectionId: 'opencode-cli',
        providerId: 'openai',
        modelId: 'gpt-5.6-luna-fast',
        performance: 'quality',
        rlmEnabled: true,
      },
      text: 'build the fixture',
      permissions,
    });

    expect(client.session.update).toHaveBeenCalledWith({
      path: { id: 'session-1' },
      body: { permission: toOpenCodePermissionRules(permissions) },
    });
    expect(client.session.update.mock.invocationCallOrder[0]).toBeLessThan(
      client.session.promptAsync.mock.invocationCallOrder[0]!,
    );
    expect(toOpenCodePermissionRules(permissions)).toEqual([
      { permission: 'read', pattern: '*', action: 'deny' },
      { permission: 'read', pattern: 'C:/project/**', action: 'allow' },
      { permission: 'read', pattern: '**/.env', action: 'deny' },
      { permission: 'edit', pattern: '*', action: 'deny' },
      { permission: 'edit', pattern: 'C:/project/**', action: 'allow' },
      { permission: 'bash', pattern: '*', action: 'allow' },
      { permission: 'task', pattern: '*', action: 'allow' },
      { permission: 'skill', pattern: '*', action: 'allow' },
      { permission: 'webfetch', pattern: '*', action: 'allow' },
      { permission: 'websearch', pattern: '*', action: 'allow' },
      { permission: 'external_directory', pattern: '*', action: 'deny' },
      { permission: 'doom_loop', pattern: '*', action: 'deny' },
    ]);
  });

  it('fails closed before prompt when request-scoped permissions cannot be applied', async () => {
    const client = fakeClient();
    client.session.update.mockRejectedValueOnce(new Error('permission update rejected'));
    const sdk = new OpenCodeSdkSessionClient(client);

    await expect(
      sdk.sendAsync({
        sessionId: 'session-1',
        controls: {
          connectionId: 'opencode-cli',
          providerId: 'openai',
          modelId: 'gpt-5.6-luna-fast',
          performance: 'quality',
          rlmEnabled: true,
        },
        text: 'build the fixture',
        permissions: {
          read: { '*': 'deny', 'C:/project/**': 'allow' },
          edit: { '*': 'deny', 'C:/project/**': 'ask' },
          bash: 'ask',
          task: 'ask',
          skill: 'allow',
          webfetch: 'allow',
          websearch: 'allow',
          external_directory: 'deny',
          doom_loop: 'deny',
        },
      }),
    ).rejects.toThrow('permission update rejected');
    expect(client.session.promptAsync).not.toHaveBeenCalled();
  });

  it('uses provider-safe wire names without changing semantic gateway identity', async () => {
    expect(
      toProviderSafeOpenCodeTools({
        'terminal.list': true,
        'app.getState': false,
        vibespace_context: true,
      }),
    ).toEqual({ terminal_list: true, app_getState: false, vibespace_context: true });

    const client = fakeClient();
    const sdk = new OpenCodeSdkSessionClient(client);
    await sdk.sendAsync({
      sessionId: 'session-1',
      controls: {
        connectionId: 'opencode-cli',
        providerId: 'opencode-go',
        modelId: 'deepseek-v4-flash-vision-exp',
        performance: 'quality',
        rlmEnabled: true,
      },
      text: 'hello',
      tools: { 'terminal.list': false, vibespace_context: true },
    });
    expect(client.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          tools: { terminal_list: false, vibespace_context: true },
        }),
      }),
    );
  });

  it('uses async prompt on one persistent client with exact model identity', async () => {
    const client = fakeClient();
    const adapter: ModelControlPromptAdapter = {
      toPromptFields: () => ({ variant: 'max-fast' }),
    };
    const sdk = new OpenCodeSdkSessionClient(client, adapter);
    await sdk.sendAsync({
      sessionId: 'session-1',
      controls: {
        connectionId: 'openai-chatgpt-pro',
        providerId: 'openai',
        modelId: 'gpt-5.6-sol',
        variant: 'max-fast',
        performance: 'quality',
        rlmEnabled: true,
      },
      text: 'hello',
    });
    expect(client.session.promptAsync).toHaveBeenCalledWith({
      path: { id: 'session-1' },
      body: {
        model: { providerID: 'openai', modelID: 'gpt-5.6-sol' },
        variant: 'max-fast',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });
  });

  it('maps exact live effort/Fast metadata to a named OpenCode variant', async () => {
    const client = fakeClient();
    const sdk = new OpenCodeSdkSessionClient(
      client,
      new CatalogVariantPromptAdapter(() => ({
        effortVariants: { high: 'high' },
        fastVariant: 'fast',
        combinedVariants: { 'high+fast': 'high-fast' },
      })),
    );
    await sdk.sendAsync({
      sessionId: 'session-1',
      controls: {
        connectionId: 'openai-chatgpt-pro',
        providerId: 'openai',
        modelId: 'gpt-5.6-sol',
        effort: 'high',
        serviceTier: 'fast',
        performance: 'quality',
        rlmEnabled: true,
      },
      text: 'hello',
    });
    expect(client.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ variant: 'high-fast' }),
      }),
    );
  });

  it('combines an already-resolved effort variant with Fast only through exact live metadata', () => {
    const adapter = new CatalogVariantPromptAdapter(() => ({
      effortVariants: { max: 'max' },
      combinedVariants: { 'max+fast': 'max-fast' },
    }));

    expect(
      adapter.toPromptFields({
        connectionId: 'openai-chatgpt-pro',
        providerId: 'openai',
        modelId: 'gpt-5.6-sol',
        variant: 'max',
        serviceTier: 'fast',
        performance: 'quality',
        rlmEnabled: true,
      }),
    ).toEqual({ variant: 'max-fast' });
  });

  it('fails closed instead of silently dropping Fast from an effort variant', () => {
    const adapter = new CatalogVariantPromptAdapter(() => ({
      effortVariants: { max: 'max' },
    }));

    expect(() =>
      adapter.toPromptFields({
        connectionId: 'openai-chatgpt-pro',
        providerId: 'openai',
        modelId: 'gpt-5.6-sol',
        variant: 'max',
        serviceTier: 'fast',
        performance: 'quality',
        rlmEnabled: true,
      }),
    ).toThrow(/combined max\+fast variant/u);
  });

  it('fails closed when the strict transport cannot carry native OpenCode Fast', () => {
    expect(() =>
      new StrictModelControlPromptAdapter().toPromptFields({
        connectionId: 'opencode-cli',
        providerId: 'opencode-go',
        modelId: 'model',
        variant: 'max',
        openCodeFastMode: true,
        performance: 'quality',
        rlmEnabled: true,
      }),
    ).toThrow(/HARNESS_INCOMPATIBLE/u);
  });

  it('refuses blocking/per-turn fallback when promptAsync is unavailable', async () => {
    const client = fakeClient();
    delete (client.session as { promptAsync?: unknown }).promptAsync;
    const sdk = new OpenCodeSdkSessionClient(client);
    await expect(
      sdk.sendAsync({
        sessionId: 's',
        controls: {
          connectionId: 'c',
          providerId: 'openai',
          modelId: 'm',
          performance: 'quality',
          rlmEnabled: true,
        },
        text: 'hello',
      }),
    ).rejects.toThrow(/refusing per-turn CLI fallback/u);
  });

  it('fails closed when independent effort transport is not version-adapted', async () => {
    const sdk = new OpenCodeSdkSessionClient(fakeClient());
    await expect(
      sdk.sendAsync({
        sessionId: 's',
        controls: {
          connectionId: 'c',
          providerId: 'openai',
          modelId: 'm',
          effort: 'max',
          performance: 'quality',
          rlmEnabled: true,
        },
        text: 'hello',
      }),
    ).rejects.toThrow(/cannot transport independent effort/u);
  });

  it('reconstructs snapshot-only text events and filters another session', async () => {
    const client = fakeClient([
      {
        type: 'message.part.updated',
        properties: { part: { id: 'p', sessionID: 'other', type: 'text', text: 'wrong' } },
      },
      {
        type: 'message.part.updated',
        properties: { part: { id: 'p', sessionID: 'session-1', type: 'text', text: 'Hello' } },
      },
      {
        type: 'message.part.updated',
        properties: {
          part: { id: 'p', sessionID: 'session-1', type: 'text', text: 'Hello world' },
        },
      },
    ]);
    const sdk = new OpenCodeSdkSessionClient(client);
    const emissions = [];
    for await (const emission of sdk.subscribeTextEvents({ sessionId: 'session-1' })) {
      emissions.push(emission);
    }
    expect(
      emissions.map((event) => (event.kind === 'delta' ? event.text : event.fullText)),
    ).toEqual(['Hello', ' world']);
  });
});
