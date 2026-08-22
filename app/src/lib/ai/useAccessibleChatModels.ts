import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderId } from '@/types';
import { useAuthStore } from '@/stores/auth';
import {
  getProviderDisplayName,
  getProviderRegistryEntry,
  isLocalProvider,
} from './providerRegistry';
import {
  MODEL_CATALOG_REFRESH_INTERVAL_MS,
  refreshConnectedProviderModels,
} from './providerModelCatalog';
import { listPromotedAdapters } from '@/features/model-foundry/adapterRegistry';
import { getAccessibleModelOptions, getAccessibleProviders, useOllamaModelOptions } from './models';
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
  logicalProviderModelId,
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

const SUBSCRIPTION_ROUTE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'openai-codex': 'Codex / ChatGPT subscription',
  'anthropic-claude-code': 'Claude Code subscription',
  'google-gemini-cli': 'Gemini CLI subscription',
  'github-copilot-cli': 'GitHub Copilot subscription',
  'qwen-code': 'Qwen Code subscription',
  'zai-coding-plan': 'Z.AI Coding Plan subscription',
});

const UPSTREAM_PROVIDER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  alibaba: 'Alibaba',
  'alibaba-token-plan': 'Alibaba Token Plan',
  azure: 'Azure',
  google: 'Google Gemini',
  moonshot: 'Moonshot',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  qwen: 'Qwen',
  'qwen-coding-plan': 'Qwen Code',
});

function upstreamProviderId(modelId: string): string {
  return canonicalModelId(modelId).split('/').filter(Boolean)[0] ?? '';
}

function upstreamProviderLabel(owner: string): string {
  const exact = UPSTREAM_PROVIDER_LABELS[owner];
  if (exact) return exact;
  const registered = getProviderDisplayName(owner as ProviderId);
  if (registered !== owner) return registered;
  return owner
    .split(/[-_.]+/u)
    .filter(Boolean)
    .map((segment) => `${segment.slice(0, 1).toLocaleUpperCase('en-US')}${segment.slice(1)}`)
    .join(' ');
}

function managedProviderRouteLabel(modelId: string): string {
  const owner = upstreamProviderId(modelId);
  if (owner === 'openai') return 'Codex / ChatGPT subscription';
  if (owner === 'google') return 'Gemini CLI subscription';
  if (owner === 'qwen' || owner === 'qwen-coding-plan') return 'Qwen Code subscription';
  if (owner === 'azure') return 'Azure subscription';
  return `${upstreamProviderLabel(owner || 'provider')} provider connection`;
}

export function connectionRouteModeLabel(
  connection: Readonly<ProviderConnection>,
  modelId?: string,
): string {
  if (connection.mode === 'native-api' || connection.mode === 'local') {
    return connection.displayName;
  }
  if (connection.id === OPENCODE_CLI_CONNECTION.id && modelId) {
    return managedProviderRouteLabel(modelId);
  }
  return SUBSCRIPTION_ROUTE_LABELS[connection.id] ?? `${connection.displayName} subscription`;
}

export function connectionRouteProviderLabel(
  connection: Readonly<ProviderConnection>,
  modelId?: string,
): string {
  if (connection.id === OPENCODE_CLI_CONNECTION.id && modelId) {
    return upstreamProviderLabel(upstreamProviderId(modelId) || 'provider');
  }
  return getProviderDisplayName(connection.providerId as ProviderId);
}

/** Explicit model-catalog invalidation used after auth, key, plan, region, or runtime changes. */
export const OPEN_CODE_MODEL_CATALOG_REFRESH_EVENT = 'vibespace:open-code-model-catalog-refresh';

const OPEN_CODE_MODEL_CACHE_TTL_MS = MODEL_CATALOG_REFRESH_INTERVAL_MS;
const OPEN_CODE_MODEL_FAILURE_RETRY_MS = 15_000;
let openCodeCatalogGeneration = 0;
let openCodeAccountGeneration = 0;
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
  if (openCodeModelLoad) {
    if (!force && openCodeModelLoad.generation === generation) {
      return openCodeModelLoad.promise;
    }
    // Auth/config invalidation can arrive while the lightweight catalog request is in flight.
    // Join that request, discard its generation-bound result, then start exactly one refresh for
    // the newest generation instead of issuing concurrent provider calls.
    return openCodeModelLoad.promise.catch(() => []).then(() => loadOpenCodeModels(force));
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

function pickerCanonicalModelId(providerId: string, modelId: string): string {
  return canonicalProviderModelId(providerId, modelId);
}

function pickerRouteDisplayName(option: ModelPickerOption): string | undefined {
  const connectionName = option.connection?.displayName?.trim();
  if (option.connectionId !== OPENCODE_CLI_CONNECTION.id) return connectionName;
  return managedProviderRouteLabel(option.modelId);
}

function openCodeBaseLeaf(option: ModelPickerOption): string {
  const segments = canonicalModelId(option.modelId).split('/').filter(Boolean);
  const leaf = segments.at(-1) ?? '';
  const base = leaf.endsWith('-fast') ? leaf.slice(0, -'-fast'.length) : leaf;
  return segments.at(-2) === 'openai' && base === 'gpt-5.6' ? 'gpt-5.6-sol' : base;
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

function isDirectOpenAiRoute(option: ModelPickerOption): boolean {
  if (
    option.connectionId !== OPENCODE_CLI_CONNECTION.id ||
    option.catalogSource !== 'opencode-live' ||
    option.available === false
  ) {
    return false;
  }
  const segments = canonicalModelId(option.modelId).split('/').filter(Boolean);
  return segments.length === 2 && segments[0] === 'openai';
}

function openCodeRouteOwner(option: ModelPickerOption): string {
  const owner = upstreamProviderId(option.modelId) || 'other';
  return owner === 'qwen-coding-plan' ? 'qwen' : owner;
}

function openCodeProviderGroupLabel(owner: string): string {
  if (owner === 'openrouter') return 'OpenRouter Models';
  if (owner === 'qwen') return 'Qwen Models';
  if (owner === 'openai') return 'OpenAI';
  return `${upstreamProviderLabel(owner)} Models`;
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
      (option) => isDirectOpenAiRoute(option) && openCodeBaseLeaf(option) === key,
    );
    for (const route of routes) unconsumed.delete(route.id);
    subscriptionOptions.push(logicalOpenCodeOption(routes));
  }

  const result: ModelPickerGroup[] = [];
  if (subscriptionOptions.length > 0) {
    result.push({
      id: 'opencode:openai-subscription',
      provider: 'openai',
      label: 'OpenAI',
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
      provider: (getProviderRegistryEntry(owner as ProviderId)
        ? owner
        : group.provider) as ProviderId,
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
        modeLabel: connectionRouteModeLabel(connection, model.id),
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

  // Present documented aliases once inside an exact connection while retaining
  // every exact upstream route for selection and dispatch.
  for (const group of groups.values()) {
    const routesByLogicalModel = new Map<string, ModelPickerOption[]>();
    for (const option of group.options) {
      const modelKey = logicalProviderModelId(group.provider, option.modelId);
      const routeKey = `${option.connectionId ?? ''}\u0000${modelKey}`;
      const routes = routesByLogicalModel.get(routeKey) ?? [];
      routes.push(option);
      routesByLogicalModel.set(routeKey, routes);
    }
    const visible = [...routesByLogicalModel.values()].map((routes) => {
      const exact = dedupeModelMetadataInOrder(
        routes.map((route) => ({ id: route.id, label: route.label })),
      );
      const exactIds = new Set(exact.map((route) => route.id));
      const uniqueRoutes = routes.filter((route) => exactIds.has(route.id));
      const preferred = uniqueRoutes[0]!;
      return uniqueRoutes.length > 1
        ? { ...preferred, alternativeRoutes: uniqueRoutes }
        : preferred;
    });
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

  const partitioned = [...groups.values()].flatMap((group) =>
    group.provider === ('opencode' as ProviderId) ? partitionOpenCodePickerGroup(group) : [group],
  );
  const openAiGroups = partitioned.filter((group) => group.provider === 'openai');
  if (openAiGroups.length === 0) return partitioned;
  const openAiRoutesByModel = new Map<string, ModelPickerOption[]>();
  for (const option of openAiGroups.flatMap((group) => group.options)) {
    const key = logicalProviderModelId('openai', option.modelId);
    for (const route of option.alternativeRoutes ?? [option]) {
      const routes = openAiRoutesByModel.get(key) ?? [];
      if (!routes.some((candidate) => candidate.id === route.id)) routes.push(route);
      openAiRoutesByModel.set(key, routes);
    }
  }
  const mergedOpenAi: ModelPickerGroup = {
    id: 'provider:openai',
    provider: 'openai',
    label: 'OpenAI',
    options: [...openAiRoutesByModel.values()].map((routes) => {
      const preferred = routes[0]!;
      const label = preferred.label.split(' · ')[0]!.trim();
      if (routes.length === 1) return { ...preferred, label };
      const allFree = routes.every((route) => route.isFree === true);
      return {
        ...preferred,
        label,
        pricingStatus: allFree ? ('free' as const) : ('unknown' as const),
        isFree: allFree,
        alternativeRoutes: routes.map((route) => ({
          ...route,
          label: modelRouteLabel(label, route.modeLabel, routes.length),
        })),
      };
    }),
  };
  let inserted = false;
  return partitioned.flatMap((group) => {
    if (group.provider !== 'openai') return [group];
    if (inserted) return [];
    inserted = true;
    return [mergedOpenAi];
  });
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
    readonly accountGeneration: number;
    readonly models: readonly PickerCatalogModel[];
  }>({ generation: -1, accountGeneration: openCodeAccountGeneration, models: [] });

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
        openCodeAccountGeneration += 1;
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
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const ctx = { apiKeys, offlineMode, plan, defaultLocalModel };
      void refreshConnectedProviderModels(ctx)
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) refreshTimer = setTimeout(refresh, MODEL_CATALOG_REFRESH_INTERVAL_MS);
        });
    };
    refresh();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
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
    const expectedAccountGeneration = openCodeAccountGeneration;
    void loadOpenCodeModels()
      .then((models) => {
        if (cancelled || expectedGeneration !== openCodeCatalogGeneration) return;
        setOpenCodeCatalog({
          generation: expectedGeneration,
          accountGeneration: expectedAccountGeneration,
          models,
        });
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
        setOpenCodeCatalog((current) =>
          current.accountGeneration === expectedAccountGeneration
            ? current
            : {
                generation: expectedGeneration,
                accountGeneration: expectedAccountGeneration,
                models: [],
              },
        );
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
      legacy
        .filter(
          (group) =>
            isLocalProvider(group.provider) ||
            getProviderRegistryEntry(group.provider)?.supportsDynamicListing !== true,
        )
        .map((group) => [
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

    // Subscription CLI hints are not a catalog or an authorization result.
    // The active session plus its live catalog must prove a provider/model
    // route before it is shown anywhere in the picker.
    for (const connection of pickerConnections) {
      if (connection.mode !== 'external-cli') continue;
      if (connection.providerId === KERNEL_SMOKE_PROVIDER_ID && smokeBindingActive) {
        delete modelsByConnection[connection.id];
      } else {
        modelsByConnection[connection.id] = [];
      }
    }

    // Cached rows may survive a transient load failure, but current-session
    // readiness remains the authority for whether they are visible as live.
    const currentLiveOpenCodeModels =
      openCodeReady && openCodeCatalog.accountGeneration === openCodeAccountGeneration
        ? openCodeCatalog.models
        : [];
    for (const connection of pickerConnections) {
      if (
        connection.mode === 'external-cli' &&
        stateByConnection[connection.id]?.auth !== 'authenticated'
      ) {
        continue;
      }
      const discovered = getDiscoveredConnectionModels(connection.id);
      if (discovered.length === 0) continue;
      const discoveredModels = discovered.map((model) => ({
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
      }));
      const hasCurrentLiveAuthority = discovered.some((model) => model.unverified !== true);
      modelsByConnection[connection.id] = dedupeModelMetadataInOrder(
        hasCurrentLiveAuthority
          ? discoveredModels
          : [...(modelsByConnection[connection.id] ?? []), ...discoveredModels],
      );
    }

    if (currentLiveOpenCodeModels.length > 0) {
      // Live catalog truth replaces static hints; it is never unioned with them.
      modelsByConnection[OPENCODE_CLI_CONNECTION.id] = currentLiveOpenCodeModels;
    } else {
      modelsByConnection[OPENCODE_CLI_CONNECTION.id] = [];
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
