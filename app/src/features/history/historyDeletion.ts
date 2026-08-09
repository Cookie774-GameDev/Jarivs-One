const MAX_HISTORY_DELETE = 200;

interface HistoryChatOwnership {
  id: unknown;
  workspace_id: unknown;
}

export interface HistoryDeletionResult {
  deletedIds: string[];
  failedId?: string;
  error?: string;
}

export function historyDeletionFeedback(
  result: HistoryDeletionResult,
  selectedChatId: string | null,
): {
  clearSelection: boolean;
  tone: 'success' | 'error';
  title: string;
  message: string;
} {
  const count = result.deletedIds.length;
  const clearSelection = selectedChatId !== null && result.deletedIds.includes(selectedChatId);
  if (result.error) {
    return {
      clearSelection,
      tone: 'error',
      title: count > 0 ? 'History partially cleared' : 'Could not delete history',
      message:
        count > 0 ? `${count} deleted before stopping safely. ${result.error}` : result.error,
    };
  }
  return {
    clearSelection,
    tone: 'success',
    title: count === 1 ? 'Chat removed' : 'History cleared',
    message: `${count} ${count === 1 ? 'chat' : 'chats'} deleted.`,
  };
}

export async function deleteHistoryChats(
  chatIds: readonly string[],
  ports: {
    expectedWorkspaceId: string;
    getActiveWorkspaceId(): string | null;
    read(chatId: string): Promise<HistoryChatOwnership | undefined>;
    remove(chatId: string): Promise<void>;
  },
): Promise<HistoryDeletionResult> {
  const unique = [...new Set(chatIds)];
  if (unique.length > MAX_HISTORY_DELETE) {
    throw new Error('Too many history rows were selected for one clear operation.');
  }
  const deletedIds: string[] = [];
  for (const chatId of unique) {
    try {
      if (ports.getActiveWorkspaceId() !== ports.expectedWorkspaceId) {
        throw new Error('The active workspace changed; remaining chats were not deleted.');
      }
      const chat = await ports.read(chatId);
      if (!chat) throw new Error('The chat no longer exists.');
      if (String(chat.workspace_id) !== ports.expectedWorkspaceId) {
        throw new Error('The chat does not belong to the reviewed workspace.');
      }
      if (ports.getActiveWorkspaceId() !== ports.expectedWorkspaceId) {
        throw new Error('The active workspace changed; remaining chats were not deleted.');
      }
      await ports.remove(chatId);
      deletedIds.push(chatId);
    } catch (error) {
      return {
        deletedIds,
        failedId: chatId,
        error: error instanceof Error ? error.message : 'The delete operation failed safely.',
      };
    }
  }
  return { deletedIds };
}
