import type { EventCreateInput } from '@/lib/db/repositories';
import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import type { EventRow } from '@/types/event';
import type { AgentId, WorkspaceId } from '@/types/common';

export type JarvisScheduleRecurrence =
  | 'once'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'weekdays'
  | 'custom_interval'
  | 'custom_days';

export interface JarvisScheduleMetadata {
  kind: 'jarvis_schedule';
  prompt: string;
  recurrence: JarvisScheduleRecurrence;
  modelSelection: ChatModelSelection;
  agentId: AgentId | string;
  createdBy: 'jarvis' | 'user';
  lastRunAt?: number;
  nextRunAt?: number;
  /** Dedicated chat that collects this action's outputs. Created on first run. */
  outputChatId?: string;
  runHistory: Array<{ at: number; status: 'success' | 'error'; summary?: string }>;
  errorHistory: Array<{ at: number; error: string }>;
}

/**
 * Persist updated Jarvis schedule metadata back onto an event row while
 * preserving the rest of the source_ref payload. History arrays are capped so
 * long-lived recurring actions cannot grow the row without bound.
 */
export const JARVIS_SCHEDULE_HISTORY_CAP = 20;

export function withJarvisScheduleMetadata(event: EventRow, metadata: JarvisScheduleMetadata): Partial<EventRow> {
  const bounded: JarvisScheduleMetadata = {
    ...metadata,
    runHistory: metadata.runHistory.slice(-JARVIS_SCHEDULE_HISTORY_CAP),
    errorHistory: metadata.errorHistory.slice(-JARVIS_SCHEDULE_HISTORY_CAP),
  };
  return {
    source_ref: {
      ...event.source_ref,
      context: {
        kind: event.source_ref?.context?.kind ?? 'memory',
        ...event.source_ref?.context,
        id: serializeJarvisScheduleMetadata(bounded),
      },
    },
  };
}

export function serializeJarvisScheduleMetadata(metadata: JarvisScheduleMetadata): string {
  return `jarvis_schedule:${JSON.stringify(metadata)}`;
}

export function parseJarvisScheduleMetadata(event: EventRow): JarvisScheduleMetadata | null {
  const raw = event.source_ref?.context?.id;
  if (!raw?.startsWith('jarvis_schedule:')) return null;
  try {
    const parsed = JSON.parse(raw.slice('jarvis_schedule:'.length)) as JarvisScheduleMetadata;
    return parsed?.kind === 'jarvis_schedule' ? parsed : null;
  } catch {
    return null;
  }
}

export function isJarvisScheduleEvent(event: EventRow): boolean {
  return event.source === 'ai' && (
    Boolean(parseJarvisScheduleMetadata(event)) ||
    Boolean(event.source_ref?.context?.id?.startsWith('jarvis_schedule:'))
  );
}

export function recurrenceToRule(recurrence: JarvisScheduleRecurrence): string | undefined {
  if (recurrence === 'once') return undefined;
  if (recurrence === 'custom_interval') return 'custom_interval';
  if (recurrence === 'custom_days') return 'custom_days';
  return recurrence;
}

export function buildJarvisScheduleEventInput(input: {
  workspaceId: WorkspaceId;
  createdBy: string;
  title: string;
  prompt: string;
  startAt: number;
  durationMs?: number;
  recurrence: JarvisScheduleRecurrence;
  timezone: string;
  modelSelection: ChatModelSelection;
  agentId: AgentId | string;
  projectId?: string;
}): EventCreateInput {
  const cleanTitle = input.title.trim() || 'Jarvis task';
  const metadata: JarvisScheduleMetadata = {
    kind: 'jarvis_schedule',
    prompt: input.prompt.trim(),
    recurrence: input.recurrence,
    modelSelection: input.modelSelection,
    agentId: input.agentId,
    createdBy: input.createdBy.startsWith('agt_') || input.createdBy.includes('jarvis') ? 'jarvis' : 'user',
    nextRunAt: input.startAt,
    runHistory: [],
    errorHistory: [],
  };
  return {
    workspace_id: input.workspaceId,
    ...(input.projectId ? { project_id: input.projectId as never } : {}),
    title: `Jarvis Scheduled — ${cleanTitle}`,
    description: input.prompt.trim(),
    start_at: input.startAt,
    end_at: input.startAt + (input.durationMs ?? 30 * 60 * 1000),
    all_day: false,
    timezone: input.timezone,
    source: 'ai',
    source_ref: {
      context: {
        kind: 'memory',
        id: serializeJarvisScheduleMetadata(metadata),
        excerpt: input.prompt.trim(),
      },
    },
    recurrence_rule: recurrenceToRule(input.recurrence),
    reminders: [],
    status: 'scheduled',
    color_hue: 265,
    created_by: input.createdBy,
  };
}

export function findScheduleConflicts(events: EventRow[], startAt: number, endAt: number): EventRow[] {
  return events.filter((event) => (
    event.status !== 'cancelled' &&
    event.start_at < endAt &&
    event.end_at > startAt
  ));
}

export function scheduleActionSummary(action: 'created' | 'paused' | 'resumed' | 'deleted', event: Pick<EventRow, 'title'>): string {
  const verb = action === 'created' ? 'Created' : action === 'paused' ? 'Paused' : action === 'resumed' ? 'Resumed' : 'Deleted';
  return `${verb} ${event.title}.`;
}
