/**
 * Integration-style tests for chat/terminal ownership + panel lifecycle wiring.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { usePetPresentationStore } from './petPresentationStore';
import { PET_PANEL_MAX_TERMINALS, PET_PANEL_TERMINAL_LIMIT_MESSAGE } from './petPanelLifecycle';

describe('pet presentation store integration', () => {
  beforeEach(() => {
    usePetPresentationStore.setState({
      chats: {},
      terminals: {},
      panelActiveChatId: null,
      panelActiveTerminalId: null,
      activity: [],
      activitySeenIds: [],
      unreadActivity: 0,
      panelLifecycle: 'closed',
      lastLimitMessage: null,
    });
  });

  it('moves chat without changing id (presentation only)', () => {
    const s = usePetPresentationStore.getState();
    s.registerChat('chat_abc', 'main');
    const r = s.moveChat('chat_abc', 'pet-mini-panel');
    expect(r.ok).toBe(true);
    expect(usePetPresentationStore.getState().chats.chat_abc.chatId).toBe('chat_abc');
    expect(usePetPresentationStore.getState().isChatOnPet('chat_abc')).toBe(true);
    s.moveChat('chat_abc', 'main');
    expect(usePetPresentationStore.getState().isChatOnPet('chat_abc')).toBe(false);
  });

  it('blocks duplicate chat requests', () => {
    const s = usePetPresentationStore.getState();
    s.registerChat('c1', 'pet-mini-panel');
    expect(s.beginChatRequest('c1', 'req1').ok).toBe(true);
    expect(s.beginChatRequest('c1', 'req2').ok).toBe(false);
    s.endChatRequest('c1', 'req1');
    expect(s.beginChatRequest('c1', 'req3').ok).toBe(true);
  });

  it('moves terminal preserving pty id', () => {
    const s = usePetPresentationStore.getState();
    s.registerTerminal({
      terminalId: 'pty_1',
      ptyId: 'pty_1',
      owner: 'main',
      status: 'running',
    });
    const r = s.moveTerminal('pty_1', 'pet-mini-panel');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ptyId).toBe('pty_1');
    expect(usePetPresentationStore.getState().terminals.pty_1.ptyId).toBe('pty_1');
  });

  it('enforces four terminal limit with exact message', () => {
    const s = usePetPresentationStore.getState();
    for (let i = 0; i < PET_PANEL_MAX_TERMINALS; i++) {
      s.registerTerminal({
        terminalId: `t${i}`,
        ptyId: `t${i}`,
        owner: 'pet-mini-panel',
        status: 'running',
      });
    }
    s.registerTerminal({
      terminalId: 't_extra',
      ptyId: 't_extra',
      owner: 'main',
      status: 'running',
    });
    const fail = s.moveTerminal('t_extra', 'pet-mini-panel');
    expect(fail.ok).toBe(false);
    if (fail.ok) return;
    expect(fail.message).toBe(PET_PANEL_TERMINAL_LIMIT_MESSAGE);
    expect(usePetPresentationStore.getState().terminals.t_extra.owner).toBe('main');
  });

  it('activity dedupes and sanitizes', () => {
    const s = usePetPresentationStore.getState();
    s.pushActivity(
      {
        id: 'a1',
        kind: 'notification',
        summary: 'token sk-abc123 leaked',
        target: { type: 'notification', id: 'n1' },
        createdAt: 1,
      },
      false,
    );
    expect(usePetPresentationStore.getState().unreadActivity).toBe(1);
    s.pushActivity(
      {
        id: 'a1',
        kind: 'notification',
        summary: 'again',
        target: { type: 'notification', id: 'n1' },
        createdAt: 2,
      },
      false,
    );
    expect(usePetPresentationStore.getState().unreadActivity).toBe(1);
    const sum = usePetPresentationStore.getState().activity[0]?.summary ?? '';
    expect(sum).not.toMatch(/sk-abc/);
  });
});
