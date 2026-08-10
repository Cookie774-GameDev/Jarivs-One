import { describe, expect, it } from 'vitest';
import {
  SECRET_API_KEY_PROVIDERS,
  isSecretApiKeyProvider,
  saveApiKeySecurely,
} from './secureApiKeys';

describe('secure API key providers', () => {
  it('stores Qwen Model Studio credentials in the existing secure vault boundary', () => {
    expect(isSecretApiKeyProvider('qwen')).toBe(true);
    expect(SECRET_API_KEY_PROVIDERS.filter((provider) => provider === 'qwen')).toHaveLength(1);
  });
});

describe('verified secure API key save', () => {
  it('does not report success until secure storage reads back the same credential', async () => {
    const calls: string[] = [];
    await expect(
      saveApiKeySecurely('openai', '  sk-test  ', {
        set: async (_provider, key) => {
          calls.push(`set:${key}`);
        },
        get: async () => {
          calls.push('get');
          return 'sk-test';
        },
      }),
    ).resolves.toEqual({ ok: true });
    expect(calls).toEqual(['set:sk-test', 'get']);
  });

  it('returns a stable redacted code when the credential write fails', async () => {
    await expect(
      saveApiKeySecurely('openai', 'sk-test', {
        set: async () => {
          throw new Error('raw keychain details');
        },
        get: async () => 'sk-test',
      }),
    ).resolves.toEqual({ ok: false, code: 'credential-write-failed' });
  });

  it('rejects a mismatched readback instead of creating a fake connected state', async () => {
    await expect(
      saveApiKeySecurely('openai', 'sk-new', {
        set: async () => undefined,
        get: async () => 'sk-old',
      }),
    ).resolves.toEqual({ ok: false, code: 'credential-verification-failed' });
  });
});
