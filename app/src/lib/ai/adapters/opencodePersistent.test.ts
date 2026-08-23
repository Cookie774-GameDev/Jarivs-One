import { describe, expect, it, vi } from 'vitest';
import {
  assertAuthoritativeOpenCodeCompletion,
  assertAuthoritativeOpenCodeIdentity,
  assertAuthoritativeOpenCodeRuntimeControls,
  canonicalOpenCodeTextSuffix,
  combineSystemPrompt,
  contextSystemAddendum,
  createGenerationSafeAsyncCache,
  createPersistentOpenCodeRuntimeSupervisor,
  filterOpenCodeModelsToConnectedProviders,
  managedOpenCodeAuthResult,
  openCodePersistentAdapter,
  parseOpenCodeLiveModels,
  parseConnectedOpenCodeProviderIds,
  requireAuthoritativeOpenCodeModel,
  shouldReportPersistentTurnFailure,
  shouldReconcileOpenCodeSessionCompletion,
  toolsForPolicy,
  toOpenCodeDiscoveredModels,
} from './opencodePersistent';
import type { HarnessRuntimeManager } from '@/lib/harness/runtimeManager';

const liveModels = parseOpenCodeLiveModels({
  providers: [
    {
      id: 'openai',
      models: {
        'gpt-5.6-sol': {
          name: 'GPT-5.6 Sol',
          cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
          variants: {
            xhigh: {},
            max: {},
          },
        },
      },
    },
    {
      id: 'other',
      models: {
        'gpt-5.6-sol': {
          name: 'Different route, same local ID',
          cost: { input: 0, output: 0, cache: { read: 0 } },
        },
      },
    },
  ],
});

describe('persistent OpenCode live authority', () => {
  it('emits only provider-safe tool names while keeping Context enabled', () => {
    const tools = toolsForPolicy({
      mode: 'agent',
      access: 'full',
      rlmEnabled: true,
      requested: { vibespace_context: true },
    });

    expect(tools.vibespace_context).toBe(true);
    expect(Object.keys(tools)).toEqual(expect.arrayContaining(['vibespace_context']));
    expect(Object.keys(tools).every((name) => /^[a-zA-Z0-9_-]+$/u.test(name))).toBe(true);
    expect(tools).not.toHaveProperty('vibespace_context.query');
  });

  it('keeps explicit-root evidence filesystem-only and before the final response contract', () => {
    const addendum = contextSystemAddendum(
      {
        prompt: 'C:\\Users\\viper audit this directory',
        workingDirectory: 'C:\\Users\\viper',
        explicitReadRoot: true,
      } as never,
      { rlmEnabled: false, performance: 'quality' } as never,
    );
    expect(addendum).toContain('read, glob, grep, or list');
    expect(addendum).toContain('approved working directory');
    expect(addendum).toContain('Do not use Context, RLM, web, shell, or recursive retrieval');
    expect(addendum).not.toContain('Use only the current approved prompt/context');
    const systemPrompt = combineSystemPrompt(
      '## Explicit response contract\nThe final answer must never exceed 750 words.',
      addendum,
      true,
    );
    expect(systemPrompt.indexOf('DIRECT FILESYSTEM EVIDENCE')).toBeLessThan(
      systemPrompt.indexOf('## Explicit response contract'),
    );
    expect(systemPrompt.trimEnd()).toMatch(/must never exceed 750 words\.$/u);

    const tools = toolsForPolicy({
      mode: 'agent',
      access: 'full',
      rlmEnabled: true,
      explicitReadRoot: true,
      requested: { vibespace_context: true },
    });
    expect(tools).toMatchObject({
      read: true,
      glob: true,
      grep: true,
      list: true,
      webfetch: false,
      websearch: false,
      edit: false,
      write: false,
      patch: false,
      bash: false,
      shell: false,
      task: false,
      vibespace_context: false,
    });
  });

  it.each([
    { streamed: 'complete', canonical: 'complete', expected: '' },
    { streamed: 'first', canonical: 'first second', expected: ' second' },
    {
      streamed: 'first',
      canonical: 'corrected first [unverified output location omitted]',
      expected: '',
    },
  ])(
    'reconciles canonical completion without appending a divergent full answer',
    ({ streamed, canonical, expected }) => {
      expect(canonicalOpenCodeTextSuffix(streamed, canonical)).toBe(expected);
    },
  );

  it('keeps closed diagnostics free of request and prompt material', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const events = openCodePersistentAdapter.send!({
      requestId: 'secret-request-sentinel',
      prompt: 'secret-prompt-sentinel',
    } as never)[Symbol.asyncIterator]();

    await expect(events.next()).rejects.toThrow(/exact model selection/i);
    expect(warn).toHaveBeenCalledExactlyOnceWith('OpenCode protected turn failed.', {
      diagnosticCode: 'request_identity',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-(request|prompt)-sentinel/i);
    warn.mockRestore();
  });

  it('does not report ordinary cancellation as a protected-turn failure', () => {
    expect(shouldReportPersistentTurnFailure(new DOMException('cancelled', 'AbortError'))).toBe(
      false,
    );
    expect(shouldReportPersistentTurnFailure({ name: 'AbortError' })).toBe(false);
    expect(shouldReportPersistentTurnFailure(new Error('failed'))).toBe(true);
  });

  it('does not reuse or cache a stale in-flight load after invalidation', async () => {
    const cache = createGenerationSafeAsyncCache<string, string>(60_000);
    let resolveOld: ((value: string) => void) | undefined;
    let resolveFresh: ((value: string) => void) | undefined;
    const old = cache.get(
      'catalog',
      () => new Promise<string>((resolve) => (resolveOld = resolve)),
    );

    cache.invalidate();
    const fresh = cache.get(
      'catalog',
      () => new Promise<string>((resolve) => (resolveFresh = resolve)),
    );
    expect(fresh).not.toBe(old);

    resolveOld?.('stale');
    await expect(old).resolves.toBe('stale');
    expect(cache.peek('catalog')).toBeUndefined();

    resolveFresh?.('fresh');
    await expect(fresh).resolves.toBe('fresh');
    expect(cache.peek('catalog')).toBe('fresh');
    await expect(cache.get('catalog', async () => 'unexpected')).resolves.toBe('fresh');
  });

  it('uses only the native managed runtime descriptor', async () => {
    const refresh = vi.fn(async () => undefined);
    const runtime = {
      refresh,
      getConnection: () => ({
        version: '1.18.18',
        source: 'system' as const,
        generation: 'opencode-server-test',
      }),
    } as unknown as HarnessRuntimeManager;

    const handle = await createPersistentOpenCodeRuntimeSupervisor(runtime).start({
      accountId: 'local-desktop-account',
      workingDirectory: 'C:\\workspace',
    });

    expect(refresh).toHaveBeenCalledOnce();
    expect(handle).toMatchObject({
      generation: 'opencode-server-test',
      version: '1.18.18',
      scope: {
        accountId: 'local-desktop-account',
        workingDirectory: 'C:\\workspace',
      },
    });
    expect(JSON.stringify(handle)).not.toMatch(/baseUrl|username|password|authorization|basic/i);
    await handle.dispose();
  });

  it('fails closed when the managed runtime has no private connection', async () => {
    const runtime = {
      refresh: vi.fn(async () => undefined),
      getConnection: () => undefined,
    } as unknown as HarnessRuntimeManager;

    await expect(
      createPersistentOpenCodeRuntimeSupervisor(runtime).start({
        accountId: 'local-desktop-account',
      }),
    ).rejects.toThrow(/private server connection/);
  });

  it('selects only an exact provider-qualified live model', () => {
    expect(requireAuthoritativeOpenCodeModel(liveModels, 'openai/gpt-5.6-sol')).toMatchObject({
      providerId: 'openai',
      upstreamModelId: 'gpt-5.6-sol',
    });
    expect(() => requireAuthoritativeOpenCodeModel(liveModels, 'gpt-5.6-sol')).toThrow(
      /provider-qualified/,
    );
    expect(() => requireAuthoritativeOpenCodeModel(liveModels, 'missing/gpt-5.6-sol')).toThrow(
      /live authenticated catalog/,
    );
  });

  it('keeps nested provider-local model IDs distinct from canonical catalog IDs', () => {
    const [model] = parseOpenCodeLiveModels({
      providers: [{ id: 'openrouter', models: { 'openai/gpt-5.6-luna': { name: 'Luna' } } }],
    });

    expect(model).toMatchObject({
      id: 'openrouter/openai/gpt-5.6-luna',
      providerId: 'openrouter',
      upstreamModelId: 'openai/gpt-5.6-luna',
    });
  });

  it('preserves separate xhigh and max live variants', () => {
    const model = requireAuthoritativeOpenCodeModel(liveModels, 'openai/gpt-5.6-sol');
    expect(model.variants.map(({ id }) => id)).toEqual(['xhigh', 'max']);
  });

  it('carries only complete pricing from the same persistent provider response', () => {
    expect(requireAuthoritativeOpenCodeModel(liveModels, 'openai/gpt-5.6-sol').pricing).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(
      requireAuthoritativeOpenCodeModel(liveModels, 'other/gpt-5.6-sol').pricing,
    ).toBeUndefined();
    expect(
      toOpenCodeDiscoveredModels(liveModels).find(({ id }) => id === 'openai/gpt-5.6-sol'),
    ).toMatchObject({ pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
    expect(
      toOpenCodeDiscoveredModels(liveModels).find(({ id }) => id === 'other/gpt-5.6-sol'),
    ).not.toHaveProperty('pricing');
  });

  it('uses managed provider truth for auth and executable catalog authority', () => {
    expect(parseConnectedOpenCodeProviderIds({ connected: ['openai', 'openrouter'] })).toEqual([
      'openai',
      'openrouter',
    ]);
    expect(managedOpenCodeAuthResult({ connected: ['openai'] })).toMatchObject({
      status: 'authenticated',
    });
    expect(managedOpenCodeAuthResult({ connected: [] })).toMatchObject({
      status: 'unauthenticated',
    });
    expect(
      filterOpenCodeModelsToConnectedProviders(liveModels, ['openai']).map(({ id }) => id),
    ).toEqual(['openai/gpt-5.6-sol']);
    expect(() => parseConnectedOpenCodeProviderIds({ connected: ['openai', null] })).toThrow(
      /malformed provider status/,
    );
  });

  it('rejects an unsupported live effort before the coordinator can downgrade it', () => {
    const spark = parseOpenCodeLiveModels({
      providers: [
        {
          id: 'openai',
          models: {
            'gpt-5.3-codex-spark': { variants: { medium: {} } },
          },
        },
      ],
    })[0]!;
    expect(() =>
      assertAuthoritativeOpenCodeRuntimeControls(
        { effort: 'max', fastMode: 'auto' },
        spark,
        'opencode-cli',
      ),
    ).toThrow(/not available/);
  });

  it('requires observed model and variant proof before accepting completion', () => {
    expect(() =>
      assertAuthoritativeOpenCodeIdentity({
        connectionId: 'opencode-cli',
        providerId: 'openai',
        modelId: 'openai/gpt-5.6-sol',
        variant: 'max',
      }),
    ).toThrow(/without authoritative observed model identity/);

    expect(() =>
      assertAuthoritativeOpenCodeIdentity({
        connectionId: 'opencode-cli',
        providerId: 'openai',
        modelId: 'openai/gpt-5.6-sol',
        variant: 'max',
        observed: {
          providerId: 'openai',
          modelId: 'gpt-5.6-sol',
          variant: 'xhigh',
        },
      }),
    ).toThrow(/MODEL_IDENTITY_MISMATCH/);

    expect(
      assertAuthoritativeOpenCodeIdentity({
        connectionId: 'opencode-cli',
        providerId: 'openai',
        modelId: 'openai/gpt-5.6-sol',
        variant: 'max',
        observed: {
          providerId: 'openai',
          modelId: 'gpt-5.6-sol',
          variant: 'max',
        },
      }),
    ).toBe('openai/gpt-5.6-sol');
  });

  it('accepts stream EOF only after authoritative identity and non-empty assistant text', () => {
    expect(() =>
      assertAuthoritativeOpenCodeCompletion({
        observedModelId: 'openai/gpt-5.3-codex-spark',
        streamedText: 'OK',
        canonicalText: '',
      }),
    ).not.toThrow();
    expect(() =>
      assertAuthoritativeOpenCodeCompletion({
        streamedText: 'OK',
        canonicalText: '',
      }),
    ).toThrow(/authoritative observed model identity/);
    expect(() =>
      assertAuthoritativeOpenCodeCompletion({
        observedModelId: 'openai/gpt-5.3-codex-spark',
        streamedText: '',
        canonicalText: '',
      }),
    ).toThrow(/canonical assistant text/);
  });

  it('reconciles omitted idle status only after persisted assistant evidence', () => {
    expect(
      shouldReconcileOpenCodeSessionCompletion({
        statusLookupSucceeded: true,
        streamedText: 'OK',
        hasPersistedAssistantIdentity: true,
      }),
    ).toBe(true);
    expect(
      shouldReconcileOpenCodeSessionCompletion({
        statusLookupSucceeded: false,
        streamedText: 'OK',
        hasPersistedAssistantIdentity: true,
      }),
    ).toBe(false);
    expect(
      shouldReconcileOpenCodeSessionCompletion({
        statusLookupSucceeded: true,
        streamedText: '',
        hasPersistedAssistantIdentity: true,
      }),
    ).toBe(false);
    expect(
      shouldReconcileOpenCodeSessionCompletion({
        statusLookupSucceeded: true,
        streamedText: 'OK',
        hasPersistedAssistantIdentity: false,
      }),
    ).toBe(false);
    expect(
      shouldReconcileOpenCodeSessionCompletion({
        status: 'idle',
        statusLookupSucceeded: true,
        streamedText: '',
        hasPersistedAssistantIdentity: false,
      }),
    ).toBe(true);
  });
});
