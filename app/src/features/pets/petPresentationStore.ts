/**
 * Cross-window presentation ownership for chats and terminals.
 * Persisted to localStorage so main + pet-mini-panel share the same owners.
 * Moving ownership never clones threads or PTYs.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';
import {
  PET_PANEL_MAX_TERMINALS,
  PET_PANEL_TERMINAL_LIMIT_MESSAGE,
  type PetPanelLifecycleState,
} from './petPanelLifecycle';
import {
  sanitizeActivitySummary,
  type PresentationSurface,
  type SafeActivityEvent,
} from './petPresentation';

export interface OwnedChat {
  chatId: string;
  owner: PresentationSurface;
  activeRequestId: string | null;
}

export interface OwnedTerminal {
  terminalId: string;
  ptyId: string;
  owner: PresentationSurface;
  title?: string;
  cwd?: string;
  shell?: string;
  paneId?: string;
  projectId?: string | null;
  status: 'running' | 'exited' | 'error';
}

interface PetPresentationStore {
  chats: Record<string, OwnedChat>;
  terminals: Record<string, OwnedTerminal>;
  /** Focused chat inside the pet panel. */
  panelActiveChatId: string | null;
  /** Focused terminal inside the pet panel. */
  panelActiveTerminalId: string | null;
  activity: SafeActivityEvent[];
  activitySeenIds: string[];
  unreadActivity: number;
  panelLifecycle: PetPanelLifecycleState;
  lastLimitMessage: string | null;

  setPanelLifecycle: (s: PetPanelLifecycleState) => void;
  setPanelActiveChatId: (id: string | null) => void;
  setPanelActiveTerminalId: (id: string | null) => void;

  registerChat: (chatId: string, owner?: PresentationSurface) => void;
  moveChat: (chatId: string, to: PresentationSurface) => { ok: true } | { ok: false; reason: string };
  beginChatRequest: (
    chatId: string,
    requestId: string,
  ) => { ok: true } | { ok: false; reason: string };
  endChatRequest: (chatId: string, requestId: string) => void;

  registerTerminal: (term: OwnedTerminal) => void;
  moveTerminal: (
    terminalId: string,
    to: PresentationSurface,
  ) => { ok: true; ptyId: string } | { ok: false; reason: string; message?: string };
  setTerminalStatus: (terminalId: string, status: OwnedTerminal['status']) => void;

  pushActivity: (event: SafeActivityEvent, panelFocused: boolean) => void;
  clearUnread: () => void;
  clearLimitMessage: () => void;

  chatOwner: (chatId: string | null | undefined) => PresentationSurface;
  terminalOwner: (terminalId: string | null | undefined) => PresentationSurface;
  petTerminalCount: () => number;
  isChatOnPet: (chatId: string | null | undefined) => boolean;
  isTerminalOnPet: (terminalId: string | null | undefined) => boolean;
}

export const usePetPresentationStore = create<PetPresentationStore>()(
  persist(
    (set, get) => ({
      chats: {},
      terminals: {},
      panelActiveChatId: null,
      panelActiveTerminalId: null,
      activity: [],
      activitySeenIds: [],
      unreadActivity: 0,
      panelLifecycle: 'closed',
      lastLimitMessage: null,

      setPanelLifecycle: (s) => set({ panelLifecycle: s }),
      setPanelActiveChatId: (id) => set({ panelActiveChatId: id }),
      setPanelActiveTerminalId: (id) => set({ panelActiveTerminalId: id }),

      registerChat: (chatId, owner = 'main') =>
        set((s) => ({
          chats: {
            ...s.chats,
            [chatId]: s.chats[chatId] ?? {
              chatId,
              owner,
              activeRequestId: null,
            },
          },
        })),

      moveChat: (chatId, to) => {
        const s = get();
        const chat = s.chats[chatId] ?? {
          chatId,
          owner: 'main' as PresentationSurface,
          activeRequestId: null,
        };
        set({
          chats: { ...s.chats, [chatId]: { ...chat, owner: to } },
          panelActiveChatId: to === 'pet-mini-panel' ? chatId : s.panelActiveChatId === chatId ? null : s.panelActiveChatId,
        });
        return { ok: true as const };
      },

      beginChatRequest: (chatId, requestId) => {
        const s = get();
        const chat = s.chats[chatId] ?? {
          chatId,
          owner: 'main' as PresentationSurface,
          activeRequestId: null,
        };
        if (chat.activeRequestId && chat.activeRequestId !== requestId) {
          return { ok: false as const, reason: 'duplicate_request' };
        }
        set({
          chats: {
            ...s.chats,
            [chatId]: { ...chat, activeRequestId: requestId },
          },
        });
        return { ok: true as const };
      },

      endChatRequest: (chatId, requestId) => {
        const chat = get().chats[chatId];
        if (!chat || chat.activeRequestId !== requestId) return;
        set((s) => ({
          chats: {
            ...s.chats,
            [chatId]: { ...chat, activeRequestId: null },
          },
        }));
      },

      registerTerminal: (term) =>
        set((s) => ({
          terminals: { ...s.terminals, [term.terminalId]: term },
        })),

      moveTerminal: (terminalId, to) => {
        const s = get();
        const term = s.terminals[terminalId];
        if (!term) return { ok: false as const, reason: 'unknown_terminal' };
        if (term.owner === to) return { ok: true as const, ptyId: term.ptyId };

        if (to === 'pet-mini-panel') {
          const count = Object.values(s.terminals).filter((t) => t.owner === 'pet-mini-panel').length;
          if (count >= PET_PANEL_MAX_TERMINALS) {
            set({ lastLimitMessage: PET_PANEL_TERMINAL_LIMIT_MESSAGE });
            return {
              ok: false as const,
              reason: 'panel_terminal_limit',
              message: PET_PANEL_TERMINAL_LIMIT_MESSAGE,
            };
          }
        }

        set({
          terminals: {
            ...s.terminals,
            [terminalId]: { ...term, owner: to },
          },
          panelActiveTerminalId:
            to === 'pet-mini-panel'
              ? terminalId
              : s.panelActiveTerminalId === terminalId
                ? null
                : s.panelActiveTerminalId,
          lastLimitMessage: null,
        });
        return { ok: true as const, ptyId: term.ptyId };
      },

      setTerminalStatus: (terminalId, status) => {
        const term = get().terminals[terminalId];
        if (!term) return;
        set((s) => ({
          terminals: { ...s.terminals, [terminalId]: { ...term, status } },
        }));
      },

      pushActivity: (event, panelFocused) => {
        const s = get();
        if (s.activitySeenIds.includes(event.id)) return;
        const clean: SafeActivityEvent = {
          ...event,
          summary: sanitizeActivitySummary(event.summary),
        };
        set({
          activity: [...s.activity, clean].slice(-200),
          activitySeenIds: [...s.activitySeenIds, event.id].slice(-500),
          unreadActivity: panelFocused ? s.unreadActivity : s.unreadActivity + 1,
        });
      },

      clearUnread: () => set({ unreadActivity: 0 }),
      clearLimitMessage: () => set({ lastLimitMessage: null }),

      chatOwner: (chatId) => {
        if (!chatId) return 'main';
        return get().chats[chatId]?.owner ?? 'main';
      },
      terminalOwner: (terminalId) => {
        if (!terminalId) return 'main';
        return get().terminals[terminalId]?.owner ?? 'main';
      },
      petTerminalCount: () =>
        Object.values(get().terminals).filter((t) => t.owner === 'pet-mini-panel').length,
      isChatOnPet: (chatId) => get().chatOwner(chatId) === 'pet-mini-panel',
      isTerminalOnPet: (terminalId) => get().terminalOwner(terminalId) === 'pet-mini-panel',
    }),
    {
      name: 'vibespace-pet-presentation',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({
        chats: s.chats,
        terminals: s.terminals,
        panelActiveChatId: s.panelActiveChatId,
        panelActiveTerminalId: s.panelActiveTerminalId,
        activity: s.activity.slice(-100),
        activitySeenIds: s.activitySeenIds.slice(-300),
        unreadActivity: s.unreadActivity,
        panelLifecycle: s.panelLifecycle,
      }),
    },
  ),
);

/** Rehydrate when another webview writes the same key (cross-window sync). */
export function installPetPresentationStorageSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== 'vibespace-pet-presentation' && e.key !== 'vibespace-pet-settings') return;
    if (e.key === 'vibespace-pet-presentation') {
      void usePetPresentationStore.persist.rehydrate();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
