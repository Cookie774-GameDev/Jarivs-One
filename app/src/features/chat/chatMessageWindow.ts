export const INITIAL_CHAT_MESSAGE_WINDOW = 400;
export const CHAT_MESSAGE_WINDOW_PAGE = 100;

export function windowChatMessages<T>(
  messages: readonly T[],
  mountedCount = INITIAL_CHAT_MESSAGE_WINDOW,
): readonly T[] {
  const count = Math.max(0, Math.min(messages.length, mountedCount));
  return messages.slice(messages.length - count);
}

export function nextChatMessageWindowCount(
  total: number,
  mountedCount: number,
  hasOlder = false,
): number {
  const next = Math.max(0, mountedCount) + CHAT_MESSAGE_WINDOW_PAGE;
  return hasOlder ? next : Math.min(total, next);
}

export function anchoredChatScrollTop(
  previousScrollHeight: number,
  previousScrollTop: number,
  nextScrollHeight: number,
): number {
  return Math.max(0, nextScrollHeight - previousScrollHeight + previousScrollTop);
}
