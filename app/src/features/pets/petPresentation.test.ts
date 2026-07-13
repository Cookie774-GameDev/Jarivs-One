import { describe, expect, it } from 'vitest';
import {
  assertSessionsSurvivePanelClose,
  beginChatRequest,
  createEmptyPresentationState,
  endChatRequest,
  moveChatPresentation,
  moveTerminalPresentation,
  petPanelTerminalCount,
  pushActivity,
  registerChat,
  registerTerminal,
  sanitizeActivitySummary,
} from './petPresentation';
import { PET_PANEL_MAX_TERMINALS, PET_PANEL_TERMINAL_LIMIT_MESSAGE } from './petPanelLifecycle';

describe('presentation ownership', () => {
  it('moves chat without cloning or changing id', () => {
    let s = createEmptyPresentationState();
    s = registerChat(s, {
      chatId: 'chat_1',
      owner: 'main',
      streaming: true,
      activeRequestId: 'req_a',
    });
    const moved = moveChatPresentation(s, 'chat_1', 'pet-mini-panel');
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.state.chats.chat_1.chatId).toBe('chat_1');
    expect(moved.state.chats.chat_1.owner).toBe('pet-mini-panel');
    expect(moved.state.chats.chat_1.streaming).toBe(true);
    expect(moved.state.chats.chat_1.activeRequestId).toBe('req_a');
  });

  it('blocks duplicate outbound chat requests', () => {
    let s = createEmptyPresentationState();
    s = registerChat(s, {
      chatId: 'chat_1',
      owner: 'pet-mini-panel',
      streaming: false,
      activeRequestId: null,
    });
    const a = beginChatRequest(s, 'chat_1', 'req_1');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = beginChatRequest(a.state, 'chat_1', 'req_2');
    expect(b.ok).toBe(false);
    if (b.ok) return;
    expect(b.reason).toBe('duplicate_request');
    s = endChatRequest(a.state, 'chat_1', 'req_1');
    expect(s.chats.chat_1.streaming).toBe(false);
  });

  it('moves terminal preserving same pty id', () => {
    let s = createEmptyPresentationState();
    s = registerTerminal(s, {
      terminalId: 't1',
      owner: 'main',
      ptyId: 'pty_live_1',
      title: 'pwsh',
      cwd: 'C:\\tmp',
      shell: 'pwsh',
      status: 'running',
    });
    const moved = moveTerminalPresentation(s, 't1', 'pet-mini-panel');
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.ptyId).toBe('pty_live_1');
    expect(moved.state.terminals.t1.ptyId).toBe('pty_live_1');
    expect(moved.state.terminals.t1.owner).toBe('pet-mini-panel');
    expect(moved.state.terminals.t1).toMatchObject({
      title: 'pwsh',
      cwd: 'C:\\tmp',
      shell: 'pwsh',
      status: 'running',
    });
  });

  it('enforces four-terminal panel limit with exact message', () => {
    let s = createEmptyPresentationState();
    for (let i = 0; i < PET_PANEL_MAX_TERMINALS; i++) {
      s = registerTerminal(s, {
        terminalId: `t${i}`,
        owner: 'pet-mini-panel',
        ptyId: `pty${i}`,
        title: `t${i}`,
        cwd: '/',
        shell: 'pwsh',
        status: 'running',
      });
    }
    s = registerTerminal(s, {
      terminalId: 't_extra',
      owner: 'main',
      ptyId: 'pty_extra',
      title: 'extra',
      cwd: '/',
      shell: 'pwsh',
      status: 'running',
    });
    expect(petPanelTerminalCount(s)).toBe(4);
    const fail = moveTerminalPresentation(s, 't_extra', 'pet-mini-panel');
    expect(fail.ok).toBe(false);
    if (fail.ok) return;
    expect(fail.message).toBe(PET_PANEL_TERMINAL_LIMIT_MESSAGE);
    // Fifth remains on main
    expect(fail.state).toBe(s);
    expect(fail.state.terminals.t_extra.owner).toBe('main');
    expect(petPanelTerminalCount(fail.state)).toBe(PET_PANEL_MAX_TERMINALS);
  });

  it('streaming and running terminals survive panel close snapshot', () => {
    let s = createEmptyPresentationState();
    s = registerChat(s, {
      chatId: 'c1',
      owner: 'pet-mini-panel',
      streaming: true,
      activeRequestId: 'r1',
    });
    s = registerTerminal(s, {
      terminalId: 't1',
      owner: 'pet-mini-panel',
      ptyId: 'p1',
      title: 't',
      cwd: '/',
      shell: 'pwsh',
      status: 'running',
    });
    const snap = assertSessionsSurvivePanelClose(s);
    expect(snap.streamingChats).toBe(1);
    expect(snap.runningTerminals).toBe(1);
  });

  it('sanitizes secrets and paths from activity summaries', () => {
    const s = sanitizeActivitySummary('token sk-abc123 and C:\\Users\\viper\\secret.env');
    expect(s).not.toMatch(/sk-abc/);
    expect(s).toContain('[redacted]');
    expect(s).toContain('[path]');
  });

  it('dedupes activity by stable id and tracks unread', () => {
    let s = createEmptyPresentationState();
    const ev = {
      id: 'act_1',
      kind: 'chat' as const,
      summary: 'ok',
      target: { type: 'chat' as const, id: 'c1' },
      createdAt: 1,
    };
    s = pushActivity(s, ev, { panelFocused: false });
    expect(s.unreadActivity).toBe(1);
    s = pushActivity(s, ev, { panelFocused: false });
    expect(s.unreadActivity).toBe(1);
    expect(s.activitySeenIds).toEqual(['act_1']);
  });
});
