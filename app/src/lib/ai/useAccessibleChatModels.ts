import { useEffect, useMemo, useState } from 'react';
import type { ProviderId } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { getProviderDisplayName } from './providerRegistry';
import { CHAT_MODEL_OPTIONS, getAccessibleModelOptions, getAccessibleProviders, useOllamaModelOptions } from './models';
import type { ProviderConnection } from './adapters/types';
import { PROVIDER_CATALOG, PROVIDER_CONNECTIONS } from './adapters/catalog';

/** @deprecated Use getProviderDisplayName from providerRegistry */
export const MODEL_PROVIDER_LABELS: Partial<Record<ProviderId, string>> = new Proxy(
  {} as Partial<Record<ProviderId, string>>,
  { get(_target, prop: string) { return getProviderDisplayName(prop as ProviderId); } },
);

export interface ModelPickerOption {
  /** Connection-qualified and stable for keyboard navigation. */
  id: string;
  provider: ProviderId;
  modelId: string;
  label: string;
  connection?: Readonly<ProviderConnection>;
  connectionId?: string;
  modeLabel?: string;
  authLabel?: string;
  available?: boolean;
}

export interface ModelPickerGroup {
  provider: ProviderId;
  label: string;
  options: ModelPickerOption[];
}

export interface ConnectionPickerState {
  available: boolean;
  auth: 'authenticated' | 'unauthenticated' | 'unknown';
}

export const AI_CONNECTION_STATE_EVENT = 'jarvis:ai-connections:changed';
const AI_CONNECTION_STATE_KEY = 'vibespace.ai-connection-states.v1';

export function readConnectionPickerStates(): Partial<Record<string, ConnectionPickerState>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(AI_CONNECTION_STATE_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).flatMap(([id, value]) => {
      if (!value || typeof value !== 'object') return [];
      const item = value as Record<string, unknown>;
      if (typeof item.available !== 'boolean' || !['authenticated', 'unauthenticated', 'unknown'].includes(String(item.auth))) return [];
      return [[id, { available: item.available, auth: item.auth as ConnectionPickerState['auth'] }]];
    }));
  } catch { return {}; }
}

export function writeConnectionPickerStates(states: Partial<Record<string, ConnectionPickerState>>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AI_CONNECTION_STATE_KEY, JSON.stringify(states));
  window.dispatchEvent(new Event(AI_CONNECTION_STATE_EVENT));
}

export const CONNECTION_MODE_LABELS = Object.freeze({
  'external-cli': 'Subscription bridge · External agent',
  'native-api': 'Native Jarvis Chat · API billed',
  local: 'Local runtime',
});

function connectionAuthLabel(state: ConnectionPickerState): string {
  if (state.auth === 'authenticated') return 'Ready';
  if (state.auth === 'unauthenticated') return 'Sign in required';
  if (!state.available) return 'Unavailable';
  return 'Authentication unknown';
}

/** Pure connection-qualified picker builder; unavailable entries remain visible but disabled. */
export function buildConnectionPickerGroups(args: {
  connections: readonly Readonly<ProviderConnection>[];
  modelsByProvider: Partial<Record<string, readonly { id: string; label: string }[]>>;
  stateByConnection?: Partial<Record<string, ConnectionPickerState>>;
}): ModelPickerGroup[] {
  const familyByProvider = new Map(
    Object.values(PROVIDER_CATALOG).map((family) => [family.id as string, family]),
  );
  const groups = new Map<string, ModelPickerGroup>();
  for (const connection of args.connections) {
    const models = args.modelsByProvider[connection.providerId] ?? [];
    if (models.length === 0) continue;
    const group = groups.get(connection.providerId) ?? {
      provider: connection.providerId as ProviderId,
      label: familyByProvider.get(connection.providerId)?.displayName
        ?? getProviderDisplayName(connection.providerId as ProviderId),
      options: [],
    };
    const state = args.stateByConnection?.[connection.id] ?? {
      available: connection.mode !== 'external-cli',
      auth: connection.mode === 'local' ? 'authenticated' as const : 'unknown' as const,
    };
    for (const model of models) {
      group.options.push({
        id: `${connection.id}:${model.id}`,
        provider: connection.providerId as ProviderId,
        modelId: model.id,
        label: model.label,
        connection,
        connectionId: connection.id,
        modeLabel: CONNECTION_MODE_LABELS[connection.mode],
        authLabel: connectionAuthLabel(state),
        available: state.available && state.auth !== 'unauthenticated',
      });
    }
    groups.set(connection.providerId, group);
  }
  return [...groups.values()];
}

export function buildModelPickerGroups(args: {
  apiKeys: Partial<Record<ProviderId, string>>;
  offlineMode: boolean;
  plan: ReturnType<typeof useAuthStore.getState>['plan'];
  defaultLocalModel: string;
}): ModelPickerGroup[] {
  const providers = getAccessibleProviders(args.apiKeys, args.offlineMode, args.plan, args.defaultLocalModel)
    .filter((provider) => provider !== 'local');
  const groups: ModelPickerGroup[] = [];
  for (const provider of providers) {
    const models = getAccessibleModelOptions(provider, args.apiKeys, args.offlineMode, args.defaultLocalModel, args.plan);
    if (models.length === 0) continue;
    groups.push({
      provider,
      label: getProviderDisplayName(provider),
      options: models.map((model) => ({
        id: `${provider}:${model.id}`, provider, modelId: model.id, label: model.label,
      })),
    });
  }
  return groups;
}

/** Reactive connection catalog for chat (subscribes to Ollama discovery). */
export function useAccessibleChatModels() {
  const apiKeys = useAuthStore((s) => s.apiKeys);
  const offlineMode = useAuthStore((s) => s.offlineMode);
  const plan = useAuthStore((s) => s.plan);
  const defaultLocalModel = useAuthStore((s) => s.defaultLocalModel);
  const ollamaOptions = useOllamaModelOptions();
  const [connectionRevision, setConnectionRevision] = useState(0);
  useEffect(() => {
    const update = () => setConnectionRevision((value) => value + 1);
    window.addEventListener(AI_CONNECTION_STATE_EVENT, update);
    return () => window.removeEventListener(AI_CONNECTION_STATE_EVENT, update);
  }, []);
  const ollamaSignature = ollamaOptions.map((option) => option.id).join('\0');

  const groups = useMemo(() => {
    const legacy = buildModelPickerGroups({ apiKeys, offlineMode, plan, defaultLocalModel });
    const modelsByProvider: Record<string, { id: string; label: string }[]> = Object.fromEntries(legacy.map((group) => [
      group.provider,
      group.options.map((option) => ({ id: option.modelId, label: option.label })),
    ]));
    for (const connection of PROVIDER_CONNECTIONS) {
      if (connection.mode !== 'external-cli' || modelsByProvider[connection.providerId]?.length) continue;
      modelsByProvider[connection.providerId] = CHAT_MODEL_OPTIONS
        .filter((option) => option.provider === connection.providerId)
        .map((option) => ({ id: option.id, label: option.label }));
    }
    const accessible = new Set(legacy.map((group) => group.provider));
    const scanned = readConnectionPickerStates();
    const stateByConnection = Object.fromEntries(PROVIDER_CONNECTIONS.map((connection) => [
      connection.id,
      scanned[connection.id] ?? {
        available: connection.mode !== 'external-cli' && accessible.has(connection.providerId as ProviderId),
        auth: accessible.has(connection.providerId as ProviderId) || connection.mode === 'local'
          ? 'authenticated' : 'unauthenticated',
      } satisfies ConnectionPickerState,
    ]));
    return buildConnectionPickerGroups({ connections: PROVIDER_CONNECTIONS, modelsByProvider, stateByConnection })
      .sort((a, b) => Number(b.options.some((option) => option.available)) - Number(a.options.some((option) => option.available)));
  }, [apiKeys, offlineMode, plan, defaultLocalModel, ollamaSignature, connectionRevision]);

  const flatOptions = useMemo(() => groups.flatMap((group) => group.options), [groups]);
  return { groups, flatOptions, hasAny: flatOptions.some((option) => option.available !== false), ollamaCount: ollamaOptions.length };
}
