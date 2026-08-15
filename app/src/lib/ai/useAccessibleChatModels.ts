import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProviderId } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { getProviderDisplayName } from './providerRegistry';
import {
  CHAT_MODEL_OPTIONS,
  getAccessibleModelOptions,
  getAccessibleProviders,
  useOllamaModelOptions,
} from './models';
import type { ProviderConnection } from './adapters/types';
import {
  CODEX_CLI_CONNECTION,
  CONNECTION_MODEL_OPTIONS,
  OPENCODE_CLI_CONNECTION,
  PROVIDER_CATALOG,
  PROVIDER_CONNECTIONS,
} from './adapters/catalog';
import { ensureExternalConnectionAutoDetection } from './adapters/autoDetectConnections';
import {
  invalidateOpenCodePersistentModelCache,
  openCodePersistentAdapter,
} from './adapters/opencodePersistent';
import {
  AI_CONNECTION_STATE_EVENT,
  isConnectionSessionChecked,
  readConnectionPickerStates,
  readConnectionSessionPickerStates,
  type ConnectionPickerState,
} from './connectionState';
import {
  kernelSmokeProvider,
  KERNEL_SMOKE_BINDING_EVENT,
  KERNEL_SMOKE_PROVIDER_ID,
} from './providers/kernelSmoke';
import {
  canonicalProviderModelId,
  dedupeModelMetadata,
  modelRouteLabel,
  type SimpleModelCatalogRecord,
  type ModelCatalogSource,
} from './catalog/canonicalModelCatalog';

/** @deprecated Use getProviderDisplayName from providerRegistry */
export const MODEL_PROVIDER_LABELS: Partial<Record<ProviderId, string>> = new Proxy(
  {} as Partial<Record<ProviderId, string>>,
  {
    get(_target, prop: string) {
      return getProviderDisplayName(prop as ProviderId);
    },
  },
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
  catalogSource?: ModelCatalogSource;
  lastVerifiedAt?: number;
  variants?: readonly string[];
}

export interface ModelPickerGroup {
  provider: ProviderId;
  label: string;
  options: ModelPickerOption[];
}

export interface PickerCatalogModel extends SimpleModelCatalogRecord {
  id: string;
  label: string;
}

export {
  AI_CONNECTION_STATE_EVENT,
  readConnectionPickerStates,
  writeConnectionPickerStates,
} from './connectionState';
export type { ConnectionPickerState } from './connectionState';

export const CONNECTION_MODE_LABELS = Object.freeze({
  'external-cli': 'Subscription bridge · External agent',
  'native-api': 'Native Jarvis Chat · API billed',
  local: 'Local runtime',
});

/** Explicit model-catalog invalidation used after auth, key, plan, region, or runtime changes. */
export const OPEN_CODE_MODEL_CATALOG_REFRESH_EVENT =
  'vibespace:open-code-model-catalog-refresh';

const OPEN_CODE_MODEL_CACHE_TTL_MS = 60_000;
const OPEN_CODE_MODEL_FAILURE_RETRY_MS = 15_000;
let openCodeCatalogGeneration = 0;
let openCodeModelCache:
  | { readonly loadedAt: number; readonly models: readonly PickerCatalogModel[] }
  | undefined;
let openCodeModelLoad:
  | { readonly generation: number; readonly promise: Promise<readonly PickerCatalogModel[]> }
  | undefined;

function connectionAuthLabel(state: ConnectionPickerState): string {
  if (state.auth === 'authenticated') return 'Ready';
  if (state.auth === 'unauthenticated') return 'Sign in required';
  if (!state.available) return 'Unavailable';
  return 'Authentication unknown';
}

function asCatalogModels(
  models: readonly Readonly<{ id: string; label: string; variants?: readonly string[] }>[],
  source: ModelCatalogSource,
  lastVerifiedAt?: number,
): PickerCatalogModel[] {
  return dedupeModelMetadata(
    models.map((model) => ({
      ...model,
      source,
      ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
    })),
  );
}

function invalidateOpenCodeModelCatalog(): number {
  openCodeCatalogGeneration += 1;
  return openCodeCatalogGeneration;
}

async function loadOpenCodeModels(force = false): Promise<readonly PickerCatalogModel[]> {
  const now = Date.now();
  const generation = openCodeCatalogGeneration;
  if (
    !force
    && openCodeModelCache
    && now - openCodeModelCache.loadedAt < OPEN_CODE_MODEL_CACHE_TTL_MS
  ) {
    return openCodeModelCache.models;
  }
  if (!force && openCodeModelLoad?.generation === generation) {
    return openCodeModelLoad.promise;
  }
  if (!openCodePersistentAdapter.listModels) return openCodeModelCache?.models ?? [];

  const promise = openCodePersistentAdapter
    .listModels()
    .then((models) => {
      const loadedAt = Date.now();
      const normalized = asCatalogModels(models, 'opencode-live', loadedAt);
      // An older auth/refresh request must never overwrite a newer catalog.
      if (generation === openCodeCatalogGeneration) {
        openCodeModelCache = { loadedAt, models: normalized };
      }
      return normalized;
    })
    .catch((error) => {
      // A transient discovery/auth failure must not erase the last verified list.
      if (openCodeModelCache) return openCodeModelCache.models;
      throw error;
    })
    .finally(() => {
      if (openCodeModelLoad?.promise === promise) openCodeModelLoad = undefined;
    });
  openCodeModelLoad = { generation, promise };
  return promise;
}

/** Force the next authenticated model discovery without erasing verified cache. */
export function requestOpenCodeModelCatalogRefresh(): void {
  invalidateOpenCodeModelCatalog();
  invalidateOpenCodePersistentModelCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPEN_CODE_MODEL_CATALOG_REFRESH_EVENT));
  }
}

function pickerCanonicalModelId(providerId: string, modelId: string): string {
  return canonicalProviderModelId(providerId, modelId);
}

/** Pure connection-qualified picker builder; unavailable entries remain visible but disabled. */
export function buildConnectionPickerGroups(args: {
  connections: readonly Readonly<ProviderConnection>[];
  modelsByProvider: Partial<Record<string, readonly PickerCatalogModel[]>>;
  modelsByConnection?: Partial<Record<string, readonly PickerCatalogModel[]>>;
  stateByConnection?: Partial<Record<string, ConnectionPickerState>>;
}): ModelPickerGroup[] {
  const familyByProvider = new Map(
    Object.values(PROVIDER_CATALOG).map((family) => [family.id as string, family]),
  );
  const groups = new Map<string, ModelPickerGroup>();

  for (const connection of args.connections) {
    const models = dedupeModelMetadata(
      args.modelsByConnection?.[connection.id] ??
        args.modelsByProvider[connection.providerId] ??
        [],
    );
    if (models.length === 0) continue;

    const group = groups.get(connection.providerId) ?? {
      provider: connection.providerId as ProviderId,
      label:
        familyByProvider.get(connection.providerId)?.displayName ??
        getProviderDisplayName(connection.providerId as ProviderId),
      options: [],
    };
    const state = args.stateByConnection?.[connection.id] ?? {
      available: connection.mode !== 'external-cli',
      auth: connection.mode === 'local' ? ('authenticated' as const) : ('unknown' as const),
    };
    const authAllowsUse =
      connection.id === CODEX_CLI_CONNECTION.id || connection.id === OPENCODE_CLI_CONNECTION.id
        ? state.auth === 'authenticated'
        : state.auth !== 'unauthenticated';

    for (const model of models) {
      group.options.push({
        id: `${connection.id}:${model.id}`,
        provider: connection.providerId as ProviderId,
        modelId: model.id,
        label: model.label,
        connection,
        connectionId: connection.id,
        modeLabel: `${connection.displayName} · ${CONNECTION_MODE_LABELS[connection.mode]}`,
        authLabel: connectionAuthLabel(state),
        available: state.available && authAllowsUse && model.available !== false,
        catalogSource: model.source,
        lastVerifiedAt: model.lastVerifiedAt,
        variants: model.variants,
      });
    }
    groups.set(connection.providerId, group);
  }

  // Remove stale/unavailable duplicates when the same canonical model has a
  // healthy route. Distinct healthy API/subscription routes remain explicit and
  // connection-qualified so billing/auth identity is never silently merged.
  for (const group of groups.values()) {
    const availableByModel = new Set(
      group.options
        .filter((option) => option.available !== false)
        .map((option) => pickerCanonicalModelId(group.provider, option.modelId)),
    );
    const uniqueByRoute = new Map<string, ModelPickerOption>();
    for (const option of group.options) {
      const modelKey = pickerCanonicalModelId(group.provider, option.modelId);
      if (option.available === false && availableByModel.has(modelKey)) continue;
      const routeKey = `${option.connectionId ?? ''}\u0000${modelKey}`;
      if (!uniqueByRoute.has(routeKey)) uniqueByRoute.set(routeKey, option);
    }
    const visible = [...uniqueByRoute.values()];
    const routeCounts = new Map<string, number>();
    for (const option of visible) {
      const key = pickerCanonicalModelId(group.provider, option.modelId);
      routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1);
    }
    group.options = visible
      .map((option) => {
        const key = pickerCanonicalModelId(group.provider, option.modelId);
        return {
          ...option,
          label: modelRouteLabel(
            option.label,
            option.connection?.displayName,
            routeCounts.get(key) ?? 1,
          ),
        };
      })
      .sort(
        (a, b) =>
          Number(b.available !== false) - Number(a.available !== false)
          || a.label.localeCompare(b.label)
          || a.id.localeCompare(b.id),
      );
  }

  return [...groups.values()];
}

export function buildModelPickerGroups(args: {
  apiKeys: Partial<Record<ProviderId, string>>;
  offlineMode: boolean;
  plan: ReturnType<typeof useAuthStore.getState>['plan'];
  defaultLocalModel: string;
}): ModelPickerGroup[] {
  const providers = getAccessibleProviders(
    args.apiKeys,
    args.offlineMode,
    args.plan,
    args.defaultLocalModel,
  ).filter((provider) => provider !== 'local');
  const groups: ModelPickerGroup[] = [];
  for (const provider of providers) {
    const models = getAccessibleModelOptions(
      provider,
      args.apiKeys,
      args.offlineMode,
      args.defaultLocalModel,
      args.plan,
    );
    if (models.length === 0) continue;
    groups.push({
      provider,
      label: getProviderDisplayName(provider),
      options: models.map((model) => ({
        id: `${provider}:${model.id}`,
        provider,
        modelId: model.id,
        label: model.label,
        catalogSource: 'provider-static',
      })),
    });
  }
  return groups;
}

/** Reactive connection catalog for chat (subscribes to Ollama and connection discovery). */
export function useAccessibleChatModels() {
  const apiKeys = useAuthStore((s) => s.apiKeys);
  const offlineMode = useAuthStore((s) => s.offlineMode);
  const plan = useAuthStore((s) => s.plan);
  const defaultLocalModel = useAuthStore((s) => s.defaultLocalModel);
  const ollamaOptions = useOllamaModelOptions();
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [openCodeModels, setOpenCodeModels] = useState<readonly PickerCatalogModel[]>([]);

  const openCodeSessionState = readConnectionSessionPickerStates()[OPENCODE_CLI_CONNECTION.id];
  const openCodeReady =
    !offlineMode &&
    isConnectionSessionChecked(OPENCODE_CLI_CONNECTION.id) &&
    openCodeSessionState?.available === true &&
    openCodeSessionState.auth === 'authenticated';

  useEffect(() => {
    const updateConnection = () => {
      invalidateOpenCodeModelCatalog();
      setConnectionRevision((value) => value + 1);
    };
    const refreshCatalog = () => {
      setCatalogRevision((value) => value + 1);
    };
    window.addEventListener(AI_CONNECTION_STATE_EVENT, updateConnection);
    window.addEventListener(KERNEL_SMOKE_BINDING_EVENT, updateConnection);
    window.addEventListener(OPEN_CODE_MODEL_CATALOG_REFRESH_EVENT, refreshCatalog);
    if (!offlineMode) {
      void ensureExternalConnectionAutoDetection().catch(() => undefined);
    }
    return () => {
      window.removeEventListener(AI_CONNECTION_STATE_EVENT, updateConnection);
      window.removeEventListener(KERNEL_SMOKE_BINDING_EVENT, updateConnection);
      window.removeEventListener(OPEN_CODE_MODEL_CATALOG_REFRESH_EVENT, refreshCatalog);
    };
  }, [offlineMode]);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    if (!openCodeReady || !openCodePersistentAdapter.listModels) {
      // Preserve the last verified rows as disabled/stale while signed out.
      return () => {
        cancelled = true;
      };
    }

    const expectedGeneration = openCodeCatalogGeneration;
    void loadOpenCodeModels()
      .then((models) => {
        if (cancelled || expectedGeneration !== openCodeCatalogGeneration) return;
        setOpenCodeModels(models);
        const age = openCodeModelCache ? Date.now() - openCodeModelCache.loadedAt : 0;
        const delay = Math.max(1_000, OPEN_CODE_MODEL_CACHE_TTL_MS - age);
        refreshTimer = setTimeout(() => {
          if (cancelled) return;
          invalidateOpenCodeModelCatalog();
          setCatalogRevision((value) => value + 1);
        }, delay);
      })
      .catch(() => {
        // Preserve any previously verified in-component list on transient failure,
        // and retry with bounded backoff rather than high-frequency polling.
        refreshTimer = setTimeout(() => {
          if (cancelled) return;
          invalidateOpenCodeModelCatalog();
          setCatalogRevision((value) => value + 1);
        }, OPEN_CODE_MODEL_FAILURE_RETRY_MS);
      });
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [openCodeReady, connectionRevision, catalogRevision]);

  const refreshModels = useCallback(() => requestOpenCodeModelCatalogRefresh(), []);
  const ollamaSignature = ollamaOptions.map((option) => option.id).join('\0');

  const groups = useMemo(() => {
    const modernOpenCodeHealthy = openCodeReady && openCodeModels.length > 0;
    const pickerConnections = (offlineMode
      ? PROVIDER_CONNECTIONS.filter((connection) => connection.mode === 'local')
      : PROVIDER_CONNECTIONS
    ).filter(
      (connection) => !(modernOpenCodeHealthy && connection.id === CODEX_CLI_CONNECTION.id),
    );
    const legacy = buildModelPickerGroups({ apiKeys, offlineMode, plan, defaultLocalModel });
    const modelsByProvider: Record<string, PickerCatalogModel[]> = Object.fromEntries(
      legacy.map((group) => [
        group.provider,
        asCatalogModels(
          group.options.map((option) => ({ id: option.modelId, label: option.label })),
          'provider-static',
        ),
      ]),
    );

    const smokeBindingActive = kernelSmokeProvider.isAvailable();
    if (
      smokeBindingActive &&
      pickerConnections.some((connection) => connection.providerId === KERNEL_SMOKE_PROVIDER_ID)
    ) {
      modelsByProvider[KERNEL_SMOKE_PROVIDER_ID] = asCatalogModels(
        [{ id: 'kernel-smoke-v1', label: 'Kernel Smoke v1' }],
        'provider-live',
        Date.now(),
      );
    }

    for (const connection of pickerConnections) {
      if (connection.mode !== 'external-cli' || modelsByProvider[connection.providerId]?.length)
        continue;
      modelsByProvider[connection.providerId] = asCatalogModels(
        CHAT_MODEL_OPTIONS.filter((option) => option.provider === connection.providerId).map(
          (option) => ({ id: option.id, label: option.label }),
        ),
        'provider-static',
      );
    }

    const accessible = new Set(legacy.map((group) => group.provider));
    const scanned = readConnectionPickerStates();
    const sessionScanned = readConnectionSessionPickerStates();
    const stateByConnection = Object.fromEntries(
      pickerConnections.map((connection) => {
        let state: ConnectionPickerState;
        if (connection.providerId === KERNEL_SMOKE_PROVIDER_ID && smokeBindingActive) {
          state = { available: true, auth: 'authenticated' };
        } else if (
          connection.mode === 'external-cli' &&
          !isConnectionSessionChecked(connection.id)
        ) {
          state = { available: false, auth: 'unknown' };
        } else if (connection.mode === 'external-cli') {
          state = sessionScanned[connection.id] ?? { available: false, auth: 'unknown' };
        } else {
          state = scanned[connection.id] ?? {
            available: accessible.has(connection.providerId as ProviderId),
            auth:
              accessible.has(connection.providerId as ProviderId) || connection.mode === 'local'
                ? 'authenticated'
                : 'unauthenticated',
          };
        }
        return [connection.id, state];
      }),
    );

    const modelsByConnection: Record<string, readonly PickerCatalogModel[]> = Object.fromEntries(
      Object.entries(CONNECTION_MODEL_OPTIONS).map(([connectionId, models]) => [
        connectionId,
        asCatalogModels(models ?? [], 'connection-static'),
      ]),
    );
    if (openCodeModels.length > 0) {
      // Authenticated live discovery is authoritative for the OpenCode connection.
      modelsByConnection[OPENCODE_CLI_CONNECTION.id] = openCodeModels;
    }

    return buildConnectionPickerGroups({
      connections: pickerConnections,
      modelsByProvider,
      modelsByConnection,
      stateByConnection,
    }).sort(
      (a, b) =>
        Number(b.options.some((option) => option.available)) -
          Number(a.options.some((option) => option.available)) ||
        a.label.localeCompare(b.label),
    );
  }, [
    apiKeys,
    offlineMode,
    plan,
    defaultLocalModel,
    ollamaSignature,
    connectionRevision,
    openCodeModels,
    openCodeReady,
  ]);

  const flatOptions = useMemo(() => groups.flatMap((group) => group.options), [groups]);
  return {
    groups,
    flatOptions,
    hasAny: flatOptions.some((option) => option.available !== false),
    ollamaCount: ollamaOptions.length,
    refreshModels,
  };
}
