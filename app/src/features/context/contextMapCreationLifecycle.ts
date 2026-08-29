import type { ContextPersistenceState } from './contextPersistence';
import type { ContextMapRecord, ProjectContextTree } from './tree';

interface PopulatePersistedCreatedContextMapInput {
  persisted: ContextPersistenceState;
  tree: ProjectContextTree;
  signal?: AbortSignal;
  populateCreatedMap(
    accountId: string,
    map: ContextMapRecord,
    signal?: AbortSignal,
  ): Promise<unknown>;
  repairCreatedMap?(
    accountId: string,
    map: ContextMapRecord,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

export interface PopulatedCreatedContextMap {
  persistedMap: ContextMapRecord;
  generatedMap: ContextMapRecord;
}

/**
 * Populate the physical search index for a newly persisted active map.
 *
 * A failed initial population gets one repair attempt against the same map.
 * If both attempts fail, the persisted map remains active. Only an explicit
 * user recycle action may turn a Context Map into a deleted tombstone.
 */
export async function populatePersistedCreatedContextMap(
  input: PopulatePersistedCreatedContextMapInput,
): Promise<PopulatedCreatedContextMap> {
  const persistedMap = input.persisted.maps.find(
    (map) => map.id === input.persisted.selectedMapId && map.status === 'active',
  );
  if (!persistedMap) throw new Error('context_search_index_snapshot_invalid');

  // The V2 graph projection stores portable metadata and intentionally drops
  // local ingestion eligibility. Index from the freshly scanned tree while
  // retaining the durable map identity.
  const generatedMap: ContextMapRecord = { ...persistedMap, tree: input.tree };
  try {
    await input.populateCreatedMap(input.persisted.accountId, generatedMap, input.signal);
  } catch (error) {
    if (!input.repairCreatedMap) throw error;
    await input.repairCreatedMap(input.persisted.accountId, generatedMap, input.signal);
  }
  return { persistedMap, generatedMap };
}
