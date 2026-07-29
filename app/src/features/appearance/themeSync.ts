import {
  parseSelectableTheme,
  parseThemeSyncMessage as parseThemeSyncValue,
  resolveDocumentTheme,
  type SelectableTheme,
} from './themeContract';

const CHANNEL_NAME = 'vibespace:appearance';

export type ThemeSyncChannel = {
  postMessage: (value: unknown) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  close: () => void;
};

export type ThemeSyncChannelFactory = (name: string) => ThemeSyncChannel | null;

export type ThemeSyncApplicationDocument = Pick<Document, 'documentElement'>;

export type ThemeSyncApplicationStore = {
  setState(state: { theme: SelectableTheme }): void;
};

const createBroadcastChannel: ThemeSyncChannelFactory = (name) =>
  typeof BroadcastChannel === 'function' ? (new BroadcastChannel(name) as ThemeSyncChannel) : null;

export function applyThemeSyncToApplication(
  theme: SelectableTheme,
  targetDocument: ThemeSyncApplicationDocument,
  themeStore: ThemeSyncApplicationStore,
): void {
  targetDocument.documentElement.setAttribute('data-theme', resolveDocumentTheme(theme));
  targetDocument.documentElement.setAttribute('data-theme-preference', theme);
  themeStore.setState({ theme });
}

export function parseThemeSyncMessage(value: unknown): SelectableTheme | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as { kind?: unknown; theme?: unknown };
  return message.kind === 'theme' ? parseThemeSyncValue(message.theme) : null;
}

export function publishThemePreference(
  theme: SelectableTheme,
  createChannel: ThemeSyncChannelFactory = createBroadcastChannel,
): void {
  const canonicalTheme = parseSelectableTheme(theme);
  if (!canonicalTheme) return;

  const channel = createChannel(CHANNEL_NAME);
  if (!channel) return;
  try {
    channel.postMessage({ kind: 'theme', theme: canonicalTheme });
  } finally {
    channel.close();
  }
}

export function startThemeSync(
  onTheme: (theme: SelectableTheme) => void,
  createChannel: ThemeSyncChannelFactory = createBroadcastChannel,
): () => void {
  const channel = createChannel(CHANNEL_NAME);
  if (!channel) return () => undefined;

  const onMessage = (event: MessageEvent<unknown>) => {
    const theme = parseThemeSyncMessage(event.data);
    if (theme) onTheme(theme);
  };
  channel.addEventListener('message', onMessage);

  return () => {
    channel.removeEventListener('message', onMessage);
    channel.close();
  };
}
