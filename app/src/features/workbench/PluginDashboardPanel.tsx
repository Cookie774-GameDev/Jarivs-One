import { ExternalLink, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openExternal } from '@/lib/tauri';
import {
  getPluginManifest,
  PluginLogo,
  selectPluginConnectionsForAccount,
  usePluginStore,
} from '@/features/plugins';
import { resolveAccountIdentity } from '@/lib/accountIdentity';
import { useAuthStore } from '@/stores/auth';
import { requestOpenMcpManager } from '@/features/plugins/openMcpManager';

const DASHBOARD_URLS: Readonly<Record<string, string>> = {
  github: 'https://github.com',
  supabase: 'https://supabase.com/dashboard',
};

export function PluginDashboardPanel({ pluginId }: { pluginId?: string }) {
  const accountId = useAuthStore((state) => resolveAccountIdentity(state)?.accountId ?? '');
  const plugin = pluginId ? getPluginManifest(pluginId) : undefined;
  const connection = usePluginStore(
    (state) => selectPluginConnectionsForAccount(state, accountId)[pluginId ?? ''],
  );

  if (!plugin) {
    return (
      <div className="workbench-panel-empty" role="status">
        <PlugZap />
        <strong>Plugin unavailable</strong>
        <span>The saved plugin is no longer installed. Reconnect it from Plugins.</span>
      </div>
    );
  }

  const dashboardUrl = DASHBOARD_URLS[plugin.id] ?? plugin.credentialUrl ?? plugin.docsUrl;
  const agentAccess =
    connection?.state !== 'connected'
      ? 'Connection required'
      : connection.enabled
        ? 'Enabled'
        : 'Disabled';
  const availableToolCount = agentAccess === 'Enabled' ? plugin.tools.length : 0;
  const declaredTools = plugin.tools.slice(0, 8);
  return (
    <section className="workbench-plugin-dashboard" aria-label={`${plugin.name} dashboard`}>
      <header>
        <PluginLogo plugin={plugin} />
        <div>
          <h3>{plugin.name}</h3>
          <p>{connection?.state === 'connected' ? 'Connected' : 'Connection needs attention'}</p>
        </div>
      </header>
      <p>{plugin.description}</p>
      <dl>
        <div>
          <dt>Agent access</dt>
          <dd>{agentAccess}</dd>
        </div>
        <div>
          <dt>Available tools</dt>
          <dd>{availableToolCount}</dd>
        </div>
      </dl>
      <div>
        <p>Declared tools</p>
        <ul aria-label={`${plugin.name} declared tools`}>
          {declaredTools.map((tool) => (
            <li key={tool.name}>{tool.name}</li>
          ))}
        </ul>
        {plugin.tools.length > declaredTools.length ? (
          <p>{plugin.tools.length - declaredTools.length} more declared tools</p>
        ) : null}
      </div>
      {agentAccess !== 'Enabled' ? (
        <Button
          type="button"
          size="sm"
          onClick={requestOpenMcpManager}
          aria-label={
            agentAccess === 'Connection required'
              ? `Connect ${plugin.name} in Plugins`
              : `Manage ${plugin.name} agent access`
          }
        >
          <PlugZap />
          {agentAccess === 'Connection required' ? 'Connect in Plugins' : 'Manage agent access'}
        </Button>
      ) : null}
      {dashboardUrl && (
        <Button type="button" size="sm" onClick={() => void openExternal(dashboardUrl)}>
          <ExternalLink /> Open {plugin.name} dashboard
        </Button>
      )}
    </section>
  );
}
