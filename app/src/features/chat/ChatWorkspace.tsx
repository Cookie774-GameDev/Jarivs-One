import { useCallback, useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrowserGoalStatus } from '@/features/browser/BrowserGoalStatus';
import { BrowserChatHub, resolveChatEngine, useBrowserChatStore } from '@/features/browser-chat';
import { ChatThread } from './ChatThread';
import { Composer } from './Composer';
import { WarmChatWelcome } from './WarmChatWelcome';
import { TokenBossCinematic } from './token-boss/TokenBossCinematic';
import { ChatOutputPanel } from './ChatOutputPanel';
import {
  CHAT_OPEN_BESIDE_EVENT,
  VIBESPACE_CHAT_MIME,
  readChatDragPayload,
} from './chatDragPayload';
import { layoutClassForPaneCount, type ChatWorkspaceLayoutV1 } from './chatWorkspaceLayout';
import type { Message } from '@/types/chat';

export type ChatWorkspaceOpenResult =
  | Readonly<{
      ok: true;
      paneCount: number;
      action: 'opened' | 'focused_existing';
      source: Readonly<{ chatId: string; title: string }>;
    }>
  | Readonly<{
      ok: false;
      reason: 'pane_limit';
      source: Readonly<{ chatId: string; title: string }>;
    }>
  | Readonly<{
      ok: false;
      reason: 'invalid_payload' | 'chat_unavailable' | 'access_denied';
    }>;

export interface ChatWorkspaceProps {
  readonly layout: ChatWorkspaceLayoutV1;
  readonly chatTitles: Readonly<Record<string, string>>;
  readonly fixtureMessagesByChat?: Readonly<Record<string, readonly Message[] | undefined>>;
  readonly onFocus: (chatId: string) => void;
  readonly onClose: (chatId: string) => void;
  readonly onOpenBeside: (
    payload: unknown,
    destinationChatId: string,
  ) => ChatWorkspaceOpenResult | Promise<ChatWorkspaceOpenResult>;
}

function paneTitle(chatTitles: Readonly<Record<string, string>>, chatId: string): string {
  return chatTitles[chatId]?.trim() || 'Untitled chat';
}

function isPaneActionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-chat-pane-action="true"]') !== null;
}

function NativeChatSurface({
  chatId,
  fixtureMessages,
  onOpenBeside,
  onDragState,
}: {
  chatId: string;
  fixtureMessages?: readonly Message[];
  onOpenBeside: (event: DragEvent<HTMLDivElement>) => void;
  onDragState: (dragging: boolean) => void;
}) {
  const [outputOpen, setOutputOpen] = useState(false);

  useEffect(() => {
    const onOutput = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId?: string }>).detail;
      if (detail?.chatId && String(detail.chatId) !== chatId) return;
      setOutputOpen(true);
    };
    window.addEventListener('jarvis:chat:output', onOutput as EventListener);
    return () => window.removeEventListener('jarvis:chat:output', onOutput as EventListener);
  }, [chatId]);

  return (
    <>
      <WarmChatWelcome chatId={chatId} />
      <div
        data-testid={`chat-conversation-region-${chatId}`}
        className="relative flex min-h-0 flex-1 flex-col"
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes(VIBESPACE_CHAT_MIME)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'link';
          onDragState(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            onDragState(false);
          }
        }}
        onDrop={(event) => {
          onDragState(false);
          onOpenBeside(event);
        }}
      >
        <ChatThread chatId={chatId} fixtureMessages={fixtureMessages} />
        <BrowserGoalStatus chatId={chatId} />
      </div>
      <Composer key={chatId} chatId={chatId} />
      <TokenBossCinematic chatId={chatId} />
      <ChatOutputPanel chatId={chatId} open={outputOpen} onClose={() => setOutputOpen(false)} />
    </>
  );
}

function ChatPane({
  chatId,
  title,
  focused,
  multiPane,
  fixtureMessages,
  onFocus,
  onClose,
  onDropChat,
}: {
  chatId: string;
  title: string;
  focused: boolean;
  multiPane: boolean;
  fixtureMessages?: readonly Message[];
  onFocus: () => void;
  onClose: () => void;
  onDropChat: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const engine = useBrowserChatStore((state) => resolveChatEngine(state, chatId));
  const [dragOver, setDragOver] = useState(false);
  let surface: ReactNode;
  if (engine === 'browser') {
    surface = (
      <div
        data-testid={`chat-conversation-region-${chatId}`}
        className="flex min-h-0 flex-1 flex-col"
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes(VIBESPACE_CHAT_MIME)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'link';
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragOver(false);
          }
        }}
        onDrop={(event) => {
          setDragOver(false);
          onDropChat(event);
        }}
      >
        <BrowserChatHub chatId={chatId} />
      </div>
    );
  } else {
    surface = (
      <NativeChatSurface
        chatId={chatId}
        fixtureMessages={fixtureMessages}
        onOpenBeside={onDropChat}
        onDragState={setDragOver}
      />
    );
  }

  return (
    <section
      aria-label={`${title} chat pane`}
      data-testid={`chat-pane-${chatId}`}
      data-chat-id={chatId}
      data-focused={focused ? 'true' : 'false'}
      data-chat-drag-over={dragOver ? 'true' : 'false'}
      onPointerDownCapture={(event) => {
        if (!isPaneActionTarget(event.target)) onFocus();
      }}
      onFocusCapture={(event) => {
        if (!isPaneActionTarget(event.target)) onFocus();
      }}
      className={cn(
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-background transition-[box-shadow,border-color] duration-150 motion-reduce:transition-none',
        multiPane && 'border border-border/70',
        multiPane &&
          focused &&
          'border-accent-copper/60 shadow-[inset_0_0_0_1px_hsl(var(--accent-copper)/0.22)]',
        dragOver && 'ring-inset ring-2 ring-accent-copper/60',
      )}
    >
      {multiPane ? (
        <header className="flex h-8 shrink-0 items-center gap-2 border-b border-border/70 bg-panel/80 px-2">
          <button
            type="button"
            data-chat-pane-action="true"
            aria-label={`Focus ${title}`}
            aria-pressed={focused}
            onClick={onFocus}
            className="min-w-0 flex-1 truncate rounded-sm text-left text-metadata font-medium text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {title}
          </button>
          {focused ? (
            <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-accent-copper">
              Focused
            </span>
          ) : null}
          <button
            type="button"
            data-chat-pane-action="true"
            aria-label={`Close ${title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </header>
      ) : null}
      {surface}
    </section>
  );
}

export function ChatWorkspace({
  layout,
  chatTitles,
  fixtureMessagesByChat,
  onFocus,
  onClose,
  onOpenBeside,
}: ChatWorkspaceProps) {
  const focusedTitle = paneTitle(chatTitles, layout.focusedChatId);
  const focusedPaneOrdinal = layout.chatIds.indexOf(layout.focusedChatId) + 1;
  const focusAnnouncement = `Focused ${focusedTitle}, pane ${focusedPaneOrdinal} of ${layout.chatIds.length}.`;
  const [announcement, setAnnouncement] = useState(focusAnnouncement);

  useEffect(() => {
    setAnnouncement(focusAnnouncement);
  }, [focusAnnouncement, layout.focusedChatId]);

  const openBeside = useCallback(
    async (payload: unknown, destinationChatId = layout.focusedChatId) => {
      const destinationTitle = paneTitle(chatTitles, destinationChatId);
      try {
        const result = await onOpenBeside(payload, destinationChatId);
        if (result.ok) {
          setAnnouncement(
            result.action === 'focused_existing'
              ? `Focused existing ${result.source.title}. ${result.paneCount} chats open.`
              : `${result.source.title} opened beside ${destinationTitle}. ${result.paneCount} chats open.`,
          );
          return;
        }
        if (result.reason === 'pane_limit') {
          setAnnouncement(
            `Cannot open ${result.source.title} beside ${destinationTitle}. This workspace supports up to four chats.`,
          );
          return;
        }
        setAnnouncement(
          `Cannot open a chat beside ${destinationTitle}. The chat is unavailable or inaccessible.`,
        );
      } catch {
        setAnnouncement(`Cannot open a chat beside ${destinationTitle}. Please try again.`);
      }
    },
    [chatTitles, layout.focusedChatId, onOpenBeside],
  );

  useEffect(() => {
    const onSidebarOpenBeside = (event: Event) => {
      void openBeside((event as CustomEvent<unknown>).detail);
    };
    window.addEventListener(CHAT_OPEN_BESIDE_EVENT, onSidebarOpenBeside as EventListener);
    return () =>
      window.removeEventListener(CHAT_OPEN_BESIDE_EVENT, onSidebarOpenBeside as EventListener);
  }, [openBeside]);

  return (
    <div
      data-testid="chat-workspace"
      data-pane-count={layout.chatIds.length}
      className={cn(
        'grid h-full min-h-0 w-full gap-px overflow-hidden bg-border/70 transition-[grid-template-columns,grid-template-rows] duration-150 motion-reduce:transition-none',
        layoutClassForPaneCount(layout.chatIds.length),
      )}
    >
      {layout.chatIds.map((chatId) => (
        <ChatPane
          key={chatId}
          chatId={chatId}
          title={paneTitle(chatTitles, chatId)}
          focused={layout.focusedChatId === chatId}
          multiPane={layout.chatIds.length > 1}
          fixtureMessages={fixtureMessagesByChat?.[chatId]}
          onFocus={() => onFocus(chatId)}
          onClose={() => onClose(chatId)}
          onDropChat={(event) => {
            const payload = readChatDragPayload(event.dataTransfer);
            if (!payload) return;
            event.preventDefault();
            event.stopPropagation();
            void openBeside(payload, chatId);
          }}
        />
      ))}
      {layout.chatIds.length === 3 ? (
        <div
          data-testid="chat-workspace-empty-cell"
          aria-hidden="true"
          className="min-h-0 min-w-0 bg-background/55"
        />
      ) : null}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
