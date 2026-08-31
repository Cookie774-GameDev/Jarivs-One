import type { InstantResult } from '../types';

const MAX_SCHEDULES = 1_000;
const MAX_BINDING_LENGTH = 200;
const MAX_COMMAND_ID_LENGTH = 64;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export type VersionedEntity = Readonly<{ id: string; name: string; revision: number }>;
export type VersionedEntitySelector = Readonly<{
  id?: string;
  name?: string;
  expectedRevision?: number;
}>;

export function resolveVersionedEntity<T extends VersionedEntity>(
  entities: readonly T[],
  selector: VersionedEntitySelector,
):
  | Readonly<{ status: 'resolved'; entity: T }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'ambiguous'; candidateIds: readonly string[] }>
  | Readonly<{ status: 'stale'; actualRevision: number }> {
  if (!validEntitySnapshot(entities) || !selectorIsBounded(selector)) {
    return Object.freeze({ status: 'missing' });
  }
  let matches: readonly T[] = [];
  if (selector.id) matches = entities.filter((entity) => entity.id === selector.id);
  else if (selector.name) {
    const normalized = selector.name.trim().toLocaleLowerCase();
    matches = entities.filter((entity) => entity.name.trim().toLocaleLowerCase() === normalized);
  }
  if (matches.length === 0) return Object.freeze({ status: 'missing' });
  if (matches.length > 1) {
    return Object.freeze({
      status: 'ambiguous',
      candidateIds: Object.freeze([...new Set(matches.map((entity) => entity.id))].sort()),
    });
  }
  const entity = Object.freeze({ ...matches[0]! }) as T;
  if (selector.expectedRevision !== undefined && selector.expectedRevision !== entity.revision) {
    return Object.freeze({ status: 'stale', actualRevision: entity.revision });
  }
  return Object.freeze({ status: 'resolved', entity });
}

type ScheduleMutation = 'pause' | 'resume' | 'enable' | 'disable';

type RecurrenceState = Readonly<{
  recurrenceAnchor: string | null;
  occurrenceCount: number;
}>;

export type ScheduleCommandPort<T extends VersionedEntity = VersionedEntity> = Readonly<{
  list: () => readonly T[] | Promise<readonly T[]>;
  open: (id: string) => void | Promise<void>;
  mutate: (id: string, action: ScheduleMutation, expectedRevision: number) => void | Promise<void>;
  runNow: (
    id: string,
    expectedRevision: number,
    options: Readonly<{ preserveRecurrence: true }>,
  ) =>
    | Readonly<{ before: RecurrenceState; after: RecurrenceState }>
    | Promise<Readonly<{ before: RecurrenceState; after: RecurrenceState }>>;
}>;

export type ScheduleCommandRequest = Readonly<{
  id: string;
  selector?: VersionedEntitySelector;
}>;

const MUTATION_BY_ID: Readonly<Record<string, ScheduleMutation>> = Object.freeze({
  'schedule.pause': 'pause',
  'schedule.resume': 'resume',
  'schedule.enable': 'enable',
  'schedule.disable': 'disable',
});
const ALLOWED_COMMANDS = new Set([
  'schedule.list',
  'schedule.open',
  'schedule.pause',
  'schedule.resume',
  'schedule.enable',
  'schedule.disable',
  'schedule.run_now',
]);

function boundedString(value: unknown, maximumLength = MAX_BINDING_LENGTH): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maximumLength &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validEntitySnapshot(entities: unknown): entities is readonly VersionedEntity[] {
  return (
    Array.isArray(entities) &&
    entities.length <= MAX_SCHEDULES &&
    entities.every(
      (entity) =>
        entity !== null &&
        typeof entity === 'object' &&
        boundedString((entity as VersionedEntity).id) &&
        boundedString((entity as VersionedEntity).name) &&
        validRevision((entity as VersionedEntity).revision),
    )
  );
}

function selectorIsBounded(selector: VersionedEntitySelector | undefined): boolean {
  if (!selector || (!selector.id && !selector.name)) return false;
  return (
    [selector.id, selector.name].every((value) => value === undefined || boundedString(value)) &&
    (selector.expectedRevision === undefined || validRevision(selector.expectedRevision))
  );
}

function validRecurrenceState(value: unknown): value is RecurrenceState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<RecurrenceState>;
  return (
    (state.recurrenceAnchor === null || boundedString(state.recurrenceAnchor)) &&
    validRevision(state.occurrenceCount)
  );
}

function resolutionFailure(status: 'missing' | 'ambiguous' | 'stale'): InstantResult {
  if (status === 'ambiguous') {
    return { ok: false, code: 'target_ambiguous', message: 'Schedule selection is ambiguous.' };
  }
  if (status === 'stale') {
    return { ok: false, code: 'target_not_ready', message: 'Schedule revision is stale.' };
  }
  return { ok: false, code: 'target_missing', message: 'Schedule was not found.' };
}

export async function executeScheduleCommand<T extends VersionedEntity>(
  request: ScheduleCommandRequest,
  port: ScheduleCommandPort<T>,
): Promise<InstantResult> {
  try {
    if (!boundedString(request.id, MAX_COMMAND_ID_LENGTH) || !ALLOWED_COMMANDS.has(request.id)) {
      return { ok: false, code: 'queue_failed', message: 'Unknown schedule command.' };
    }
    if (request.id === 'schedule.list') {
      const entities = await port.list();
      if (!validEntitySnapshot(entities)) {
        return { ok: false, code: 'queue_failed', message: 'Schedule registry is unavailable.' };
      }
      return { ok: true, code: 'opened', message: `${entities.length} schedules.` };
    }
    if (!selectorIsBounded(request.selector)) return resolutionFailure('missing');

    const entities = await port.list();
    const resolution = resolveVersionedEntity(entities, request.selector!);
    if (resolution.status !== 'resolved') return resolutionFailure(resolution.status);
    const { entity } = resolution;

    if (request.id === 'schedule.open') {
      await port.open(entity.id);
      return { ok: true, code: 'opened', message: 'Schedule opened.' };
    }

    const mutation = MUTATION_BY_ID[request.id];
    if (mutation) {
      await port.mutate(entity.id, mutation, entity.revision);
      return { ok: true, code: 'opened', message: `Schedule ${mutation}d.` };
    }

    if (request.id === 'schedule.run_now') {
      const observation = await port.runNow(entity.id, entity.revision, {
        preserveRecurrence: true,
      });
      if (
        !observation ||
        !validRecurrenceState(observation.before) ||
        !validRecurrenceState(observation.after)
      ) {
        return {
          ok: false,
          code: 'queue_failed',
          message: 'Schedule run state is invalid.',
        };
      }
      if (
        observation.before.recurrenceAnchor !== observation.after.recurrenceAnchor ||
        observation.before.occurrenceCount !== observation.after.occurrenceCount
      ) {
        return {
          ok: false,
          code: 'queue_failed',
          message: 'Schedule recurrence changed during run-now.',
        };
      }
      return { ok: true, code: 'opened', message: 'Schedule run completed.' };
    }

    return { ok: false, code: 'queue_failed', message: 'Unknown schedule command.' };
  } catch {
    return { ok: false, code: 'queue_failed', message: 'Schedule command failed.' };
  }
}
