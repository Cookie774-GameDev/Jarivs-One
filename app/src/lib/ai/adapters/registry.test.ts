import { beforeEach, describe, expect, it } from 'vitest';
import {
  getProviderAdapter,
  listProviderConnections,
  registerProviderAdapter,
  registerProviderConnection,
  resetProviderAdapterRegistryForTests,
  resolveProviderConnection,
} from './registry';
import type { ProviderAdapter, ProviderCapabilities, ProviderConnection } from './types';

const capabilities: ProviderCapabilities = {
  text: true,
  images: false,
  files: false,
  tools: false,
  modelSelection: false,
  structuredOutput: false,
  streaming: false,
  cancellation: false,
  resumeSession: false,
  systemPrompt: false,
  workingDirectory: false,
  usage: false,
  subscriptionQuota: false,
  localOnly: false,
};

function connection(
  id: string,
  mode: ProviderConnection['mode'],
  enabled = true,
): ProviderConnection {
  return {
    id,
    adapterId: `${id}-adapter`,
    providerId: 'openai',
    displayName: id,
    mode,
    authSource: `${mode}-auth`,
    capabilities,
    promptTransport: mode === 'external-cli' ? 'prefixed-preamble' : 'unsupported',
    enabled,
  };
}

function adapter(id: string): ProviderAdapter {
  return { id };
}

describe('provider adapter registry', () => {
  beforeEach(() => {
    resetProviderAdapterRegistryForTests();
  });

  it('keeps native, external, and local registrations distinct', () => {
    const native = connection('openai-api', 'native-api');
    const external = connection('openai-codex', 'external-cli');
    const local = connection('ollama-local', 'local');

    registerProviderConnection(native);
    registerProviderConnection(external);
    registerProviderConnection(local);

    expect(resolveProviderConnection(native.id)).toBe(native);
    expect(resolveProviderConnection(external.id)).toBe(external);
    expect(resolveProviderConnection(local.id)).toBe(local);
    expect(listProviderConnections()).toEqual([native, external, local]);
  });

  it('throws exact errors for unknown and disabled connections', () => {
    registerProviderConnection(connection('disabled-cli', 'external-cli', false));

    expect(() => resolveProviderConnection('missing')).toThrowError(
      'Unknown provider connection: missing',
    );
    expect(() => resolveProviderConnection('disabled-cli')).toThrowError(
      'Provider connection is disabled: disabled-cli',
    );
  });

  it('rejects duplicate adapter and connection ids deterministically', () => {
    registerProviderAdapter(adapter('openai'));
    registerProviderConnection(connection('openai-api', 'native-api'));

    expect(() => registerProviderAdapter(adapter('openai'))).toThrowError(
      'Provider adapter already registered: openai',
    );
    expect(() => registerProviderConnection(connection('openai-api', 'external-cli'))).toThrowError(
      'Provider connection already registered: openai-api',
    );
  });

  it('reset helper isolates adapters and connections', () => {
    registerProviderAdapter(adapter('openai'));
    registerProviderConnection(connection('openai-api', 'native-api'));

    resetProviderAdapterRegistryForTests();

    expect(getProviderAdapter('openai')).toBeUndefined();
    expect(listProviderConnections()).toEqual([]);
    expect(() => resolveProviderConnection('openai-api')).toThrowError(
      'Unknown provider connection: openai-api',
    );
  });
});
