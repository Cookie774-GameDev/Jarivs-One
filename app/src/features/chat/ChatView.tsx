import { useEffect, useState } from 'react';
import { TooltipProvider } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui';
import { ChatThread } from './ChatThread';
import { Composer } from './Composer';
import { EmptyChat } from './EmptyChat';
import { ensureActiveChat } from './chatLifecycle';
import { cn } from '@/lib/utils';
import { getChatDragKind, getChatDropPayload, type ChatDropKind } from './dropPayload';
import { usePetPresentationStore } from '@/features/pets/petPresentationStore';

/**
 * Top-level chat surface. Move chats into the Pet panel via right-click on a tab
 * (TabStrip) — no permanent "Move to Pet" button clutter.
 */
export function ChatView() {
  const activeChatId = useUIStore((s) => s.activeChatId);
  const [dropKind, setDropKind] = useState<ChatDropKind | null>(null);
  const [ensuringChat, setEnsuringChat] = useState(false);
  const [ensureFailed, setEnsureFailed] = useState(false);
  const isOnPet = usePetPresentationStore((s) => s.isChatOnPet(activeChatId));
  const moveChat = usePetPresentationStore((s) => s.moveChat);

  useEffect(() => {
    if (activeChatId) return;
    let cancelled = false;
    setEnsuringChat(true);
    setEnsureFailed(false);
    void ensureActiveChat()
      .then((id) => {
        if (!cancelled && !id) setEnsureFailed(true);
      })
      .catch(() => {
        if (!cancelled) setEnsureFailed(true);
      })
      .finally(() => {
        if (!cancelled) setEnsuringChat(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeChatId]);

  return (
    <TooltipProvider delayDuration={400}>
      <div
        data-vibespace-page="chat"
        data-terminal-drop={activeChatId ? 'chat' : undefined}
        data-terminal-drop-chat-id={activeChatId ?? undefined}
        onDragOver={(e) => {
          if (!activeChatId) return;
          const nextKind = getChatDragKind(e.dataTransfer.types);
          if (!nextKind) return;
          e.preventDefault();
          setDropKind(nextKind);
        }}
        onDragLeave={() => setDropKind(null)}
        onDrop={(e) => {
          if (!activeChatId) return;
          const payload = getChatDropPayload(e.dataTransfer);
          if (!payload) return;
          e.preventDefault();
          e.stopPropagation();
          setDropKind(null);
          if (payload.kind === 'context') {
            window.dispatchEvent(
              new CustomEvent('jarvis:context:attach', {
                detail: { raw: payload.raw, chatId: activeChatId },
              }),
            );
          } else if (payload.kind === 'terminal') {
            window.dispatchEvent(
              new CustomEvent('jarvis:terminal:attach', {
                detail: { raw: payload.raw, chatId: activeChatId },
              }),
            );
          } else {
            window.dispatchEvent(
              new CustomEvent('jarvis:file:attach', {
                detail: { path: payload.path, chatId: activeChatId },
              }),
            );
          }
        }}
        className={cn(
          'relative flex h-full w-full flex-col bg-background transition-shadow',
          dropKind && 'ring-inset ring-2 ring-accent-copper/50',
        )}
      >
        {dropKind && (
          <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-md border border-accent-copper/50 bg-background/95 px-3 py-1 text-metadata text-accent-copper shadow-soft">
            Drop{' '}
            {dropKind === 'context'
              ? 'Context'
              : dropKind === 'terminal'
                ? 'terminal'
                : 'file path'}{' '}
            here to power up this chat
          </div>
        )}
        {activeChatId ? (
          <>
            {isOnPet && (
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 shrink-0 bg-muted/40">
                <span className="text-metadata text-muted-foreground">
                  This chat is open in the Pet panel (same thread — not copied).
                </span>
                <Button size="sm" variant="outline" onClick={() => moveChat(activeChatId, 'main')}>
                  Bring back here
                </Button>
              </div>
            )}
            <ChatThread chatId={activeChatId} />
            {isOnPet ? (
              <div className="border-t border-border px-4 py-3 text-secondary text-muted-foreground text-sm">
                Type in the Pet panel for this thread. Streaming already started here keeps running.
              </div>
            ) : (
              <Composer chatId={activeChatId} />
            )}
          </>
        ) : ensuringChat ? (
          <div className="flex flex-1 items-center justify-center text-secondary text-muted-foreground">
            Starting a conversation…
          </div>
        ) : (
          <EmptyChat />
        )}
        {ensureFailed && !activeChatId && !ensuringChat ? (
          <p className="px-4 pb-3 text-center text-metadata text-muted-foreground">
            Could not open a chat yet — workspace may still be loading.
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
