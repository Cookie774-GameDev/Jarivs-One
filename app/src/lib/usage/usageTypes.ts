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

export interface UsageSnapshot {
  connectionId: string;
  providerId: string;
  providerName: string;
  modelId?: string;
  mode: ProviderConnection['mode'];
  authSource: ProviderConnection['authSource'];
  capturedAt: number;
  currentChat: {
    inputTokens: UsageValue;
    outputTokens: UsageValue;
    totalTokens: UsageValue;
    costUsd: UsageValue;
    requests: UsageValue;
  };
  providerPeriod: UsageValue;
  quota: UsageValue;
  note?: string;
}

export type UsageMode = 'default' | 'refresh' | 'session' | 'all';
