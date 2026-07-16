import { describe, expect, it, vi } from 'vitest';
import {
  applyTerminalFollowScroll,
  isTerminalViewportAtBottom,
  shouldAutoFollowTerminalOutput,
  shouldPinTerminalViewportToTop,
  terminalUserHasScrolled,
} from './terminalViewport';

function terminal(viewportY: number, baseY: number) {
  return {
    buffer: {
      active: {
        viewportY,
        baseY,
      },
    },
  };
}

describe('terminal viewport helpers', () => {
  it('detects when the xterm viewport is already at the live bottom', () => {
    expect(isTerminalViewportAtBottom(terminal(100, 100))).toBe(true);
    expect(isTerminalViewportAtBottom(terminal(101, 100))).toBe(true);
    expect(isTerminalViewportAtBottom(terminal(90, 100))).toBe(false);
  });

  it('tracks user scroll intent from the current xterm viewport', () => {
    expect(terminalUserHasScrolled(terminal(90, 100))).toBe(true);
    expect(terminalUserHasScrolled(terminal(100, 100))).toBe(false);
  });

  it('auto-follows output only while the user has not scrolled away or returned to bottom', () => {
    expect(shouldAutoFollowTerminalOutput({
      term: terminal(100, 100),
      userHasScrolled: false,
    })).toBe(true);
    expect(shouldAutoFollowTerminalOutput({
      term: terminal(90, 100),
      userHasScrolled: true,
    })).toBe(false);
    expect(shouldAutoFollowTerminalOutput({
      term: terminal(100, 100),
      userHasScrolled: true,
    })).toBe(true);
  });

  it('pins short (no-scrollback) terminals to the top of the pane', () => {
    expect(shouldPinTerminalViewportToTop(terminal(0, 0))).toBe(true);
    expect(shouldPinTerminalViewportToTop(terminal(5, 0))).toBe(true);
    expect(shouldPinTerminalViewportToTop(terminal(100, 40))).toBe(false);
  });

  it('scrolls to top for short buffers and bottom for long follow', () => {
    const short = {
      ...terminal(0, 0),
      scrollToTop: vi.fn(),
      scrollToBottom: vi.fn(),
    };
    applyTerminalFollowScroll(short, { getUserHasScrolled: () => false });
    expect(short.scrollToTop).toHaveBeenCalledTimes(1);
    expect(short.scrollToBottom).not.toHaveBeenCalled();

    const long = {
      ...terminal(100, 40),
      scrollToTop: vi.fn(),
      scrollToBottom: vi.fn(),
    };
    applyTerminalFollowScroll(long, { getUserHasScrolled: () => false });
    expect(long.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(long.scrollToTop).not.toHaveBeenCalled();

    const scrolledAway = {
      ...terminal(10, 40),
      scrollToTop: vi.fn(),
      scrollToBottom: vi.fn(),
    };
    applyTerminalFollowScroll(scrolledAway, { getUserHasScrolled: () => true });
    expect(scrolledAway.scrollToTop).not.toHaveBeenCalled();
    expect(scrolledAway.scrollToBottom).not.toHaveBeenCalled();
  });

  it('reads the latest user scroll intent after an asynchronous terminal write', () => {
    let userHasScrolled = false;
    const live = {
      ...terminal(39, 40),
      scrollToTop: vi.fn(),
      scrollToBottom: vi.fn(),
    };
    const getUserHasScrolled = () => userHasScrolled;

    // The write started while following output, then the user scrolled before
    // xterm invoked its completion callback.
    userHasScrolled = true;
    applyTerminalFollowScroll(live, { getUserHasScrolled });

    expect(live.scrollToTop).not.toHaveBeenCalled();
    expect(live.scrollToBottom).not.toHaveBeenCalled();
  });
});
