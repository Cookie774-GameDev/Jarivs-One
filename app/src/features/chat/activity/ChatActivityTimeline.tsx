import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  GitPullRequest,
  Image,
  Loader2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn, formatRelative } from '@/lib/utils';
import type { ChatId } from '@/types/common';
import { useChatActivityStore } from './activityStore';
import type { ChatActivityEvent, ChatActivityKind, ChatActivityStatus } from './types';

const KIND_ICON: Record<ChatActivityKind, typeof Bot> = {
  agent: Bot,
  subagent: Bot,
  file: FileText,
  url: ExternalLink,
  diff: GitPullRequest,
  tool: Wrench,
};

const STATUS_META: Record<ChatActivityStatus, { label: string; variant: 'secondary' | 'success' | 'destructive'; icon: React.ReactElement }> = {
  pending: { label: 'Queued', variant: 'secondary', icon: <Loader2 className="h-3 w-3" /> },
  running: { label: 'Running', variant: 'secondary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  done: { label: 'Done', variant: 'success', icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { label: 'Cancelled', variant: 'secondary', icon: <XCircle className="h-3 w-3" /> },
  error: { label: 'Failed', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
};

export function ChatActivityTimeline({ chatId, compact = false }: { chatId: ChatId | string; compact?: boolean }) {
  const eventsByChat = useChatActivityStore((state) => state.eventsByChat);
  const events = eventsByChat[String(chatId)];
  const recent = React.useMemo(() => (events ?? []).slice(-12), [events]);
  if (recent.length === 0) return null;

  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-panel/75 shadow-soft overflow-hidden',
        compact ? 'mx-1' : 'mx-0',
      )}
      aria-label="Jarvis activity"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/80 px-3 py-2">
        <div>
          <p className="text-ui-strong text-foreground">Jarvis activity</p>
          <p className="text-metadata text-muted-foreground">
            Agents, files, URLs, and changes for this chat
          </p>
        </div>
        <Badge variant="secondary">{recent.length}</Badge>
      </div>
      <div className="divide-y divide-border/70">
        <AnimatePresence initial={false}>
          {recent.map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

export function ActivityRow({ event }: { event: ChatActivityEvent }) {
  const [open, setOpen] = React.useState(false);
  const Icon = KIND_ICON[event.kind] ?? Bot;
  const meta = STATUS_META[event.status];
  const hasBody = Boolean(event.detail || event.diff);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="bg-elevated/45"
    >
      <button
        type="button"
        disabled={!hasBody}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left',
          hasBody ? 'hover:bg-muted/35' : 'cursor-default',
        )}
        aria-expanded={open}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-accent-copper" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-secondary text-foreground">{event.title}</p>
            {event.kind === 'file' && event.filePath && <ImageAwareFileBadge path={event.filePath} />}
          </div>
          <p className="truncate text-metadata text-muted-foreground">
            {event.subtitle ?? event.agentSlug ?? event.filePath ?? event.url ?? formatRelative(event.ts)}
          </p>
        </div>
        {event.kind === 'diff' ? (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px]">
            <span className="text-emerald-400">+{event.addedLines ?? 0}</span>
            <span className="text-rose-400">-{event.removedLines ?? 0}</span>
          </span>
        ) : null}
        <Badge variant={meta.variant} className="gap-1">
          {meta.icon}
          {meta.label}
        </Badge>
        {hasBody ? (
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        ) : null}
      </button>
      <AnimatePresence initial={false}>
        {open && hasBody ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/70"
          >
            <div className="space-y-2 px-3 py-2.5">
              {event.detail ? (
                <p className="whitespace-pre-wrap text-secondary text-muted-foreground">{event.detail}</p>
              ) : null}
              {event.diff ? (
                <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">
                  {event.diff}
                </pre>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

function ImageAwareFileBadge({ path }: { path: string }) {
  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(path);
  if (!isImage) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-1.5 py-0.5 text-[10px] text-pink-300">
      <Image className="h-2.5 w-2.5" />
      image
    </span>
  );
}

