import type { Theme } from '@/types/common';
import type { SelectableTheme } from './themes';

const CHANNEL_NAME = 'vibespace:appearance';
const PUBLIC_THEME_IDS = new Set<SelectableTheme>(['jarvis', 'vibespace', 'default', 'light']);

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
  return channel;
}

export function parseThemeSyncMessage(value: unknown): SelectableTheme | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as { kind?: unknown; theme?: unknown };
  if (message.kind !== 'theme' || typeof message.theme !== 'string') return null;
  return PUBLIC_THEME_IDS.has(message.theme as SelectableTheme)
    ? (message.theme as SelectableTheme)
    : null;
}

export function publishThemePreference(theme: Theme): void {
  if (!PUBLIC_THEME_IDS.has(theme as SelectableTheme)) return;
  getChannel()?.postMessage({ kind: 'theme', theme });
}

export function startThemeSync(onTheme: (theme: SelectableTheme) => void): () => void {
  const activeChannel = getChannel();
  if (!activeChannel) return () => undefined;
  const onMessage = (event: MessageEvent<unknown>) => {
    const theme = parseThemeSyncMessage(event.data);
    if (theme) onTheme(theme);
  };
  activeChannel.addEventListener('message', onMessage);
  return () => activeChannel.removeEventListener('message', onMessage);
}
