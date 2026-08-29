import type { ChatModelSelection } from '@/lib/ai/modelSelection';

export type ExactChatSelection = Extract<ChatModelSelection, { mode: 'single' }>;

/**
 * A chat-scoped exact connection remains authoritative if late global-store
 * hydration briefly restores the account default to `none`.
 */
export function restoreExactChatSelection(
  current: ChatModelSelection,
  retained: ExactChatSelection | null,
): ChatModelSelection {
  return current.mode === 'none' && retained ? retained : current;
}
