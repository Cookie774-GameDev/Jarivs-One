import { useState, useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { canonicalRemoteMcpEndpoint } from '@/lib/mcp/remoteAuthorization';
import { remoteMcpSetupRuntime, type RemoteMcpSetupRuntime } from '@/lib/mcp/remoteSetupRuntime';

const SAFE_SERVER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const SAFE_CONNECTION_ERROR = 'Unable to connect to this MCP server.';

export interface McpConnectionsProps {
  readonly runtime?: RemoteMcpSetupRuntime;
}

interface ReviewedConnection {
  readonly id: string;
  readonly endpoint: string;
}

export function McpConnections({ runtime = remoteMcpSetupRuntime }: McpConnectionsProps) {
  const connections = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
  const [id, setId] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [reviewed, setReviewed] = useState<ReviewedConnection>();
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const invalidateReview = () => {
    setReviewed(undefined);
    setAuthorized(false);
    setError(undefined);
  };

  const review = () => {
    try {
      const reviewedId = id.trim();
      if (!SAFE_SERVER_ID.test(reviewedId)) throw new Error('Invalid MCP server id.');
      setReviewed({
        id: reviewedId,
        endpoint: canonicalRemoteMcpEndpoint(endpoint),
      });
      setAuthorized(false);
      setError(undefined);
    } catch {
      setReviewed(undefined);
      setAuthorized(false);
      setError('Enter a valid server identifier and safe MCP endpoint.');
    }
  };

  const connect = async () => {
    if (!reviewed || !authorized || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await runtime.connect({
        id: reviewed.id,
        endpoint: reviewed.endpoint,
        confirmedByUser: true,
      });
      setId('');
      setEndpoint('');
      setReviewed(undefined);
      setAuthorized(false);
    } catch {
      setError(SAFE_CONNECTION_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="space-y-4 border-t border-border pt-4"
      aria-labelledby="mcp-connections-title"
    >
      <div>
        <h2 id="mcp-connections-title" className="text-lg font-semibold text-foreground">
          MCP Connections
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Connect through credentialless Streamable HTTP. Every discovered tool stays off until you
          allow it explicitly.
        </p>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          This flow does not launch local processes or accept commands, executables, API keys,
          tokens, or passwords.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm text-foreground">
          Server identifier
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={id}
            onChange={(event) => {
              setId(event.target.value);
              invalidateReview();
            }}
            autoComplete="off"
          />
        </label>
        <label className="grid gap-1 text-sm text-foreground">
          MCP endpoint
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={endpoint}
            onChange={(event) => {
              setEndpoint(event.target.value);
              invalidateReview();
            }}
            placeholder="https://example.com/mcp"
            inputMode="url"
            autoComplete="off"
          />
        </label>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={review}>
        Review MCP connection
      </Button>

      {reviewed ? (
        <div
          role="region"
          aria-label="Review MCP connection"
          className="space-y-3 rounded-lg border border-border bg-panel/60 p-3"
        >
          <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Identifier</dt>
            <dd className="font-mono">{reviewed.id}</dd>
            <dt className="text-muted-foreground">Exact endpoint</dt>
            <dd className="break-all font-mono">{reviewed.endpoint}</dd>
            <dt className="text-muted-foreground">Initial access</dt>
            <dd>No tools allowed</dd>
          </dl>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(event) => setAuthorized(event.target.checked)}
            />
            <span>I authorize VibeSpace to connect to this exact endpoint.</span>
          </label>
          <Button
            type="button"
            size="sm"
            onClick={() => void connect()}
            disabled={!authorized || busy}
          >
            {busy ? 'Connecting…' : 'Connect MCP server'}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        {connections.map((connection) => (
          <article
            key={connection.id}
            className="space-y-3 rounded-lg border border-border bg-panel/60 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-foreground">{connection.id}</h3>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {connection.endpoint}
                </p>
              </div>
              <span className="text-xs capitalize text-muted-foreground">{connection.state}</span>
            </div>
            {connection.state === 'connected' ? (
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-foreground">Allowed tools</legend>
                {connection.tools.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tools discovered.</p>
                ) : (
                  connection.tools.map((tool) => (
                    <label key={tool.name} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={`Allow ${tool.name}`}
                        checked={tool.exposed}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...connection.exposedTools, tool.name]
                            : connection.exposedTools.filter((name) => name !== tool.name);
                          runtime.setToolExposure(
                            connection.id,
                            [...new Set(next)].sort((left, right) =>
                              left.localeCompare(right, 'en'),
                            ),
                          );
                        }}
                      />
                      <span>
                        <span className="font-mono text-xs text-foreground">{tool.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {tool.description}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </fieldset>
            ) : null}
            {connection.error ? (
              <p role="alert" className="text-xs text-destructive">
                {connection.error}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Disconnect ${connection.id}`}
              onClick={() => void runtime.disconnect(connection.id)}
            >
              Disconnect
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}

export default McpConnections;
