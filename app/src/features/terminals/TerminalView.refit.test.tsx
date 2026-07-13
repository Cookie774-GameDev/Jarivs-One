import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalView } from './TerminalView';
import { useTerminalTranscriptStore } from './transcriptStore';
import { markTerminalPaneRuntime } from './terminalExecutionStore';

interface FakeTerminalHandle {
  buffer: {
    active: {
      viewportY: number;
      baseY: number;
    };
  };
}

const mocks = vi.hoisted(() => ({
  fit: vi.fn(),
  refresh: vi.fn(),
  scrollToBottom: vi.fn(),
  scrollToTop: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  terminal: null as FakeTerminalHandle | null,
  onScroll: null as (() => void) | null,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mocks.listen,
}));

vi.mock('xterm', () => ({
  Terminal: class {
    rows = 24;
    cols = 80;
    options: Record<string, unknown>;
    textarea: HTMLTextAreaElement | undefined;
    buffer = {
      active: {
        viewportY: 0,
        baseY: 0,
        length: 0,
        getLine: () => undefined,
      },
    };

    constructor(options: Record<string, unknown>) {
      this.options = { ...options };
      mocks.terminal = this;
    }

    loadAddon() {}
    open() {}
    dispose() {}
    reset() {}
    clear() {}
    write(_data: string, callback?: () => void) {
      callback?.();
    }
    refresh(start: number, end: number) {
      mocks.refresh(start, end);
    }
    scrollToBottom() {
      mocks.scrollToBottom();
    }
    scrollToTop() {
      mocks.scrollToTop();
    }
    onData() {
      return { dispose: vi.fn() };
    }
    onScroll(callback: () => void) {
      mocks.onScroll = callback;
      return { dispose: vi.fn() };
    }
  },
}));

vi.mock('xterm-addon-fit', () => ({
  FitAddon: class {
    fit() {
      mocks.fit();
    }
  },
}));

vi.mock('xterm-addon-web-links', () => ({
  WebLinksAddon: class {},
}));

vi.mock('xterm-addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss() {}
    dispose() {}
  },
}));

describe('TerminalView stable refit integration', () => {
  let geometry = { width: 0, height: 0 };
  let rafQueue = new Map<number, FrameRequestCallback>();
  let nextRafId = 1;
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
  let originalClientWidth: PropertyDescriptor | undefined;
  let originalClientHeight: PropertyDescriptor | undefined;
  let originalFonts: PropertyDescriptor | undefined;

  beforeEach(() => {
    geometry = { width: 0, height: 0 };
    rafQueue = new Map();
    nextRafId = 1;
    mocks.fit.mockReset();
    mocks.refresh.mockReset();
    mocks.scrollToBottom.mockReset();
    mocks.scrollToTop.mockReset();
    mocks.listen.mockClear();
    mocks.terminal = null;
    mocks.onScroll = null;
    useTerminalTranscriptStore.getState().reset();
    mocks.invoke.mockReset();
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'terminal_list') {
        return [
          {
            sessionId: 'pty-live',
            command: 'powershell',
            cwd: '',
            rows: 24,
            cols: 80,
            startedAt: 1,
            projectId: null,
          },
        ];
      }
      return undefined;
    });

    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const id = nextRafId++;
      rafQueue.set(id, callback);
      return id;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      rafQueue.delete(id);
    }) as typeof window.cancelAnimationFrame;

    originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => geometry.width,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => geometry.height,
    });

    originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });

    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    }
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
    }
    if (originalFonts) {
      Object.defineProperty(document, 'fonts', originalFonts);
    } else {
      Reflect.deleteProperty(document, 'fonts');
    }
    vi.unstubAllGlobals();
    useTerminalTranscriptStore.getState().reset();
    vi.restoreAllMocks();
  });

  async function renderAttachedTerminal() {
    const onReady = vi.fn();
    const result = render(<TerminalView sessionId="pty-live" onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledWith('pty-live'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return result;
  }

  async function flushOneFrame() {
    const pending = [...rafQueue.values()];
    rafQueue.clear();
    await act(async () => {
      pending.forEach((callback) => callback(performance.now()));
      await Promise.resolve();
    });
  }

  it('never fits a hidden zero-sized terminal during attach', async () => {
    const result = await renderAttachedTerminal();

    expect(mocks.fit).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalledWith('terminal_spawn', expect.anything());
    expect(result.container.firstElementChild?.getAttribute('data-session-id')).toBe('pty-live');
  });

  it('rearms an ended presentation slot when a new approved Fleet execution arrives', async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'terminal_list') {
        return [
          {
            sessionId: 'pty-live',
            command: 'powershell',
            cwd: '',
            rows: 24,
            cols: 80,
            startedAt: 1,
            projectId: null,
          },
        ];
      }
      if (command === 'terminal_spawn') {
        return { sessionId: 'pty-fleet', cwd: 'C:\\work' };
      }
      return undefined;
    });
    const onReady = vi.fn();
    const result = render(
      <TerminalView
        sessionId="pty-live"
        paneId="pane-ended"
        command="powershell"
        executionId="previous-execution"
        onReady={onReady}
      />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalledWith('pty-live'));
    markTerminalPaneRuntime('pane-ended', 'idle');
    mocks.invoke.mockClear();
    onReady.mockClear();

    result.rerender(
      <TerminalView
        sessionId="pty-live"
        paneId="pane-ended"
        command="powershell"
        startupCommand="codex"
        executionId="fleet-request:1"
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledWith('pty-fleet'));
    expect(mocks.invoke).toHaveBeenCalledWith(
      'terminal_spawn',
      expect.objectContaining({ command: 'powershell', cwd: undefined }),
    );
    expect(mocks.invoke).toHaveBeenCalledWith('terminal_write', {
      sessionId: 'pty-fleet',
      data: 'codex\r',
    });
    expect(mocks.invoke).not.toHaveBeenCalledWith('terminal_kill', expect.anything());
  });

  it('waits for stable visible geometry, redraws, and resizes the existing PTY once', async () => {
    await renderAttachedTerminal();
    mocks.fit.mockClear();
    mocks.refresh.mockClear();
    mocks.invoke.mockClear();

    geometry = { width: 640, height: 360 };
    window.dispatchEvent(new Event('jarvis:terminals:visible'));

    await flushOneFrame();
    expect(mocks.fit).not.toHaveBeenCalled();
    await flushOneFrame();

    expect(mocks.fit).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledWith(0, 23);
    expect(mocks.invoke).toHaveBeenCalledWith('terminal_resize', {
      sessionId: 'pty-live',
      rows: 24,
      cols: 80,
    });
    expect(mocks.invoke).not.toHaveBeenCalledWith('terminal_spawn', expect.anything());
  });

  it('preserves a user-scrolled viewport during a visibility refit', async () => {
    await renderAttachedTerminal();
    const terminal = mocks.terminal;
    expect(terminal).not.toBeNull();
    terminal!.buffer.active.baseY = 30;
    terminal!.buffer.active.viewportY = 10;
    mocks.onScroll?.();
    mocks.scrollToBottom.mockClear();
    mocks.scrollToTop.mockClear();

    geometry = { width: 700, height: 420 };
    window.dispatchEvent(new Event('jarvis:terminals:visible'));
    await flushOneFrame();
    await flushOneFrame();

    expect(mocks.scrollToTop).not.toHaveBeenCalled();
    expect(mocks.scrollToBottom).not.toHaveBeenCalled();
  });

  it('keeps an output-following terminal at its live position after refit', async () => {
    await renderAttachedTerminal();
    const terminal = mocks.terminal;
    expect(terminal).not.toBeNull();
    terminal!.buffer.active.baseY = 30;
    terminal!.buffer.active.viewportY = 30;
    mocks.onScroll?.();
    mocks.scrollToBottom.mockClear();
    mocks.scrollToTop.mockClear();

    geometry = { width: 720, height: 440 };
    window.dispatchEvent(new Event('jarvis:terminals:visible'));
    await flushOneFrame();
    await flushOneFrame();

    expect(mocks.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(mocks.scrollToTop).not.toHaveBeenCalled();
  });

  it('survives 50 hidden-visible scaling cycles without respawn, transcript mutation, or leaked work', async () => {
    const addListener = vi.spyOn(window, 'addEventListener');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const result = await renderAttachedTerminal();
    const transcriptBefore = structuredClone(
      useTerminalTranscriptStore.getState().sessions['pty-live'],
    );
    mocks.fit.mockClear();
    mocks.refresh.mockClear();
    mocks.invoke.mockClear();

    for (let cycle = 0; cycle < 50; cycle += 1) {
      geometry = { width: 0, height: 0 };
      window.dispatchEvent(new Event('jarvis:terminals:visible'));
      await flushOneFrame();
      expect(mocks.fit).toHaveBeenCalledTimes(cycle);

      geometry = { width: 600 + cycle, height: 320 + cycle };
      const visibilityEvent = new Event('visibilitychange');
      document.dispatchEvent(visibilityEvent);
      await flushOneFrame();
      await flushOneFrame();
      expect(rafQueue.size).toBe(0);
    }

    expect(mocks.fit).toHaveBeenCalledTimes(50);
    expect(mocks.refresh).toHaveBeenCalledTimes(50);
    expect(
      mocks.invoke.mock.calls.filter(([command]) => command === 'terminal_resize'),
    ).toHaveLength(1);
    expect(mocks.invoke).not.toHaveBeenCalledWith('terminal_spawn', expect.anything());
    expect(useTerminalTranscriptStore.getState().sessions['pty-live']).toEqual(transcriptBefore);
    expect(
      addListener.mock.calls.filter(([event]) => event === 'jarvis:terminals:visible'),
    ).toHaveLength(1);

    result.unmount();
    expect(
      removeListener.mock.calls.filter(([event]) => event === 'jarvis:terminals:visible'),
    ).toHaveLength(1);
    expect(rafQueue.size).toBe(0);
  });
});
