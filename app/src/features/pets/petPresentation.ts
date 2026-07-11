/**
 * Presentation ownership for chats and terminals between main shell and pet mini-panel.
 * Moving changes presentation only — never clones threads, never restarts PTYs,
 * never duplicates outbound AI requests.
 */

import {
  PET_PANEL_MAX_TERMINALS,
  PET_PANEL_TERMINAL_LIMIT_MESSAGE,
} from './petPanelLifecycle';

export type PresentationSurface = 'main' | 'pet-mini-panel';

export interface ChatPresentation {
  chatId: string;
  owner: PresentationSurface;
  /** Streaming continues regardless of owner or panel visibility. */
  streaming: boolean;
  /** Outbound request in flight — never start a second one for the same turn. */
  activeRequestId: string | null;
}

export interface TerminalPresentation {
  terminalId: string;
  /** xterm can only mount in one surface at a time. */
  owner: PresentationSurface;
  /** Real PTY id — never duplicated on move. */
  ptyId: string;
  title: string;
  cwd: string;
  shell: string;
  status: 'running' | 'exited' | 'error';
}

export interface PresentationState {
  chats: Record<string, ChatPresentation>;
  terminals: Record<string, TerminalPresentation>;
  /** Stable activity event ids already shown (dedupe). */
  activitySeenIds: string[];
  unreadActivity: number;
}

export function createEmptyPresentationState(): PresentationState {
  return {
    chats: {},
    terminals: {},
    activitySeenIds: [],
    unreadActivity: 0,
  };
}

export function registerChat(
  state: PresentationState,
  chat: ChatPresentation,
): PresentationState {
  return {
    ...state,
    chats: { ...state.chats, [chat.chatId]: chat },
  };
}

/**
 * Move chat presentation ownership. Same thread id, no clone, no new request.
 */
export function moveChatPresentation(
  state: PresentationState,
  chatId: string,
  to: PresentationSurface,
): { state: PresentationState; ok: true } | { state: PresentationState; ok: false; reason: string } {
  const chat = state.chats[chatId];
  if (!chat) return { state, ok: false, reason: 'unknown_chat' };
  if (chat.owner === to) return { state, ok: true };
  return {
    ok: true,
    state: {
      ...state,
      chats: {
        ...state.chats,
        [chatId]: { ...chat, owner: to },
      },
    },
  };
}

/**
 * Start an outbound request only if none is active for this chat.
 * Prevents duplicate outbound requests when panel and main both try to send.
 */
export function beginChatRequest(
  state: PresentationState,
  chatId: string,
  requestId: string,
): { state: PresentationState; ok: true } | { state: PresentationState; ok: false; reason: string } {
  const chat = state.chats[chatId];
  if (!chat) return { state, ok: false, reason: 'unknown_chat' };
  if (chat.activeRequestId && chat.activeRequestId !== requestId) {
    return { state, ok: false, reason: 'duplicate_request' };
  }
  return {
    ok: true,
    state: {
      ...state,
      chats: {
        ...state.chats,
        [chatId]: { ...chat, streaming: true, activeRequestId: requestId },
      },
    },
  };
}

export function endChatRequest(
  state: PresentationState,
  chatId: string,
  requestId: string,
): PresentationState {
  const chat = state.chats[chatId];
  if (!chat || chat.activeRequestId !== requestId) return state;
  return {
    ...state,
    chats: {
      ...state.chats,
      [chatId]: { ...chat, streaming: false, activeRequestId: null },
    },
  };
}

export function registerTerminal(
  state: PresentationState,
  term: TerminalPresentation,
): PresentationState {
  return {
    ...state,
    terminals: { ...state.terminals, [term.terminalId]: term },
  };
}

/**
 * Move terminal xterm presentation. PTY id must stay identical.
 * Enforces max 4 terminals on pet-mini-panel.
 */
export function moveTerminalPresentation(
  state: PresentationState,
  terminalId: string,
  to: PresentationSurface,
):
  | { state: PresentationState; ok: true; ptyId: string }
  | { state: PresentationState; ok: false; reason: string; message?: string } {
  const term = state.terminals[terminalId];
  if (!term) return { state, ok: false, reason: 'unknown_terminal' };
  if (term.owner === to) return { state, ok: true, ptyId: term.ptyId };

  if (to === 'pet-mini-panel') {
    const onPanel = Object.values(state.terminals).filter((t) => t.owner === 'pet-mini-panel');
    const already = onPanel.some((t) => t.terminalId === terminalId);
    if (!already && onPanel.length >= PET_PANEL_MAX_TERMINALS) {
      return {
        state,
        ok: false,
        reason: 'panel_terminal_limit',
        message: PET_PANEL_TERMINAL_LIMIT_MESSAGE,
      };
    }
  }

  return {
    ok: true,
    ptyId: term.ptyId,
    state: {
      ...state,
      terminals: {
        ...state.terminals,
        [terminalId]: { ...term, owner: to },
      },
    },
  };
}

/** Count terminals currently presented on the pet panel. */
export function petPanelTerminalCount(state: PresentationState): number {
  return Object.values(state.terminals).filter((t) => t.owner === 'pet-mini-panel').length;
}

export interface SafeActivityEvent {
  id: string;
  kind: 'chat' | 'terminal' | 'agent' | 'notification' | 'error';
  summary: string;
  /** Navigation target — never secrets. */
  target: { type: 'chat' | 'terminal' | 'agent' | 'notification' | 'error'; id: string };
  createdAt: number;
}

const SECRETISH =
  /(api[_-]?key\s*[:=]?\s*\S+|secret\s*[:=]?\s*\S+|password\s*[:=]?\s*\S+|authorization\s*[:=]?\s*\S+|bearer\s+[a-z0-9._-]+|sk-[a-z0-9]+|\btoken\b\s*[:=]?\s*\S*)/gi;

/**
 * Sanitize activity for pet panel: strip secrets, full commands, env dumps, bodies.
 */
export function sanitizeActivitySummary(raw: string): string {
  let s = raw.replace(SECRETISH, '[redacted]');
  // Second pass for residual key-like tokens
  s = s.replace(/\bsk-[a-z0-9]+\b/gi, '[redacted]');
  s = s.replace(/[A-Za-z]:\\[^\s]+/g, '[path]');
  s = s.replace(/\/(?:home|Users|var|tmp)\/[^\s]+/g, '[path]');
  if (s.length > 160) s = `${s.slice(0, 157)}...`;
  return s;
}

/**
 * Push activity with stable-id dedupe. Unread increments when panel not focused.
 */
export function pushActivity(
  state: PresentationState,
  event: SafeActivityEvent,
  opts: { panelFocused: boolean },
): PresentationState {
  if (state.activitySeenIds.includes(event.id)) return state;
  const summary = sanitizeActivitySummary(event.summary);
  if (SECRETISH.test(summary) && summary.includes('[redacted]') === false) {
    // Extra guard: drop if still looks like a secret
    return state;
  }
  const seen = [...state.activitySeenIds, event.id].slice(-500);
  return {
    ...state,
    activitySeenIds: seen,
    unreadActivity: opts.panelFocused ? state.unreadActivity : state.unreadActivity + 1,
  };
}

export function clearActivityUnread(state: PresentationState): PresentationState {
  return { ...state, unreadActivity: 0 };
}

/** Panel minimize/close must not end streaming or kill PTYs. */
export function assertSessionsSurvivePanelClose(state: PresentationState): {
  streamingChats: number;
  runningTerminals: number;
} {
  const streamingChats = Object.values(state.chats).filter((c) => c.streaming).length;
  const runningTerminals = Object.values(state.terminals).filter((t) => t.status === 'running').length;
  return { streamingChats, runningTerminals };
}
