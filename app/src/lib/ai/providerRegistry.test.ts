import { describe, expect, it } from 'vitest';
import {
  buildProviderRegistry,
  formatProviderOptionLabel,
  getProviderDisplayName,
  isProviderConnected,
} from './providerRegistry';
import { KERNEL_SMOKE_PROVIDER_ID } from './providers/kernelSmoke';

describe('providerRegistry', () => {
  it('maps google internal id to Gemini display name', () => {
    expect(getProviderDisplayName('google')).toBe('Gemini');
  });

  it('formats connected provider labels for dropdowns', () => {
    const label = formatProviderOptionLabel('groq', {
      apiKeys: { groq: 'gsk_test' },
      offlineMode: false,
      plan: 'free',
    });
    expect(label).toBe('Groq — Connected');
  });

  it('marks missing API key providers as not connected on free plan', () => {
    expect(
      isProviderConnected('google', {
        apiKeys: {},
        offlineMode: false,
        plan: 'free',
      }),
    ).toBe(false);
  });

  it('allows hosted google on paid plans without BYOK', () => {
    expect(
      isProviderConnected('google', {
        apiKeys: {},
        offlineMode: false,
        plan: 'starter',
      }),
    ).toBe(true);
  });

  it('omits the dedicated smoke provider unless the exact development gate is open', () => {
    const disabled = buildProviderRegistry({ devBuild: true, explicitFlag: undefined });
    const production = buildProviderRegistry({ devBuild: false, explicitFlag: '1' });
    const enabled = buildProviderRegistry({ devBuild: true, explicitFlag: '1' });

    expect(disabled.some((entry) => entry.id === KERNEL_SMOKE_PROVIDER_ID)).toBe(false);
    expect(production.some((entry) => entry.id === KERNEL_SMOKE_PROVIDER_ID)).toBe(false);
    expect(enabled.filter((entry) => entry.id === KERNEL_SMOKE_PROVIDER_ID)).toEqual([
      {
        id: KERNEL_SMOKE_PROVIDER_ID,
        displayName: 'VibeSpace Kernel Smoke',
        requiresApiKey: false,
        supportsDynamicListing: false,
        hiveEligible: false,
      },
    ]);
    expect(Object.isFrozen(enabled)).toBe(true);
  });
});
