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
