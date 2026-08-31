import { rememberSettingsTab } from '@/features/settings/settingsTabMemory';
import { useUIStore } from '@/stores/ui';

export const PROVIDER_FOCUS_STORAGE_KEY = 'vibespace.settings.provider-focus.v1';
export const CONNECT_PROVIDER_FOCUS_IDS = Object.freeze([
  'anthropic',
  'deepseek',
  'google',
  'groq',
  'mistral',
  'openai',
  'openrouter',
  'qwen',
  'together',
  'xai',
] as const);

export type ConnectProviderFocusId = (typeof CONNECT_PROVIDER_FOCUS_IDS)[number];

const PROVIDER_IDS = new Set<string>(CONNECT_PROVIDER_FOCUS_IDS);
const REJECTION = 'Choose one supported provider in Settings.';

export type ProviderConnectionTargetResult =
  | Readonly<{ ok: true; providerId: ConnectProviderFocusId | undefined }>
  | Readonly<{ ok: false; reason: typeof REJECTION }>;

export interface ProviderConnectionEntrypointPort {
  isSettingsOpen(): boolean;
  rememberProviders(): void;
  persistProviderFocus(providerId: ConnectProviderFocusId): void;
  setSettingsOpen(open: boolean): void;
  emitProvidersTab(): void;
  emitProviderFocus(providerId: ConnectProviderFocusId): void;
  schedule(callback: () => void): void;
}

export function parseProviderConnectionTarget(raw: unknown): ProviderConnectionTargetResult {
  if (raw === undefined || raw === null || raw === '') {
    return Object.freeze({ ok: true, providerId: undefined });
  }
  if (
    typeof raw !== 'string' ||
    raw !== raw.trim() ||
    raw.length > 96 ||
    !/^[a-z0-9][a-z0-9._-]{0,95}$/u.test(raw) ||
    !PROVIDER_IDS.has(raw)
  ) {
    return Object.freeze({ ok: false, reason: REJECTION });
  }
  return Object.freeze({ ok: true, providerId: raw as ConnectProviderFocusId });
}

const browserPort: ProviderConnectionEntrypointPort = Object.freeze({
  isSettingsOpen: () => useUIStore.getState().settingsOpen,
  rememberProviders: () => rememberSettingsTab('providers'),
  persistProviderFocus: (providerId: ConnectProviderFocusId) =>
    window.sessionStorage.setItem(PROVIDER_FOCUS_STORAGE_KEY, providerId),
  setSettingsOpen: (open: boolean) => useUIStore.getState().setSettingsOpen(open),
  emitProvidersTab: () =>
    window.dispatchEvent(new CustomEvent('jarvis:settings:tab', { detail: { tab: 'providers' } })),
  emitProviderFocus: (providerId: ConnectProviderFocusId) =>
    window.dispatchEvent(new CustomEvent('jarvis:settings:provider', { detail: { providerId } })),
  schedule: (callback: () => void) => window.setTimeout(callback, 0),
});

export function openProviderConnectionEntrypoint(
  providerId?: string,
  port: Readonly<ProviderConnectionEntrypointPort> = browserPort,
): Readonly<{ ok: true }> | Readonly<{ ok: false; reason: typeof REJECTION }> {
  const parsed = parseProviderConnectionTarget(providerId);
  if (!parsed.ok) return parsed;

  const wasOpen = port.isSettingsOpen();
  port.rememberProviders();
  if (parsed.providerId) {
    try {
      port.persistProviderFocus(parsed.providerId);
    } catch {
      // Focus is optional; the secure Providers surface must still open.
    }
  }
  port.setSettingsOpen(true);

  const emit = () => {
    port.emitProvidersTab();
    if (parsed.providerId) port.emitProviderFocus(parsed.providerId);
  };
  if (wasOpen) emit();
  else port.schedule(emit);
  return Object.freeze({ ok: true });
}
