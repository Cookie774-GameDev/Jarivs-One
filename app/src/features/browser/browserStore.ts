import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BrowserAgentAction,
  BrowserConsoleEntry,
  BrowserControlMode,
  BrowserRuntimeInfo,
  BrowserTab,
} from './browserTypes';

function tabId() {
  return `tab-${Math.random().toString(36).slice(2, 10)}`;
}

function blankTab(url = 'about:blank'): BrowserTab {
  return {
    id: tabId(),
    url,
    title: url === 'about:blank' ? 'New Tab' : url,
    loading: false,
    pinned: false,
    muted: false,
    controlMode: 'ask_every_action',
  };
}

interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string;
  runtime: BrowserRuntimeInfo | null;
  frameDataUrl: string | null;
  consoleEntries: BrowserConsoleEntry[];
  agentActions: BrowserAgentAction[];
  agentArmed: boolean;
  sidebarOpen: boolean;
  consoleOpen: boolean;
  findQuery: string;
  zoom: number;
  draftUrl: string;
  setDraftUrl: (v: string) => void;
  setRuntime: (r: BrowserRuntimeInfo | null) => void;
  setFrame: (dataUrl: string | null) => void;
  setActiveTab: (id: string) => void;
  newTab: (url?: string) => string;
  closeTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<BrowserTab>) => void;
  restoreClosed: () => void;
  closedStack: BrowserTab[];
  pushConsole: (level: BrowserConsoleEntry['level'], text: string) => void;
  clearConsole: () => void;
  enqueueAgentAction: (action: Omit<BrowserAgentAction, 'id' | 'createdAt' | 'status'>) => string;
  resolveAgentAction: (id: string, status: BrowserAgentAction['status'], result?: string) => void;
  abortAgentActions: () => void;
  setAgentArmed: (v: boolean) => void;
  setControlMode: (tabId: string, mode: BrowserControlMode) => void;
  setSidebarOpen: (v: boolean) => void;
  setConsoleOpen: (v: boolean) => void;
  setFindQuery: (v: string) => void;
  setZoom: (z: number) => void;
  activeTab: () => BrowserTab | undefined;
}

const initial = blankTab();

export const useBrowserStore = create<BrowserState>()(
  persist(
    (set, get) => ({
      tabs: [initial],
      activeTabId: initial.id,
      runtime: null,
      frameDataUrl: null,
      consoleEntries: [],
      agentActions: [],
      agentArmed: false,
      sidebarOpen: true,
      consoleOpen: false,
      findQuery: '',
      zoom: 1,
      draftUrl: '',
      closedStack: [],
      setDraftUrl: (draftUrl) => set({ draftUrl }),
      setRuntime: (runtime) => set({ runtime }),
      setFrame: (frameDataUrl) => set({ frameDataUrl }),
      setActiveTab: (activeTabId) => {
        const tab = get().tabs.find((t) => t.id === activeTabId);
        set({ activeTabId, draftUrl: tab?.url ?? get().draftUrl });
      },
      newTab: (url) => {
        const tab = blankTab(url);
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, draftUrl: tab.url }));
        return tab.id;
      },
      closeTab: (id) =>
        set((s) => {
          const closing = s.tabs.find((t) => t.id === id);
          const tabs = s.tabs.filter((t) => t.id !== id);
          if (tabs.length === 0) {
            const t = blankTab();
            return {
              tabs: [t],
              activeTabId: t.id,
              draftUrl: t.url,
              closedStack: closing ? [closing, ...s.closedStack].slice(0, 10) : s.closedStack,
            };
          }
          const activeTabId = s.activeTabId === id ? tabs[tabs.length - 1]!.id : s.activeTabId;
          return {
            tabs,
            activeTabId,
            draftUrl: tabs.find((t) => t.id === activeTabId)?.url ?? '',
            closedStack: closing ? [closing, ...s.closedStack].slice(0, 10) : s.closedStack,
          };
        }),
      updateTab: (id, patch) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      restoreClosed: () => {
        const [first, ...rest] = get().closedStack;
        if (!first) return;
        const tab = { ...first, id: tabId() };
        set((s) => ({
          tabs: [...s.tabs, tab],
          activeTabId: tab.id,
          draftUrl: tab.url,
          closedStack: rest,
        }));
      },
      pushConsole: (level, text) =>
        set((s) => ({
          consoleEntries: [
            { id: tabId(), level, text: text.slice(0, 2000), ts: Date.now() },
            ...s.consoleEntries,
          ].slice(0, 200),
        })),
      clearConsole: () => set({ consoleEntries: [] }),
      enqueueAgentAction: (action) => {
        const id = tabId();
        const entry: BrowserAgentAction = {
          ...action,
          id,
          createdAt: Date.now(),
          status: 'pending',
        };
        set((s) => ({
          agentActions: [entry, ...s.agentActions].slice(0, 100),
          agentArmed: true,
        }));
        return id;
      },
      resolveAgentAction: (id, status, result) =>
        set((s) => ({
          agentActions: s.agentActions.map((a) =>
            a.id === id ? { ...a, status, result } : a,
          ),
        })),
      abortAgentActions: () =>
        set((s) => ({
          agentActions: s.agentActions.map((a) =>
            a.status === 'pending' || a.status === 'running' || a.status === 'approved'
              ? { ...a, status: 'aborted' }
              : a,
          ),
          agentArmed: false,
        })),
      setAgentArmed: (agentArmed) => set({ agentArmed }),
      setControlMode: (tabId, controlMode) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, controlMode } : t)),
        })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
      setFindQuery: (findQuery) => set({ findQuery }),
      setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.5, zoom)) }),
      activeTab: () => get().tabs.find((t) => t.id === get().activeTabId),
    }),
    {
      name: 'vibespace-browser:v1',
      partialize: (s) => ({
        tabs: s.tabs.map(({ id, url, title, pinned, muted, controlMode }) => ({
          id,
          url,
          title,
          pinned,
          muted,
          controlMode,
          loading: false,
        })),
        activeTabId: s.activeTabId,
        zoom: s.zoom,
        sidebarOpen: s.sidebarOpen,
      }),
    },
  ),
);
