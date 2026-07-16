/**
 * Safe chat /undo and /redo for the last full conversation turn.
 *
 * A "full turn" is the last user message plus every consecutive
 * assistant/agent/tool message that followed it (the complete reply),
 * ignoring trailing /undo|/redo status system notices.
 *
 * Safety:
 * - Only messages from the active chat are considered.
 * - Trailing status system messages (Undone./Redone.) are never the target.
 * - Empty chats and utility-only histories return no-op.
 * - Redo restores the exact message snapshots (ids + timestamps) LIFO.
 */
import type { Message } from '@/types';
import type { MessageId } from '@/types/common';

export const UNDO_STATUS_TEXT = 'Undone.';
export const REDO_STATUS_TEXT = 'Redone.';
export const NOTHING_TO_UNDO_TEXT = 'Nothing to undo.';
export const NOTHING_TO_REDO_TEXT = 'Nothing to redo.';
export const UNDO_BLOCKED_RUNNING_TEXT =
  'Cannot undo while Jarvis is still generating a reply. Stop the run first, then try /undo.';
export const REDO_BLOCKED_RUNNING_TEXT =
  'Cannot redo while Jarvis is still generating a reply. Stop the run first, then try /redo.';

const MAX_STACK = 20;

export interface ChatUndoTurn {
  chatId: string;
  /** Messages removed as one atomic turn, chronological order. */
  messages: Message[];
  undoneAt: number;
}

/** In-memory redo stacks per chat (session-local). */
const redoStacks = new Map<string, ChatUndoTurn[]>();

export function __resetChatUndoRedoForTests(): void {
  redoStacks.clear();
}

export function isUndoRedoStatusMessage(message: Message): boolean {
  if (message.role !== 'system') return false;
  const text = message.parts
    .filter((part): part is Extract<typeof part, { kind: 'text' }> => part.kind === 'text')
    .map((part) => part.text.trim())
    .join('\n');
  return (
    text === UNDO_STATUS_TEXT ||
    text === REDO_STATUS_TEXT ||
    text === NOTHING_TO_UNDO_TEXT ||
    text === NOTHING_TO_REDO_TEXT ||
    text === UNDO_BLOCKED_RUNNING_TEXT ||
    /^Undone\b/i.test(text) ||
    /^Redone\b/i.test(text)
  );
}

/**
 * Drop trailing undo/redo status system messages so they never become the
 * undo target and don't block finding the real last turn.
 */
export function stripTrailingUndoRedoStatus(messages: Message[]): Message[] {
  let end = messages.length;
  while (end > 0 && isUndoRedoStatusMessage(messages[end - 1]!)) {
    end -= 1;
  }
  return messages.slice(0, end);
}

/**
 * Select the last full undoable turn from a chronological message list.
 * Returns [] when there is nothing safe to undo.
 */
export function selectLastUndoableTurn(messages: Message[]): Message[] {
  const scoped = stripTrailingUndoRedoStatus(messages);
  if (scoped.length === 0) return [];

  // Prefer last user message + everything after it (assistant/tool/agent).
  let userIdx = -1;
  for (let i = scoped.length - 1; i >= 0; i -= 1) {
    if (scoped[i]!.role === 'user') {
      userIdx = i;
      break;
    }
  }

  if (userIdx >= 0) {
    const turn = scoped.slice(userIdx);
    // Never undo a turn that is only status systems (shouldn't happen after strip).
    if (turn.every(isUndoRedoStatusMessage)) return [];
    return turn;
  }

  // No user message: allow undoing a single trailing assistant/agent reply only.
  const last = scoped[scoped.length - 1]!;
  if (last.role === 'assistant' || last.role === 'agent' || last.role === 'tool') {
    return [last];
  }

  // Do not undo arbitrary system/tool noise.
  return [];
}

export function pushRedoTurn(turn: ChatUndoTurn): void {
  const key = turn.chatId;
  const stack = redoStacks.get(key) ?? [];
  stack.push(turn);
  while (stack.length > MAX_STACK) stack.shift();
  redoStacks.set(key, stack);
}

export function popRedoTurn(chatId: string): ChatUndoTurn | null {
  const stack = redoStacks.get(chatId);
  if (!stack || stack.length === 0) return null;
  const turn = stack.pop()!;
  if (stack.length === 0) redoStacks.delete(chatId);
  else redoStacks.set(chatId, stack);
  return turn;
}

export function peekRedoDepth(chatId: string): number {
  return redoStacks.get(chatId)?.length ?? 0;
}

/** Clear redo stack when the user sends a new real message (branch invalid). */
export function clearRedoStack(chatId: string): void {
  redoStacks.delete(chatId);
}

export function messageIdsOf(messages: Message[]): MessageId[] {
  return messages.map((m) => m.id);
}

export function summarizeUndoTurn(messages: Message[]): string {
  const user = messages.find((m) => m.role === 'user');
  const assistant = messages.find((m) => m.role === 'assistant' || m.role === 'agent');
  const userPreview = previewText(user);
  const count = messages.length;
  if (userPreview && assistant) {
    return `Removed last turn (${count} message${count === 1 ? '' : 's'}): “${userPreview}”`;
  }
  if (userPreview) {
    return `Removed last message: “${userPreview}”`;
  }
  return `Removed last ${count} message${count === 1 ? '' : 's'}.`;
}

function previewText(message: Message | undefined): string {
  if (!message) return '';
  const text = message.parts
    .filter((part): part is Extract<typeof part, { kind: 'text' }> => part.kind === 'text')
    .map((part) => part.text.replace(/\s+/g, ' ').trim())
    .join(' ')
    .trim();
  if (!text) return '';
  return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}
