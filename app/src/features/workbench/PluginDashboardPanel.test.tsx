import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginDashboardPanel } from './PluginDashboardPanel';

type TestConnection = {
  accountId: string;
  pluginId: string;
  state: 'connected' | 'not_connected';
  enabled: boolean;
  enabledProjectIds: string[];
  configuredFields: string[];
  updatedAt: number;
};

const connection: TestConnection = {
  accountId: 'local-account',
  pluginId: 'github',
  state: 'not_connected' as const,
  enabled: true,
  enabledProjectIds: [],
  configuredFields: [],
  updatedAt: 1,
};

vi.mock('@/features/plugins', () => ({
  getPluginManifest: () => ({
    id: 'github',
    name: 'GitHub',
    description: 'Repository context.',
    tools: [{ name: 'repository_context' }],
    docsUrl: 'https://docs.github.com',
  }),
  PluginLogo: () => <span aria-hidden="true" />,
  selectPluginConnectionsForAccount: (state: {
    connectionsByAccount: Record<string, Record<string, TestConnection>>;
  }) => state.connectionsByAccount['local-account'] ?? {},
  usePluginStore: (selector: (state: unknown) => unknown) =>
    selector({ connectionsByAccount: { 'local-account': { github: connection } } }),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ cloudSession: null, localUserId: 'local-account' }),
}));

vi.mock('@/lib/tauri', () => ({ openExternal: vi.fn() }));

describe('PluginDashboardPanel', () => {
  beforeEach(() => {
    connection.state = 'not_connected';
    connection.enabled = true;
  });

  it('does not claim agent access for a disconnected saved connection', () => {
    render(<PluginDashboardPanel pluginId="github" />);

    expect(screen.getByText('Agent access')).toBeTruthy();
    expect(screen.getByText('Connection required')).toBeTruthy();
    expect(screen.queryByText('Enabled')).toBeNull();
  });

  it('reports enabled agent access only for a connected enabled plugin', () => {
    connection.state = 'connected';
    connection.enabled = true;

    render(<PluginDashboardPanel pluginId="github" />);

    expect(screen.getByText('Agent access')).toBeTruthy();
    expect(screen.getByText('Enabled')).toBeTruthy();
  });
});
