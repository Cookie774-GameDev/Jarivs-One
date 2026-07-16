type TerminalLike = {
  rows?: number;
  buffer: {
    active: {
      viewportY: number;
      baseY: number;
    };
  };
  scrollToTop?: () => void;
  scrollToBottom?: () => void;
};

export function isTerminalViewportAtBottom(term: TerminalLike): boolean {
  const buffer = term.buffer.active;
  return buffer.viewportY >= buffer.baseY;
}

export function terminalUserHasScrolled(term: TerminalLike): boolean {
  return !isTerminalViewportAtBottom(term);
}

/**
 * True when the buffer has no scrollback — the entire live surface fits
 * in one screen. In that case `scrollToBottom()` pins a short shell prompt
 * (e.g. `PS C:\Users\viper>`) to the *bottom* of a tall pane, which looks
 * broken. Prefer top-aligning instead.
 */
export function shouldPinTerminalViewportToTop(term: TerminalLike): boolean {
  return term.buffer.active.baseY <= 0;
}

export function shouldAutoFollowTerminalOutput({
  term,
  userHasScrolled,
}: {
  term: TerminalLike;
  userHasScrolled: boolean;
}): boolean {
  return !userHasScrolled || isTerminalViewportAtBottom(term);
}

/**
 * Keep the live prompt consistent:
 * - short buffer / no scrollback → top of the pane
 * - long scrollback while following → bottom (cursor in view)
 * - user scrolled away → do nothing
 */
export function applyTerminalFollowScroll(
  term: TerminalLike,
  opts: { userHasScrolled: boolean },
): void {
  if (!shouldAutoFollowTerminalOutput({ term, userHasScrolled: opts.userHasScrolled })) {
    return;
  }
  if (shouldPinTerminalViewportToTop(term)) {
    term.scrollToTop?.();
    return;
  }
  term.scrollToBottom?.();
}
