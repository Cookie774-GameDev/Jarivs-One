import type { DeepReadonly } from './contracts';

export const CONTEXT_REVISION_CACHE_CHANNELS = [
  'query_result',
  'embedding',
  'map_summary',
  'graph_neighbors',
] as const;

export type ContextRevisionCacheChannel = (typeof CONTEXT_REVISION_CACHE_CHANNELS)[number];

export interface ContextRevisionCacheScope {
  partitionId: string;
  mapId: string;
  knowledgeRevision: number;
}

export interface ContextRevisionCacheOptions {
  maxEntries?: number;
  maxEntryWeight?: number;
  maxTotalWeight?: number;
  maxInflight?: number;
  maxTrackedMaps?: number;
}

export class ContextRevisionCacheError extends Error {
  constructor(
    readonly code:
      | 'invalid_input'
      | 'entry_too_large'
      | 'invalid_value'
      | 'capacity_exceeded'
      | 'stale_revision',
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextRevisionCacheError';
  }
}

interface CacheEntry {
  scopes: readonly Readonly<ContextRevisionCacheScope>[];
  value: unknown;
  weight: number;
}

interface RevisionState {
  revision: number;
  epoch: number;
}

interface InflightEntry {
  promise: Promise<DeepReadonly<unknown>>;
  scopes: readonly Readonly<ContextRevisionCacheScope>[];
  weight: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/u;
const MAX_SCOPES = 200;
const MAX_KEY_CHARS = 131_072;
const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_MAX_ENTRY_WEIGHT = 4 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_WEIGHT = 32 * 1024 * 1024;
const DEFAULT_MAX_INFLIGHT = 64;
const DEFAULT_MAX_TRACKED_MAPS = 1_024;
const MAX_VALUE_DEPTH = 32;
const MAX_VALUE_NODES = 100_000;

function fail(code: ContextRevisionCacheError['code'], detail?: string): never {
  throw new ContextRevisionCacheError(code, detail);
}

function boundedInteger(value: unknown, minimum: number, maximum: number, detail: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('invalid_input', detail);
  }
  return value as number;
}

function normalizeScopes(
  scopes: readonly Readonly<ContextRevisionCacheScope>[],
): readonly Readonly<ContextRevisionCacheScope>[] {
  if (!Array.isArray(scopes)) fail('invalid_input', 'scopes');
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  let keys: PropertyKey[];
  try {
    if (Object.getPrototypeOf(scopes) !== Array.prototype) fail('invalid_input', 'scopes');
    descriptors = Object.getOwnPropertyDescriptors(scopes) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >;
    keys = Reflect.ownKeys(scopes);
  } catch {
    return fail('invalid_input', 'scopes');
  }
  const length = descriptors.length?.value as unknown;
  if (
    !Number.isSafeInteger(length) ||
    (length as number) < 1 ||
    (length as number) > MAX_SCOPES ||
    keys.length !== (length as number) + 1
  ) {
    fail('invalid_input', 'scopes');
  }
  const normalized = Array.from({ length: length as number }, (_, index) => {
    const item = descriptors[String(index)];
    if (!item?.enumerable || !Object.hasOwn(item, 'value')) fail('invalid_input', 'scope');
    const scope = item.value as unknown;
    let scopeDescriptors: PropertyDescriptorMap;
    let scopeKeys: PropertyKey[];
    try {
      if (
        !scope ||
        typeof scope !== 'object' ||
        Array.isArray(scope) ||
        (Object.getPrototypeOf(scope) !== Object.prototype && Object.getPrototypeOf(scope) !== null)
      ) {
        return fail('invalid_input', 'scope');
      }
      scopeDescriptors = Object.getOwnPropertyDescriptors(scope);
      scopeKeys = Reflect.ownKeys(scope);
    } catch {
      return fail('invalid_input', 'scope');
    }
    if (
      scopeKeys.length !== 3 ||
      scopeKeys.some(
        (key) =>
          (key !== 'partitionId' && key !== 'mapId' && key !== 'knowledgeRevision') ||
          !scopeDescriptors[key]?.enumerable ||
          !Object.hasOwn(scopeDescriptors[key]!, 'value'),
      )
    ) {
      return fail('invalid_input', 'scope');
    }
    const partitionId = scopeDescriptors.partitionId!.value as unknown;
    const mapId = scopeDescriptors.mapId!.value as unknown;
    const knowledgeRevision = scopeDescriptors.knowledgeRevision!.value as unknown;
    if (
      typeof partitionId !== 'string' ||
      !ID.test(partitionId) ||
      typeof mapId !== 'string' ||
      !ID.test(mapId) ||
      !Number.isSafeInteger(knowledgeRevision) ||
      (knowledgeRevision as number) < 0
    ) {
      return fail('invalid_input', 'scope');
    }
    return Object.freeze({
      partitionId,
      mapId,
      knowledgeRevision: knowledgeRevision as number,
    });
  });
  normalized.sort(
    (left, right) =>
      left.partitionId.localeCompare(right.partitionId, 'en-US') ||
      left.mapId.localeCompare(right.mapId, 'en-US') ||
      left.knowledgeRevision - right.knowledgeRevision,
  );
  if (
    new Set(normalized.map(({ partitionId, mapId }) => `${partitionId}\u001f${mapId}`)).size !==
    normalized.length
  ) {
    fail('invalid_input', 'duplicate_map');
  }
  return Object.freeze(normalized);
}

function cloneAndMeasure<T>(value: T): { value: DeepReadonly<T>; weight: number } {
  const seen = new WeakSet<object>();
  let nodes = 0;
  function visit(input: unknown, depth: number): { value: unknown; weight: number } {
    if (depth > MAX_VALUE_DEPTH || ++nodes > MAX_VALUE_NODES) fail('invalid_value', 'complexity');
    if (input === null) return { value: null, weight: 4 };
    if (typeof input === 'string') return { value: input, weight: 16 + input.length * 2 };
    if (typeof input === 'boolean') return { value: input, weight: 4 };
    if (typeof input === 'number' && Number.isFinite(input)) return { value: input, weight: 8 };
    if (typeof input !== 'object') return fail('invalid_value', 'type');
    if (seen.has(input)) return fail('invalid_value', 'cycle');
    seen.add(input);
    let prototype: object | null;
    let descriptors: PropertyDescriptorMap;
    let keys: PropertyKey[];
    try {
      prototype = Object.getPrototypeOf(input);
      descriptors = Object.getOwnPropertyDescriptors(input);
      keys = Reflect.ownKeys(input);
    } catch {
      return fail('invalid_value', 'reflection');
    }
    const isArray = Array.isArray(input);
    if (
      (isArray
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null) ||
      keys.some(
        (key) =>
          typeof key !== 'string' ||
          (key !== 'length' &&
            (!descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key]!, 'value'))),
      )
    ) {
      return fail('invalid_value', 'shape');
    }
    if (isArray) {
      const length = descriptors.length?.value as unknown;
      if (
        !Number.isSafeInteger(length) ||
        (length as number) < 0 ||
        keys.length !== (length as number) + 1
      ) {
        return fail('invalid_value', 'array');
      }
      const output: unknown[] = [];
      let weight = 24;
      for (let index = 0; index < (length as number); index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('invalid_value', 'array');
        const child = visit(descriptor.value, depth + 1);
        output.push(child.value);
        weight += child.weight;
      }
      return { value: Object.freeze(output), weight };
    }
    const output: Record<string, unknown> = Object.create(null);
    let weight = 32;
    for (const key of keys as string[]) {
      const child = visit(descriptors[key]!.value, depth + 1);
      output[key] = child.value;
      weight += key.length * 2 + child.weight + 8;
    }
    return { value: Object.freeze(output), weight };
  }
  const cloned = visit(value, 0);
  return { value: cloned.value as DeepReadonly<T>, weight: cloned.weight };
}

function cacheKey(
  channel: ContextRevisionCacheChannel,
  scopes: readonly Readonly<ContextRevisionCacheScope>[],
  key: string,
): string {
  return `${channel}\u001f${scopes
    .map(
      ({ partitionId, mapId, knowledgeRevision }) =>
        `${partitionId}\u001d${mapId}@${knowledgeRevision}`,
    )
    .join('\u001e')}\u001f${key}`;
}

export class ContextRevisionCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #inflight = new Map<string, InflightEntry>();
  readonly #latestRevisions = new Map<string, RevisionState>();
  readonly #maxEntries: number;
  readonly #maxEntryWeight: number;
  readonly #maxTotalWeight: number;
  readonly #maxInflight: number;
  readonly #maxTrackedMaps: number;
  #totalWeight = 0;
  #inflightWeight = 0;
  #activeLoadCount = 0;
  #activeLoadWeight = 0;
  #generation = 0;

  constructor(options: ContextRevisionCacheOptions = {}) {
    this.#maxEntries = boundedInteger(
      options.maxEntries ?? DEFAULT_MAX_ENTRIES,
      1,
      10_000,
      'max_entries',
    );
    this.#maxEntryWeight = boundedInteger(
      options.maxEntryWeight ?? DEFAULT_MAX_ENTRY_WEIGHT,
      1_024,
      64 * 1024 * 1024,
      'max_entry_weight',
    );
    this.#maxTotalWeight = boundedInteger(
      options.maxTotalWeight ?? DEFAULT_MAX_TOTAL_WEIGHT,
      this.#maxEntryWeight,
      512 * 1024 * 1024,
      'max_total_weight',
    );
    this.#maxInflight = boundedInteger(
      options.maxInflight ?? DEFAULT_MAX_INFLIGHT,
      1,
      1_024,
      'max_inflight',
    );
    this.#maxTrackedMaps = boundedInteger(
      options.maxTrackedMaps ?? DEFAULT_MAX_TRACKED_MAPS,
      1,
      10_000,
      'max_tracked_maps',
    );
  }

  #validateRequest(
    channel: ContextRevisionCacheChannel,
    scopes: readonly Readonly<ContextRevisionCacheScope>[],
    key: string,
  ): { scopes: readonly Readonly<ContextRevisionCacheScope>[]; key: string } {
    if (
      !(CONTEXT_REVISION_CACHE_CHANNELS as readonly unknown[]).includes(channel) ||
      typeof key !== 'string' ||
      key.length < 1 ||
      key.length > MAX_KEY_CHARS ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(key)
    ) {
      fail('invalid_input', 'key_or_channel');
    }
    const normalized = normalizeScopes(scopes);
    return { scopes: normalized, key: cacheKey(channel, normalized, key) };
  }

  #adopt(scopes: readonly Readonly<ContextRevisionCacheScope>[]): boolean {
    if (
      scopes.some(
        ({ partitionId, mapId, knowledgeRevision }) =>
          knowledgeRevision <
          (this.#latestRevisions.get(`${partitionId}\u001f${mapId}`)?.revision ??
            knowledgeRevision),
      )
    ) {
      return false;
    }
    const newMaps = scopes.filter(
      ({ partitionId, mapId }) => !this.#latestRevisions.has(`${partitionId}\u001f${mapId}`),
    ).length;
    if (this.#latestRevisions.size + newMaps > this.#maxTrackedMaps) {
      fail('capacity_exceeded', 'tracked_maps');
    }
    for (const { partitionId, mapId, knowledgeRevision } of scopes) {
      const stateKey = `${partitionId}\u001f${mapId}`;
      const prior = this.#latestRevisions.get(stateKey);
      if (prior !== undefined && knowledgeRevision > prior.revision) {
        this.invalidateMap(partitionId, mapId);
      }
      const current = this.#latestRevisions.get(stateKey);
      this.#latestRevisions.set(stateKey, {
        revision: knowledgeRevision,
        epoch: current?.epoch ?? 0,
      });
    }
    return true;
  }

  #remove(key: string): void {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#entries.delete(key);
    this.#totalWeight -= entry.weight;
  }

  #evict(): void {
    while (this.#entries.size > this.#maxEntries || this.#totalWeight > this.#maxTotalWeight) {
      const oldest = this.#entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#remove(oldest);
    }
  }

  get<T>(
    channel: ContextRevisionCacheChannel,
    scopes: readonly Readonly<ContextRevisionCacheScope>[],
    key: string,
  ): DeepReadonly<T> | undefined {
    const request = this.#validateRequest(channel, scopes, key);
    if (!this.#adopt(request.scopes)) return undefined;
    const entry = this.#entries.get(request.key);
    if (!entry) return undefined;
    this.#entries.delete(request.key);
    this.#entries.set(request.key, entry);
    return entry.value as DeepReadonly<T>;
  }

  set<T>(
    channel: ContextRevisionCacheChannel,
    scopes: readonly Readonly<ContextRevisionCacheScope>[],
    key: string,
    value: T,
  ): DeepReadonly<T> {
    const request = this.#validateRequest(channel, scopes, key);
    const cloned = cloneAndMeasure(value);
    const weight = cloned.weight + request.key.length * 2;
    if (weight > this.#maxEntryWeight) fail('entry_too_large');
    if (!this.#adopt(request.scopes)) fail('stale_revision');
    this.#remove(request.key);
    this.#entries.set(request.key, {
      scopes: request.scopes,
      value: cloned.value,
      weight,
    });
    this.#totalWeight += weight;
    this.#evict();
    return cloned.value;
  }

  async getOrLoad<T>(
    channel: ContextRevisionCacheChannel,
    scopes: readonly Readonly<ContextRevisionCacheScope>[],
    key: string,
    loader: () => Promise<T>,
  ): Promise<DeepReadonly<T>> {
    if (typeof loader !== 'function') fail('invalid_input', 'loader');
    const cached = this.get<T>(channel, scopes, key);
    if (cached !== undefined) return cached;
    const request = this.#validateRequest(channel, scopes, key);
    if (!this.#adopt(request.scopes)) fail('stale_revision');
    const active = this.#inflight.get(request.key);
    if (active) return (await active.promise) as DeepReadonly<T>;
    const inflightWeight = request.key.length * 2 + 128;
    if (
      this.#inflight.size >= this.#maxInflight ||
      this.#inflightWeight + inflightWeight > this.#maxTotalWeight ||
      this.#activeLoadCount >= this.#maxInflight * 2 ||
      this.#activeLoadWeight + inflightWeight > this.#maxTotalWeight * 2
    ) {
      fail('capacity_exceeded', 'inflight');
    }
    const generation = this.#generation;
    const revisionEpochs = request.scopes.map(({ partitionId, mapId }) => {
      const state = this.#latestRevisions.get(`${partitionId}\u001f${mapId}`);
      return state?.epoch ?? 0;
    });
    const pending = Promise.resolve()
      .then(loader)
      .then((value) => {
        if (
          generation !== this.#generation ||
          request.scopes.some(({ partitionId, mapId }, index) => {
            const state = this.#latestRevisions.get(`${partitionId}\u001f${mapId}`);
            return state === undefined || state.epoch !== revisionEpochs[index];
          })
        ) {
          return cloneAndMeasure(value).value;
        }
        return this.set(channel, request.scopes, key, value);
      });
    const inflightEntry: InflightEntry = {
      promise: pending as Promise<DeepReadonly<unknown>>,
      scopes: request.scopes,
      weight: inflightWeight,
    };
    this.#inflight.set(request.key, inflightEntry);
    this.#inflightWeight += inflightWeight;
    this.#activeLoadCount += 1;
    this.#activeLoadWeight += inflightWeight;
    try {
      return await pending;
    } finally {
      this.#activeLoadCount -= 1;
      this.#activeLoadWeight -= inflightWeight;
      if (this.#inflight.get(request.key) === inflightEntry) {
        this.#inflight.delete(request.key);
        this.#inflightWeight -= inflightWeight;
      }
    }
  }

  invalidateMap(partitionId: string, mapId: string): number {
    if (!ID.test(partitionId) || !ID.test(mapId)) fail('invalid_input', 'map_id');
    const stateKey = `${partitionId}\u001f${mapId}`;
    const state = this.#latestRevisions.get(stateKey);
    if (state) this.#latestRevisions.set(stateKey, { ...state, epoch: state.epoch + 1 });
    for (const [key, entry] of this.#inflight) {
      if (
        entry.scopes.some((scope) => scope.partitionId === partitionId && scope.mapId === mapId)
      ) {
        this.#inflight.delete(key);
        this.#inflightWeight -= entry.weight;
      }
    }
    let removed = 0;
    for (const [key, entry] of this.#entries) {
      if (
        entry.scopes.some((scope) => scope.partitionId === partitionId && scope.mapId === mapId)
      ) {
        this.#remove(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.#generation += 1;
    this.#entries.clear();
    this.#inflight.clear();
    this.#latestRevisions.clear();
    this.#totalWeight = 0;
    this.#inflightWeight = 0;
  }

  stats(): Readonly<{
    entries: number;
    activeLoads: number;
    inflight: number;
    trackedMaps: number;
    weight: number;
  }> {
    return Object.freeze({
      entries: this.#entries.size,
      activeLoads: this.#activeLoadCount,
      inflight: this.#inflight.size,
      trackedMaps: this.#latestRevisions.size,
      weight: this.#totalWeight + this.#activeLoadWeight,
    });
  }
}
