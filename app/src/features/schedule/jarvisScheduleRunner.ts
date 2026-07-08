/**
 * Executor for scheduled Jarvis Actions.
 *
 * A Jarvis Action is an event row carrying `jarvis_schedule` metadata: a
 * prompt, a model selection, and a recurrence. Until this runner existed the
 * schedule could *store* those actions but nothing ever fired them. The
 * runner polls Dexie for due actions while the app is open, sends each due
 * prompt to Jarvis in a dedicated per-action output chat, advances
 * `nextRunAt` for recurring actions, and records bounded run/error history.
 *
 * Duplicate prevention: a run is claimed in-memory (`eventId:dueAt`) before
 * dispatch and the persisted metadata is advanced before the send, so
 * overlapping ticks or focus events can never double-fire one occurrence.
 *
 * Catch-up policy: if the app was closed at the scheduled time, a missed
 * occurrence still runs on next launch when it is less than
 * `JARVIS_SCHEDULE_CATCH_UP_MS` old. Older misses are recorded honestly in
 * `errorHistory` and the schedule advances to its next occurrence instead of
 * replaying a stale backlog.
 */
import {
  chatRepo as realChatRepo,
  eventRepo as realEventRepo,
  messageRepo as realMessageRepo,
} from '@/lib/db/repositories';
import { newChatId } from '@/lib/ids';
import { useAuthStore } from '@/stores/auth';
import type { EventRow } from '@/types/event';
import type { ChatId, WorkspaceId } from '@/types/common';
import { expandRecurrence } from './recurrence';
import {
  isJarvisScheduleEvent,
  parseJarvisScheduleMetadata,
  withJarvisScheduleMetadata,
  type JarvisScheduleMetadata,
} from './jarvisSchedules';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Missed occurrences older than this are logged and skipped, not replayed. */
export const JARVIS_SCHEDULE_CATCH_UP_MS = 6 * 60 * 60 * 1000;

/** How often the runner re-checks for due actions while the app is open. */
export const JARVIS_SCHEDULE_POLL_MS = 30_000;

export interface JarvisScheduleRunnerDeps {
  listEvents: (workspaceId: WorkspaceId) => Promise<EventRow[]>;
  updateEvent: (id: EventRow['id'], patch: Partial<EventRow>) => Promise<unknown>;
  createChat: (input: {
    id: ChatId;
    workspace_id: WorkspaceId;
    project_id?: EventRow['project_id'];
    title: string;
    mode: 'chat';
    active_agent_ids: never[];
  }) => Promise<unknown>;
  createMessage: (input: {
    chat_id: ChatId;
    role: 'user';
    parts: Array<{ kind: 'text'; text: string }>;
  }) => Promise<unknown>;
  dispatchEvent: (event: CustomEvent) => void;
  now: () => number;
}

function defaultDeps(): JarvisScheduleRunnerDeps {
  return {
    listEvents: (workspaceId) => realEventRepo.list({ workspace_id: workspaceId }),
    updateEvent: (id, patch) => realEventRepo.update(id, patch),
    createChat: (input) => realChatRepo.create(input),
    createMessage: (input) => realMessageRepo.create(input),
    dispatchEvent: (event) => window.dispatchEvent(event),
    now: () => Date.now(),
  };
}

/**
 * Next occurrence strictly after `afterMs`, using the same expansion engine
 * as the timeline so the runner and the UI always agree. Returns null for
 * one-shot actions (and for legacy custom_* codes the engine cannot expand).
 */
export function computeNextJarvisRunAt(event: EventRow, afterMs: number): number | null {
  const horizon = afterMs + 62 * DAY_MS;
  const instances = expandRecurrence(event, afterMs + 1, horizon);
  const next = instances.find((instance) => instance.instanceStartMs > afterMs);
  return next ? next.instanceStartMs : null;
}

export interface JarvisScheduleRunResult {
  ran: string[];
  missed: string[];
  checked: number;
}

/** In-memory claim of dispatched occurrences: `${eventId}:${dueAt}`. */
const claimedRuns = new Set<string>();
const CLAIMED_RUNS_CAP = 500;

function claimRun(key: string): boolean {
  if (claimedRuns.has(key)) return false;
  if (claimedRuns.size >= CLAIMED_RUNS_CAP) claimedRuns.clear();
  claimedRuns.add(key);
  return true;
}

function outputChatTitle(event: EventRow): string {
  const title = event.title.replace(/^Jarvis Scheduled\s+—\s+/, '').trim() || 'Jarvis task';
  return `Jarvis Action — ${title}`.slice(0, 96);
}

async function ensureOutputChat(
  event: EventRow,
  metadata: JarvisScheduleMetadata,
  deps: JarvisScheduleRunnerDeps,
): Promise<string> {
  if (metadata.outputChatId) return metadata.outputChatId;
  const chatId = newChatId();
  await deps.createChat({
    id: chatId,
    workspace_id: event.workspace_id,
    project_id: event.project_id,
    title: outputChatTitle(event),
    mode: 'chat',
    active_agent_ids: [],
  });
  return String(chatId);
}

/**
 * Check every Jarvis schedule in the workspace and fire the due ones.
 * Safe to call repeatedly; occurrences are claimed before dispatch.
 */
export async function runDueJarvisSchedules(
  workspaceId: WorkspaceId,
  deps: JarvisScheduleRunnerDeps = defaultDeps(),
): Promise<JarvisScheduleRunResult> {
  const result: JarvisScheduleRunResult = { ran: [], missed: [], checked: 0 };
  const now = deps.now();
  let events: EventRow[];
  try {
    events = await deps.listEvents(workspaceId);
  } catch {
    return result;
  }

  for (const event of events) {
    if (event.status !== 'scheduled' || !isJarvisScheduleEvent(event)) continue;
    const metadata = parseJarvisScheduleMetadata(event);
    if (!metadata || !metadata.prompt.trim()) continue;
    result.checked += 1;

    const dueAt = metadata.nextRunAt ?? event.start_at;
    if (dueAt > now) continue;
    if (!claimRun(`${event.id}:${dueAt}`)) continue;

    const nextRunAt = computeNextJarvisRunAt(event, Math.max(dueAt, now));

    if (now - dueAt > JARVIS_SCHEDULE_CATCH_UP_MS) {
      // Too old to replay honestly - record the miss and move on.
      const missedMetadata: JarvisScheduleMetadata = {
        ...metadata,
        nextRunAt: nextRunAt ?? undefined,
        errorHistory: [
          ...metadata.errorHistory,
          { at: now, error: `Missed scheduled run at ${new Date(dueAt).toLocaleString()} (app was closed).` },
        ],
      };
      try {
        await deps.updateEvent(event.id, {
          ...withJarvisScheduleMetadata(event, missedMetadata),
          ...(nextRunAt === null ? { status: 'done' as const } : {}),
        });
      } catch {
        // Persist failures leave the row untouched; the claim prevents retry storms this session.
      }
      result.missed.push(String(event.id));
      continue;
    }

    try {
      const outputChatId = await ensureOutputChat(event, metadata, deps);
      const ranMetadata: JarvisScheduleMetadata = {
        ...metadata,
        outputChatId,
        lastRunAt: now,
        nextRunAt: nextRunAt ?? undefined,
        runHistory: [
          ...metadata.runHistory,
          { at: now, status: 'success', summary: 'Run dispatched to Jarvis.' },
        ],
      };
      // Advance the schedule BEFORE dispatching so a crash mid-run cannot
      // double-fire this occurrence on the next tick.
      await deps.updateEvent(event.id, {
        ...withJarvisScheduleMetadata(event, ranMetadata),
        ...(nextRunAt === null ? { status: 'done' as const } : {}),
      });
      await deps.createMessage({
        chat_id: outputChatId as ChatId,
        role: 'user',
        parts: [{ kind: 'text', text: metadata.prompt }],
      });
      deps.dispatchEvent(new CustomEvent('jarvis:send', {
        detail: {
          chatId: outputChatId,
          text: metadata.prompt,
          modelSelectionOverride: metadata.modelSelection,
        },
      }));
      result.ran.push(String(event.id));
    } catch (err) {
      const failedMetadata: JarvisScheduleMetadata = {
        ...metadata,
        nextRunAt: nextRunAt ?? undefined,
        errorHistory: [
          ...metadata.errorHistory,
          { at: now, error: err instanceof Error ? err.message : 'Jarvis Action failed to start.' },
        ],
      };
      try {
        await deps.updateEvent(event.id, withJarvisScheduleMetadata(event, failedMetadata));
      } catch {
        // Nothing else to do without a working event store.
      }
    }
  }

  return result;
}

/**
 * Start the polling loop. Returns a stop function. Also re-checks when the
 * window regains focus so actions due while the machine slept fire promptly.
 */
export function startJarvisScheduleRunner(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const workspaceId = useAuthStore.getState().workspaceId;
      if (workspaceId) await runDueJarvisSchedules(workspaceId as WorkspaceId);
    } catch (err) {
      console.warn('[jarvis schedule] due-check failed', err);
    } finally {
      running = false;
    }
  };
  const timer = window.setInterval(() => void tick(), JARVIS_SCHEDULE_POLL_MS);
  const onFocus = () => void tick();
  window.addEventListener('focus', onFocus);
  void tick();
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', onFocus);
  };
}
