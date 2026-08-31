import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useShallow } from 'zustand/react/shallow';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import { useAgentStore } from '@/stores/agents';
import { useTerminalTranscriptStore } from '@/features/terminals/transcriptStore';
import { useUIStore } from '@/stores/ui';
import type { LiveChatStatus, LiveTerminalStatus, LiveWorkStatus } from './types';
import type { WorkspaceId } from '@/types/common';
import type { AgentId } from '@/types/common';
import type { AgentRunState } from '@/types/agent';
import type { TerminalSession } from '@/types/terminal';
import type { Chat, Message } from '@/types/chat';

function isAgentBusy(state: string | undefined): boolean {
  return (
    state === 'streaming' ||
    state === 'thinking' ||
    state === 'tool_calling' ||
    state === 'reading' ||
    state === 'queued'
  );
}

export const STATIONARY_AFTER_MS = 4_000;

export function getTerminalWorkStatus(
  lastOutputAt?: number,
  hasActiveProcess = true,
): LiveWorkStatus {
  if (hasActiveProcess && lastOutputAt && Date.now() - lastOutputAt < STATIONARY_AFTER_MS) {
    return 'working';
  }
  if (!lastOutputAt) return 'stationary';
  return Date.now() - lastOutputAt < STATIONARY_AFTER_MS ? 'working' : 'stationary';
}

export function useLiveTerminalStatuses(
  workspaceId: WorkspaceId | null,
  projectId: string | null,
): LiveTerminalStatus[] {
  const sessions =
    useLiveQuery(async () => {
      if (!workspaceId) return [] as TerminalSession[];
      const rows = await db.terminal_sessions.where('workspace_id').equals(workspaceId).toArray();
      return rows
        .filter((s) => {
          const sameProject = projectId ? s.project_id === projectId : !s.project_id;
          return sameProject && s.status !== 'exited';
        })
        .sort((a, b) => b.last_active_at - a.last_active_at);
    }, [workspaceId, projectId]) ?? [];

  const transcripts = useTerminalTranscriptStore(
    useShallow((state) => sessions.map((session) => state.sessions[session.id])),
  );

  return useMemo(() => {
    return sessions.map((session, index) => {
      const transcript = transcripts[index];
      const lastOutputAt = transcript?.lastWriteAt ?? session.last_active_at;
      const status = getTerminalWorkStatus(lastOutputAt, session.status === 'running');
      const summary = transcript?.text?.trim().split('\n').filter(Boolean).pop()?.slice(0, 120);
      return {
        terminalId: session.id,
        sessionId: session.id,
        terminalName: session.title?.trim() || `Terminal ${session.id.slice(0, 6)}`,
        agentName: transcript?.agentSlug ?? undefined,
        status,
        lastOutputAt,
        lastActivitySummary: summary,
      };
    });
  }, [sessions, transcripts]);
}

export function useLiveChatStatuses(
  workspaceId: WorkspaceId | null,
  projectId: string | null,
): LiveChatStatus[] {
  const runStates = useAgentStore((s) => s.runStates);
  const evidence = useLiveQuery(async () => {
    if (!workspaceId) return { chats: [] as Chat[], messages: [] as Message[] };
    const rows = await db.chats.where('workspace_id').equals(workspaceId).toArray();
    const chats = rows
      .filter((c) => (projectId ? c.project_id === projectId : !c.project_id))
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, 16);
    const chatIds = chats.map((chat) => chat.id);
    const messages = chatIds.length
      ? await db.messages.where('chat_id').anyOf(chatIds).toArray()
      : [];
    return { chats, messages };
  }, [workspaceId, projectId]) ?? { chats: [], messages: [] };

  return useMemo(() => projectLiveChatStatuses({ ...evidence, runStates }), [evidence, runStates]);
}

function visibleMessagePreview(message: Message): string | undefined {
  const visible = message.parts
    .flatMap((part) => (part.kind === 'text' ? [part.text.trim()] : []))
    .filter(Boolean)
    .join('\n');
  return visible ? visible.slice(0, 240) : undefined;
}

export function projectLiveChatStatuses(
  input: Readonly<{
    chats: readonly Chat[];
    messages: readonly Message[];
    runStates: Partial<Record<AgentId, AgentRunState>>;
  }>,
): LiveChatStatus[] {
  const latestVisible = new Map<string, { message: Message; preview: string }>();
  for (const message of input.messages) {
    const preview = visibleMessagePreview(message);
    if (!preview) continue;
    const chatId = String(message.chat_id);
    const previous = latestVisible.get(chatId)?.message;
    if (
      !previous ||
      message.created_at > previous.created_at ||
      (message.created_at === previous.created_at && String(message.id) > String(previous.id))
    ) {
      latestVisible.set(chatId, { message, preview });
    }
  }

  return input.chats
    .filter((chat) => !chat.archived)
    .map((chat) => {
      const latest = latestVisible.get(String(chat.id));
      const working = chat.active_agent_ids.some((agentId) =>
        isAgentBusy(input.runStates[agentId]),
      );
      return {
        chatId: chat.id,
        title: chat.title?.trim() || 'Untitled chat',
        status: working ? ('working' as const) : ('stationary' as const),
        lastActivityAt: Math.max(chat.updated_at, latest?.message.updated_at ?? 0),
        lastMessagePreview: latest?.preview,
      };
    });
}

export function focusTerminalSession(sessionId: string, paneId?: string): void {
  useUIStore.getState().setRoute('terminal');
  window.dispatchEvent(new CustomEvent('jarvis:terminal:focus', { detail: { sessionId, paneId } }));
}

export function focusChat(chatId: string): void {
  const ui = useUIStore.getState();
  ui.setRoute('chat');
  ui.setActiveChat(chatId);
  window.dispatchEvent(new CustomEvent('jarvis:chat:focus', { detail: { chatId } }));
}
