import * as React from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  FileCode2,
  Gauge,
  GitCompareArrows,
  MoreHorizontal,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Button, toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import type { JarvisCreatorKind } from '@/features/jarvis-creator/contracts';
import { MessageBubble } from '../MessageBubble';
import { MessagePart } from '../MessagePart';
import { AssistantActivityLedger } from '../activity-ledger/AssistantActivityLedger';
import type { ChatActivityEvent, ChatActivityStatus } from '../activity/types';
import {
  MAX_MOUNTED_BLOCKS,
  TRANSCRIPT_PAGE_SIZE,
  formatUnifiedDiffLines,
  projectAgenticTranscript,
  projectAgenticTranscriptWindow,
  summarizeAgenticSession,
  type AgenticSessionEvidence,
  type AgenticSessionSummary,
  type TranscriptBlock,
} from './projection';
import {
  CONSOLE_PREFERENCE_EVENT,
  CONSOLE_PROFILES,
  loadConsolePreferences,
  saveConsolePreferences,
  type ConsolePreferences,
  type ConsoleProfile,
} from './preferences';
import { PerceptibleAgentMotionIndicator, resolveAgentMotion } from './AgentMotionIndicator';
import { SubagentsHeaderButton } from './SubagentsMiniPanel';
import { buildChatSessionExport, downloadChatSessionExport } from './sessionExport';
import './agentic-console.css';

export interface AgenticConsoleProps {
  chatId: string;
  messages: readonly Message[];
  activity: readonly ChatActivityEvent[];
  compact?: boolean;
  creatorDraftKind?: JarvisCreatorKind;
  sessionEvidence?: AgenticSessionEvidence;
  headerProgress?: React.ReactNode;
  actions?: {
    cancel?: () => void | Promise<void>;
    retry?: () => void | Promise<void>;
    continue?: () => void | Promise<void>;
  };
}

type BoundaryProps = {
  children: React.ReactNode;
  fallback: React.ReactNode;
};

type BoundaryState = { failed: boolean };

export class AgenticConsoleErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch() {
    console.error('[AgenticConsole] Projection failed; restored classic transcript.');
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function useConsolePreferences(): [
  ConsolePreferences,
  (patch: Partial<ConsolePreferences>) => void,
] {
  const [preferences, setPreferences] = React.useState(loadConsolePreferences);
  React.useEffect(() => {
    const refresh = () => setPreferences(loadConsolePreferences());
    window.addEventListener(CONSOLE_PREFERENCE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CONSOLE_PREFERENCE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const update = React.useCallback(
    (patch: Partial<ConsolePreferences>) => {
      const next = { ...preferences, ...patch, version: 1 as const };
      saveConsolePreferences(next);
      setPreferences(next);
    },
    [preferences],
  );
  return [preferences, update];
}

function formatMetric(value: number | '—', suffix = ''): string {
  return value === '—' ? '—' : `${value.toLocaleString()}${suffix}`;
}

function formatDuration(durationMs: number | '—'): string {
  if (durationMs === '—') return '—';
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function statusLabel(status: AgenticSessionSummary['status']): string {
  if (status === 'queued') return 'Queued';
  if (status === 'planning') return 'Planning';
  if (status === 'running') return 'Running';
  if (status === 'blocked') return 'Blocked';
  if (status === 'partial') return 'Partial';
  if (status === 'error') return 'Failed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'recovering') return 'Recovering';
  if (status === 'done') return 'Complete';
  return 'Idle';
}

function HeaderProgressSlot({
  children,
  present,
  onPresenceChange,
}: {
  children: React.ReactNode;
  present: boolean;
  onPresenceChange: (present: boolean) => void;
}) {
  const slotRef = React.useRef<HTMLDivElement>(null);
  const updatePresence = React.useCallback(() => {
    onPresenceChange(Boolean(slotRef.current?.hasChildNodes()));
  }, [onPresenceChange]);

  React.useLayoutEffect(updatePresence);
  React.useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const observer = new MutationObserver(updatePresence);
    observer.observe(slot, { childList: true });
    return () => observer.disconnect();
  }, [updatePresence]);

  return (
    <div
      ref={slotRef}
      className={present ? 'agentic-session__progress' : undefined}
      hidden={!present}
    >
      {children}
    </div>
  );
}

function SessionHeader({
  chatId,
  summary,
  preferences,
  headerProgress,
  onPreferences,
  actions,
  onExpandAll,
  onCollapseAll,
  onCopySummary,
  onExport,
}: {
  chatId: string;
  summary: AgenticSessionSummary;
  preferences: ConsolePreferences;
  headerProgress?: React.ReactNode;
  onPreferences: (patch: Partial<ConsolePreferences>) => void;
  actions?: AgenticConsoleProps['actions'];
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onCopySummary: () => void;
  onExport: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [hasHeaderProgress, setHasHeaderProgress] = React.useState(false);
  const invoke = (action: (() => void | Promise<void>) | undefined) => {
    if (!action) return;
    const report = (error: unknown) => {
      toast.error('Run action failed', error instanceof Error ? error.message : 'Please retry.');
    };
    try {
      void Promise.resolve(action()).catch(report);
    } catch (error) {
      report(error);
    }
  };
  return (
    <header
      className="agentic-session"
      aria-label="Agentic session summary"
      data-testid="jarvis-session-panel"
      data-has-progress={hasHeaderProgress ? 'true' : undefined}
    >
      <div className="agentic-session__identity">
        <span className={cn('agentic-status-dot', `is-${summary.status}`)} aria-hidden="true" />
        <div className="agentic-session__title">
          <strong aria-label="Session status">{statusLabel(summary.status)}</strong>
          <span title={summary.currentOperation}>{summary.currentOperation}</span>
        </div>
      </div>
      <HeaderProgressSlot present={hasHeaderProgress} onPresenceChange={setHasHeaderProgress}>
        {headerProgress}
      </HeaderProgressSlot>
      <div className="agentic-session__metrics-row">
        <button
          type="button"
          className="agentic-session__metrics"
          aria-label="Open session details"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span>
            <FileCode2 aria-hidden="true" />
            {summary.fileCount} {summary.fileCount === 1 ? 'file' : 'files'}
          </span>
          <span className="is-add">+{summary.addedLines}</span>
          <span className="is-remove">-{summary.removedLines}</span>
          <span>{formatMetric(summary.tokenCount, ' tokens')}</span>
          <span title="Elapsed time">
            <Clock3 aria-hidden="true" />
            {formatDuration(summary.durationMs)}
          </span>
          <span className="agentic-session__model" title={summary.model}>
            {summary.model}
          </span>
        </button>
        <SubagentsHeaderButton chatId={chatId} />
      </div>
      <div className="agentic-session__actions">
        {actions?.continue ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Continue run"
            onClick={() => invoke(actions.continue)}
          >
            Continue
          </Button>
        ) : null}
        {actions?.retry ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Retry run"
            onClick={() => invoke(actions.retry)}
          >
            <RotateCcw />
          </Button>
        ) : null}
        {actions?.cancel ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel run"
            onClick={() => invoke(actions.cancel)}
          >
            <Circle />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Chat console settings"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Settings2 />
        </Button>
        {open ? (
          <div className="agentic-settings" role="dialog" aria-label="Chat console settings">
            <dl className="agentic-settings__evidence">
              <div>
                <dt>Model</dt>
                <dd>{summary.model}</dd>
              </div>
              <div>
                <dt>Context</dt>
                <dd>{summary.context}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>
                  {summary.startedAt === '—'
                    ? '—'
                    : new Date(summary.startedAt).toLocaleTimeString()}
                </dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(summary.durationMs)}</dd>
              </div>
            </dl>
            <label>
              <span>Console theme</span>
              <select
                aria-label="Console theme"
                value={preferences.profile}
                onChange={(event) =>
                  onPreferences({ profile: event.currentTarget.value as ConsoleProfile })
                }
              >
                {CONSOLE_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="agentic-settings__row">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Use classic chat view"
                onClick={() => onPreferences({ view: 'classic' })}
              >
                Classic view
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onPreferences({
                    density: preferences.density === 'compact' ? 'comfortable' : 'compact',
                  })
                }
              >
                {preferences.density === 'compact' ? 'Comfortable' : 'Compact'} density
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="agentic-settings__wide"
              onClick={() =>
                onPreferences({
                  caret: preferences.caret === 'block' ? 'standard' : 'block',
                })
              }
            >
              {preferences.caret === 'block' ? 'Use standard caret' : 'Use block caret'}
            </Button>
            <div className="agentic-settings__controls">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Expand all transcript details"
                onClick={onExpandAll}
              >
                Expand all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Collapse all transcript details"
                onClick={onCollapseAll}
              >
                Collapse all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Copy session summary"
                onClick={onCopySummary}
              >
                Copy summary
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Export session"
                onClick={onExport}
              >
                Export session
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function statusIcon(status: ChatActivityStatus) {
  if (status === 'done') return <Check aria-hidden="true" />;
  if (status === 'error') return <AlertCircle aria-hidden="true" />;
  if (status === 'running') return <Play aria-hidden="true" />;
  if (status === 'cancelled') return <RotateCcw aria-hidden="true" />;
  return <Circle aria-hidden="true" />;
}

function activityIcon(kind: string) {
  if (kind === 'file') return <FileCode2 aria-hidden="true" />;
  if (kind === 'url') return <Search aria-hidden="true" />;
  if (kind === 'agent' || kind === 'subagent') return <Bot aria-hidden="true" />;
  return <Wrench aria-hidden="true" />;
}

function PromptBand({ block }: { block: Extract<TranscriptBlock, { kind: 'prompt' }> }) {
  const [expanded, setExpanded] = React.useState(false);
  const long = block.text.length > 520 || block.text.split('\n').length > 8;
  return (
    <article className="agentic-prompt-band" data-message-id={block.message.id}>
      <div className="agentic-prompt-band__meta">
        <strong>You</strong>
        <time dateTime={new Date(block.message.created_at).toISOString()}>
          {new Date(block.message.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>
      <p className={cn('agentic-prompt-band__text', long && !expanded && 'is-clamped')}>
        {block.text}
      </p>
      {long ? (
        <button
          type="button"
          className="agentic-inline-action"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show preview' : 'Show full prompt'}
          {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        </button>
      ) : null}
    </article>
  );
}

function copyText(text: string) {
  void navigator.clipboard
    ?.writeText(text)
    .then(() => toast.success('Copied'))
    .catch(() => toast.error('Copy failed'));
}

function DiffView({
  block,
  compact,
}: {
  block: Extract<TranscriptBlock, { kind: 'diff' }>;
  compact?: boolean;
}) {
  const lines = React.useMemo(() => formatUnifiedDiffLines(block.diff), [block.diff]);
  const motion = resolveAgentMotion({
    status: block.status,
    activityCategory: block.activityCategory,
    activityKind: 'diff',
    title: block.title,
    filePath: block.filePath,
  });
  return (
    <article className="agentic-diff" aria-label={`Diff ${block.filePath ?? block.title}`}>
      <div className="agentic-block-head">
        <span>
          <PerceptibleAgentMotionIndicator motion={motion} compact={compact} />
          <GitCompareArrows aria-hidden="true" />
          <strong>{block.filePath ?? block.title}</strong>
        </span>
        <span className="agentic-block-head__metrics">
          {block.addedLines != null ? <b className="is-add">+{block.addedLines}</b> : null}
          {block.removedLines != null ? <b className="is-remove">-{block.removedLines}</b> : null}
          <button type="button" aria-label="Copy diff" onClick={() => copyText(block.diff)}>
            <Copy aria-hidden="true" />
          </button>
        </span>
      </div>
      <pre>
        {lines.map((line, index) => (
          <code
            key={`${index}:${line.text.slice(0, 20)}`}
            className={cn(
              'agentic-diff-line',
              line.kind === 'add' && 'agentic-diff-line--add',
              line.kind === 'remove' && 'agentic-diff-line--remove',
              line.kind === 'meta' && 'agentic-diff-line--meta',
            )}
          >
            <span className="agentic-diff-line__number" aria-hidden="true">
              {line.oldLine ?? ''}
            </span>
            <span className="agentic-diff-line__number" aria-hidden="true">
              {line.newLine ?? ''}
            </span>
            <span className="agentic-diff-line__text">{line.text || ' '}</span>
          </code>
        ))}
      </pre>
    </article>
  );
}

function BlockView({
  block,
  finalAnswerId,
  compact,
  creatorDraftKind,
}: {
  block: TranscriptBlock;
  finalAnswerId?: string;
  compact?: boolean;
  creatorDraftKind?: JarvisCreatorKind;
}) {
  if (block.kind === 'prompt') return <PromptBand block={block} />;
  if (block.kind === 'answer') {
    return (
      <article
        className={cn('agentic-answer', block.id === finalAnswerId && 'is-final')}
        data-message-id={block.message.id}
      >
        <div className="agentic-answer__meta">
          <Sparkles aria-hidden="true" />
          <strong>{block.id === finalAnswerId ? 'Final response' : 'Assistant'}</strong>
          {block.message.usage?.model ? <span>{block.message.usage.model}</span> : null}
        </div>
        <div className="agentic-answer__text">{block.text}</div>
      </article>
    );
  }
  if (block.kind === 'reasoning') {
    return (
      <details className="agentic-reasoning">
        <summary>
          <Gauge aria-hidden="true" />
          Reasoning
        </summary>
        <p>{block.text}</p>
      </details>
    );
  }
  if (block.kind === 'activity') {
    // Chat-level lifecycle events do not have durable assistant-message
    // correlation. Render them once in the current turn activity ledger instead of
    // manufacturing a wall of standalone assistant/status messages.
    return null;
  }
  if (block.kind === 'diff') return null;
  // Persisted command/tool payloads are represented by the privacy-safe
  // AssistantActivityLedger at their message boundary. Never expose their
  // arguments, command text, stdout, stderr, environment, or raw results here.
  if (block.kind === 'command' || block.kind === 'tool') return null;
  return (
    <div className="agentic-legacy" data-agentic-fallback="structured-message">
      <MessageBubble
        message={block.message}
        compact={compact}
        creatorDraftKind={creatorDraftKind}
      />
    </div>
  );
}

function isInlineLedgerLegacyBlock(block: TranscriptBlock, latestUserTurnStartedAt: number) {
  if (
    block.kind !== 'legacy' ||
    block.message.role !== 'assistant' ||
    block.message.created_at < latestUserTurnStartedAt
  ) {
    return false;
  }
  const hasProse = block.message.parts.some(
    (part) => part.kind === 'text' && part.text.trim().length > 0,
  );
  const hasContextReferences = block.message.parts.some(
    (part) => part.kind === 'jarvis_source_ref',
  );
  const canSplitWithoutChangingInteractiveContent = block.message.parts.every(
    (part) =>
      part.kind === 'text' ||
      part.kind === 'jarvis_source_ref' ||
      part.kind === 'tool_call' ||
      part.kind === 'tool_result',
  );
  return hasProse && hasContextReferences && canSplitWithoutChangingInteractiveContent;
}

function SessionCompletionInspector({ summary }: { summary: AgenticSessionSummary }) {
  const terminal = new Set<AgenticSessionSummary['status']>([
    'done',
    'blocked',
    'partial',
    'error',
    'cancelled',
  ]).has(summary.status);
  if (!terminal) return null;

  const outcome =
    summary.status === 'done'
      ? {
          done: 'Response complete',
          next: 'Awaiting your next request',
          blockers: 'None',
          className: 'is-done',
        }
      : summary.status === 'blocked'
        ? {
            done: 'Run stopped',
            next: 'Blocker resolution required',
            blockers: 'Blocked state recorded',
            className: 'is-blocked',
          }
        : summary.status === 'error'
          ? {
              done: 'Run ended',
              next: 'Review before retrying',
              blockers: 'Run error recorded',
              className: 'is-blocked',
            }
          : summary.status === 'cancelled'
            ? {
                done: 'Run cancelled',
                next: 'Awaiting your next request',
                blockers: 'Not reported',
                className: 'is-blocked',
              }
            : {
                done: 'Partial completion recorded',
                next: 'Continuation available',
                blockers: 'Not reported',
                className: 'is-blocked',
              };

  const items = [
    { label: 'Done', text: outcome.done, icon: Check, className: outcome.className },
    { label: 'Doing now', text: 'No active work', icon: Clock3, className: undefined },
    { label: 'Next', text: outcome.next, icon: ChevronRight, className: undefined },
    {
      label: 'Blockers',
      text: outcome.blockers,
      icon: AlertCircle,
      className: outcome.blockers === 'None' ? undefined : 'is-blocked',
    },
  ] as const;

  return (
    <section
      className="agentic-completion-inspector"
      role="status"
      aria-label="Session completion status"
      aria-live="polite"
      data-terminal-status={summary.status}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={cn('agentic-completion-inspector__item', item.className)}
          >
            <strong>
              <Icon aria-hidden="true" />
              {item.label}
            </strong>
            <span>{item.text}</span>
          </div>
        );
      })}
    </section>
  );
}

export function AgenticConsole({
  chatId,
  messages,
  activity,
  compact = false,
  creatorDraftKind,
  sessionEvidence,
  headerProgress,
  actions,
}: AgenticConsoleProps) {
  const [preferences, updatePreferences] = useConsolePreferences();
  const [mountedCount, setMountedCount] = React.useState(MAX_MOUNTED_BLOCKS);
  const rootRef = React.useRef<HTMLElement>(null);
  const transcriptWindow = React.useMemo(
    () =>
      projectAgenticTranscriptWindow(messages, activity, mountedCount, {
        preserveAssistantMessages: creatorDraftKind != null,
      }),
    [messages, activity, mountedCount, creatorDraftKind],
  );
  const blocks = transcriptWindow.visible;
  const summary = React.useMemo(
    () => summarizeAgenticSession(messages, activity, sessionEvidence),
    [messages, activity, sessionEvidence],
  );
  const finalAnswerId = [...blocks].reverse().find((block) => block.kind === 'answer')?.id;
  const latestUserTurnStartedAt = React.useMemo(
    () =>
      messages.reduce(
        (latest, message) =>
          message.role === 'user' ? Math.max(latest, message.created_at) : latest,
        Number.NEGATIVE_INFINITY,
      ),
    [messages],
  );
  const turnActivity = React.useMemo(
    () => activity.filter((event) => (event.startedAt ?? event.ts) >= latestUserTurnStartedAt),
    [activity, latestUserTurnStartedAt],
  );
  const hasTurnToolEvidence = React.useMemo(
    () =>
      messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.created_at >= latestUserTurnStartedAt &&
          message.parts.some((part) => part.kind === 'tool_call' || part.kind === 'tool_result'),
      ),
    [latestUserTurnStartedAt, messages],
  );
  const turnAuthoritativeDurationMs =
    typeof summary.durationMs === 'number' &&
    summary.durationMs > 0 &&
    typeof summary.startedAt === 'number' &&
    summary.startedAt >= latestUserTurnStartedAt
      ? summary.durationMs
      : undefined;
  const sessionIsActive =
    summary.status === 'queued' ||
    summary.status === 'planning' ||
    summary.status === 'running' ||
    summary.status === 'recovering';
  const latestActiveEvidenceAt = React.useMemo(
    () =>
      turnActivity.reduce(
        (latest, event) =>
          event.status === 'running' || event.status === 'pending'
            ? Math.max(latest, event.startedAt ?? event.ts)
            : latest,
        Number.NEGATIVE_INFINITY,
      ),
    [turnActivity],
  );
  const latestAssistantMessageId = React.useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === 'assistant' &&
            message.created_at >= latestUserTurnStartedAt &&
            message.updated_at >= latestActiveEvidenceAt,
        )?.id,
    [latestActiveEvidenceAt, latestUserTurnStartedAt, messages],
  );
  const turnActivityMessage = React.useMemo<Message | undefined>(() => {
    // Durable assistant message parts own their own response-phase ledgers.
    // Uncorrelated live events get one latest-turn fallback only when no such
    // evidence exists, preventing duplicate or guessed receipts.
    if (turnActivity.length === 0 || hasTurnToolEvidence) return undefined;
    let startedAt = turnActivity[0]!.startedAt ?? turnActivity[0]!.ts;
    let updatedAt = turnActivity[0]!.endedAt ?? turnActivity[0]!.ts;
    for (let index = 1; index < turnActivity.length; index += 1) {
      const event = turnActivity[index]!;
      const eventStartedAt = event.startedAt ?? event.ts;
      const eventUpdatedAt = event.endedAt ?? event.ts;
      if (eventStartedAt < startedAt) startedAt = eventStartedAt;
      if (eventUpdatedAt > updatedAt) updatedAt = eventUpdatedAt;
    }
    return {
      id: `session-activity:${chatId}` as Message['id'],
      chat_id: chatId as Message['chat_id'],
      role: 'assistant',
      // Activity events are not durably correlated to one assistant message.
      // Bound the fallback to the latest user turn without guessing a phase.
      parts: [],
      created_at: startedAt,
      updated_at: updatedAt,
    };
  }, [chatId, hasTurnToolEvidence, turnActivity]);
  const inlineLedgerLegacyBlock = React.useMemo(
    () =>
      [...blocks]
        .reverse()
        .find((block) => isInlineLedgerLegacyBlock(block, latestUserTurnStartedAt)),
    [blocks, latestUserTurnStartedAt],
  );
  const inlineLedgerLegacyId = inlineLedgerLegacyBlock?.id;
  const inlineLedgerSourceId = inlineLedgerLegacyBlock?.sourceId;
  const loadCount = Math.min(TRANSCRIPT_PAGE_SIZE, transcriptWindow.remaining);
  const messagesBySource = React.useMemo(
    () =>
      new Map<string, Message>(
        messages.map((message) => [`message:${String(message.id)}`, message] as const),
      ),
    [messages],
  );
  const lastVisibleIndexBySource = React.useMemo(() => {
    const indexes = new Map<string, number>();
    blocks.forEach((block, index) => indexes.set(block.sourceId, index));
    return indexes;
  }, [blocks]);

  React.useEffect(() => {
    document.documentElement.dataset.agenticConsoleCaret =
      preferences.view === 'agentic' ? preferences.caret : 'standard';
  }, [preferences.caret, preferences.view]);

  const setDetailsOpen = (open: boolean) => {
    rootRef.current?.querySelectorAll<HTMLDetailsElement>('details').forEach((details) => {
      details.open = open;
    });
  };

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 't')
        return;
      const target = event.target;
      if (
        (target instanceof Element &&
          target.matches('input, textarea, select, [contenteditable="true"]')) ||
        !rootRef.current?.isConnected
      ) {
        return;
      }
      const details = [...rootRef.current.querySelectorAll<HTMLDetailsElement>('details')];
      if (details.length === 0) return;
      event.preventDefault();
      const nextOpen = details.some((detail) => !detail.open);
      details.forEach((detail) => {
        detail.open = nextOpen;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const summaryText = [
    `Status: ${statusLabel(summary.status)}`,
    `Operation: ${summary.currentOperation}`,
    `Files: ${summary.fileCount}`,
    `Changes: +${summary.addedLines} -${summary.removedLines}`,
    `Tokens: ${formatMetric(summary.tokenCount)}`,
    `Model: ${summary.model}`,
    `Duration: ${formatDuration(summary.durationMs)}`,
  ].join('\n');
  const exportSession = () => {
    const exportBlocks = projectAgenticTranscript(messages, activity, {
      preserveAssistantMessages: creatorDraftKind != null,
    }).map((block) => {
      if ('message' in block) {
        const { message: _message, ...safeBlock } = block;
        if (block.kind === 'legacy') {
          return {
            ...safeBlock,
            note: 'Structured message content remains in canonical chat storage.',
          };
        }
        return safeBlock;
      }
      return block;
    });
    // Per-chat lightweight log: full messages for this chatId + projection blocks.
    downloadChatSessionExport(
      buildChatSessionExport({
        chatId,
        messages,
        summary,
        blocks: exportBlocks,
      }),
    );
  };

  if (preferences.view === 'classic') {
    return (
      <div className="agentic-view-notice" role="status">
        <span>Classic chat view selected.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => updatePreferences({ view: 'agentic' })}
        >
          Use agentic console
        </Button>
      </div>
    );
  }

  // Empty idle chats: do not double empty-state. Once there are messages,
  // activity, or run evidence, always mount the session mini command center.
  const hasTranscriptWork =
    messages.length > 0 ||
    activity.length > 0 ||
    Boolean(sessionEvidence) ||
    transcriptWindow.total > 0;
  if (!hasTranscriptWork) return null;

  return (
    <section
      ref={rootRef}
      role="region"
      aria-label="Agentic chat console"
      data-agentic-console
      data-console-theme={preferences.profile}
      data-console-density={preferences.density}
      data-console-caret={preferences.caret}
      data-chat-id={chatId}
      className={cn('agentic-console', compact && 'is-compact')}
    >
      <SessionHeader
        chatId={chatId}
        summary={summary}
        preferences={preferences}
        headerProgress={headerProgress}
        onPreferences={updatePreferences}
        actions={actions}
        onExpandAll={() => setDetailsOpen(true)}
        onCollapseAll={() => setDetailsOpen(false)}
        onCopySummary={() => copyText(summaryText)}
        onExport={exportSession}
      />
      {blocks.length > 0 ? (
        <div className="agentic-transcript" aria-label="Agentic transcript">
          {transcriptWindow.remaining > 0 ? (
            <button
              type="button"
              className="agentic-history"
              aria-label={`Load ${loadCount} older events`}
              onClick={() => setMountedCount((count) => count + TRANSCRIPT_PAGE_SIZE)}
            >
              <MoreHorizontal aria-hidden="true" />
              Load {loadCount} older events
            </button>
          ) : null}
          {blocks.map((block, index) => {
            const sourceMessage = messagesBySource.get(block.sourceId);
            const inlineLegacyMessage =
              block.id === inlineLedgerLegacyId && block.kind === 'legacy'
                ? block.message
                : undefined;
            const inlineContextReferences = inlineLegacyMessage?.parts.filter(
              (part) => part.kind === 'jarvis_source_ref',
            );
            const showLedger =
              block.kind !== 'legacy' &&
              block.sourceId !== inlineLedgerSourceId &&
              sourceMessage?.role === 'assistant' &&
              lastVisibleIndexBySource.get(block.sourceId) === index &&
              sourceMessage.parts.some(
                (part) => part.kind === 'tool_call' || part.kind === 'tool_result',
              );
            return (
              <React.Fragment key={block.id}>
                {inlineLegacyMessage ? (
                  <div className="agentic-legacy" data-agentic-fallback="structured-message">
                    <MessageBubble
                      message={{
                        ...inlineLegacyMessage,
                        parts: inlineLegacyMessage.parts.filter((part) => part.kind === 'text'),
                      }}
                      compact={compact}
                      creatorDraftKind={creatorDraftKind}
                    />
                  </div>
                ) : (
                  <BlockView
                    block={block}
                    finalAnswerId={finalAnswerId}
                    compact={compact}
                    creatorDraftKind={creatorDraftKind}
                  />
                )}
                {showLedger ? (
                  <AssistantActivityLedger
                    message={sourceMessage}
                    compact={compact}
                    active={sessionIsActive && sourceMessage.id === latestAssistantMessageId}
                  />
                ) : null}
                {inlineLegacyMessage ? (
                  <AssistantActivityLedger
                    message={inlineLegacyMessage}
                    compact={compact}
                    active={sessionIsActive && inlineLegacyMessage.id === latestAssistantMessageId}
                  />
                ) : null}
                {(block.id === inlineLedgerLegacyId ||
                  (!inlineLedgerLegacyId && block.id === finalAnswerId)) &&
                turnActivityMessage ? (
                  <AssistantActivityLedger
                    message={turnActivityMessage}
                    correlatedEvents={turnActivity}
                    authoritativeDurationMs={turnAuthoritativeDurationMs}
                    compact={compact}
                    active={sessionIsActive}
                  />
                ) : null}
                {inlineLegacyMessage && inlineContextReferences?.length ? (
                  <div
                    className="agentic-context-references"
                    aria-label="Assistant context references"
                  >
                    {inlineContextReferences.map((part, partIndex) => (
                      <MessagePart
                        key={`${part.source.id}:${partIndex}`}
                        part={part}
                        allParts={inlineLegacyMessage.parts}
                        messageId={inlineLegacyMessage.id}
                        chatId={inlineLegacyMessage.chat_id}
                      />
                    ))}
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
          {turnActivityMessage && !inlineLedgerLegacyId && !finalAnswerId ? (
            <AssistantActivityLedger
              message={turnActivityMessage}
              correlatedEvents={turnActivity}
              authoritativeDurationMs={turnAuthoritativeDurationMs}
              compact={compact}
              active={sessionIsActive}
            />
          ) : null}
        </div>
      ) : null}
      <SessionCompletionInspector summary={summary} />
    </section>
  );
}
