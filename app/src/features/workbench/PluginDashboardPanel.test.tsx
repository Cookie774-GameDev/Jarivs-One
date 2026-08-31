import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginDashboardPanel } from './PluginDashboardPanel';

const { requestOpenMcpManager } = vi.hoisted(() => ({ requestOpenMcpManager: vi.fn() }));

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
    tools: [
      { name: 'repository_context', description: 'Read repository context.', readOnly: true },
      { name: 'issue_create', description: 'Create an issue.', readOnly: false },
    ],
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
vi.mock('@/features/plugins/openMcpManager', () => ({ requestOpenMcpManager }));

describe('PluginDashboardPanel', () => {
  beforeEach(() => {
    connection.state = 'not_connected';
    connection.enabled = true;
    requestOpenMcpManager.mockReset();
  });

  it('does not claim agent access for a disconnected saved connection', () => {
    render(<PluginDashboardPanel pluginId="github" />);

    expect(screen.getByText('Agent access')).toBeTruthy();
    expect(screen.getByText('Connection required')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByText('Enabled')).toBeNull();
  });

  it('reports enabled agent access only for a connected enabled plugin', () => {
    connection.state = 'connected';
    connection.enabled = true;

    render(<PluginDashboardPanel pluginId="github" />);

    expect(screen.getByText('Agent access')).toBeTruthy();
    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /in Plugins|agent access/u })).toBeNull();
  });

  it('routes disconnected and disabled panels to the canonical Plugins authority', () => {
    const { rerender } = render(<PluginDashboardPanel pluginId="github" />);

    screen.getByRole('button', { name: 'Connect GitHub in Plugins' }).click();
    expect(requestOpenMcpManager).toHaveBeenCalledOnce();

    connection.state = 'connected';
    connection.enabled = false;
    rerender(<PluginDashboardPanel pluginId="github" />);
    screen.getByRole('button', { name: 'Manage GitHub agent access' }).click();
    expect(requestOpenMcpManager).toHaveBeenCalledTimes(2);
  });

  it('shows bounded declared tool identities without implying unavailable access', () => {
    render(<PluginDashboardPanel pluginId="github" />);

    expect(screen.getByText('repository_context')).toBeTruthy();
    expect(screen.getByText('issue_create')).toBeTruthy();
    expect(screen.getByText('Connection required')).toBeTruthy();
    expect(screen.queryByText('Tool access ready')).toBeNull();
  });
});
