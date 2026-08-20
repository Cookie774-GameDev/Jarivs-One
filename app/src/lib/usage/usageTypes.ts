import type { ProviderConnection } from '@/lib/ai/adapters/types';

export type UsageProvenance =
  | 'provider-api'
  | 'provider-cli'
  | 'response-metadata'
  | 'local-exact'
  | 'local-estimate'
  | 'unavailable';

export interface UsageValue {
  value?: number;
  unit: 'tokens' | 'usd' | 'requests' | 'percent';
  provenance: UsageProvenance;
  reason?: string;
}

export type UsageAvailability = 'available' | 'unavailable' | 'stale' | 'error';

export interface UsageTotals {
  inputTokens: UsageValue;
  cachedInputTokens: UsageValue;
  outputTokens: UsageValue;
  totalTokens: UsageValue;
  costUsd: UsageValue;
  requests: UsageValue;
}

export interface RouteUsageWindow extends UsageTotals {
  label: 'Current app session' | 'Rolling 30 days';
  startedAt: number;
  lastRequestAt: number | null;
  models: readonly string[];
  availability: UsageAvailability;
}

export interface UsageSnapshot {
  connectionId: string;
  providerId: string;
  providerName: string;
  modelId?: string;
  mode: ProviderConnection['mode'];
  authSource: ProviderConnection['authSource'];
  capturedAt: number;
  usageMode: UsageMode;
  availability: UsageAvailability;
  currentChat: UsageTotals;
  routeWindow?: RouteUsageWindow;
  providerPeriod: UsageValue;
  quota: UsageValue;
  accountUsageState?: UsageAvailability;
  accountUsageUpdatedAt?: number;
  errorCode?: string;
  note?: string;
}

export type UsageMode = 'default' | 'refresh' | 'session' | 'all';
