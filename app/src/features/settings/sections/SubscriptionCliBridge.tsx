import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PROVIDER_CATALOG, PROVIDER_CONNECTIONS } from '@/lib/ai/adapters/catalog';
import type { ProviderConnection } from '@/lib/ai/adapters/types';
import type { ProviderAdapter } from '@/lib/ai/adapters/types';
import { codexCliAdapter } from '@/lib/ai/adapters/codex';
import { claudeCliAdapter } from '@/lib/ai/adapters/claude';
import { geminiCliAdapter } from '@/lib/ai/adapters/gemini';
import { copilotCliAdapter } from '@/lib/ai/adapters/copilot';
import { qwenCliAdapter } from '@/lib/ai/adapters/qwen';
import { openCodeCliAdapter } from '@/lib/ai/adapters/opencode';
import { writeConnectionPickerStates } from '@/lib/ai/useAccessibleChatModels';

export interface ConnectionMetadataRecord {
  installation: 'installed' | 'not-installed' | 'unknown';
  auth: 'authenticated' | 'unauthenticated' | 'unknown';
  executablePath?: string;
  version?: string;
  lastCheckedAt?: number;
  disabled?: boolean;
}

export type ConnectionMetadata = Partial<Record<string, ConnectionMetadataRecord>>;
export type ConnectionAction = 'refresh' | 'sign-in' | 'configure' | 'disable' | 'forget' | 'add-api-key';

export interface SubscriptionCliBridgeProps {
  records?: ConnectionMetadata;
  onScan?: () => void | Promise<void>;
  onRefresh?: (connection: Readonly<ProviderConnection>) => void | Promise<void>;
  onSignIn?: (connection: Readonly<ProviderConnection>) => void | Promise<void>;
  onAction?: (action: ConnectionAction, connection: Readonly<ProviderConnection>) => void | Promise<void>;
}

function emitAction(action: ConnectionAction, connection: Readonly<ProviderConnection>): void {
  window.dispatchEvent(new CustomEvent('jarvis:ai-connection-action', {
    detail: { action, connectionId: connection.id },
  }));
}

const METADATA_KEY = 'vibespace.ai-connection-metadata.v1';
const ADAPTERS: Readonly<Record<string, ProviderAdapter>> = Object.freeze(Object.fromEntries([
  codexCliAdapter, claudeCliAdapter, geminiCliAdapter, copilotCliAdapter, qwenCliAdapter, openCodeCliAdapter,
].map((adapter) => [adapter.id, adapter])));

function readMetadata(): ConnectionMetadata {
  try { return JSON.parse(window.localStorage.getItem(METADATA_KEY) ?? '{}') as ConnectionMetadata; }
  catch { return {}; }
}

function persistMetadata(metadata: ConnectionMetadata): void {
  window.localStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
  writeConnectionPickerStates(Object.fromEntries(Object.entries(metadata).map(([id, record]) => [id, {
    available: record?.installation === 'installed' && !record.disabled,
    auth: record?.auth ?? 'unknown',
  }])));
}

function capabilitySummary(connection: Readonly<ProviderConnection>): string {
  const labels = [
    connection.capabilities.images && 'images',
    connection.capabilities.files && 'files',
    connection.capabilities.tools && 'tools',
    connection.capabilities.streaming && 'streaming',
    connection.capabilities.usage && 'usage',
  ].filter(Boolean);
  return labels.length > 0 ? labels.join(' · ') : 'text';
}

export function SubscriptionCliBridge({
  records, onScan, onRefresh, onSignIn, onAction,
}: SubscriptionCliBridgeProps) {
  const [busy, setBusy] = useState(false);
  const [metadata, setMetadata] = useState<ConnectionMetadata>(() => records ?? readMetadata());
  const inspect = async (connection: Readonly<ProviderConnection>) => {
    const adapter = ADAPTERS[connection.adapterId];
    if (!adapter?.detect) return;
    const detection = await adapter.detect();
    const auth = detection.status === 'available' && adapter.probeAuth
      ? await adapter.probeAuth(connection)
      : { status: 'unknown' as const };
    setMetadata((current) => {
      const next = {
        ...current,
        [connection.id]: {
          installation: detection.status === 'available' ? 'installed' as const : 'not-installed' as const,
          auth: auth.status,
          ...(detection.executablePath ? { executablePath: detection.executablePath } : {}),
          ...(detection.version ? { version: detection.version } : {}),
          lastCheckedAt: Date.now(),
          disabled: current[connection.id]?.disabled,
        },
      };
      persistMetadata(next);
      return next;
    });
  };
  const act = (action: ConnectionAction, connection: Readonly<ProviderConnection>) => {
    if (action === 'refresh' && onRefresh) return void onRefresh(connection);
    if (action === 'refresh' && connection.mode === 'external-cli') return void inspect(connection);
    if (action === 'sign-in' && onSignIn) return void onSignIn(connection);
    if (onAction) return void onAction(action, connection);
    if (action === 'disable' || action === 'forget') {
      setMetadata((current) => {
        const next = { ...current };
        if (action === 'forget') delete next[connection.id];
        else next[connection.id] = {
          ...(current[connection.id] ?? { installation: 'unknown', auth: 'unknown' }),
          disabled: true,
        };
        persistMetadata(next);
        return next;
      });
      return;
    }
    emitAction(action, connection);
  };
  const scan = async () => {
    setBusy(true);
    try {
      if (onScan) await onScan();
      else await Promise.all(PROVIDER_CONNECTIONS.filter((connection) => connection.mode === 'external-cli').map(inspect));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="ai-connections-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="ai-connections-title" className="text-lg font-semibold text-foreground">AI Connections</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Choose exactly how Jarvis connects. Scans are read-only and never send a prompt.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => void scan()} disabled={busy} aria-label="Scan for agents">
          {busy ? 'Scanning…' : 'Scan'}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {PROVIDER_CONNECTIONS.map((connection) => {
          const family = Object.values(PROVIDER_CATALOG).find((entry) => entry.id === connection.providerId);
          const record = metadata[connection.id];
          const installed = record?.installation === 'installed';
          const authenticated = record?.auth === 'authenticated';
          return (
            <article key={connection.id} className="rounded-lg border border-border bg-panel/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-foreground">{connection.displayName}</h3>
                  <p className="text-xs text-muted-foreground">{family?.displayName ?? connection.providerId} · {
                    connection.mode === 'external-cli' ? 'External agent' : connection.mode === 'native-api' ? 'API billed' : 'Local runtime'
                  }</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {record?.disabled ? 'Disabled' : authenticated ? 'Ready' : installed ? 'Sign in required' : record?.installation === 'not-installed' ? 'Not installed' : 'Not checked'}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 text-xs">
                {record?.executablePath ? <><dt className="text-muted-foreground">Path</dt><dd className="truncate font-mono" title={record.executablePath}>{record.executablePath}</dd></> : null}
                <dt className="text-muted-foreground">Version</dt><dd>{record?.version ?? 'Unknown'}</dd>
                <dt className="text-muted-foreground">Capabilities</dt><dd>{capabilitySummary(connection)}</dd>
                <dt className="text-muted-foreground">Usage</dt><dd>{connection.capabilities.usage ? 'Available when reported' : 'Unavailable'}</dd>
                <dt className="text-muted-foreground">Last check</dt><dd>{record?.lastCheckedAt ? new Date(record.lastCheckedAt).toLocaleString() : 'Never'}</dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={() => act('refresh', connection)} aria-label={`Refresh ${connection.displayName}`}>Refresh</Button>
                {connection.mode === 'external-cli' ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => act('sign-in', connection)} aria-label={`Sign in to ${connection.displayName}`}>Sign in</Button>
                ) : connection.mode === 'native-api' ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => act('add-api-key', connection)} aria-label={`Add API key for ${connection.displayName}`}>Add API key</Button>
                ) : null}
                <Button type="button" size="sm" variant="ghost" onClick={() => act('configure', connection)} aria-label={`Configure ${connection.displayName}`}>Configure</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => act('disable', connection)} aria-label={`Disable ${connection.displayName}`}>Disable</Button>
                {record ? <Button type="button" size="sm" variant="ghost" onClick={() => act('forget', connection)} aria-label={`Forget ${connection.displayName} metadata`}>Forget metadata</Button> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default SubscriptionCliBridge;
