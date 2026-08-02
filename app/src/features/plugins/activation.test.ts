import { beforeEach, describe, expect, it } from 'vitest';
import { listActiveAiModelPlugins, listActivePlugins } from './activation';
import { usePluginStore } from './store';

describe('plugin activation', () => {
  beforeEach(() => usePluginStore.setState({ connectionsByAccount: {} }));

  it('lists only connected and enabled plugins for the exact account', () => {
    usePluginStore.setState({
      connectionsByAccount: {
        'account-a': {
          github: {
            accountId: 'account-a',
            pluginId: 'github',
            state: 'connected',
            enabled: true,
            enabledProjectIds: ['*'],
            configuredFields: ['token'],
            updatedAt: Date.now(),
          },
        },
        'account-b': {
          slack: {
            accountId: 'account-b',
            pluginId: 'slack',
            state: 'connected',
            enabled: true,
            enabledProjectIds: ['*'],
            configuredFields: ['token'],
            updatedAt: Date.now(),
          },
        },
      },
    });

    expect(listActivePlugins('account-a').map((plugin) => plugin.id)).toEqual(['github']);
    expect(listActivePlugins('account-b').map((plugin) => plugin.id)).toEqual(['slack']);
    expect(listActivePlugins('')).toEqual([]);
  });

  it('filters active AI plugins with automated tests', () => {
    usePluginStore.setState({
      connectionsByAccount: {
        'account-a': {
          openai: {
            accountId: 'account-a',
            pluginId: 'openai',
            state: 'connected',
            enabled: true,
            enabledProjectIds: ['*'],
            configuredFields: ['api_key'],
            updatedAt: Date.now(),
          },
        },
      },
    });

    expect(listActiveAiModelPlugins('account-a').map((plugin) => plugin.id)).toEqual(['openai']);
    expect(listActiveAiModelPlugins('account-b')).toEqual([]);
  });
});
