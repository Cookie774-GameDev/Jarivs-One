import { describe, expect, it } from 'vitest';
import {
  assertAuthoritativeOpenCodeIdentity,
  assertAuthoritativeOpenCodeRuntimeControls,
  parseOpenCodeLiveModels,
  requireAuthoritativeOpenCodeModel,
} from './opencodePersistent';

const liveModels = parseOpenCodeLiveModels({
  providers: [
    {
      id: 'openai',
      models: {
        'gpt-5.6-sol': {
          name: 'GPT-5.6 Sol',
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
        'gpt-5.6-sol': { name: 'Different route, same local ID' },
      },
    },
  ],
});

describe('persistent OpenCode live authority', () => {
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
