import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/jarvis/smoke/config', () => ({ isKernelSmokeEnabled: () => true }));

import { getProviderConnectionDescriptor } from './adapters/catalog';
import { validateSendModelAccess } from './modelSelection';
import {
  activateKernelSmokeBinding,
  clearKernelSmokeBinding,
  KERNEL_SMOKE_PROVIDER_ID,
} from './providers/kernelSmoke';

const smokeBinding = Object.freeze({
  nativePid: 91,
  cdpPort: 49_191,
  profileSha256: 'a'.repeat(64),
  nonce: 'b'.repeat(64),
});

const context = Object.freeze({
  apiKeys: {},
  offlineMode: false,
  plan: 'free' as const,
  defaultLocalModel: 'llama3.2',
});

describe('model selection for the attested kernel smoke provider', () => {
  beforeEach(() => {
    clearKernelSmokeBinding();
  });

  afterEach(() => {
    clearKernelSmokeBinding();
  });

  it('allows the exact registered native smoke model only while its binding is active', () => {
    const connection = getProviderConnectionDescriptor('vibespace-kernel-smoke-native');
    const selection = {
      mode: 'single' as const,
      providerId: KERNEL_SMOKE_PROVIDER_ID,
      modelId: 'kernel-smoke-v1',
      connectionId: connection.id,
      connectionMode: connection.mode,
      authSource: connection.authSource,
      capabilities: connection.capabilities,
    };

    expect(validateSendModelAccess('smoke fixture', selection, context, []).ok).toBe(false);

    activateKernelSmokeBinding(smokeBinding);

    expect(validateSendModelAccess('smoke fixture', selection, context, []).ok).toBe(true);
  });
});
