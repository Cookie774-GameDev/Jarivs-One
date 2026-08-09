import { describe, expect, it } from 'vitest';
import { SECRET_API_KEY_PROVIDERS, isSecretApiKeyProvider } from './secureApiKeys';

describe('secure API key providers', () => {
  it('stores Qwen Model Studio credentials in the existing secure vault boundary', () => {
    expect(isSecretApiKeyProvider('qwen')).toBe(true);
    expect(SECRET_API_KEY_PROVIDERS.filter((provider) => provider === 'qwen')).toHaveLength(1);
  });
});
