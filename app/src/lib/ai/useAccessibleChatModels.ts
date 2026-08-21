import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderId } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { getProviderDisplayName } from './providerRegistry';
import { listPromotedAdapters } from '@/features/model-foundry/adapterRegistry';
import {
  CHAT_MODEL_OPTIONS,
  getAccessibleModelOptions,
  getAccessibleProviders,
  useOllamaModelOptions,
} from './models';
import type { ProviderConnection, ProviderDiscoveredModel } from './adapters/types';
import {
  OPENCODE_CLI_CONNECTION,
  CONNECTION_MODEL_OPTIONS,
  PROVIDER_CONNECTIONS,
} from './adapters/catalog';
import { ensureExternalConnectionAutoDetection } from './adapters/autoDetectConnections';
import {
  invalidateOpenCodePersistentModelCache,
  openCodePersistentAdapter,
} from './adapters/opencodePersistent';
import { classifyHarnessModelPricing } from '@/lib/harness/freeModelSelection';
import type { HarnessModelPricing } from '@/lib/harness/types';
import {
  AI_CONNECTION_STATE_EVENT,
  deriveAiConnectionHealth,
  isConnectionSessionChecked,
  readConnectionMetadata,
  readConnectionPickerStates,
  readConnectionSessionPickerStates,
  writeConnectionPickerStates,
  type ConnectionPickerState,
} from './connectionState';
import { probeQwenApiCredential, reconcileNativeProbeState } from './nativeConnectionProbe';
import {
  kernelSmokeProvider,
  KERNEL_SMOKE_BINDING_EVENT,
  KERNEL_SMOKE_PROVIDER_ID,
} from './providers/kernelSmoke';
import {
  canonicalModelId,
  canonicalProviderModelId,
  dedupeModelMetadata,
  modelRouteLabel,
  type SimpleModelCatalogRecord,
  type ModelCatalogSource,
} from './catalog/canonicalModelCatalog';
import {
  setDiscoveredOpenAiSubscriptionModels,
  subscribeDiscoveredOpenAiSubscriptionModels,
} from './openCodeOpenAiCatalog';
import {
  getDiscoveredConnectionModels,
  subscribeDiscoveredConnectionModels,
} from './connectionCatalog';

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
  pricing?: Readonly<HarnessModelPricing>;
  pricingStatus?: 'free' | 'paid' | 'unknown';
  isFree?: boolean;
  /** Exact live routes for one logical OpenCode model, when more than one exists. */
  alternativeRoutes?: readonly ModelPickerOption[];
}

export interface ModelPickerGroup {
  /** Stable presentation identity; provider alone is not unique across auth/billing surfaces. */
  id?: string;
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
export const OPEN_CODE_MODEL_CATALOG_REFRESH_EVENT = 'vibespace:open-code-model-catalog-refresh';

const OPEN_CODE_MODEL_CACHE_TTL_MS = 60_000;
const OPEN_CODE_MODEL_FAILURE_RETRY_MS = 15_000;
let openCodeCatalogGeneration = 0;
let openCodeModelCache:
  | {
      readonly generation: number;
      readonly loadedAt: number;
      readonly models: readonly PickerCatalogModel[];
    }
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

function dedupeModelMetadataInOrder(
  records: readonly Readonly<PickerCatalogModel>[],
): PickerCatalogModel[] {
  const byId = new Map<string, PickerCatalogModel>();
  const order: string[] = [];
  for (const raw of records) {
    const candidate = dedupeModelMetadata([raw])[0];
    if (!candidate) continue;
    const key = canonicalModelId(candidate.id);
    const current = byId.get(key);
    if (!current) {
      order.push(key);
      byId.set(key, candidate);
      continue;
    }
    const merged = dedupeModelMetadata([current, candidate])[0];
    if (merged) byId.set(key, merged);
  }
  return order.map((key) => byId.get(key)!).filter(Boolean);
}

function asCatalogModels(
  models: readonly Readonly<{
    id: string;
    label: string;
    variants?: readonly string[];
    available?: boolean;
    pricing?: Readonly<HarnessModelPricing>;
    pricingStatus?: 'free' | 'paid' | 'unknown';
    isFree?: boolean;
  }>[],
  source: ModelCatalogSource,
  lastVerifiedAt?: number,
): PickerCatalogModel[] {
  return dedupeModelMetadataInOrder(
    models.map((model) => ({
      ...model,
      source,
      ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
    })),
  );
}

/**
 * Build picker rows only from the persistent transport's exact live provider response. Pricing and
 * identity therefore share one runtime, scope, cache generation, and authority boundary.
 */
export function buildLiveOpenCodePickerModels(
  models: readonly Readonly<ProviderDiscoveredModel>[],
  lastVerifiedAt: number,
): PickerCatalogModel[] {
  return dedupeModelMetadataInOrder(
    models.map((model) => {
      const pricingStatus = classifyHarnessModelPricing(model.pricing);
      return {
        id: model.id,
        label: model.label || model.id,
        source: 'opencode-live' as const,
        lastVerifiedAt,
        variants: model.variants,
        available: true,
        ...(pricingStatus === 'unknown' ? {} : { pricing: model.pricing }),
        pricingStatus,
        isFree: pricingStatus === 'free',
      };
    }),
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
    !force &&
    openCodeModelCache &&
    openCodeModelCache.generation === generation &&
    now - openCodeModelCache.loadedAt < OPEN_CODE_MODEL_CACHE_TTL_MS
  ) {
    return openCodeModelCache.models;
  }
  if (!force && openCodeModelLoad?.generation === generation) {
    return openCodeModelLoad.promise;
  }
  const promise = (openCodePersistentAdapter.listModels?.() ?? Promise.resolve([]))
    .then((models) => {
      const loadedAt = Date.now();
      const normalized = buildLiveOpenCodePickerModels(models, loadedAt);
      // An older auth/refresh request must never overwrite a newer catalog.
      if (generation === openCodeCatalogGeneration) {
        openCodeModelCache = { generation, loadedAt, models: normalized };
      }
      return normalized;
    })
    .catch((error) => {
      // A cache from an earlier auth/catalog generation is never executable.
      if (openCodeModelCache?.generation === generation) return openCodeModelCache.models;
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

function isLiveOpenAiSubscriptionRoute(model: Readonly<PickerCatalogModel>): boolean {
  if (model.available === false || model.source !== 'opencode-live') return false;
  const segments = canonicalModelId(model.id).split('/').filter(Boolean);
  return segments.length === 2 && segments[0] === 'openai';
}

function pickerCanonicalModelId(providerId: string, modelId: string): string {
  return canonicalProviderModelId(providerId, modelId);
}

function pickerRouteDisplayName(option: ModelPickerOption): string | undefined {
  const connectionName = option.connection?.displayName?.trim();
  if (option.connectionId !== OPENCODE_CLI_CONNECTION.id) return connectionName;
  const separator = option.modelId.indexOf('/');
  if (separator <= 0) return connectionName;
  const upstreamProvider = option.modelId.slice(0, separator);
  const providerName = getProviderDisplayName(upstreamProvider as ProviderId);
  return connectionName ? `${connectionName} · ${providerName}` : providerName;
}

function openCodeBaseLeaf(option: ModelPickerOption): string {
  const segments = canonicalModelId(option.modelId).split('/').filter(Boolean);
  const leaf = segments.at(-1) ?? '';
  return leaf.endsWith('-fast') ? leaf.slice(0, -'-fast'.length) : leaf;
}

function openCodeSourceProductKey(option: ModelPickerOption): string {
  const segments = canonicalModelId(option.modelId).split('/').filter(Boolean);
  const leaf = openCodeBaseLeaf(option);
  const providerPath = segments.slice(0, -1);
  if (providerPath[0] === 'qwen-coding-plan') providerPath[0] = 'qwen';
  return [...providerPath, leaf].join('/');
}

function preferOpenCodeRoute(left: ModelPickerOption, right: ModelPickerOption): number {
  const leftSegments = canonicalModelId(left.modelId).split('/').filter(Boolean);
  const rightSegments = canonicalModelId(right.modelId).split('/').filter(Boolean);
  return (
    Number(right.available !== false) - Number(left.available !== false) ||
    Number(right.catalogSource === 'opencode-live') -
      Number(left.catalogSource === 'opencode-live') ||
    Number(canonicalModelId(left.modelId).endsWith('-fast')) -
      Number(canonicalModelId(right.modelId).endsWith('-fast')) ||
    leftSegments.length - rightSegments.length ||
    (leftSegments[0]?.length ?? 0) - (rightSegments[0]?.length ?? 0) ||
    left.id.localeCompare(right.id)
  );
}

function logicalOpenCodeOption(candidateRoutes: readonly ModelPickerOption[]): ModelPickerOption {
  const routes = [...candidateRoutes].sort(preferOpenCodeRoute);
  const preferred = routes[0]!;
  if (routes.length === 1) return preferred;
  const logicalLabel = candidateRoutes[0]!.label.split(' · ')[0]!.trim();
  return { ...preferred, label: logicalLabel, alternativeRoutes: routes };
}

function isDirectOpenAiBaseRoute(option: ModelPickerOption): boolean {
  if (
    option.connectionId !== OPENCODE_CLI_CONNECTION.id ||
    option.catalogSource !== 'opencode-live' ||
    option.available === false
  ) {
    return false;
  }
  const segments = canonicalModelId(option.modelId).split('/').filter(Boolean);
  return segments.length === 2 && segments[0] === 'openai' && !segments[1]!.endsWith('-fast');
}

function isOpenAiProductRoute(option: ModelPickerOption): boolean {
  if (
    option.connectionId !== OPENCODE_CLI_CONNECTION.id ||
    option.catalogSource !== 'opencode-live' ||
    option.available === false
  ) {
    return false;
  }
  const segments = canonicalModelId(option.modelId).split('/').filter(Boolean);
  return (
    (segments.length === 2 && segments[0] === 'openai') ||
    (segments.length === 3 && segments[0] === 'openrouter' && segments[1] === 'openai')
  );
}

function openCodeRouteOwner(option: ModelPickerOption): string {
  const owner = canonicalModelId(option.modelId).split('/').filter(Boolean)[0] ?? 'other';
  return owner === 'qwen-coding-plan' ? 'qwen' : owner;
}

function openCodeProviderGroupLabel(owner: string): string {
  if (owner === 'openrouter') return 'OpenRouter Models';
  if (owner === 'qwen') return 'Qwen Models';
  if (owner === 'openai') return 'Other OpenAI Routes';
  const provider = getProviderDisplayName(owner as ProviderId);
  return `${provider === owner ? owner : provider} Models`;
}

/**
 * Present one authenticated OpenAI-subscription row per direct live product while preserving every
 * exact OpenCode route. Nested aggregators can be alternatives, but can never seed subscription
 * authority. Unconsumed providers remain selectable under their own truthful source group.
 */
function partitionOpenCodePickerGroup(group: ModelPickerGroup): ModelPickerGroup[] {
  const unconsumed = new Map(group.options.map((option) => [option.id, option]));
  const subscriptionOptions: ModelPickerOption[] = [];
  const subscriptionKeys = new Set<string>();

  for (const seed of group.options.filter(isDirectOpenAiBaseRoute)) {
    const key = openCodeBaseLeaf(seed);
    if (subscriptionKeys.has(key)) continue;
    subscriptionKeys.add(key);
    const routes = group.options.filter(
      (option) => isOpenAiProductRoute(option) && openCodeBaseLeaf(option) === key,
    );
    for (const route of routes) unconsumed.delete(route.id);
    subscriptionOptions.push(logicalOpenCodeOption(routes));
  }

  const result: ModelPickerGroup[] = [];
  if (subscriptionOptions.length > 0) {
    result.push({
      id: 'opencode:openai-subscription',
      provider: group.provider,
      label: 'OpenAI Subscription',
      options: subscriptionOptions,
    });
  }

  const routesByOwner = new Map<string, ModelPickerOption[]>();
  for (const route of unconsumed.values()) {
    const owner = openCodeRouteOwner(route);
    const routes = routesByOwner.get(owner) ?? [];
    routes.push(route);
    routesByOwner.set(owner, routes);
  }
  for (const [owner, providerRoutes] of routesByOwner) {
    const logicalRoutes = new Map<string, ModelPickerOption[]>();
    for (const route of providerRoutes) {
      const key = openCodeSourceProductKey(route);
      const routes = logicalRoutes.get(key) ?? [];
      routes.push(route);
      logicalRoutes.set(key, routes);
    }
    result.push({
      id: `opencode:${owner}`,
      provider: group.provider,
      label: openCodeProviderGroupLabel(owner),
      options: [...logicalRoutes.values()].map(logicalOpenCodeOption),
    });
  }
  return result;
}

/** Pure connection-qualified picker builder; unavailable entries remain visible but disabled. */
export function buildConnectionPickerGroups(args: {
  connections: readonly Readonly<ProviderConnection>[];
  modelsByProvider: Partial<Record<string, readonly PickerCatalogModel[]>>;
  modelsByConnection?: Partial<Record<string, readonly PickerCatalogModel[]>>;
  stateByConnection?: Partial<Record<string, ConnectionPickerState>>;
  credentialSavedByProvider?: Partial<Record<string, boolean>>;
}): ModelPickerGroup[] {
  const groups = new Map<string, ModelPickerGroup>();

  for (const connection of args.connections) {
    const models = dedupeModelMetadataInOrder(
      args.modelsByConnection?.[connection.id] ??
        args.modelsByProvider[connection.providerId] ??
        [],
    );
    if (models.length === 0) continue;

    const groupId = `connection:${connection.id}`;
    const group = groups.get(groupId) ?? {
      id: groupId,
      provider: connection.providerId as ProviderId,
      label: connection.displayName,
      options: [],
    };
    let state = args.stateByConnection?.[connection.id] ?? {
      available: connection.mode !== 'external-cli',
      auth: connection.mode === 'local' ? ('authenticated' as const) : ('unknown' as const),
    };
    if (
      connection.mode === 'native-api' &&
      connection.authSource === 'api-key' &&
      args.credentialSavedByProvider?.[connection.providerId] === false
    ) {
      state = { available: false, auth: 'unauthenticated' };
    }
    const authAllowsUse =
      connection.mode === 'external-cli'
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
        modeLabel: CONNECTION_MODE_LABELS[connection.mode],
        authLabel: model.available === false ? 'Unavailable' : connectionAuthLabel(state),
        available: state.available && authAllowsUse && model.available !== false,
        catalogSource: model.source,
        lastVerifiedAt: model.lastVerifiedAt,
        variants: model.variants,
        pricing: model.pricing,
        pricingStatus: model.pricingStatus,
        isFree: model.isFree,
      });
    }
    groups.set(groupId, group);
  }

  // Dedupe only within an exact connection+canonical-model route. Distinct
  // API/subscription routes—including unavailable sign-in rows—remain visible
  // so auth, billing, and provider identity are never silently collapsed.
  for (const group of groups.values()) {
    const uniqueByRoute = new Map<string, ModelPickerOption>();
    for (const option of group.options) {
      const modelKey = pickerCanonicalModelId(group.provider, option.modelId);
      const routeKey = `${option.connectionId ?? ''}\u0000${modelKey}`;
      if (!uniqueByRoute.has(routeKey)) uniqueByRoute.set(routeKey, option);
    }
    const visible = [...uniqueByRoute.values()];
    const routeCounts = new Map<string, number>();
    const labelCounts = new Map<string, number>();
    for (const option of visible) {
      const key = pickerCanonicalModelId(group.provider, option.modelId);
      routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1);
      const labelKey = option.label.trim().toLocaleLowerCase('en-US');
      labelCounts.set(labelKey, (labelCounts.get(labelKey) ?? 0) + 1);
    }
    const labeled = visible.map((option) => {
      const key = pickerCanonicalModelId(group.provider, option.modelId);
      const labelKey = option.label.trim().toLocaleLowerCase('en-US');
      return {
        ...option,
        label: modelRouteLabel(
          option.label,
          pickerRouteDisplayName(option),
          Math.max(routeCounts.get(key) ?? 1, labelCounts.get(labelKey) ?? 1),
        ),
      };
    });
    group.options = labeled;
  }

  return [...groups.values()].flatMap((group) =>
    group.provider === ('opencode' as ProviderId) ? partitionOpenCodePickerGroup(group) : [group],
  );
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
      id: `provider:${provider}`,
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
  const preferredConnections = useAuthStore((s) => s.preferredConnectionIdByProviderFamily ?? {});
  const ollamaOptions = useOllamaModelOptions();
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [foundryRevision, setFoundryRevision] = useState(0);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [openCodeCatalog, setOpenCodeCatalog] = useState<{
    readonly generation: number;
    readonly models: readonly PickerCatalogModel[];
  }>({ generation: -1, models: [] });

  const openCodeSessionState = readConnectionSessionPickerStates()[OPENCODE_CLI_CONNECTION.id];
  const openCodeSessionChecked = isConnectionSessionChecked(OPENCODE_CLI_CONNECTION.id);
  const openCodeReady =
    !offlineMode &&
    openCodeSessionChecked &&
    openCodeSessionState?.available === true &&
    openCodeSessionState.auth === 'authenticated';
  const openCodeStateSignature = [
    openCodeSessionChecked,
    openCodeSessionState?.available === true,
    openCodeSessionState?.auth ?? 'unknown',
  ].join(':');
  const openCodeStateSignatureRef = useRef(openCodeStateSignature);
  openCodeStateSignatureRef.current = openCodeStateSignature;

  useEffect(() => {
    const updateConnection = () => {
      const sessionState = readConnectionSessionPickerStates()[OPENCODE_CLI_CONNECTION.id];
      const nextSignature = [
        isConnectionSessionChecked(OPENCODE_CLI_CONNECTION.id),
        sessionState?.available === true,
        sessionState?.auth ?? 'unknown',
      ].join(':');
      if (nextSignature !== openCodeStateSignatureRef.current) {
        openCodeStateSignatureRef.current = nextSignature;
        invalidateOpenCodeModelCatalog();
        invalidateOpenCodePersistentModelCache();
      }
      setConnectionRevision((value) => value + 1);
    };
    const refreshCatalog = () => setCatalogRevision((value) => value + 1);
    window.addEventListener(AI_CONNECTION_STATE_EVENT, updateConnection);
    window.addEventListener(KERNEL_SMOKE_BINDING_EVENT, updateConnection);
    window.addEventListener(OPEN_CODE_MODEL_CATALOG_REFRESH_EVENT, refreshCatalog);
    if (!offlineMode) void ensureExternalConnectionAutoDetection().catch(() => undefined);
    return () => {
      window.removeEventListener(AI_CONNECTION_STATE_EVENT, updateConnection);
      window.removeEventListener(KERNEL_SMOKE_BINDING_EVENT, updateConnection);
      window.removeEventListener(OPEN_CODE_MODEL_CATALOG_REFRESH_EVENT, refreshCatalog);
    };
  }, [offlineMode]);

  useEffect(
    () =>
      subscribeDiscoveredOpenAiSubscriptionModels(() => {
        setConnectionRevision((value) => value + 1);
      }),
    [],
  );

  useEffect(
    () =>
      subscribeDiscoveredConnectionModels(() => {
        setConnectionRevision((value) => value + 1);
      }),
    [],
  );
  useEffect(() => {
    const refreshFoundry = () => setFoundryRevision((value) => value + 1);
    window.addEventListener('vibespace:foundry-adapters-changed', refreshFoundry);
    return () => window.removeEventListener('vibespace:foundry-adapters-changed', refreshFoundry);
  }, []);

  useEffect(() => {
    if (offlineMode) return;
    let cancelled = false;
    // The legacy subscription bridge still consumes this provider-scoped
    // allowlist for exact dispatch validation. Visible picker authority comes
    // from the authenticated persistent catalog loaded below, never this copy.
    void import('@/lib/harness/openCodeHarness')
      .then(async ({ openCodeHarness }) => {
        const openai = await openCodeHarness.listModels('openai');
        if (!cancelled && openai.length > 0) {
          setDiscoveredOpenAiSubscriptionModels(
            openai.map((model) => ({ id: model.id, label: model.name || model.id })),
          );
        }
        const zai = await openCodeHarness.listModels('zai');
        if (cancelled || zai.length === 0) return;
        const { setDiscoveredConnectionModels } = await import('./connectionCatalog');
        setDiscoveredConnectionModels(
          'zai-coding-plan',
          zai.map((model) => ({
            id: model.id,
            label: model.name || model.id,
            source: 'opencode_refresh' as const,
            lastVerifiedAt: Date.now(),
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [offlineMode]);

  useEffect(() => {
    if (offlineMode) return;
    let cancelled = false;
    void import('./providerModelCatalog').then(async ({ loadProviderModels }) => {
      const ctx = { apiKeys, offlineMode, plan, defaultLocalModel };
      for (const provider of [
        'openai',
        'anthropic',
        'google',
        'groq',
        'deepseek',
        'zai',
        'qwen',
        'mistral',
        'together',
        'xai',
        'openrouter',
      ] as const) {
        if (cancelled || !apiKeys[provider]?.trim()) continue;
        await loadProviderModels(provider, ctx).catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apiKeys, offlineMode, plan, defaultLocalModel]);

  useEffect(() => {
    if (offlineMode) return;
    const qwenKey = apiKeys.qwen?.trim();
    if (!qwenKey) return;
    let cancelled = false;
    void probeQwenApiCredential(qwenKey).then((state) => {
      if (cancelled) return;
      const current = readConnectionPickerStates();
      writeConnectionPickerStates({
        ...current,
        'qwen-api': reconcileNativeProbeState(current['qwen-api'], state),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [apiKeys.qwen, offlineMode]);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    if (!openCodeReady) {
      return () => {
        cancelled = true;
      };
    }
    const expectedGeneration = openCodeCatalogGeneration;
    void loadOpenCodeModels()
      .then((models) => {
        if (cancelled || expectedGeneration !== openCodeCatalogGeneration) return;
        setOpenCodeCatalog({ generation: expectedGeneration, models });
        const age = openCodeModelCache ? Date.now() - openCodeModelCache.loadedAt : 0;
        const delay = Math.max(1_000, OPEN_CODE_MODEL_CACHE_TTL_MS - age);
        refreshTimer = setTimeout(() => {
          if (cancelled) return;
          invalidateOpenCodeModelCatalog();
          setCatalogRevision((value) => value + 1);
        }, delay);
      })
      .catch(() => {
        if (cancelled || expectedGeneration !== openCodeCatalogGeneration) return;
        setOpenCodeCatalog({ generation: expectedGeneration, models: [] });
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
    const pickerConnections = offlineMode
      ? PROVIDER_CONNECTIONS.filter((connection) => connection.mode === 'local')
      : PROVIDER_CONNECTIONS;
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

    const scanned = readConnectionPickerStates();
    const sessionScanned = readConnectionSessionPickerStates();
    const metadata = readConnectionMetadata();
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
          const current = sessionScanned[connection.id] ?? { available: false, auth: 'unknown' };
          const health = deriveAiConnectionHealth({
            connection,
            metadata: metadata[connection.id] ?? {
              installation: current.available ? 'installed' : 'not-installed',
              auth: current.auth,
            },
          });
          state = { available: health.usable, auth: current.auth };
        } else {
          const health = deriveAiConnectionHealth({
            connection,
            metadata: metadata[connection.id],
            credentialSaved: Boolean(apiKeys[connection.providerId as ProviderId]),
          });
          state =
            scanned[connection.id] ??
            ({
              available: health.usable,
              auth:
                health.auth === 'authenticated' || health.auth === 'not_required'
                  ? 'authenticated'
                  : health.auth,
            } satisfies ConnectionPickerState);
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

    // Cached rows may survive a transient load failure, but current-session
    // readiness remains the authority for whether they are visible as live.
    const currentLiveOpenCodeModels =
      openCodeReady && openCodeCatalog.generation === openCodeCatalogGeneration
        ? openCodeCatalog.models
        : [];
    const hasHealthyLiveOpenAiSubscription = currentLiveOpenCodeModels.some(
      isLiveOpenAiSubscriptionRoute,
    );
    // The managed live OpenCode catalog owns authenticated subscription truth.
    // Once it exposes an exact OpenAI route, do not also surface stale Codex
    // static rows for the same subscription. When live authority is absent,
    // static fallback stays visible but disabled and cannot be selected for a send.
    modelsByConnection['openai-codex'] = hasHealthyLiveOpenAiSubscription
      ? []
      : asCatalogModels(
          (CONNECTION_MODEL_OPTIONS['openai-codex'] ?? []).map((model) => ({
            ...model,
            available: false,
          })),
          'connection-static',
        );

    for (const connection of pickerConnections) {
      const discovered = getDiscoveredConnectionModels(connection.id);
      if (discovered.length === 0) continue;
      modelsByConnection[connection.id] = dedupeModelMetadataInOrder([
        ...(modelsByConnection[connection.id] ?? []),
        ...discovered.map((model) => ({
          id: model.id,
          label: model.label,
          source:
            model.source === 'opencode_refresh'
              ? ('opencode-live' as const)
              : model.source === 'stale_fallback'
                ? ('offline-cache' as const)
                : ('provider-live' as const),
          lastVerifiedAt: model.lastVerifiedAt,
          available: model.unverified !== true,
        })),
      ]);
    }

    const alwaysOnOpenCode = asCatalogModels(
      CONNECTION_MODEL_OPTIONS[OPENCODE_CLI_CONNECTION.id] ?? [],
      'connection-static',
    );
    if (currentLiveOpenCodeModels.length > 0) {
      // Live catalog truth replaces static hints; it is never unioned with them.
      modelsByConnection[OPENCODE_CLI_CONNECTION.id] = currentLiveOpenCodeModels;
    } else if (alwaysOnOpenCode.length > 0) {
      modelsByConnection[OPENCODE_CLI_CONNECTION.id] = alwaysOnOpenCode;
    }

    const connectionGroups = buildConnectionPickerGroups({
      connections: pickerConnections,
      modelsByProvider,
      modelsByConnection,
      stateByConnection,
      credentialSavedByProvider: Object.fromEntries(
        pickerConnections.map((connection) => [
          connection.providerId,
          Boolean(apiKeys[connection.providerId as ProviderId]),
        ]),
      ),
    })
      .map((group) => ({
        ...group,
        options: [...group.options].sort(
          (left, right) =>
            Number(right.connectionId === preferredConnections?.[group.provider]) -
              Number(left.connectionId === preferredConnections?.[group.provider]) ||
            Number(right.available !== false) - Number(left.available !== false) ||
            left.label.localeCompare(right.label),
        ),
      }))
      .sort(
        (a, b) =>
          Number(b.options.some((option) => option.available)) -
            Number(a.options.some((option) => option.available)) || a.label.localeCompare(b.label),
      );
    // Promoted Model Foundry adapters are local, credential-free options.
    // They surface only while their evaluation gate stays passed (fail closed
    // inside listPromotedAdapters), and never through a cloud connection.
    void foundryRevision;
    const foundryAdapters =
      typeof window === 'undefined' ? [] : listPromotedAdapters(window.localStorage);
    if (foundryAdapters.length === 0) return connectionGroups;
    const foundryGroup: ModelPickerGroup = {
      id: 'provider:foundry',
      provider: 'foundry',
      label: getProviderDisplayName('foundry'),
      options: foundryAdapters.map((record) => ({
        id: `foundry:${record.projectId}--${record.jobId}`,
        provider: 'foundry' as ProviderId,
        modelId: `${record.projectId}--${record.jobId}`,
        label: record.projectName?.trim()
          ? record.projectName.trim()
          : `Local champion · ${record.jobId}`,
        available: true,
        catalogSource: 'provider-live' as const,
      })),
    };
    return [...connectionGroups, foundryGroup];
  }, [
    apiKeys,
    offlineMode,
    plan,
    defaultLocalModel,
    ollamaSignature,
    connectionRevision,
    catalogRevision,
    openCodeCatalog,
    openCodeReady,
    preferredConnections,
    foundryRevision,
  ]);

  const flatOptions = useMemo(
    () =>
      groups.flatMap((group) =>
        group.options.flatMap((option) => option.alternativeRoutes ?? [option]),
      ),
    [groups],
  );
  return {
    groups,
    flatOptions,
    hasAny: flatOptions.some((option) => option.available !== false),
    ollamaCount: ollamaOptions.length,
    refreshModels,
  };
}
