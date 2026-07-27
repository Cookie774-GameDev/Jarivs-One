import { describe, expect, it } from 'vitest';
import { getPluginManifest } from '@/features/plugins/catalog';
import type { PluginConnection } from '@/features/plugins/types';
import {
  isPromptForgePluginAvailable,
  isPromptForgePluginConnected,
} from './composerPluginSources';

function connection(overrides: Partial<PluginConnection> = {}): PluginConnection {
  return {
    accountId: 'account-a',
    pluginId: 'github',
    state: 'connected',
    enabled: true,
    enabledProjectIds: ['*'],
    configuredFields: ['token'],
    updatedAt: 100,
    ...overrides,
  };
}

describe('Prompt Forge plugin source availability', () => {
  const github = getPluginManifest('github');
  const local = getPluginManifest('mock-connector');

  it('accepts an implemented credential-free plugin without an account connection', () => {
    expect(isPromptForgePluginAvailable(local, undefined, 'project-a')).toBe(true);
  });

  it('does not call a credential-free plugin connected until it has an enabled connection', () => {
    expect(isPromptForgePluginConnected(local, undefined, 'project-a')).toBe(false);
    expect(
      isPromptForgePluginConnected(
        local,
        connection({ pluginId: 'mock-connector', configuredFields: [] }),
        'project-a',
      ),
    ).toBe(true);
  });

  it('rejects a missing plugin manifest', () => {
    expect(isPromptForgePluginAvailable(undefined, connection(), 'project-a')).toBe(false);
  });

  it('accepts connected enabled credentialed plugins for wildcard or current-project scope', () => {
    expect(isPromptForgePluginAvailable(github, connection(), 'project-a')).toBe(true);
    expect(
      isPromptForgePluginAvailable(
        github,
        connection({ enabledProjectIds: ['project-a'] }),
        'project-a',
      ),
    ).toBe(true);
  });

  it('rejects disconnected, disabled, or wrong-project credentialed plugins', () => {
    expect(
      isPromptForgePluginAvailable(github, connection({ state: 'not_connected' }), 'project-a'),
    ).toBe(false);
    expect(isPromptForgePluginAvailable(github, connection({ enabled: false }), 'project-a')).toBe(
      false,
    );
    expect(
      isPromptForgePluginAvailable(
        github,
        connection({ enabledProjectIds: ['project-b'] }),
        'project-a',
      ),
    ).toBe(false);
  });

  it('does not treat the mere existence of a connection record as availability', () => {
    expect(
      isPromptForgePluginAvailable(
        github,
        connection({ state: 'error', enabled: true, enabledProjectIds: ['*'] }),
        'project-a',
      ),
    ).toBe(false);
  });
});
