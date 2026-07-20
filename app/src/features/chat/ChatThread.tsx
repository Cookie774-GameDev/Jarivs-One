import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { useChatMessages } from './hooks';
import { MessageBubble } from './MessageBubble';
import { ChatActivityTimeline } from './activity';
import { ChatAgentActivityPanel } from '@/features/jarvis-interaction/AgentActivityCard';
import { JarvisTaskProgressCard } from '@/features/jarvis-runs/JarvisTaskProgressCard';
import { JarvisMemoryStatus } from '@/features/jarvis-memory/JarvisMemoryStatus';
import {
  JarvisCommandCenter,
  useJarvisCommandCenterBinding,
} from '@/features/jarvis-command-center/JarvisCommandCenter';
import type { JarvisCommandCenterHandlers } from '@/features/jarvis-command-center/types';
import { useJarvisTaskRunStore } from '@/features/jarvis-runs/taskRunStore';
import type { ChatId, Message, Part } from '@/types';
import type { JarvisCreatorKind } from '@/features/jarvis-creator/contracts';

const MAX_STREAM_SIZE_PART = 8000;

export interface ChatThreadProps {
  chatId: ChatId | string;
  compact?: boolean;
}

/**
 * Sum of streaming-text size across the message - used as a dependency
 * to keep the auto-scroll glued to bottom while tokens land.
 */
function streamingSize(message: Message | undefined): number {
  if (!message) return 0;
  let n = 0;
  for (const p of message.parts as Part[]) {
    if (p.kind === 'text' || p.kind === 'reasoning')
      n += Math.min(p.text.length, MAX_STREAM_SIZE_PART);
    else if (p.kind === 'tool_call') n += Math.min(roughPayloadSize(p.args), MAX_STREAM_SIZE_PART);
    else if (p.kind === 'tool_result')
      n += Math.min(roughPayloadSize(p.result ?? p.error ?? ''), MAX_STREAM_SIZE_PART);
  }
  return n;
}

function roughPayloadSize(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).length;
  if (Array.isArray(value)) return Math.min(value.length, 100) * 64;
  if (typeof value === 'object')
    return Math.min(Object.keys(value as Record<string, unknown>).length, 100) * 96;
  return 32;
}

/**
 * The scroll container. Auto-scrolls to bottom on new messages and during
 * streaming - but only if the user is already near the bottom. If the user
 * has scrolled up to read history, we do not yank them.
 */
export function ChatThread({ chatId, compact = false }: ChatThreadProps) {
  const messages = useChatMessages(chatId);
  const commandCenterBinding = useJarvisCommandCenterBinding();
  const hasCanonicalRun = useJarvisTaskRunStore((state) =>
    Object.values(state.runs).some((run) => run.canonical && run.chatId === String(chatId)),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef(true);
  const fallbackAgents = useMemo(() => extractAgentCards(messages), [messages]);
  const creatorDraftKind = useMemo(() => detectCreatorDraftKind(messages), [messages]);
  const commandCenterHandlers = useMemo<JarvisCommandCenterHandlers>(() => {
    const hostPort = commandCenterBinding?.hostPort;
    if (!hostPort) return {};
    const requireBoundAccount = (accountId: string) => {
      if (accountId !== hostPort.accountId) {
        throw new Error('jarvis_command_center_account_mismatch');
      }
    };
    return {
      cancelRun(accountId, runId) {
        requireBoundAccount(accountId);
        return hostPort.requestCancellation(runId);
      },
      retryScheduledTransport(accountId, runId) {
        requireBoundAccount(accountId);
        return hostPort.retryScheduledTransport(runId);
      },
      retryLogicalRun(accountId, runId) {
        requireBoundAccount(accountId);
        return hostPort.retryLogicalRun(runId);
      },
    };
  }, [commandCenterBinding]);

  const tailSize = streamingSize(messages[messages.length - 1]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickyRef.current = distFromBottom < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickyRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, tailSize]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-y-auto"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      data-tour="chat-thread"
    >
      <div
        className={
          compact
            ? 'flex w-full flex-col gap-3 px-2 py-3'
            : 'mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-6'
        }
      >
        {/* Top of every chat; scrolls away with messages (not sticky). */}
        {!hasCanonicalRun ? <ChatActivityTimeline chatId={chatId} compact={compact} /> : null}
        {messages.length === 0 ? (
          <ThreadHint />
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                compact={compact}
                creatorDraftKind={creatorDraftKind}
              />
            ))}
          </AnimatePresence>
        )}
        {hasCanonicalRun && commandCenterBinding ? (
          <JarvisCommandCenter
            accountId={commandCenterBinding.hostPort.accountId}
            chatId={String(chatId)}
            dataPort={commandCenterBinding.dataPort}
            handlers={commandCenterHandlers}
            compact={compact}
          />
        ) : null}
        <ChatAgentActivityPanel
          chatId={chatId}
          fallbackAgents={fallbackAgents}
          compact={compact}
          className={compact ? 'mx-1 mb-6' : 'sticky bottom-0 z-10 mb-8'}
        />
        {!hasCanonicalRun ? (
          <JarvisTaskProgressCard chatId={String(chatId)} compact={compact} />
        ) : null}
        <JarvisMemoryStatus chatId={String(chatId)} />
      </div>
    </div>
  );
}

function extractAgentCards(messages: Message[]) {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) => (part.kind === 'agent_card' ? [part.agent] : [])),
  );
}

function detectCreatorDraftKind(messages: Message[]): JarvisCreatorKind | undefined {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.kind !== 'question_block') continue;
      if (part.block.id === 'jarvis_creator_agent') return 'agent';
      if (part.block.id === 'jarvis_creator_skill') return 'skill';
    }
  }
  return undefined;
}

function ThreadHint() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="rounded-full border border-border bg-elevated p-3">
        <Sparkles className="h-5 w-5 text-accent-cyan" />
      </div>
      <div className="text-ui-strong text-foreground">No messages yet</div>
      <div className="text-secondary text-muted-foreground max-w-[44ch]">
        Type below to start the conversation. Use <span className="kbd">@</span> to mention an agent
        or <span className="kbd">{'\u2318'}</span>+<span className="kbd">Enter</span> to send.
      </div>
    </div>
  );
}
