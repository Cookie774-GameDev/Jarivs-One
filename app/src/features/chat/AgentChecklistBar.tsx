import * as React from 'react';
import { CheckCircle2, ChevronDown, Circle, LoaderCircle, TriangleAlert } from 'lucide-react';
import { WarmHexProgress } from '@/components/progress/WarmHexProgress';
import { cn } from '@/lib/utils';
import type { JarvisEvent, JarvisRun } from '@/lib/jarvis/contracts/execution';
import type { Message } from '@/types';

type ChecklistStatus = 'pending' | 'running' | 'completed' | 'attention';

export interface AgentChecklistItem {
  id: string;
  label: string;
  status: ChecklistStatus;
}

export async function readBoundedAgentChecklistEvidence(
  loadPage: (afterSeq: number, limit: number) => Promise<readonly JarvisEvent[]>,
): Promise<{
  events: readonly JarvisEvent[];
  coverageComplete: boolean;
  coverageTruncated: boolean;
}> {
  const events: JarvisEvent[] = [];
  let afterSeq = 0;
  for (let pageNumber = 0; pageNumber < 40; pageNumber += 1) {
    const page = await loadPage(afterSeq, 500);
    events.push(...page);
    if (page.length < 500) {
      return { events, coverageComplete: true, coverageTruncated: false };
    }
    afterSeq = page[page.length - 1]?.seq ?? afterSeq;
  }
  const beyondBound = await loadPage(afterSeq, 1);
  return {
    events,
    coverageComplete: beyondBound.length === 0,
    coverageTruncated: beyondBound.length > 0,
  };
}

function eventStepEvidence(event: JarvisEvent): { stepId: string; status: ChecklistStatus } | null {
  const result = event.canonicalResultEvidence;
  if (result?.stepId) {
    return {
      stepId: result.stepId,
      status: result.state === 'completed' ? 'completed' : 'attention',
    };
  }
  const producer = event.producerSourceEvidence;
  if (producer?.producerKind === 'hive') {
    return {
      stepId: producer.producerIdentity.stepId,
      status:
        producer.phase === 'result'
          ? producer.state === 'completed'
            ? 'completed'
            : 'attention'
          : 'running',
    };
  }
  return null;
}

function boundedChecklistLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.replace(/\s+/gu, ' ').trim();
  return label ? label.slice(0, 500) : undefined;
}

function openCodeChecklistStatus(value: unknown): ChecklistStatus {
  if (typeof value !== 'string') return 'pending';
  switch (
    value
      .trim()
      .toLocaleLowerCase('en-US')
      .replace(/[\s-]+/gu, '_')
  ) {
    case 'completed':
    case 'complete':
    case 'done':
      return 'completed';
    case 'in_progress':
    case 'running':
    case 'active':
      return 'running';
    case 'blocked':
    case 'failed':
    case 'error':
    case 'cancelled':
    case 'canceled':
      return 'attention';
    default:
      return 'pending';
  }
}

function checklistItemsFromToolCall(
  part: Extract<Message['parts'][number], { kind: 'tool_call' }>,
): Readonly<{
  recognized: boolean;
  items: readonly AgentChecklistItem[];
  coverageTruncated: boolean;
}> {
  const tool = part.tool.trim().toLocaleLowerCase('en-US');
  if (tool !== 'todo' && tool !== 'todowrite') {
    return { recognized: false, items: [], coverageTruncated: false };
  }
  const candidate = part.args.todos ?? part.args.items ?? part.args.tasks;
  if (!Array.isArray(candidate)) {
    return { recognized: false, items: [], coverageTruncated: false };
  }
  const items = candidate.slice(0, 100).flatMap((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    const label = boundedChecklistLabel(
      record.content ?? record.title ?? record.label ?? record.description,
    );
    if (!label) return [];
    const id = boundedChecklistLabel(record.id) ?? `${part.call_id}:${index}`;
    return [{ id, label, status: openCodeChecklistStatus(record.status ?? record.state) }];
  });
  return { recognized: true, items, coverageTruncated: candidate.length > 100 };
}

export function deriveOpenCodeChecklistEvidence(messages: readonly Message[]): Readonly<{
  items: readonly AgentChecklistItem[];
  coverageComplete: boolean;
  coverageTruncated: boolean;
}> {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (!message || (message.role !== 'assistant' && message.role !== 'agent')) continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part?.kind !== 'tool_call') continue;
      const evidence = checklistItemsFromToolCall(part);
      if (!evidence.recognized) continue;
      return {
        items: evidence.items,
        coverageComplete: !evidence.coverageTruncated,
        coverageTruncated: evidence.coverageTruncated,
      };
    }
  }
  return { items: [], coverageComplete: true, coverageTruncated: false };
}

export function deriveOpenCodeChecklist(
  messages: readonly Message[],
): readonly AgentChecklistItem[] {
  return deriveOpenCodeChecklistEvidence(messages).items;
}

export function deriveAgentChecklist(
  run: JarvisRun | undefined,
  events: readonly JarvisEvent[],
  messages: readonly Message[] = [],
): readonly AgentChecklistItem[] {
  const steps = run?.hiveStackPlan?.steps ?? [];
  if (!steps.length) return deriveOpenCodeChecklist(messages);
  const statusByStep = new Map<string, ChecklistStatus>();
  for (const event of events) {
    if (event.runId !== run?.id) continue;
    const evidence = eventStepEvidence(event);
    if (!evidence) continue;
    const current = statusByStep.get(evidence.stepId);
    if (current === 'completed' || current === 'attention') continue;
    statusByStep.set(evidence.stepId, evidence.status);
  }
  return steps.map((step) => ({
    id: step.stepId,
    label: step.label,
    status: statusByStep.get(step.stepId) ?? 'pending',
  }));
}

export function AgentChecklistBar({
  run,
  events,
  coverageComplete = true,
  coverageTruncated = false,
  compact = false,
  embedded = false,
  messages = [],
}: {
  run: JarvisRun | undefined;
  events: readonly JarvisEvent[];
  coverageComplete?: boolean;
  coverageTruncated?: boolean;
  compact?: boolean;
  embedded?: boolean;
  messages?: readonly Message[];
}) {
  const [expanded, setExpanded] = React.useState(false);
  const listId = React.useId();
  const openCodeEvidence = React.useMemo(
    () => deriveOpenCodeChecklistEvidence(messages),
    [messages],
  );
  const items = React.useMemo(
    () => deriveAgentChecklist(run, events, messages),
    [events, messages, run],
  );
  if (!items.length) return null;

  const completed = items.filter((item) => item.status === 'completed').length;
  const attention = items.filter((item) => item.status === 'attention').length;
  const settled = items.filter(
    (item) => item.status === 'completed' || item.status === 'attention',
  ).length;
  const active = items.find((item) => item.status === 'running');
  const hasCanonicalHivePlan = Boolean(run?.hiveStackPlan?.steps.length);
  const checklistCoverageComplete = hasCanonicalHivePlan
    ? coverageComplete
    : openCodeEvidence.coverageComplete;
  const checklistCoverageTruncated = hasCanonicalHivePlan
    ? coverageTruncated
    : openCodeEvidence.coverageTruncated;
  const progress = checklistCoverageComplete ? (settled / items.length) * 100 : null;
  const runActive =
    run?.status === 'queued' || run?.status === 'compiling' || run?.status === 'running';
  const detail = checklistCoverageComplete
    ? `${completed} completed${attention ? ` · ${attention} need attention` : ''} · ${settled} of ${items.length} settled${active ? ` · ${active.label}` : ''}`
    : checklistCoverageTruncated
      ? `Live checklist · history exceeds the bounded evidence window${active ? ` · ${active.label}` : ''}`
      : `Live checklist · earlier step history is still reconciling${active ? ` · ${active.label}` : ''}`;

  return (
    <section
      data-agent-checklist-bar
      data-checklist-placement={embedded ? 'command-header' : 'standalone'}
      className={cn(
        embedded
          ? 'relative min-w-0 w-full'
          : 'sticky top-0 z-30 mx-auto w-full border-b border-border/65 bg-paper-soft/90 px-3 py-2 shadow-sm backdrop-blur-xl',
        !embedded && (compact ? 'max-w-full' : 'max-w-[1600px]'),
      )}
      aria-label="Agent checklist"
    >
      <div className="relative">
        <WarmHexProgress
          progress={progress}
          label="Agent checklist"
          detail={detail}
          mode="compact"
          paused={!runActive}
        />
        <button
          type="button"
          className="absolute inset-0 rounded-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-copper/70"
          aria-label={expanded ? 'Collapse agent checklist' : 'Expand agent checklist'}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute right-6 top-1/2 h-4 w-4 -translate-y-1/2 text-[#ffd6b5] transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </div>
      {expanded ? (
        <ol
          id={listId}
          className="mt-2 grid gap-1 rounded-xl border border-border/70 bg-paper/90 p-2"
        >
          {items.map((item) => {
            const Icon =
              item.status === 'completed'
                ? CheckCircle2
                : item.status === 'attention'
                  ? TriangleAlert
                  : item.status === 'running'
                    ? LoaderCircle
                    : Circle;
            return (
              <li
                key={item.id}
                className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-secondary text-foreground"
                data-checklist-step-status={item.status}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    item.status === 'running' &&
                      'animate-spin text-accent-copper motion-reduce:animate-none',
                    item.status === 'completed' && 'text-emerald-600',
                    item.status === 'attention' && 'text-amber-600',
                    item.status === 'pending' && 'text-muted-foreground',
                  )}
                />
                <span className="truncate">{item.label}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
