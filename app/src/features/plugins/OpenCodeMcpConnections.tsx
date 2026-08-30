import * as React from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getStoredProjectRoot } from '@/features/files/projectFiles';
import {
  createOpenCodeHttpClient,
  type OpenCodeHttpClient,
  type OpenCodeMcpConfig,
  type OpenCodeMcpStatus,
} from '@/lib/harness/openCodeClient';
import {
  harnessRuntimeManager,
  type HarnessRuntimeManager,
  type OpenCodeServerConnection,
} from '@/lib/harness/runtimeManager';
import { useAuthStore } from '@/stores/auth';

type ServerKind = 'remote' | 'local';

export interface OpenCodeMcpConnectionsProps {
  runtime?: HarnessRuntimeManager;
  clientFactory?: (connection: OpenCodeServerConnection) => OpenCodeHttpClient;
  directory?: string;
}

const STATUS_ERROR = 'OpenCode MCP status is unavailable.';
const ACTION_ERROR = 'OpenCode could not update this MCP server.';

const STATUS_LABELS: Record<OpenCodeMcpStatus['status'], string> = {
  connected: 'Connected',
  disabled: 'Disconnected',
  needs_auth: 'Authorization needed',
  failed: 'Connection failed',
  needs_client_registration: 'Registration needed',
};

function statusVariant(status: OpenCodeMcpStatus['status']) {
  if (status === 'connected') return 'success' as const;
  if (status === 'failed') return 'destructive' as const;
  if (status === 'disabled') return 'outline' as const;
  return 'warning' as const;
}

export function OpenCodeMcpConnections({
  runtime = harnessRuntimeManager,
  clientFactory = createOpenCodeHttpClient,
  directory: configuredDirectory,
}: OpenCodeMcpConnectionsProps) {
  const projectId = useAuthStore((state) => state.projectId);
  const directory = configuredDirectory ?? (getStoredProjectRoot(projectId).trim() || undefined);
  const runtimeState = React.useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
  const connection = runtime.getConnection();
  const client = React.useMemo(
    () => (connection ? clientFactory(connection) : undefined),
    [clientFactory, connection],
  );
  const authorityKey =
    client && connection ? `${connection.generation}\u0000${directory ?? ''}` : undefined;
  const [servers, setServers] = React.useState<Readonly<Record<string, OpenCodeMcpStatus>>>({});
  const [error, setError] = React.useState<string>();
  const [busy, setBusy] = React.useState<string>();
  const [projectionAuthority, setProjectionAuthority] = React.useState<string>();
  const [kind, setKind] = React.useState<ServerKind>('remote');
  const [name, setName] = React.useState('');
  const [remoteUrl, setRemoteUrl] = React.useState('');
  const [localCommand, setLocalCommand] = React.useState('');
  const generation = React.useRef(0);

  const loadStatus = React.useCallback(async () => {
    if (!client || !authorityKey) return;
    const current = ++generation.current;
    setProjectionAuthority(authorityKey);
    setBusy('refresh');
    setError(undefined);
    try {
      const next = await client.mcpStatus(directory);
      if (current === generation.current) setServers(next);
    } catch {
      if (current === generation.current) setError(STATUS_ERROR);
    } finally {
      if (current === generation.current) setBusy(undefined);
    }
  }, [authorityKey, client, directory]);

  React.useEffect(() => {
    generation.current += 1;
    setProjectionAuthority(authorityKey);
    setServers({});
    setError(undefined);
    setBusy(undefined);
    if (client) {
      void loadStatus();
      return () => {
        generation.current += 1;
      };
    }
    if (runtimeState.kind === 'checking') void runtime.refresh();
    return undefined;
  }, [authorityKey, client, loadStatus, runtime, runtimeState.kind]);

  async function updateServer(nameToUpdate: string, action: 'connect' | 'disconnect') {
    if (!client || !authorityKey) return;
    const current = ++generation.current;
    setProjectionAuthority(authorityKey);
    setBusy(`${action}:${nameToUpdate}`);
    setError(undefined);
    try {
      const ok = await client[`${action}Mcp`](nameToUpdate, directory);
      if (!ok) throw new Error('OpenCode rejected the MCP lifecycle request.');
      const next = await client.mcpStatus(directory);
      if (current === generation.current) setServers(next);
    } catch {
      if (current === generation.current) setError(ACTION_ERROR);
    } finally {
      if (current === generation.current) setBusy(undefined);
    }
  }

  async function addServer(event: React.FormEvent) {
    event.preventDefault();
    if (!client || !authorityKey) return;
    const normalizedName = name.trim();
    const config: OpenCodeMcpConfig =
      kind === 'remote'
        ? { type: 'remote', url: remoteUrl.trim(), enabled: true }
        : {
            type: 'local',
            command: localCommand
              .split('\n')
              .map((part) => part.trim())
              .filter(Boolean),
            enabled: true,
          };
    const current = ++generation.current;
    setProjectionAuthority(authorityKey);
    setBusy('add');
    setError(undefined);
    try {
      const next = await client.addMcp(normalizedName, config, directory);
      if (current !== generation.current) return;
      setServers(next);
      setName('');
      setRemoteUrl('');
      setLocalCommand('');
    } catch {
      if (current === generation.current) setError(ACTION_ERROR);
    } finally {
      if (current === generation.current) setBusy(undefined);
    }
  }

  const projectionCurrent = authorityKey !== undefined && projectionAuthority === authorityKey;
  const visibleBusy = projectionCurrent ? busy : client ? 'authority-change' : undefined;
  const visibleError = projectionCurrent ? error : undefined;
  const entries = Object.entries(projectionCurrent ? servers : {}).sort(([left], [right]) =>
    left.localeCompare(right, 'en'),
  );
  const ready = Boolean(client);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-ui-strong text-foreground">OpenCode MCP servers</h3>
          <p className="mt-1 text-secondary text-muted-foreground">
            These are the MCP servers OpenCode uses for this project. Changes apply to OpenCode's
            own configuration and lifecycle.
          </p>
          {directory ? (
            <p className="mt-1 truncate font-mono text-metadata text-muted-foreground">
              {directory}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Refresh OpenCode MCP status"
          disabled={!ready || Boolean(visibleBusy)}
          onClick={() => void loadStatus()}
        >
          {visibleBusy === 'refresh' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </div>

      {!ready ? (
        <p className="text-secondary text-muted-foreground">
          {runtimeState.kind === 'download_required'
            ? 'OpenCode must be installed before MCP servers can be managed.'
            : runtimeState.kind === 'incompatible' || runtimeState.kind === 'failed'
              ? 'OpenCode is unavailable in this app session.'
              : 'Starting OpenCode…'}
        </p>
      ) : null}

      {visibleError ? (
        <p role="alert" className="text-secondary text-destructive">
          {visibleError}
        </p>
      ) : null}

      {ready && !visibleBusy && entries.length === 0 && !visibleError ? (
        <p className="rounded-md border border-dashed border-border p-3 text-secondary text-muted-foreground">
          No OpenCode MCP servers are configured for this project.
        </p>
      ) : null}

      <div className="grid gap-2">
        {entries.map(([serverName, status]) => {
          const connected = status.status === 'connected';
          const action = connected ? 'disconnect' : 'connect';
          return (
            <article
              key={serverName}
              aria-label={`${serverName} MCP server`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/60 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-foreground">{serverName}</span>
                  <Badge variant={statusVariant(status.status)}>
                    {STATUS_LABELS[status.status]}
                  </Badge>
                </div>
                {'error' in status ? (
                  <p className="mt-1 max-w-xl text-metadata text-destructive">{status.error}</p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`${connected ? 'Disconnect' : 'Connect'} ${serverName}`}
                disabled={Boolean(visibleBusy)}
                onClick={() => void updateServer(serverName, action)}
              >
                {visibleBusy === `${action}:${serverName}` ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                {connected ? 'Disconnect' : 'Connect'}
              </Button>
            </article>
          );
        })}
      </div>

      {ready ? (
        <form className="space-y-3 border-t border-border pt-4" onSubmit={addServer}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1 space-y-1.5">
              <Label htmlFor="opencode-mcp-name">Server name</Label>
              <Input
                id="opencode-mcp-name"
                value={name}
                required
                autoComplete="off"
                placeholder="example-server"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex gap-1" aria-label="MCP server type">
              <Button
                type="button"
                size="sm"
                variant={kind === 'remote' ? 'default' : 'outline'}
                aria-pressed={kind === 'remote'}
                onClick={() => setKind('remote')}
              >
                Remote
              </Button>
              <Button
                type="button"
                size="sm"
                variant={kind === 'local' ? 'default' : 'outline'}
                aria-pressed={kind === 'local'}
                onClick={() => setKind('local')}
              >
                Local
              </Button>
            </div>
          </div>
          {kind === 'remote' ? (
            <div className="space-y-1.5">
              <Label htmlFor="opencode-mcp-url">Remote URL</Label>
              <Input
                id="opencode-mcp-url"
                type="url"
                value={remoteUrl}
                required
                autoComplete="off"
                placeholder="https://mcp.example.com/rpc"
                onChange={(event) => setRemoteUrl(event.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="opencode-mcp-command">Local command</Label>
              <textarea
                id="opencode-mcp-command"
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
                value={localCommand}
                required
                placeholder={'Executable on the first line\nOne argument per additional line'}
                onChange={(event) => setLocalCommand(event.target.value)}
              />
              <p className="text-metadata text-muted-foreground">
                Put the executable on the first line and one argument on each following line.
              </p>
            </div>
          )}
          <Button type="submit" size="sm" disabled={Boolean(visibleBusy)}>
            {visibleBusy === 'add' ? <Loader2 className="animate-spin" /> : <Plus />}
            Add OpenCode MCP server
          </Button>
        </form>
      ) : null}
    </section>
  );
}

export default OpenCodeMcpConnections;
