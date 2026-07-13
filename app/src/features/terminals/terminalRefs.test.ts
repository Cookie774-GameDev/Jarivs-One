import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: { payload: unknown }) => void),
  unlisten: vi.fn(),
  emitTo: vi.fn(async () => undefined),
  getByLabel: vi.fn(),
  unminimize: vi.fn(async () => undefined),
  show: vi.fn(async () => undefined),
  setFocus: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: mocks.emitTo,
  listen: vi.fn(async (_event: string, listener: (event: { payload: unknown }) => void) => {
    mocks.listener = listener;
    return mocks.unlisten;
  }),
}));

vi.mock('@tauri-apps/api/window', () => ({
  Window: {
    getByLabel: mocks.getByLabel,
  },
}));

import {
  MAIN_TERMINAL_FOCUS_REQUEST_EVENT,
  installMainTerminalFocusBridge,
  requestMainTerminalFocus,
} from './terminalRefs';

describe('main terminal focus bridge', () => {
  beforeEach(() => {
    mocks.listener = null;
    mocks.unlisten.mockReset();
    mocks.emitTo.mockReset().mockResolvedValue(undefined);
    mocks.unminimize.mockReset().mockResolvedValue(undefined);
    mocks.show.mockReset().mockResolvedValue(undefined);
    mocks.setFocus.mockReset().mockResolvedValue(undefined);
    mocks.getByLabel.mockReset().mockResolvedValue({
      unminimize: mocks.unminimize,
      show: mocks.show,
      setFocus: mocks.setFocus,
    });
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    vi.restoreAllMocks();
  });

  it('shows and focuses main before emitting only the exact routing identifiers', async () => {
    await expect(
      requestMainTerminalFocus({
        sessionId: 'pty-live-1',
        paneId: 'pane-main-2',
        projectId: 'project-3',
        label: 'do not transmit labels',
        command: 'do not transmit commands',
      }),
    ).resolves.toBe(true);

    expect(mocks.getByLabel).toHaveBeenCalledWith('main');
    expect(mocks.unminimize).toHaveBeenCalledTimes(1);
    expect(mocks.show).toHaveBeenCalledTimes(1);
    expect(mocks.setFocus).toHaveBeenCalledTimes(1);
    expect(mocks.emitTo).toHaveBeenCalledWith(
      'main',
      MAIN_TERMINAL_FOCUS_REQUEST_EVENT,
      {
        sessionId: 'pty-live-1',
        paneId: 'pane-main-2',
        projectId: 'project-3',
      },
    );
  });

  it('navigates first, then targets the exact pane/session when Terminals is visible', async () => {
    const navigate = vi.fn();
    const focusEvents: Array<{ sessionId: string; paneId?: string }> = [];
    const onFocus = (event: Event) => {
      focusEvents.push(
        (event as CustomEvent<{ sessionId: string; paneId?: string }>).detail,
      );
    };
    window.addEventListener('jarvis:terminal:focus', onFocus);
    const cleanup = installMainTerminalFocusBridge({
      isTerminalRouteVisible: () => false,
      openTerminalRoute: navigate,
    });
    await vi.waitFor(() => expect(mocks.listener).toBeTypeOf('function'));

    mocks.listener?.({
      payload: {
        sessionId: 'pty-live-9',
        paneId: 'pane-main-8',
        projectId: 'project-7',
        command: 'must be ignored',
      },
    });

    expect(navigate).toHaveBeenCalledWith({
      sessionId: 'pty-live-9',
      paneId: 'pane-main-8',
      projectId: 'project-7',
    });
    expect(focusEvents).toEqual([]);

    window.dispatchEvent(new CustomEvent('jarvis:terminals:visible'));

    expect(focusEvents).toEqual([
      { sessionId: 'pty-live-9', paneId: 'pane-main-8' },
    ]);
    cleanup();
    window.removeEventListener('jarvis:terminal:focus', onFocus);
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed or control-bearing cross-window identifiers', async () => {
    const navigate = vi.fn();
    const cleanup = installMainTerminalFocusBridge({
      isTerminalRouteVisible: () => false,
      openTerminalRoute: navigate,
    });
    await vi.waitFor(() => expect(mocks.listener).toBeTypeOf('function'));

    mocks.listener?.({ payload: { sessionId: 'pty-live-1\nforged' } });
    mocks.listener?.({ payload: { paneId: 'pane-without-session' } });

    expect(navigate).not.toHaveBeenCalled();
    cleanup();
  });
});
