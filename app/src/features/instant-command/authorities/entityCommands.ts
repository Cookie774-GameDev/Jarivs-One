export type StableEntity = Readonly<{ id: string; displayName: string }>;

export type StableEntityResolution<T extends StableEntity> =
  | Readonly<{ status: 'resolved'; entity: T }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'ambiguous'; candidateIds: readonly string[] }>;

const MAX_ENTITY_COUNT = 4_096;
const MAX_ENTITY_ID_LENGTH = 128;
const MAX_ENTITY_NAME_LENGTH = 256;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const STABLE_ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const MISSING = Object.freeze({ status: 'missing' as const });

function validEntity(value: unknown): value is StableEntity {
  if (!value || typeof value !== 'object') return false;
  const entity = value as Readonly<Record<string, unknown>>;
  return (
    typeof entity.id === 'string' &&
    entity.id.length > 0 &&
    entity.id.length <= MAX_ENTITY_ID_LENGTH &&
    entity.id === entity.id.trim() &&
    !CONTROL_CHARACTER.test(entity.id) &&
    STABLE_ENTITY_ID.test(entity.id) &&
    typeof entity.displayName === 'string' &&
    entity.displayName.trim().length > 0 &&
    entity.displayName.length <= MAX_ENTITY_NAME_LENGTH &&
    !CONTROL_CHARACTER.test(entity.displayName)
  );
}

function resolved<T extends StableEntity>(entity: T): StableEntityResolution<T> {
  return Object.freeze({ status: 'resolved' as const, entity: Object.freeze({ ...entity }) as T });
}

function ambiguous<T extends StableEntity>(entities: readonly T[]): StableEntityResolution<T> {
  const candidateIds = Object.freeze([...new Set(entities.map((entity) => entity.id))].sort());
  return Object.freeze({ status: 'ambiguous' as const, candidateIds });
}

export function resolveStableEntity<T extends StableEntity>(
  entities: readonly T[],
  selector: string,
): StableEntityResolution<T> {
  if (
    !Array.isArray(entities) ||
    entities.length > MAX_ENTITY_COUNT ||
    typeof selector !== 'string' ||
    selector.length > MAX_ENTITY_NAME_LENGTH ||
    CONTROL_CHARACTER.test(selector)
  ) {
    return MISSING;
  }
  const query = selector.trim();
  if (!query) return MISSING;
  const validEntities = entities.filter((entity): entity is T => validEntity(entity));
  const byId = validEntities.filter((entity) => entity.id === query);
  if (byId.length > 1) return ambiguous(byId);
  if (byId.length === 1) return resolved(byId[0]!);
  const normalized = query.toLocaleLowerCase();
  const matches = validEntities.filter(
    (entity) => entity.displayName.trim().toLocaleLowerCase() === normalized,
  );
  if (matches.length === 0) return MISSING;
  if (matches.length > 1) return ambiguous(matches);
  return resolved(matches[0]!);
}
