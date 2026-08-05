export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
export type ReasoningMode = 'token-saver' | 'normal' | 'token-final-boss';

export interface ReasoningSelection {
  providerId: string;
  modelId: string;
  connectionId?: string;
}

export interface ReasoningPreference {
  mode: ReasoningMode;
  effortOverride: ReasoningEffort | null;
}

export interface ReasoningCapabilities {
  supportedEfforts: readonly ReasoningEffort[];
  providerOptionKey: string | null;
  wireEffort: (effort: ReasoningEffort) => string;
}

export interface ResolvedReasoningPolicy {
  mode: ReasoningMode;
  selection: ReasoningSelection;
  requestedEffort: ReasoningEffort | null;
  resolvedEffort: ReasoningEffort | null;
  providerOptions: Record<string, unknown>;
  maxOutputTokens: number | undefined;
}

const EFFORTS: readonly ReasoningEffort[] = ['minimal', 'low', 'medium', 'high', 'ultra'];
const MODES: readonly ReasoningMode[] = ['token-saver', 'normal', 'token-final-boss'];
const NO_REASONING: ReasoningCapabilities = {
  supportedEfforts: [],
  providerOptionKey: null,
  wireEffort: (effort) => effort,
};

export function normalizeReasoningPreference(value: unknown): ReasoningPreference {
  if (!value || typeof value !== 'object') return { mode: 'normal', effortOverride: null };
  const record = value as Record<string, unknown>;
  const mode = MODES.includes(record.mode as ReasoningMode)
    ? (record.mode as ReasoningMode)
    : 'normal';
  const effortOverride = EFFORTS.includes(record.effortOverride as ReasoningEffort)
    ? (record.effortOverride as ReasoningEffort)
    : null;
  return { mode, effortOverride };
}

export function getReasoningCapabilities(selection: ReasoningSelection): ReasoningCapabilities {
  const provider = selection.providerId.toLowerCase();
  const model = selection.modelId.toLowerCase();
  const connection = selection.connectionId?.toLowerCase() ?? '';

  if (provider === 'openai' && /^gpt-5(?:\.|$)/.test(model)) {
    const codexSurface = connection.includes('codex') || model.includes('-sol');
    return {
      supportedEfforts: codexSurface
        ? ['low', 'medium', 'high', 'ultra']
        : ['minimal', 'low', 'medium', 'high', 'ultra'],
      providerOptionKey: 'reasoning_effort',
      wireEffort: (effort) => (effort === 'ultra' ? 'xhigh' : effort),
    };
  }

  if (provider === 'anthropic' && /^claude-(?:opus|sonnet)-4/.test(model)) {
    return {
      supportedEfforts: ['low', 'medium', 'high', 'ultra'],
      providerOptionKey: 'reasoning_effort',
      wireEffort: (effort) => (effort === 'ultra' ? 'max' : effort),
    };
  }

  if (provider === 'google' && model.startsWith('gemini-')) {
    return {
      supportedEfforts: model.startsWith('gemini-3.5')
        ? ['minimal', 'low', 'medium', 'high']
        : ['low', 'medium', 'high'],
      providerOptionKey: 'thinking_level',
      wireEffort: (effort) => effort,
    };
  }

  if (provider === 'groq' && model.includes('gpt-oss')) {
    return {
      supportedEfforts: ['low', 'medium', 'high'],
      providerOptionKey: 'reasoning_effort',
      wireEffort: (effort) => effort,
    };
  }

  if (provider === 'xai' && model.startsWith('grok-4.')) {
    return {
      supportedEfforts: ['low', 'medium', 'high', 'ultra'],
      providerOptionKey: 'reasoning_effort',
      wireEffort: (effort) => (effort === 'ultra' ? 'xhigh' : effort),
    };
  }

  return NO_REASONING;
}

export function sanitizeReasoningProviderOptions(
  selection: ReasoningSelection,
  rawOptions: Record<string, unknown> | undefined,
): Record<string, string> {
  const capabilities = getReasoningCapabilities(selection);
  const key = capabilities.providerOptionKey;
  if (!key || !rawOptions) return {};
  const value = rawOptions[key];
  if (typeof value !== 'string') return {};
  const allowed = new Set(
    capabilities.supportedEfforts.map((effort) => capabilities.wireEffort(effort)),
  );
  return allowed.has(value) ? { [key]: value } : {};
}

function nearestSupported(
  requested: ReasoningEffort,
  supported: readonly ReasoningEffort[],
): ReasoningEffort | null {
  if (supported.length === 0) return null;
  if (supported.includes(requested)) return requested;
  const requestedIndex = EFFORTS.indexOf(requested);
  return [...supported].sort(
    (left, right) =>
      Math.abs(EFFORTS.indexOf(left) - requestedIndex) -
      Math.abs(EFFORTS.indexOf(right) - requestedIndex),
  )[0]!;
}

export function resolveReasoningPolicy({
  selection,
  preference: rawPreference,
}: {
  selection: ReasoningSelection;
  preference: ReasoningPreference;
}): ResolvedReasoningPolicy {
  const preference = normalizeReasoningPreference(rawPreference);
  const capabilities = getReasoningCapabilities(selection);
  const requestedEffort =
    preference.effortOverride ??
    (preference.mode === 'token-saver'
      ? (capabilities.supportedEfforts[0] ?? null)
      : preference.mode === 'token-final-boss'
        ? (capabilities.supportedEfforts.at(-1) ?? null)
        : null);
  const resolvedEffort = requestedEffort
    ? nearestSupported(requestedEffort, capabilities.supportedEfforts)
    : null;
  const providerOptions =
    resolvedEffort && capabilities.providerOptionKey
      ? { [capabilities.providerOptionKey]: capabilities.wireEffort(resolvedEffort) }
      : {};

  return {
    mode: preference.mode,
    selection,
    requestedEffort,
    resolvedEffort,
    providerOptions,
    maxOutputTokens: preference.mode === 'token-saver' ? 2048 : undefined,
  };
}
