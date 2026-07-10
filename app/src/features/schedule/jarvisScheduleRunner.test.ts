import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRow } from '@/types/event';
import type { WorkspaceId } from '@/types/common';
import {
  buildJarvisScheduleEventInput,
  parseJarvisScheduleMetadata,
  withJarvisScheduleMetadata,
  JARVIS_SCHEDULE_HISTORY_CAP,
  type JarvisScheduleMetadata,
} from './jarvisSchedules';
import {
  computeNextJarvisRunAt,
  runDueJarvisSchedules,
  JARVIS_SCHEDULE_CATCH_UP_MS,
  type JarvisScheduleRunnerDeps,
} from './jarvisScheduleRunner';

const WORKSPACE = 'wks_test' as WorkspaceId;
const BASE_NOW = new Date(2026, 6, 8, 8, 0, 0, 0).getTime(); // local 8:00 AM

// The runner claims eventId:dueAt pairs in module state, so every test event
// needs a unique id to stay isolated from earlier tests.
let eventSeq = 0;

function buildEvent(overrides: {
  startAt: number;
  recurrence?: 'once' | 'daily' | 'weekly' | 'monthly' | 'weekdays';
  prompt?: string;
  status?: EventRow['status'];
  metadataPatch?: Partial<JarvisScheduleMetadata>;
}): EventRow {
  const input = buildJarvisScheduleEventInput({
    workspaceId: WORKSPACE,
    createdBy: 'usr_local',
    title: 'Football news',
    prompt: overrides.prompt ?? 'Give me the top football headlines.',
    startAt: overrides.startAt,
    recurrence: overrides.recurrence ?? 'once',
    timezone: 'UTC',
    modelSelection: { mode: 'single', provider: 'google', modelId: 'gemini-2.0-flash' } as never,
    agentId: 'agent_jarvis',
  });
  const event: EventRow = {
    id: `evt_${overrides.startAt}_${eventSeq++}` as EventRow['id'],
    attendees: [],
    created_at: overrides.startAt - 1000,
    updated_at: overrides.startAt - 1000,
    ...input,
    status: overrides.status ?? 'scheduled',
  } as EventRow;
  if (overrides.metadataPatch) {
    const metadata = parseJarvisScheduleMetadata(event)!;
    Object.assign(event, withJarvisScheduleMetadata(event, { ...metadata, ...overrides.metadataPatch }));
  }
  return event;
}

function buildDeps(events: EventRow[]) {
  const updates: Array<{ id: string; patch: Partial<EventRow> }> = [];
  const chats: Array<{ id: string; title: string }> = [];
  const messages: Array<{ chat_id: string; text: string }> = [];
  const dispatched: CustomEvent[] = [];
  const deps: JarvisScheduleRunnerDeps = {
    listEvents: async () => events,
    updateEvent: async (id, patch) => {
      updates.push({ id: String(id), patch });
      const target = events.find((event) => event.id === id);
      if (target) Object.assign(target, patch);
    },
    createChat: async (input) => {
      chats.push({ id: String(input.id), title: input.title });
    },
    createMessage: async (input) => {
      messages.push({ chat_id: String(input.chat_id), text: input.parts[0]?.text ?? '' });
    },
    dispatchEvent: (event) => {
      dispatched.push(event);
    },
    now: () => BASE_NOW,
  };
  return { deps, updates, chats, messages, dispatched };
}

describe('computeNextJarvisRunAt', () => {
  it('returns null for one-shot actions', () => {
    const event = buildEvent({ startAt: BASE_NOW - 60_000, recurrence: 'once' });
    expect(computeNextJarvisRunAt(event, BASE_NOW)).toBeNull();
  });

  it('returns the next daily occurrence after the given time', () => {
    const event = buildEvent({ startAt: BASE_NOW - 60_000, recurrence: 'daily' });
    const next = computeNextJarvisRunAt(event, BASE_NOW);
    expect(next).toBe(event.start_at + 24 * 60 * 60 * 1000);
  });

  it('skips weekends for weekday recurrence', () => {
    // 2026-07-10 is a Friday; the next weekday run lands on Monday 07-13.
    const friday = new Date(2026, 6, 10, 9, 0, 0, 0).getTime();
    const event = buildEvent({ startAt: friday, recurrence: 'weekdays' });
    const next = computeNextJarvisRunAt(event, friday);
    expect(new Date(next!).getDay()).toBe(1);
    expect(next).toBe(friday + 3 * 24 * 60 * 60 * 1000);
  });

  it('returns the next weekly and monthly occurrences', () => {
    const weekly = buildEvent({ startAt: BASE_NOW - 60_000, recurrence: 'weekly' });
    expect(computeNextJarvisRunAt(weekly, BASE_NOW)).toBe(weekly.start_at + 7 * 24 * 60 * 60 * 1000);

    const monthly = buildEvent({ startAt: BASE_NOW - 60_000, recurrence: 'monthly' });
    const next = computeNextJarvisRunAt(monthly, BASE_NOW);
    expect(new Date(next!).getMonth()).toBe((new Date(monthly.start_at).getMonth() + 1) % 12);
  });
});

describe('runDueJarvisSchedules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a due one-shot action: creates an output chat, persists the prompt, dispatches, completes', async () => {
    const event = buildEvent({ startAt: BASE_NOW - 60_000, recurrence: 'once' });
    const { deps, updates, chats, messages, dispatched } = buildDeps([event]);

    const result = await runDueJarvisSchedules(WORKSPACE, deps);

    expect(result.ran).toEqual([String(event.id)]);
    expect(chats).toHaveLength(1);
    expect(chats[0]!.title).toContain('Jarvis Action');
    expect(messages).toEqual([
      expect.objectContaining({ text: 'Give me the top football headlines.' }),
    ]);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.type).toBe('jarvis:send');
    const detail = dispatched[0]!.detail as { chatId: string; text: string; modelSelectionOverride: unknown };
    expect(detail.chatId).toBe(chats[0]!.id);
    expect(detail.text).toBe('Give me the top football headlines.');
    expect(detail.modelSelectionOverride).toMatchObject({ provider: 'google' });

    // One-shot actions complete after running.
    expect(updates.some((u) => u.patch.status === 'done')).toBe(true);
    const metadata = parseJarvisScheduleMetadata(event)!;
    expect(metadata.lastRunAt).toBe(BASE_NOW);
    expect(metadata.outputChatId).toBe(chats[0]!.id);
    expect(metadata.runHistory).toHaveLength(1);
  });

  it('advances nextRunAt for recurring actions and keeps them scheduled', async () => {
    const event = buildEvent({ startAt: BASE_NOW - 60_000, recurrence: 'daily' });
    const { deps, updates, dispatched } = buildDeps([event]);

    await runDueJarvisSchedules(WORKSPACE, deps);

    expect(dispatched).toHaveLength(1);
    expect(updates.some((u) => u.patch.status === 'done')).toBe(false);
    const metadata = parseJarvisScheduleMetadata(event)!;
    expect(metadata.nextRunAt).toBe(event.start_at + 24 * 60 * 60 * 1000);
  });

  it('does not run actions that are not due yet', async () => {
    const event = buildEvent({ startAt: BASE_NOW + 60 * 60 * 1000, recurrence: 'once' });
    const { deps, dispatched, updates } = buildDeps([event]);

    const result = await runDueJarvisSchedules(WORKSPACE, deps);

    expect(result.ran).toEqual([]);
    expect(dispatched).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('never fires the same occurrence twice across repeated ticks', async () => {
    const event = buildEvent({ startAt: BASE_NOW - 60_000, recurrence: 'once' });
    const { deps, dispatched } = buildDeps([event]);

    await runDueJarvisSchedules(WORKSPACE, deps);
    // Simulate a persistence failure leaving the row unchanged - the
    // in-memory claim must still block a duplicate dispatch this session.
    event.status = 'scheduled';
    await runDueJarvisSchedules(WORKSPACE, deps);

    expect(dispatched).toHaveLength(1);
  });

  it('records old missed runs honestly instead of replaying them', async () => {
    const event = buildEvent({
      startAt: BASE_NOW - JARVIS_SCHEDULE_CATCH_UP_MS - 60_000,
      recurrence: 'daily',
    });
    const { deps, dispatched } = buildDeps([event]);

    const result = await runDueJarvisSchedules(WORKSPACE, deps);

    expect(result.missed).toEqual([String(event.id)]);
    expect(dispatched).toHaveLength(0);
    const metadata = parseJarvisScheduleMetadata(event)!;
    expect(metadata.errorHistory).toHaveLength(1);
    expect(metadata.errorHistory[0]!.error).toContain('Missed scheduled run');
    expect(metadata.nextRunAt).toBeGreaterThan(BASE_NOW);
  });

  it('runs recent missed occurrences within the catch-up window', async () => {
    const event = buildEvent({ startAt: BASE_NOW - 30 * 60 * 1000, recurrence: 'daily' });
    const { deps, dispatched } = buildDeps([event]);

    const result = await runDueJarvisSchedules(WORKSPACE, deps);

    expect(result.ran).toEqual([String(event.id)]);
    expect(dispatched).toHaveLength(1);
  });

  it('reuses the stored output chat instead of creating duplicates', async () => {
    const event = buildEvent({
      startAt: BASE_NOW - 60_000,
      recurrence: 'daily',
      metadataPatch: { outputChatId: 'cht_existing' },
    });
    const { deps, chats, dispatched } = buildDeps([event]);

    await runDueJarvisSchedules(WORKSPACE, deps);

    expect(chats).toHaveLength(0);
    expect((dispatched[0]!.detail as { chatId: string }).chatId).toBe('cht_existing');
  });

  it('skips cancelled schedules and rows with corrupted metadata', async () => {
    const cancelled = buildEvent({ startAt: BASE_NOW - 60_000, status: 'cancelled' });
    const corrupted = buildEvent({ startAt: BASE_NOW - 60_000 });
    corrupted.source_ref = { context: { kind: 'memory', id: 'jarvis_schedule:{not json' } };
    const { deps, dispatched } = buildDeps([cancelled, corrupted]);

    const result = await runDueJarvisSchedules(WORKSPACE, deps);

    expect(result.ran).toEqual([]);
    expect(dispatched).toHaveLength(0);
  });

  it('records an error entry when dispatch fails', async () => {
    const event = buildEvent({ startAt: BASE_NOW - 60_000, recurrence: 'once' });
    const { deps, dispatched } = buildDeps([event]);
    deps.createChat = async () => {
      throw new Error('Dexie unavailable');
    };

    await runDueJarvisSchedules(WORKSPACE, deps);

    expect(dispatched).toHaveLength(0);
    const metadata = parseJarvisScheduleMetadata(event)!;
    expect(metadata.errorHistory[0]!.error).toContain('Dexie unavailable');
  });

  it('survives a failing event store without throwing', async () => {
    const deps = buildDeps([]).deps;
    deps.listEvents = async () => {
      throw new Error('db closed');
    };

    await expect(runDueJarvisSchedules(WORKSPACE, deps)).resolves.toEqual({
      ran: [],
      missed: [],
      checked: 0,
    });
  });
});

describe('withJarvisScheduleMetadata', () => {
  it('caps run and error history growth', () => {
    const event = buildEvent({ startAt: BASE_NOW - 60_000 });
    const metadata = parseJarvisScheduleMetadata(event)!;
    const bloated: JarvisScheduleMetadata = {
      ...metadata,
      runHistory: Array.from({ length: 60 }, (_, i) => ({ at: i, status: 'success' as const })),
      errorHistory: Array.from({ length: 60 }, (_, i) => ({ at: i, error: `e${i}` })),
    };

    Object.assign(event, withJarvisScheduleMetadata(event, bloated));
    const parsed = parseJarvisScheduleMetadata(event)!;

    expect(parsed.runHistory).toHaveLength(JARVIS_SCHEDULE_HISTORY_CAP);
    expect(parsed.errorHistory).toHaveLength(JARVIS_SCHEDULE_HISTORY_CAP);
    expect(parsed.runHistory[JARVIS_SCHEDULE_HISTORY_CAP - 1]!.at).toBe(59);
  });
});
