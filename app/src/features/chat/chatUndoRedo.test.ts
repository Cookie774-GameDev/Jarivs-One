import { beforeEach, describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import type { ChatId, MessageId } from '@/types/common';
import {
  __resetChatUndoRedoForTests,
  clearRedoStack,
  isUndoRedoStatusMessage,
  peekRedoDepth,
  popRedoTurn,
  pushRedoTurn,
  selectLastUndoableTurn,
  stripTrailingUndoRedoStatus,
  summarizeUndoTurn,
  UNDO_STATUS_TEXT,
  REDO_STATUS_TEXT,
} from './chatUndoRedo';

function msg(
  id: string,
  role: Message['role'],
  text: string,
  created_at = 1,
): Message {
  return {
    id: id as MessageId,
    chat_id: 'chat_1' as ChatId,
    role,
    parts: [{ kind: 'text', text }],
    created_at,
    updated_at: created_at,
  };
}

describe('chatUndoRedo', () => {
  beforeEach(() => {
    __resetChatUndoRedoForTests();
  });

  it('selects the last user message plus the full assistant reply as one turn', () => {
    const messages = [
      msg('m1', 'user', 'hello', 1),
      msg('m2', 'assistant', 'hi there', 2),
      msg('m3', 'user', 'write a file', 3),
      msg('m4', 'assistant', 'done', 4),
      msg('m5', 'tool', 'ok', 5),
    ];
    const turn = selectLastUndoableTurn(messages);
    expect(turn.map((m) => m.id)).toEqual(['m3', 'm4', 'm5']);
  });

  it('ignores trailing Undone/Redone status messages when selecting the turn', () => {
    const messages = [
      msg('m1', 'user', 'hello', 1),
      msg('m2', 'assistant', 'hi', 2),
      msg('m3', 'system', UNDO_STATUS_TEXT, 3),
    ];
    const turn = selectLastUndoableTurn(messages);
    expect(turn.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(stripTrailingUndoRedoStatus(messages).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('does not undo empty history or status-only history', () => {
    expect(selectLastUndoableTurn([])).toEqual([]);
    expect(selectLastUndoableTurn([msg('s1', 'system', UNDO_STATUS_TEXT, 1)])).toEqual([]);
  });

  it('does not treat ordinary system messages as undoable when they are alone', () => {
    expect(selectLastUndoableTurn([msg('s1', 'system', 'Model changed', 1)])).toEqual([]);
  });

  it('allows undoing a lone trailing assistant message when no user is present', () => {
    const turn = selectLastUndoableTurn([msg('a1', 'assistant', 'seeded', 1)]);
    expect(turn.map((m) => m.id)).toEqual(['a1']);
  });

  it('recognizes undo/redo status system messages', () => {
    expect(isUndoRedoStatusMessage(msg('s', 'system', UNDO_STATUS_TEXT))).toBe(true);
    expect(isUndoRedoStatusMessage(msg('s', 'system', REDO_STATUS_TEXT))).toBe(true);
    expect(isUndoRedoStatusMessage(msg('u', 'user', UNDO_STATUS_TEXT))).toBe(false);
  });

  it('push/pop redo stack is LIFO and chat-scoped', () => {
    const turnA = {
      chatId: 'chat_1',
      messages: [msg('m1', 'user', 'a', 1)],
      undoneAt: 1,
    };
    const turnB = {
      chatId: 'chat_1',
      messages: [msg('m2', 'user', 'b', 2)],
      undoneAt: 2,
    };
    const other = {
      chatId: 'chat_2',
      messages: [msg('m9', 'user', 'x', 9)],
      undoneAt: 9,
    };
    pushRedoTurn(turnA);
    pushRedoTurn(turnB);
    pushRedoTurn(other);
    expect(peekRedoDepth('chat_1')).toBe(2);
    expect(popRedoTurn('chat_1')?.messages[0]?.id).toBe('m2');
    expect(popRedoTurn('chat_1')?.messages[0]?.id).toBe('m1');
    expect(popRedoTurn('chat_1')).toBeNull();
    expect(popRedoTurn('chat_2')?.messages[0]?.id).toBe('m9');
  });

  it('clearRedoStack drops redo history for that chat only', () => {
    pushRedoTurn({
      chatId: 'chat_1',
      messages: [msg('m1', 'user', 'a', 1)],
      undoneAt: 1,
    });
    pushRedoTurn({
      chatId: 'chat_2',
      messages: [msg('m2', 'user', 'b', 2)],
      undoneAt: 2,
    });
    clearRedoStack('chat_1');
    expect(peekRedoDepth('chat_1')).toBe(0);
    expect(peekRedoDepth('chat_2')).toBe(1);
  });

  it('summarizes the undone turn for the status line', () => {
    const summary = summarizeUndoTurn([
      msg('m1', 'user', 'Please write a long story about dogs and cats', 1),
      msg('m2', 'assistant', 'Sure', 2),
    ]);
    expect(summary).toMatch(/Removed last turn/i);
    expect(summary).toMatch(/Please write a long story/i);
  });
});
