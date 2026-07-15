import { loadLearningFile, saveLearningFile } from './learningFile';
import { useJarvisLearningStore } from './learningStore';
import type { JarvisMemoryCategory } from './types';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';

interface LearningSendDetail {
  chatId?: string;
  text?: string;
  messageId?: string;
}

interface LearningListenerBindings {
  getAccountId: () => string;
  subscribeAccount?: (listener: () => void) => () => void;
  save?: (accountId: string, markdown: string) => Promise<unknown>;
  load?: (accountId: string) => Promise<string | null>;
  debounceMs?: number;
  onError?: (error: unknown) => void;
}

function inferredCandidate(text: string): { value: string; category: JarvisMemoryCategory } | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const match = /\bI\s+(?:really\s+)?(?:prefer|like|want)\s+(.+)/i.exec(normalized)
    ?? /\bplease\s+(always|never)\s+(.+)/i.exec(normalized);
  if (!match) return null;
  const value = match[2]
    ? `Please ${match[1]!.toLowerCase()} ${match[2]}`
    : match[1]!;
  const clean = value.trim().slice(0, 500);
  const category: JarvisMemoryCategory = /\b(?:response|reply|concise|verbose|emoji|tone|format|status update)\b/i.test(clean)
    ? 'response-style'
    : /\b(?:never|avoid|do not|don't)\b/i.test(clean)
      ? 'avoid'
      : /\b(?:tool|plugin|mcp|terminal|cli)\b/i.test(clean)
        ? 'tool'
        : /\b(?:project|repo|workspace|codebase)\b/i.test(clean)
          ? 'project'
          : 'workflow';
  return { value: clean, category };
}

function defaultAccountLoad(accountId: string): Promise<string | null> {
  return loadLearningFile(accountId).then((result) => result.markdown).catch(() => null);
}

function report(bindings: LearningListenerBindings, error: unknown): void {
  if (bindings.onError) bindings.onError(error);
  else console.warn('[jarvis-memory] persistence unavailable', error);
}

function publishStatus(chatId: string | undefined, state: 'updating' | 'updated' | 'error'): void {
  window.dispatchEvent(new CustomEvent('jarvis:memory-status', { detail: { chatId, state } }));
}

export function startJarvisLearningListener(
  bindings: LearningListenerBindings,
  eventName = 'jarvis:send',
): () => void {
  safeLocalStorage.removeItem('jarvis-learning-memory-v1');
  const store = useJarvisLearningStore;
  const recentByAccount = new Map<string, Array<{ text: string; chatId?: string }>>();
  const save = bindings.save ?? ((accountId, markdown) => saveLearningFile(accountId, markdown));
  const load = bindings.load ?? defaultAccountLoad;
  const debounceMs = bindings.debounceMs ?? 300;
  const accountLoads = new Map<string, Promise<void>>();
  const loadingAccounts = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let disposed = false;

  const loadAccount = (accountId: string) => {
    loadingAccounts.add(accountId);
    store.getState().setAccount(accountId);
    const pending = load(accountId).then((markdown) => {
      if (disposed || (bindings.getAccountId().trim() || 'local-unassigned') !== accountId) return;
      store.getState().setAccount(accountId);
      if (markdown) store.getState().importMarkdown(markdown);
    }).catch((error) => report(bindings, error)).finally(() => {
      loadingAccounts.delete(accountId);
    });
    accountLoads.set(accountId, pending);
    return pending;
  };

  const accountId = bindings.getAccountId().trim() || 'local-unassigned';
  loadAccount(accountId);

  const persistProfile = (active: string, markdown: string) => {
    const existing = timers.get(active);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      timers.delete(active);
      void save(active, markdown).catch((error) => {
        publishStatus(undefined, 'error');
        report(bindings, error);
      });
    }, debounceMs);
    timers.set(active, timer);
  };

  const persistProfileNow = (active: string, markdown: string, chatId?: string) => {
    const existing = timers.get(active);
    if (existing) {
      clearTimeout(existing);
      timers.delete(active);
    }
    void save(active, markdown).then(() => {
      publishStatus(chatId, 'updated');
    }).catch((error) => {
      publishStatus(chatId, 'error');
      report(bindings, error);
    });
  };

  const unsubscribe = store.subscribe((state, previous) => {
    const active = state.activeAccountId;
    if (!loadingAccounts.has(active) && state.profiles[active] !== previous.profiles[active]) {
      persistProfile(active, store.getState().exportMarkdown());
    }
  });

  const unsubscribeAccount = bindings.subscribeAccount?.(() => {
    const next = bindings.getAccountId().trim() || 'local-unassigned';
    if (next !== store.getState().activeAccountId) loadAccount(next);
  });

  const onSend = (event: Event) => {
    const detail = (event as CustomEvent<LearningSendDetail>).detail;
    if (typeof detail?.text !== 'string') return;
    const messageText = detail.text;
    const chatId = detail.chatId;
    const messageId = detail.messageId;
    const currentAccount = bindings.getAccountId().trim() || 'local-unassigned';
    const pendingLoad = accountLoads.get(currentAccount) ?? loadAccount(currentAccount);
    void (async () => {
      await pendingLoad;
      if (disposed || (bindings.getAccountId().trim() || 'local-unassigned') !== currentAccount) return;
      store.getState().setAccount(currentAccount);
      const result = store.getState().recordUserMessage({
        text: messageText,
        chatId,
        messageId,
      });
      if (result.explicitMemoryId) {
        publishStatus(chatId, 'updating');
        persistProfileNow(currentAccount, store.getState().exportMarkdown(), chatId);
      }
      if (!result.qualifies) return;

      const recent = [...(recentByAccount.get(currentAccount) ?? []), {
        text: messageText,
        chatId,
      }].slice(-10);
      recentByAccount.set(currentAccount, recent);
      if (!result.evaluateNow) return;

      publishStatus(chatId, 'updating');
      const seen = new Set<string>();
      for (const message of recent) {
        const candidate = inferredCandidate(message.text);
        if (!candidate) continue;
        const key = `${candidate.category}:${candidate.value.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        store.getState().remember({
          ...candidate,
          confidence: 0.7,
          source: { kind: 'inferred', chatId: message.chatId },
        });
      }
      store.getState().markEvaluated();
      recentByAccount.set(currentAccount, []);
      persistProfileNow(currentAccount, store.getState().exportMarkdown(), chatId);
    })().catch((error) => report(bindings, error));
  };

  window.addEventListener(eventName, onSend);
  return () => {
    disposed = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    unsubscribe();
    unsubscribeAccount?.();
    window.removeEventListener(eventName, onSend);
  };
}

export function emojisEnabledFromLearning(): boolean {
  const items = useJarvisLearningStore.getState().currentProfile().items;
  const preference = items.find((item) => /\bemoji(?:s)?\b/i.test(item.value));
  if (!preference) return true;
  return !/\b(?:no|without|never|avoid|don't|do not|off)\b/i.test(preference.value);
}
