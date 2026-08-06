export const CHAT_ACTIVITY_PANEL_KEY = 'vibespace-chat-session-panel-visible-v2';

export interface ChatActivityPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createChatActivityPreferences(storage: ChatActivityPreferenceStorage) {
  const listeners = new Set<() => void>();
  let snapshot = Object.freeze({
    showSessionPanel: storage.getItem(CHAT_ACTIVITY_PANEL_KEY) === '1',
  });
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setShowSessionPanel(showSessionPanel: boolean) {
      if (snapshot.showSessionPanel === showSessionPanel) return;
      snapshot = Object.freeze({ showSessionPanel });
      storage.setItem(CHAT_ACTIVITY_PANEL_KEY, showSessionPanel ? '1' : '0');
      listeners.forEach((listener) => listener());
    },
  });
}

const fallbackStorage: ChatActivityPreferenceStorage = {
  getItem: () => null,
  setItem: () => undefined,
};

export const chatActivityPreferences = createChatActivityPreferences(
  typeof window === 'undefined' ? fallbackStorage : window.localStorage,
);
