import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TooltipProvider } from '@/components/ui';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { chatRepo } from '@/lib/db';
import { ChatThread } from './ChatThread';
import { Composer } from './Composer';
import { EmptyChat } from './EmptyChat';
import { ensureActiveChat } from './chatLifecycle';
import { cn, isTauri } from '@/lib/utils';
import {
  dispatchMediaAttach,
  getChatDragKind,
  getChatDropPayload,
  type ChatDropKind,
} from './dropPayload';
import { createNativeChatFileDropHandler } from './nativeFileDrop';
import { OrigamiChatDecor } from './OrigamiChatDecor';
import { MONOCHROME_CHAT_FIXTURE } from './monochromeFixture';
import { TokenBossCinematic } from './token-boss/TokenBossCinematic';
import { WarmChatWelcome } from './WarmChatWelcome';
import { ChatOutputPanel } from './ChatOutputPanel';
import { BrowserGoalStatus } from '@/features/browser/BrowserGoalStatus';
import { BrowserChatHub, resolveChatEngine, useBrowserChatStore } from '@/features/browser-chat';
import { ChatWorkspace, type ChatWorkspaceOpenResult } from './ChatWorkspace';
import {
  addChatPane,
  chatWorkspaceStorageKey,
  closeChatPane,
  focusChatPane,
  loadChatWorkspaceLayout,
  pruneChatWorkspaceLayout,
  replacePrimaryChatPane,
  saveChatWorkspaceLayout,
  subscribeChatWorkspaceLayout,
  type ChatWorkspaceLayoutV1,
  type ChatWorkspaceScope,
} from './chatWorkspaceLayout';
import { resolveAcceptedChatDrop, type ChatDragPayloadV1 } from './chatDragPayload';
import type { ChatId, ProjectId, WorkspaceId } from '@/types/common';
import type { Message } from '@/types/chat';
import './sakura-chat.css';
import './chat-welcome.css';

function sameLayout(left: ChatWorkspaceLayoutV1, right: ChatWorkspaceLayoutV1): boolean {
  return (
    left.focusedChatId === right.focusedChatId &&
    left.chatIds.length === right.chatIds.length &&
    left.chatIds.every((chatId, index) => chatId === right.chatIds[index])
  );
}

function VisualFixtureChatSurface({
  activeChatId,
  messages,
}: {
  activeChatId: string;
  messages: readonly Message[];
}) {
  const engine = useBrowserChatStore((state) => resolveChatEngine(state, activeChatId));
  const [outputOpen, setOutputOpen] = useState(false);

  useEffect(() => {
    const onOutput = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId?: string }>).detail;
      if (detail?.chatId && String(detail.chatId) !== String(activeChatId)) return;
      setOutputOpen(true);
    };
    window.addEventListener('jarvis:chat:output', onOutput as EventListener);
    return () => window.removeEventListener('jarvis:chat:output', onOutput as EventListener);
  }, [activeChatId]);

  if (engine === 'browser' && activeChatId) return <BrowserChatHub chatId={activeChatId} />;
  return (
    <>
      <WarmChatWelcome chatId={String(activeChatId)} />
      <ChatThread chatId={activeChatId} fixtureMessages={messages} />
      <BrowserGoalStatus chatId={String(activeChatId)} />
      <Composer key={String(activeChatId)} chatId={activeChatId} />
      <TokenBossCinematic chatId={String(activeChatId)} />
      <ChatOutputPanel
        chatId={String(activeChatId)}
        open={outputOpen}
        onClose={() => setOutputOpen(false)}
      />
    </>
  );
}

/** Top-level chat route and its persisted one-to-four-pane workspace. */
export function ChatView() {
  const storedActiveChatId = useUIStore((state) => state.activeChatId);
  const setActiveChat = useUIStore((state) => state.setActiveChat);
  const localUserId = useAuthStore((state) => state.localUserId);
  const cloudUserId = useAuthStore((state) => state.cloudSession?.user_id ?? null);
  const workspaceId = useAuthStore((state) => state.workspaceId);
  const projectId = useAuthStore((state) => state.projectId);
  const isVisualEmptyChat = document.documentElement.dataset.monochromeChatState === 'empty-state';
  const visualChatFixture =
    document.documentElement.dataset.monochromeChatFixture === 'chat'
      ? MONOCHROME_CHAT_FIXTURE
      : undefined;
  const activeChatId = visualChatFixture?.activeConversationId ?? storedActiveChatId;
  const [dropKind, setDropKind] = useState<ChatDropKind | null>(null);
  const [ensuringChat, setEnsuringChat] = useState(false);
  const [ensureFailed, setEnsureFailed] = useState(false);

  const scope = useMemo<ChatWorkspaceScope | null>(() => {
    if (!activeChatId) return null;
    return {
      accountId: cloudUserId || localUserId || 'local-account',
      workspaceId: String(workspaceId ?? 'local-workspace'),
      projectId: projectId ? String(projectId) : null,
      primaryChatId: String(activeChatId),
    };
  }, [activeChatId, cloudUserId, localUserId, projectId, workspaceId]);
  const scopeKey = scope ? chatWorkspaceStorageKey(scope) : null;
  const [layoutState, setLayoutState] = useState<{
    key: string;
    layout: ChatWorkspaceLayoutV1;
  } | null>(() =>
    scope && scopeKey ? { key: scopeKey, layout: loadChatWorkspaceLayout(scope) } : null,
  );
  const workspaceLayout =
    scope && scopeKey
      ? layoutState?.key === scopeKey
        ? layoutState.layout
        : loadChatWorkspaceLayout(scope)
      : null;
  const layoutRef = useRef(workspaceLayout);
  layoutRef.current = workspaceLayout;

  const accessibleChats = useLiveQuery(
    () =>
      workspaceId
        ? chatRepo
            .list({ workspace_id: workspaceId as WorkspaceId, archived: false })
            .then((rows) =>
              projectId
                ? rows.filter((chat) => chat.project_id === (projectId as ProjectId))
                : rows.filter((chat) => !chat.project_id),
            )
        : Promise.resolve([]),
    [workspaceId, projectId],
  );

  const commitLayout = useCallback(
    (next: ChatWorkspaceLayoutV1) => {
      if (!scope || !scopeKey) return;
      layoutRef.current = next;
      setLayoutState({ key: scopeKey, layout: next });
      saveChatWorkspaceLayout(scope, next);
    },
    [scope, scopeKey],
  );

  useEffect(() => {
    if (!scope || !scopeKey) {
      setLayoutState(null);
      return;
    }
    setLayoutState((current) =>
      current?.key === scopeKey
        ? current
        : { key: scopeKey, layout: loadChatWorkspaceLayout(scope) },
    );
  }, [scope, scopeKey]);

  useEffect(() => {
    if (!scope || !scopeKey) return;
    return subscribeChatWorkspaceLayout(scope, (layout) => {
      layoutRef.current = layout;
      setLayoutState({ key: scopeKey, layout });
    });
  }, [scope, scopeKey]);

  useEffect(() => {
    if (!activeChatId || !workspaceLayout || visualChatFixture) return;
    const next = replacePrimaryChatPane(workspaceLayout, String(activeChatId));
    if (!sameLayout(workspaceLayout, next)) commitLayout(next);
  }, [activeChatId, commitLayout, visualChatFixture, workspaceLayout]);

  useEffect(() => {
    if (!activeChatId || !workspaceLayout || accessibleChats === undefined || visualChatFixture)
      return;
    const accessibleIds = accessibleChats.map((chat) => String(chat.id));
    if (!accessibleIds.includes(String(activeChatId))) accessibleIds.push(String(activeChatId));
    const next = pruneChatWorkspaceLayout(workspaceLayout, accessibleIds, String(activeChatId));
    if (!sameLayout(workspaceLayout, next)) commitLayout(next);
  }, [accessibleChats, activeChatId, commitLayout, visualChatFixture, workspaceLayout]);

  useEffect(() => {
    if (!isTauri || !activeChatId) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const handleNativeDrop = createNativeChatFileDropHandler({
      devicePixelRatio: window.devicePixelRatio,
      hitTest: (clientX, clientY) =>
        document.elementFromPoint(clientX, clientY)?.closest('[data-vibespace-page="chat"]') !==
        null,
      onHoverChange: (hovering) => setDropKind(hovering ? 'os-files' : null),
      onDropPaths: (paths) => {
        const targetChatId = layoutRef.current?.focusedChatId ?? String(activeChatId);
        for (const path of paths) {
          window.dispatchEvent(
            new CustomEvent('jarvis:file:attach', {
              detail: { path, chatId: targetChatId },
            }),
          );
        }
      },
    });

    void import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => handleNativeDrop(event.payload)),
      )
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch(() => {
        // Browser preview and unavailable native bridges keep the existing DOM drop path.
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activeChatId]);

  useEffect(() => {
    if (activeChatId || isVisualEmptyChat) return;
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
  }, [activeChatId, isVisualEmptyChat]);

  const chatTitles = useMemo(() => {
    const titles: Record<string, string> = {};
    for (const chat of accessibleChats ?? []) {
      titles[String(chat.id)] = chat.title?.trim() || 'Untitled chat';
    }
    if (visualChatFixture) titles[visualChatFixture.activeConversationId] = 'Fixture chat';
    return titles;
  }, [accessibleChats, visualChatFixture]);

  const openBeside = useCallback(
    async (
      payload: ChatDragPayloadV1,
      destinationChatId: string,
    ): Promise<ChatWorkspaceOpenResult> => {
      const current = layoutRef.current;
      if (!current) return { ok: false, reason: 'chat_unavailable' };
      if (current.chatIds.includes(payload.chatId)) {
        const next = focusChatPane(current, payload.chatId);
        commitLayout(next);
        setActiveChat(payload.chatId);
        return { ok: true, paneCount: next.chatIds.length };
      }
      const accepted = await resolveAcceptedChatDrop(
        { payload, targetChatId: destinationChatId },
        {
          getChat: (id) => chatRepo.getById(id as ChatId),
          canAccess: (source, target) =>
            !source.archived &&
            !target.archived &&
            String(source.workspace_id) === String(workspaceId ?? '') &&
            String(source.project_id ?? '') === String(projectId ?? ''),
        },
      );
      if (!accepted.ok) {
        return {
          ok: false,
          reason: accepted.reason === 'same_chat' ? 'invalid_payload' : accepted.reason,
        };
      }
      const next = addChatPane(layoutRef.current ?? current, String(accepted.chat.id));
      if ('ok' in next) return next;
      commitLayout(next);
      setActiveChat(next.focusedChatId);
      return { ok: true, paneCount: next.chatIds.length };
    },
    [commitLayout, projectId, setActiveChat, workspaceId],
  );

  const effectiveLayout = visualChatFixture
    ? ({
        version: 1,
        chatIds: [visualChatFixture.activeConversationId],
        focusedChatId: visualChatFixture.activeConversationId,
      } satisfies ChatWorkspaceLayoutV1)
    : workspaceLayout;
  const focusedChatId = effectiveLayout?.focusedChatId ?? activeChatId ?? undefined;

  return (
    <TooltipProvider delayDuration={400}>
      <div
        data-vibespace-page="chat"
        data-token-boss-host="true"
        data-monochrome-surface="chat"
        data-sakura-surface="chat-route"
        data-terminal-drop={focusedChatId ? 'chat' : undefined}
        data-terminal-drop-chat-id={focusedChatId}
        onDragOver={(event) => {
          if (!focusedChatId) return;
          const nextKind = getChatDragKind(event.dataTransfer.types);
          if (!nextKind) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = nextKind === 'os-files' ? 'copy' : 'link';
          setDropKind(nextKind);
        }}
        onDragLeave={() => setDropKind(null)}
        onDrop={(event) => {
          if (!focusedChatId) return;
          const osFiles = event.dataTransfer.files;
          if (osFiles && osFiles.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            setDropKind(null);
            dispatchMediaAttach(String(focusedChatId), osFiles);
            return;
          }
          const payload = getChatDropPayload(event.dataTransfer);
          if (!payload) return;
          event.preventDefault();
          event.stopPropagation();
          setDropKind(null);
          if (payload.kind === 'context') {
            window.dispatchEvent(
              new CustomEvent('jarvis:context:attach', {
                detail: { raw: payload.raw, chatId: focusedChatId },
              }),
            );
          } else if (payload.kind === 'terminal') {
            window.dispatchEvent(
              new CustomEvent('jarvis:terminal:attach', {
                detail: { raw: payload.raw, chatId: focusedChatId },
              }),
            );
          } else {
            window.dispatchEvent(
              new CustomEvent('jarvis:file:attach', {
                detail: { path: payload.path, chatId: focusedChatId },
              }),
            );
          }
        }}
        className={cn(
          'relative flex h-full w-full flex-col bg-background transition-shadow',
          '[[data-theme=monochrome]_&]:bg-background [[data-theme=monochrome]_&]:shadow-none [[data-theme=monochrome]_&]:transition-none',
          dropKind && 'ring-inset ring-2 ring-accent-copper/50',
        )}
      >
        <OrigamiChatDecor />
        {dropKind ? (
          <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-md border border-accent-copper/50 bg-background/95 px-3 py-1 text-metadata text-accent-copper shadow-soft [[data-theme=monochrome]_&]:rounded-sm [[data-theme=monochrome]_&]:border-border-mid [[data-theme=monochrome]_&]:bg-background [[data-theme=monochrome]_&]:shadow-none">
            Drop{' '}
            {dropKind === 'context'
              ? 'Context'
              : dropKind === 'terminal'
                ? 'terminal'
                : dropKind === 'os-files'
                  ? 'photos, videos, or files'
                  : 'file path'}{' '}
            here to power up this chat
          </div>
        ) : null}
        {isVisualEmptyChat ? (
          <EmptyChat />
        ) : visualChatFixture ? (
          <VisualFixtureChatSurface
            activeChatId={visualChatFixture.activeConversationId}
            messages={visualChatFixture.messages}
          />
        ) : activeChatId && effectiveLayout ? (
          <ChatWorkspace
            layout={effectiveLayout}
            chatTitles={chatTitles}
            onFocus={(chatId) => {
              const current = layoutRef.current;
              if (!current) return;
              const next = focusChatPane(current, chatId);
              commitLayout(next);
              setActiveChat(chatId);
            }}
            onClose={(chatId) => {
              const current = layoutRef.current;
              if (!current) return;
              const next = closeChatPane(current, chatId);
              if (sameLayout(current, next)) return;
              commitLayout(next);
              setActiveChat(next.focusedChatId);
            }}
            onOpenBeside={openBeside}
          />
        ) : ensuringChat ? (
          <div className="flex flex-1 items-center justify-center text-secondary text-muted-foreground">
            Starting a conversation…
          </div>
        ) : (
          <EmptyChat />
        )}
        {!isVisualEmptyChat && ensureFailed && !activeChatId && !ensuringChat ? (
          <p className="px-4 pb-3 text-center text-metadata text-muted-foreground">
            Could not open a chat yet — workspace may still be loading.
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
