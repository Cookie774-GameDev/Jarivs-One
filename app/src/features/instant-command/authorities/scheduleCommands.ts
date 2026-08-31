import type { InstantResult } from '../types';

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
  let matches: readonly T[] = [];
  if (selector.id) matches = entities.filter((entity) => entity.id === selector.id);
  else if (selector.name) {
    const normalized = selector.name.trim().toLocaleLowerCase();
    matches = entities.filter((entity) => entity.name.trim().toLocaleLowerCase() === normalized);
  }
  if (matches.length === 0) return { status: 'missing' };
  if (matches.length > 1) {
    return { status: 'ambiguous', candidateIds: matches.map((entity) => entity.id) };
  }
  const entity = matches[0]!;
  if (selector.expectedRevision !== undefined && selector.expectedRevision !== entity.revision) {
    return { status: 'stale', actualRevision: entity.revision };
  }
  return { status: 'resolved', entity };
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

function selectorIsBounded(selector: VersionedEntitySelector | undefined): boolean {
  if (!selector || (!selector.id && !selector.name)) return false;
  return [selector.id, selector.name].every(
    (value) =>
      value === undefined ||
      (value.trim().length > 0 &&
        value.trim().length <= 200 &&
        !/[\u0000-\u001f\u007f]/u.test(value)),
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
    if (request.id === 'schedule.list') {
      const entities = await port.list();
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
