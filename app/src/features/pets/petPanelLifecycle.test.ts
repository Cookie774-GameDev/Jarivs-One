import { describe, expect, it } from 'vitest';
import {
  PET_PANEL_CLOSE_CONFIRM_BUTTONS,
  PET_PANEL_CLOSE_CONFIRM_MESSAGE,
  createInitialPanelLifecycle,
  panelIsVisible,
  panelPreservesSessions,
  reducePanelLifecycle,
} from './petPanelLifecycle';

describe('pet panel lifecycle', () => {
  it('starts closed and opens via request_open → opened', () => {
    let s = createInitialPanelLifecycle();
    expect(s).toBe('closed');
    s = reducePanelLifecycle(s, { type: 'request_open' });
    expect(s).toBe('opening');
    s = reducePanelLifecycle(s, { type: 'opened' });
    expect(s).toBe('open');
    expect(panelIsVisible(s)).toBe(true);
  });

  it('minimize / restore cycle', () => {
    let s = reducePanelLifecycle(createInitialPanelLifecycle(), { type: 'request_open' });
    s = reducePanelLifecycle(s, { type: 'opened' });
    s = reducePanelLifecycle(s, { type: 'request_minimize' });
    expect(s).toBe('minimizing');
    s = reducePanelLifecycle(s, { type: 'minimized' });
    expect(s).toBe('minimized');
    expect(panelIsVisible(s)).toBe(false);
    s = reducePanelLifecycle(s, { type: 'request_restore' });
    expect(s).toBe('restoring');
    s = reducePanelLifecycle(s, { type: 'restored' });
    expect(s).toBe('open');
  });

  it('close requires confirmation with approved copy', () => {
    expect(PET_PANEL_CLOSE_CONFIRM_MESSAGE).toContain('chats and terminal sessions will keep running');
    expect(PET_PANEL_CLOSE_CONFIRM_BUTTONS.cancel).toBe('Cancel');
    expect(PET_PANEL_CLOSE_CONFIRM_BUTTONS.confirm).toBe('Close Mini Panel');

    let s = reducePanelLifecycle(createInitialPanelLifecycle(), { type: 'request_open' });
    s = reducePanelLifecycle(s, { type: 'opened' });
    s = reducePanelLifecycle(s, { type: 'request_close' });
    expect(s).toBe('confirmingClose');
    s = reducePanelLifecycle(s, { type: 'cancel_close' });
    expect(s).toBe('open');
    s = reducePanelLifecycle(s, { type: 'request_close' });
    s = reducePanelLifecycle(s, { type: 'confirm_close' });
    expect(s).toBe('closing');
    s = reducePanelLifecycle(s, { type: 'closed' });
    expect(s).toBe('closed');
  });

  it('preserves sessions for all non-disposed states', () => {
    const states = [
      'closed',
      'opening',
      'open',
      'minimizing',
      'minimized',
      'confirmingClose',
      'closing',
      'restoring',
    ] as const;
    for (const st of states) {
      expect(panelPreservesSessions(st)).toBe(true);
    }
  });

  it('reopen from minimized focuses existing panel path', () => {
    let s = reducePanelLifecycle(createInitialPanelLifecycle(), { type: 'request_open' });
    s = reducePanelLifecycle(s, { type: 'opened' });
    s = reducePanelLifecycle(s, { type: 'request_minimize' });
    s = reducePanelLifecycle(s, { type: 'minimized' });
    s = reducePanelLifecycle(s, { type: 'request_open' });
    expect(s).toBe('restoring');
  });
});
