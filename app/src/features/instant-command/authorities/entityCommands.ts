export type StableEntity = Readonly<{ id: string; displayName: string }>;

export type StableEntityResolution<T extends StableEntity> =
  | Readonly<{ status: 'resolved'; entity: T }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'ambiguous'; candidateIds: readonly string[] }>;

export function resolveStableEntity<T extends StableEntity>(
  entities: readonly T[],
  selector: string,
): StableEntityResolution<T> {
  const query = selector.trim();
  const byId = entities.find((entity) => entity.id === query);
  if (byId) return { status: 'resolved', entity: byId };
  const normalized = query.toLocaleLowerCase();
  const matches = entities.filter(
    (entity) => entity.displayName.trim().toLocaleLowerCase() === normalized,
  );
  if (matches.length === 0) return { status: 'missing' };
  if (matches.length > 1) {
    return { status: 'ambiguous', candidateIds: matches.map((entity) => entity.id) };
  }
  return { status: 'resolved', entity: matches[0]! };
}
