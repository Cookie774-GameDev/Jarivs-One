import { useEffect, useMemo, useState } from 'react';
import type { ProviderId } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { getProviderDisplayName } from './providerRegistry';
import {
  getAccessibleModelOptions,
  getAccessibleProviders,
  useOllamaModelOptions,
} from './models';

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
  /** `${provider}:${modelId}` — stable for keyboard nav */
  id: string;
  provider: ProviderId;
  modelId: string;
  label: string;
}

export interface ModelPickerGroup {
  provider: ProviderId;
  label: string;
  options: ModelPickerOption[];
}

const FOUNDRY_ADAPTER_STORAGE_KEY = 'vibespace.model-foundry.real-adapters.v1';

function promotedFoundryAdapters(): ModelPickerOption[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(FOUNDRY_ADAPTER_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const record = value as { projectId?: unknown; jobId?: unknown; status?: unknown; artifactManifestSha256?: unknown; evaluation?: { artifactManifestSha256?: unknown; report?: { gate?: unknown } } };
      const evaluation = record.evaluation;
      if (record.status !== 'promoted' || evaluation?.report?.gate !== 'pass' || evaluation?.artifactManifestSha256 !== record.artifactManifestSha256 || typeof record.projectId !== 'string' || typeof record.jobId !== 'string') return [];
      const modelId = `${record.projectId}--${record.jobId}`;
      return [{ id: `foundry:${modelId}`, provider: 'foundry' as ProviderId, modelId, label: `Local champion · ${record.jobId}` }];
    });
  } catch { return []; }
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
  ).filter(
    (provider) => provider !== 'local',
  );

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
      })),
    });
  }
  const foundry = promotedFoundryAdapters();
  if (foundry.length) groups.push({ provider: 'foundry', label: 'Build Your Own AI', options: foundry });
  return groups;
}

/** Reactive model catalog for chat + agent pickers (subscribes to Ollama discovery). */
export function useAccessibleChatModels() {
  const apiKeys = useAuthStore((s) => s.apiKeys);
  const offlineMode = useAuthStore((s) => s.offlineMode);
  const plan = useAuthStore((s) => s.plan);
  const defaultLocalModel = useAuthStore((s) => s.defaultLocalModel);
  const ollamaOptions = useOllamaModelOptions();
  const ollamaSignature = ollamaOptions.map((option) => option.id).join('\0');
  const [foundryRegistryRevision, setFoundryRegistryRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setFoundryRegistryRevision((revision) => revision + 1);
    window.addEventListener('vibespace:foundry-adapters-changed', refresh);
    return () => window.removeEventListener('vibespace:foundry-adapters-changed', refresh);
  }, []);

  const groups = useMemo(
    () =>
      buildModelPickerGroups({
        apiKeys,
        offlineMode,
        plan,
        defaultLocalModel,
      }),
    [apiKeys, offlineMode, plan, defaultLocalModel, ollamaSignature, foundryRegistryRevision],
  );

  const flatOptions = useMemo(() => groups.flatMap((group) => group.options), [groups]);

  return {
    groups,
    flatOptions,
    hasAny: flatOptions.length > 0,
    ollamaCount: ollamaOptions.length,
  };
}
