import { describe, expect, it, vi } from 'vitest';
import {
  assertAuthoritativeOpenCodeIdentity,
  assertAuthoritativeOpenCodeRuntimeControls,
  createPersistentOpenCodeRuntimeSupervisor,
  parseOpenCodeLiveModels,
  requireAuthoritativeOpenCodeModel,
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
  it('uses the native managed runtime connection and private Basic auth', async () => {
    const refresh = vi.fn(async () => undefined);
    const runtime = {
      refresh,
      getConnection: () => ({
        baseUrl: 'http://127.0.0.1:41600',
        username: 'vibespace',
        password: 'a'.repeat(64),
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
      baseUrl: 'http://127.0.0.1:41600',
      version: '1.18.18',
      authorization: `Basic ${btoa(`vibespace:${'a'.repeat(64)}`)}`,
      scope: {
        accountId: 'local-desktop-account',
        workingDirectory: 'C:\\workspace',
      },
    });
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
    expect(requireAuthoritativeOpenCodeModel(liveModels, 'openai/gpt-5.6-sol').providerId).toBe(
      'openai',
    );
    expect(() => requireAuthoritativeOpenCodeModel(liveModels, 'gpt-5.6-sol')).toThrow(
      /provider-qualified/,
    );
    expect(() => requireAuthoritativeOpenCodeModel(liveModels, 'missing/gpt-5.6-sol')).toThrow(
      /live authenticated catalog/,
    );
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
});
