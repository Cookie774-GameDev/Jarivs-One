import type { ProviderId } from '@/types';
import type { ConnectionMode, ProviderConnection } from '@/lib/ai/adapters/types';
import { listEffortOptions, type EffortLabel } from '@/lib/ai/catalog/modelVariants';
import type { ModelPickerGroup, ModelPickerOption } from '@/lib/ai/useAccessibleChatModels';
import { getProviderDisplayName } from '@/lib/ai/providerRegistry';
import { normalizePromptForgeModelSelection, type PromptForgeModelSelection } from './contracts';

export const DEFAULT_PROMPT_FORGE_MODEL_SELECTION: PromptForgeModelSelection = Object.freeze({
  mode: 'prefer_local',
});

export interface PromptForgeModelOption {
  id: string;
  providerId: ProviderId;
  modelId: string;
  label: string;
  connectionId?: string;
  connectionMode?: ConnectionMode;
  connection?: Readonly<ProviderConnection>;
  variants?: readonly string[];
  alternativeRoutes?: readonly PromptForgeModelOption[];
  localOnly: boolean;
  available: boolean;
}

export type PromptForgeCurrentChatSelection =
  | Readonly<{ mode: 'none' }>
  | Readonly<{ mode: 'hive'; hiveId: string }>
  | Readonly<{
      mode: 'single';
      providerId: ProviderId;
      modelId: string;
      connectionId?: string;
      effort?: EffortLabel;
    }>;

export type ResolvedPromptForgeModel = Readonly<{
  providerId: ProviderId;
  modelId: string;
  label: string;
  connectionId: string | null;
  connectionMode: ConnectionMode | null;
  effort?: EffortLabel;
  local: boolean;
  billingClass: 'local_free' | 'subscription_connection' | 'provider_billed';
}>;

export type PromptForgeModelSelectionErrorCode =
  | 'current_chat_not_single'
  | 'model_unavailable'
  | 'connection_ambiguous'
  | 'effort_unavailable'
  | 'offline_cloud_blocked';

export class PromptForgeModelSelectionError extends Error {
  constructor(readonly code: PromptForgeModelSelectionErrorCode) {
    super(
      code === 'current_chat_not_single'
        ? 'Prompt Forge requires a single current chat model.'
        : code === 'model_unavailable'
          ? 'The selected Prompt Forge model is unavailable.'
          : code === 'connection_ambiguous'
            ? 'Choose an exact provider connection for this Prompt Forge model.'
            : code === 'effort_unavailable'
              ? 'The selected Prompt Forge effort is unavailable for this exact model route.'
              : 'A cloud Prompt Forge model is unavailable while offline.',
    );
    this.name = 'PromptForgeModelSelectionError';
  }
}

export const PROMPT_UPGRADE_ASSIGN_MODEL_MESSAGE =
  'Please assign a prompt-upgrade model in Settings. You can use the next-best fast model (Spark or Flash) if one is connected.';

function isLocal(option: PromptForgeModelOption): boolean {
  return (
    option.localOnly ||
    option.connectionMode === 'local' ||
    option.providerId === 'ollama' ||
    option.providerId === 'local'
  );
}

function exactOptions(options: readonly PromptForgeModelOption[]): PromptForgeModelOption[] {
  return options.flatMap((option) => option.alternativeRoutes ?? [option]);
}

function pickerOption(option: PromptForgeModelOption): ModelPickerOption {
  return {
    id: option.id,
    provider: option.providerId,
    modelId: option.modelId,
    label: option.label,
    ...(option.connection ? { connection: option.connection } : {}),
    ...(option.connectionId ? { connectionId: option.connectionId } : {}),
    available: option.available,
    ...(option.variants ? { variants: option.variants } : {}),
    ...(option.alternativeRoutes
      ? { alternativeRoutes: option.alternativeRoutes.map(pickerOption) }
      : {}),
  };
}

/** Adapt Prompt Forge's exact accessible options to the shared chat picker presentation. */
export function buildPromptForgeModelPickerGroups(
  options: readonly PromptForgeModelOption[],
): ModelPickerGroup[] {
  const groups = new Map<ProviderId, ModelPickerGroup>();
  for (const option of options) {
    const group = groups.get(option.providerId) ?? {
      id: `prompt-forge:${option.providerId}`,
      provider: option.providerId,
      label: getProviderDisplayName(option.providerId),
      options: [],
    };
    group.options.push(pickerOption(option));
    groups.set(option.providerId, group);
  }
  return [...groups.values()];
}

export function promptForgePickerSelectedId(
  selection: PromptForgeModelSelection,
  groups: readonly ModelPickerGroup[],
): string {
  if (selection.mode !== 'single') return '';
  const options = groups.flatMap((group) =>
    group.options.flatMap((option) => option.alternativeRoutes ?? [option]),
  );
  return (
    options.find(
      (option) =>
        option.provider === selection.providerId &&
        option.modelId === selection.modelId &&
        (selection.connectionId === undefined || option.connectionId === selection.connectionId),
    )?.id ?? ''
  );
}

function fastFallbackRank(option: PromptForgeModelOption): number {
  const haystack = `${option.modelId} ${option.label}`.toLocaleLowerCase('en-US');
  if (haystack.includes('gpt-5.3-codex-spark')) return 0;
  if (haystack.includes('codex-spark')) return 1;
  if (haystack.includes('spark')) return 2;
  if (haystack.includes('flash-lite') || haystack.includes('flashlite')) return 10;
  if (haystack.includes('flash')) return 11;
  return Number.POSITIVE_INFINITY;
}

/** Next-best prompt-upgrade model when no local/assigned model exists: Spark, then Flash. */
export function pickFastPromptUpgradeFallback(
  options: readonly PromptForgeModelOption[],
): PromptForgeModelOption | undefined {
  return exactOptions(options)
    .filter((option) => option.available && !isLocal(option) && fastFallbackRank(option) < 100)
    .sort((left, right) => {
      const rank = fastFallbackRank(left) - fastFallbackRank(right);
      if (rank !== 0) return rank;
      return (
        left.label.localeCompare(right.label, 'en-US') || left.id.localeCompare(right.id, 'en-US')
      );
    })[0];
}

function resolved(
  option: PromptForgeModelOption,
  effort: EffortLabel = 'auto',
): ResolvedPromptForgeModel {
  const supported = listEffortOptions(
    (option.variants ?? []).map((variant) => ({ id: variant })),
    option.modelId,
  ).some((candidate) => candidate.available && candidate.label === effort);
  if (!supported) throw new PromptForgeModelSelectionError('effort_unavailable');
  const local = isLocal(option);
  return Object.freeze({
    providerId: option.providerId,
    modelId: option.modelId,
    label: option.label,
    connectionId: option.connectionId ?? null,
    connectionMode: option.connectionMode ?? null,
    effort,
    local,
    billingClass: local
      ? 'local_free'
      : option.connectionMode === 'external-cli'
        ? 'subscription_connection'
        : 'provider_billed',
  });
}

function exactMatches(
  selection: Extract<PromptForgeModelSelection, { mode: 'single' }>,
  options: readonly PromptForgeModelOption[],
): PromptForgeModelOption[] {
  return exactOptions(options).filter(
    (option) =>
      option.available &&
      option.providerId === selection.providerId &&
      option.modelId === selection.modelId &&
      (selection.connectionId === undefined || option.connectionId === selection.connectionId),
  );
}

export function resolvePromptForgeModelSelection(
  rawSelection: PromptForgeModelSelection,
  context: Readonly<{
    currentChatSelection: PromptForgeCurrentChatSelection;
    options: readonly PromptForgeModelOption[];
    offlineMode: boolean;
    defaultLocalModel: string;
  }>,
): ResolvedPromptForgeModel {
  const normalized = normalizePromptForgeModelSelection(rawSelection);
  const selection: Exclude<PromptForgeModelSelection, { mode: 'current_chat_model' }> =
    normalized.mode === 'current_chat_model'
      ? (() => {
          if (context.currentChatSelection.mode !== 'single') {
            throw new PromptForgeModelSelectionError('current_chat_not_single');
          }
          return normalizePromptForgeModelSelection({
            mode: 'single',
            providerId: context.currentChatSelection.providerId,
            modelId: context.currentChatSelection.modelId,
            ...(context.currentChatSelection.connectionId
              ? { connectionId: context.currentChatSelection.connectionId }
              : {}),
            ...(context.currentChatSelection.effort
              ? { effort: context.currentChatSelection.effort }
              : {}),
          }) as Extract<PromptForgeModelSelection, { mode: 'single' }>;
        })()
      : normalized;

  let option: PromptForgeModelOption | undefined;
  if (selection.mode === 'prefer_local') {
    const local = exactOptions(context.options).filter(
      (candidate) => candidate.available && isLocal(candidate),
    );
    option =
      local.find(
        (candidate) =>
          candidate.modelId.toLocaleLowerCase('en-US') ===
          context.defaultLocalModel.toLocaleLowerCase('en-US'),
      ) ??
      [...local].sort(
        (left, right) =>
          left.label.localeCompare(right.label, 'en-US') ||
          left.id.localeCompare(right.id, 'en-US'),
      )[0];
    if (!option && !context.offlineMode) {
      option = pickFastPromptUpgradeFallback(context.options);
    }
  } else {
    const matches = exactMatches(selection, context.options);
    if (matches.length > 1 && selection.connectionId === undefined) {
      throw new PromptForgeModelSelectionError('connection_ambiguous');
    }
    option = matches[0];
    if (!option && !context.offlineMode) {
      option = pickFastPromptUpgradeFallback(context.options);
    }
  }
  if (!option) throw new PromptForgeModelSelectionError('model_unavailable');
  if (context.offlineMode && !isLocal(option)) {
    throw new PromptForgeModelSelectionError('offline_cloud_blocked');
  }
  return resolved(option, selection.mode === 'single' ? (selection.effort ?? 'auto') : 'auto');
}
