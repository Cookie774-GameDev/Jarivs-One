import {
  DEEPGRAM_PRICING_META,
  evaluateFreshness,
  formatFreshnessFooter,
  hoursForBudgetUsd,
} from '@/lib/dynamic-data';

export type DeepgramSttOptionId =
  | 'nova-3-mono'
  | 'nova-2-compat'
  | 'nova-3-multi'
  | 'flux-en'
  | 'flux-multi';

export interface DeepgramSttOption {
  id: DeepgramSttOptionId;
  label: string;
  tier: 'very-cheap' | 'cheap-medium' | 'medium' | 'medium-high' | 'highest-quality';
  runtimeModel: 'nova-3' | 'nova-2' | 'flux-general-en' | 'flux-general-multi';
  endpointVersion: 'v1' | 'v2';
  language?: 'en' | 'multi';
  streaming: true;
  priceUsdPerMinute: number;
  languages: string;
  useCase: string;
  qualityEvidence: string;
  qualityCaveat: string;
}

export const DEEPGRAM_PRICE_LAST_UPDATED = DEEPGRAM_PRICING_META.lastUpdated;
export const DEEPGRAM_PRICE_SOURCE = DEEPGRAM_PRICING_META.sourceUrl;
export const DEEPGRAM_MODEL_SOURCE = 'https://developers.deepgram.com/docs/model';
const NOVA_2_STREAMING_PER_MINUTE = 0.35 / 60;

export const DEEPGRAM_STT_OPTIONS: readonly DeepgramSttOption[] = Object.freeze([
  {
    id: 'nova-3-mono',
    label: 'Nova-3 Monolingual',
    tier: 'highest-quality',
    runtimeModel: 'nova-3',
    endpointVersion: 'v1',
    language: 'en',
    streaming: true,
    priceUsdPerMinute: 0.0048,
    languages: 'English and supported monolingual languages',
    useCase: 'General-purpose streaming transcription in the selected supported language.',
    qualityEvidence:
      'Deepgram documents Nova-3 as a general-purpose speech-to-text model available through v1/listen.',
    qualityCaveat:
      'Provider benchmark, not a promised accuracy rate. Accent, language, microphone, noise, and domain vocabulary materially change results.',
  },
  {
    id: 'nova-2-compat',
    label: 'Nova-2 Compatibility',
    tier: 'cheap-medium',
    runtimeModel: 'nova-2',
    endpointVersion: 'v1',
    language: 'en',
    streaming: true,
    priceUsdPerMinute: NOVA_2_STREAMING_PER_MINUTE,
    languages: 'Broad legacy language coverage',
    useCase: 'Compatibility option for workflows that explicitly need the Nova-2 runtime.',
    qualityEvidence: 'This option preserves a v1/listen Nova-2 compatibility runtime.',
    qualityCaveat:
      'Compare language and feature support with the current Deepgram documentation before choosing it; no VibeSpace-wide accuracy ranking is claimed.',
  },
  {
    id: 'nova-3-multi',
    label: 'Nova-3 Multilingual',
    tier: 'medium',
    runtimeModel: 'nova-3',
    endpointVersion: 'v1',
    language: 'multi',
    streaming: true,
    priceUsdPerMinute: 0.0058,
    languages: 'Automatic multilingual/code-switching support',
    useCase: 'Streaming transcription where the selected multilingual runtime is appropriate.',
    qualityEvidence: 'Deepgram documents the multilingual Nova-3 runtime on v1/listen.',
    qualityCaveat: 'Language mix and domain audio can differ from provider evaluation data.',
  },
  {
    id: 'flux-en',
    label: 'Flux English',
    tier: 'medium-high',
    runtimeModel: 'flux-general-en',
    endpointVersion: 'v2',
    streaming: true,
    priceUsdPerMinute: 0.0065,
    languages: 'English (all accents)',
    useCase: 'Conversational voice-agent flows with Flux turn events and end-of-turn handling.',
    qualityEvidence:
      'Deepgram documents Flux as a conversational speech-to-text model on v2/listen.',
    qualityCaveat:
      'Turn timing is not a latency guarantee; network, audio, and provider settings affect observed responsiveness.',
  },
  {
    id: 'flux-multi',
    label: 'Flux Multilingual',
    tier: 'medium-high',
    runtimeModel: 'flux-general-multi',
    endpointVersion: 'v2',
    streaming: true,
    priceUsdPerMinute: 0.0078,
    languages: '10-language conversational model',
    useCase: 'Multilingual conversational flows with Flux turn events and end-of-turn handling.',
    qualityEvidence:
      'Deepgram documents the multilingual Flux runtime as a v2/listen conversational model.',
    qualityCaveat:
      'Turn timing is not a latency guarantee; validate supported languages and live behavior against current provider documentation.',
  },
]);

const OPTION_BY_ID = new Map(DEEPGRAM_STT_OPTIONS.map((option) => [option.id, option]));
export const DEFAULT_DEEPGRAM_STT_OPTION: DeepgramSttOptionId = 'nova-3-mono';
export const DEEPGRAM_STT_OPTION_STORAGE_KEY = 'vibespace.deepgram.stt-option.v1';

export function getDeepgramSttOption(
  id: DeepgramSttOptionId | string | null | undefined,
): DeepgramSttOption {
  return OPTION_BY_ID.get(id as DeepgramSttOptionId) ?? DEEPGRAM_STT_OPTIONS[0]!;
}

export function readDeepgramSttOption(): DeepgramSttOptionId {
  if (typeof window === 'undefined') return DEFAULT_DEEPGRAM_STT_OPTION;
  try {
    const value = window.localStorage.getItem(DEEPGRAM_STT_OPTION_STORAGE_KEY);
    return getDeepgramSttOption(value).id;
  } catch {
    return DEFAULT_DEEPGRAM_STT_OPTION;
  }
}

export function writeDeepgramSttOption(id: DeepgramSttOptionId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEEPGRAM_STT_OPTION_STORAGE_KEY, getDeepgramSttOption(id).id);
  } catch {
    // Selection persistence is best-effort; the default remains safe.
  }
}

export function calculateDeepgramCost(
  id: DeepgramSttOptionId,
  requestedMinutes: number,
): { minutes: number; costUsd: number } {
  const minutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0 ? requestedMinutes : 0;
  const costUsd = Number((minutes * getDeepgramSttOption(id).priceUsdPerMinute).toFixed(6));
  return { minutes, costUsd };
}

export function deepgramHoursForBudget(id: DeepgramSttOptionId, budgetUsd = 10): number {
  const perMinute = getDeepgramSttOption(id).priceUsdPerMinute;
  return Number(hoursForBudgetUsd(perMinute, budgetUsd).toFixed(2));
}

/** True when the embedded price snapshot must not be labeled "current". */
export function isDeepgramPriceStale(now = new Date()): boolean {
  return !evaluateFreshness(DEEPGRAM_PRICING_META, now).isCurrent;
}

/** User-facing freshness for Deepgram prices (never current after failed refresh). */
export function getDeepgramPriceFreshness(
  now = new Date(),
  options: { refreshFailed?: boolean } = {},
) {
  return evaluateFreshness(DEEPGRAM_PRICING_META, now, options);
}

export function deepgramPriceFreshnessFooter(
  now = new Date(),
  options: { refreshFailed?: boolean } = {},
): string {
  return formatFreshnessFooter(getDeepgramPriceFreshness(now, options)).replace(
    'Prices/data verified',
    'Prices verified',
  );
}

export function deepgramListenUrl(id: DeepgramSttOptionId = readDeepgramSttOption()): string {
  const option = getDeepgramSttOption(id);
  const params = new URLSearchParams({ model: option.runtimeModel, tag: 'vibespace-stt' });
  if (option.endpointVersion === 'v1') {
    if (option.language) params.set('language', option.language);
    params.set('smart_format', 'true');
    params.set('interim_results', 'true');
    params.set('punctuate', 'true');
    params.set('endpointing', '800');
  } else {
    params.set('eot_timeout_ms', '800');
    params.set('numerals', 'true');
  }
  return `wss://api.deepgram.com/${option.endpointVersion}/listen?${params.toString()}`;
}
