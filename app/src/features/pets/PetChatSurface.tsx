/**
 * Real VibeSpace chat surface for the Pet mini-panel.
 * Uses ChatThread + Composer + ensureActiveChat — same Dexie threads and AI runtime.
 */
import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChatThread } from '@/features/chat/ChatThread';
import { Composer } from '@/features/chat/Composer';
import { ensureActiveChat } from '@/features/chat/chatLifecycle';
import { chatRepo } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { usePetPresentationStore } from './petPresentationStore';
import { cn } from '@/lib/utils';

export function PetChatSurface({ className }: { className?: string }) {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const setActiveChat = useUIStore((s) => s.setActiveChat);
  const panelActiveChatId = usePetPresentationStore((s) => s.panelActiveChatId);
  const setPanelActiveChatId = usePetPresentationStore((s) => s.setPanelActiveChatId);
  const moveChat = usePetPresentationStore((s) => s.moveChat);
  const registerChat = usePetPresentationStore((s) => s.registerChat);
  const chats = usePetPresentationStore((s) => s.chats);

  const allChats = useLiveQuery(
    async () => {
      if (!workspaceId) return [];
      return chatRepo.list({ workspace_id: workspaceId, archived: false });
    },
    [workspaceId],
    [],
  );

  const petChatIds = React.useMemo(
    () =>
      Object.values(chats)
        .filter((c) => c.owner === 'pet-mini-panel')
        .map((c) => c.chatId),
    [chats],
  );

  const activeId = panelActiveChatId && petChatIds.includes(panelActiveChatId)
    ? panelActiveChatId
    : petChatIds[0] ?? null;

  React.useEffect(() => {
    if (activeId && activeId !== panelActiveChatId) {
      setPanelActiveChatId(activeId);
    }
  }, [activeId, panelActiveChatId, setPanelActiveChatId]);

  const returnToMain = (chatId: string) => {
    moveChat(chatId, 'main');
    setActiveChat(chatId);
    if (panelActiveChatId === chatId) setPanelActiveChatId(null);
  };

  const createNewOnPanel = async () => {
    const id = await ensureActiveChat({ forceNew: true, navigateToChat: false, title: 'Pet chat' });
    if (!id) return;
    registerChat(id, 'pet-mini-panel');
    moveChat(id, 'pet-mini-panel');
    setPanelActiveChatId(id);
    setActiveChat(id);
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-2', className)} data-pet-chat-surface="true">
      <div className="flex flex-wrap items-center gap-1 shrink-0">
        <Button size="sm" variant="secondary" onClick={() => void createNewOnPanel()}>
          New chat
        </Button>
        {activeId && (
          <Button size="sm" variant="ghost" onClick={() => returnToMain(activeId)}>
            Open in Main App
          </Button>
        )}
      </div>

      {petChatIds.length > 0 && (
        <div className="flex flex-wrap gap-1 shrink-0">
          {petChatIds.map((id) => {
            const row = (allChats ?? []).find((c) => c.id === id);
            return (
              <Button
                key={id}
                size="sm"
                variant={id === activeId ? 'default' : 'outline'}
                className="max-w-[140px] truncate"
                onClick={() => setPanelActiveChatId(id)}
                data-chat-id={id}
              >
                {row?.title || id.slice(0, 10)}
              </Button>
            );
          })}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col border border-border rounded-lg overflow-hidden bg-background">
        {activeId ? (
          <>
            <ChatThread chatId={activeId} compact />
            <Composer chatId={activeId} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-secondary text-muted-foreground">
              No chats on the Pet panel. Create one or move a thread from main.
            </p>
          </div>
        )}
      </div>

      <p className="text-metadata text-muted-foreground shrink-0">
        Tip: right-click a chat tab in the main app → Send to Pet panel.
      </p>
    </div>
  );
}
