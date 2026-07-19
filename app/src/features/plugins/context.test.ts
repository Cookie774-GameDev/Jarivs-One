import { beforeEach, describe, expect, it } from 'vitest';
import { getPluginContextBlock, getPluginStatusContextBlock } from './context';
import { usePluginStore } from './store';

function github(accountId: string, enabledProjectIds = ['project-a']) {
  return {
    accountId,
    pluginId: 'github',
    state: 'connected' as const,
    enabled: true,
    enabledProjectIds,
    accountLabel: 'octocat',
    configuredFields: ['token'],
    updatedAt: Date.now(),
  };
}

describe('plugin context account boundary', () => {
  beforeEach(() => usePluginStore.setState({ connectionsByAccount: {} }));

  it('reads only connected plugins owned by the canonical account and never advertises a generic tool', () => {
    usePluginStore.setState({
      connectionsByAccount: {
        'account-a': { github: github('account-a') },
        'account-b': { github: github('account-b', ['*']) },
      },
    });

    const block = getPluginContextBlock('account-a', 'project-a');
    expect(block).toContain('GitHub');
    expect(block).toContain('octocat');
    expect(block).not.toContain('token');
    expect(block).not.toContain('plugin.call');
    expect(block).not.toContain('plugin.invoke');
    expect(getPluginContextBlock('account-a', 'project-b')).toBe('');
    expect(getPluginContextBlock('', 'project-a')).toBe('');
    expect(getPluginContextBlock('project-a', ['github'])).toBe('');
  });

  it('merges explicit descriptors without claiming they are executable', () => {
    usePluginStore.setState({
      connectionsByAccount: { 'account-a': { github: github('account-a') } },
    });
    const block = getPluginContextBlock('account-a', 'project-a', ['slack']);
    expect(block).toContain('GitHub');
    expect(block).toContain('Slack');
    expect(block).toContain('mentioned, not connected');
    expect(block).toContain('descriptors only');
  });

  it('summarizes status only for the named account', () => {
    usePluginStore.setState({
      connectionsByAccount: {
        'account-a': { github: github('account-a') },
        'account-b': { github: { ...github('account-b'), enabled: false } },
      },
    });
    expect(getPluginStatusContextBlock('account-a', 'project-a', undefined)).toContain(
      'GitHub [connected, enabled here]',
    );
    expect(getPluginStatusContextBlock('account-b', 'project-a', undefined)).toContain(
      'GitHub [connected, disabled]',
    );
    expect(getPluginStatusContextBlock('', 'project-a', undefined)).toBe('');
    expect(getPluginStatusContextBlock('project-a', 'plugins')).toBe('');
  });
});
