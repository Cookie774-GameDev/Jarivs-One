import { describe, expect, it, vi } from 'vitest';
import {
  CONTEXT_REVISION_CACHE_CHANNELS,
  ContextRevisionCache,
  ContextRevisionCacheError,
} from './contextRevisionCache';

const revision = (knowledgeRevision: number, partitionId = 'account-1') => [
  { partitionId, mapId: 'map-1', knowledgeRevision },
];

describe('ContextRevisionCache', () => {
  it('stores all required cache channels as detached immutable values', () => {
    const cache = new ContextRevisionCache();
    const values = {
      query_result: [{ id: 'candidate-1', score: 1 }],
      embedding: [0.1, 0.2, 0.3],
      map_summary: { summary: 'Release context' },
      graph_neighbors: ['node-1', 'node-2'],
    } as const;

    for (const channel of CONTEXT_REVISION_CACHE_CHANNELS) {
      const source = values[channel];
      const stored = cache.set(channel, revision(1), 'item-1', source);
      expect(cache.get(channel, revision(1), 'item-1')).toEqual(source);
      expect(Object.isFrozen(stored)).toBe(true);
    }
    expect(cache.stats().entries).toBe(4);
  });

  it('invalidates every dependent channel when a map revision advances', async () => {
    const cache = new ContextRevisionCache();
    cache.set('query_result', revision(1), 'query', ['old']);
    cache.set('embedding', revision(1), 'entity', [0.1]);

    cache.set('map_summary', revision(2), 'summary', 'new');

    expect(cache.get('query_result', revision(1), 'query')).toBeUndefined();
    expect(cache.get('embedding', revision(1), 'entity')).toBeUndefined();
    expect(cache.get('map_summary', revision(2), 'summary')).toBe('new');
    const staleLoader = vi.fn(async () => ['stale']);
    expect(() => cache.set('embedding', revision(1), 'late', [0.2])).toThrow(/stale_revision/);
    await expect(
      cache.getOrLoad('query_result', revision(1), 'late', staleLoader),
    ).rejects.toMatchObject({ code: 'stale_revision' });
    expect(staleLoader).not.toHaveBeenCalled();
  });

  it('partitions every channel by account/profile identity', () => {
    const cache = new ContextRevisionCache();
    cache.set('embedding', revision(1, 'account-1'), 'entity', [0.1]);
    cache.set('embedding', revision(1, 'account-2'), 'entity', [0.9]);
    expect(cache.get('embedding', revision(1, 'account-1'), 'entity')).toEqual([0.1]);
    expect(cache.get('embedding', revision(1, 'account-2'), 'entity')).toEqual([0.9]);
  });

  it('coalesces concurrent loads and keeps rejected loads out of the cache', async () => {
    const cache = new ContextRevisionCache();
    const loader = vi.fn(async () => ['candidate']);
    const [left, right] = await Promise.all([
      cache.getOrLoad('query_result', revision(1), 'same-query', loader),
      cache.getOrLoad('query_result', revision(1), 'same-query', loader),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(left).toBe(right);

    const failing = vi.fn(async () => {
      throw new Error('index unavailable');
    });
    await expect(
      cache.getOrLoad('query_result', revision(1), 'failed-query', failing),
    ).rejects.toThrow('index unavailable');
    await expect(
      cache.getOrLoad('query_result', revision(1), 'failed-query', failing),
    ).rejects.toThrow('index unavailable');
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('does not repopulate after clear or direct map invalidation', async () => {
    const cache = new ContextRevisionCache({ maxInflight: 1 });
    let finish!: (value: string[]) => void;
    const pending = cache.getOrLoad(
      'query_result',
      revision(1),
      'clear-race',
      async () =>
        await new Promise<string[]>((resolve) => {
          finish = resolve;
        }),
    );
    await vi.waitFor(() => expect(cache.stats().inflight).toBe(1));
    cache.clear();
    finish(['old']);
    await expect(pending).resolves.toEqual(['old']);
    expect(cache.get('query_result', revision(1), 'clear-race')).toBeUndefined();

    let finishInvalidated!: (value: string[]) => void;
    const invalidated = cache.getOrLoad(
      'query_result',
      revision(1),
      'invalidate-race',
      async () =>
        await new Promise<string[]>((resolve) => {
          finishInvalidated = resolve;
        }),
    );
    await vi.waitFor(() => expect(cache.stats().inflight).toBe(1));
    cache.invalidateMap('account-1', 'map-1');
    const fresh = await cache.getOrLoad(
      'query_result',
      revision(1),
      'invalidate-race',
      async () => ['fresh'],
    );
    expect(fresh).toEqual(['fresh']);
    finishInvalidated(['old']);
    await expect(invalidated).resolves.toEqual(['old']);
    expect(cache.get('query_result', revision(1), 'invalidate-race')).toEqual(['fresh']);
  });

  it('releases stale in-flight capacity when a revision advances', async () => {
    const cache = new ContextRevisionCache({ maxInflight: 1 });
    const old = cache.getOrLoad(
      'query_result',
      revision(1),
      'query',
      async () => await new Promise<string[]>(() => {}),
    );
    await vi.waitFor(() => expect(cache.stats().inflight).toBe(1));
    await expect(
      cache.getOrLoad('query_result', revision(2), 'query', async () => ['current']),
    ).resolves.toEqual(['current']);
    expect(cache.stats().inflight).toBe(0);
    void old;
  });

  it('bounds detached stale loaders across repeated invalidations', async () => {
    const cache = new ContextRevisionCache({ maxInflight: 1 });
    const hung = vi.fn(async () => await new Promise<string[]>(() => {}));
    void cache.getOrLoad('query_result', revision(1), 'q-1', hung);
    await vi.waitFor(() => expect(hung).toHaveBeenCalledTimes(1));
    cache.invalidateMap('account-1', 'map-1');
    void cache.getOrLoad('query_result', revision(1), 'q-2', hung);
    await vi.waitFor(() => expect(hung).toHaveBeenCalledTimes(2));
    cache.invalidateMap('account-1', 'map-1');
    await expect(cache.getOrLoad('query_result', revision(1), 'q-3', hung)).rejects.toMatchObject({
      code: 'capacity_exceeded',
      detail: 'inflight',
    });
    expect(hung).toHaveBeenCalledTimes(2);
    expect(cache.stats().activeLoads).toBe(2);
  });

  it('bounds in-flight work and revision metadata before invoking loaders', async () => {
    const cache = new ContextRevisionCache({
      maxEntries: 1,
      maxEntryWeight: 1_024,
      maxTotalWeight: 1_024,
      maxInflight: 1,
      maxTrackedMaps: 1,
    });
    const loader = vi.fn(async () => await new Promise<string[]>(() => {}));
    void cache.getOrLoad('query_result', revision(1), 'first', loader);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await expect(
      cache.getOrLoad('query_result', revision(1), 'second', loader),
    ).rejects.toMatchObject({ code: 'capacity_exceeded', detail: 'inflight' });
    expect(() =>
      cache.get(
        'query_result',
        [{ partitionId: 'account-1', mapId: 'map-2', knowledgeRevision: 1 }],
        'third',
      ),
    ).toThrow(/tracked_maps/);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('enforces LRU and memory bounds', () => {
    const cache = new ContextRevisionCache({
      maxEntries: 2,
      maxEntryWeight: 1_024,
      maxTotalWeight: 1_200,
    });
    cache.set('map_summary', revision(1), 'a', 'a'.repeat(200));
    cache.set('map_summary', revision(1), 'b', 'b'.repeat(200));
    cache.get('map_summary', revision(1), 'a');
    cache.set('map_summary', revision(1), 'c', 'c'.repeat(200));
    expect(cache.get('map_summary', revision(1), 'a')).toBe('a'.repeat(200));
    expect(cache.get('map_summary', revision(1), 'b')).toBeUndefined();
    expect(cache.get('map_summary', revision(1), 'c')).toBe('c'.repeat(200));
  });

  it('rejects oversized, cyclic, accessor-backed, and malformed values', () => {
    const cache = new ContextRevisionCache({
      maxEntryWeight: 1_024,
      maxTotalWeight: 2_048,
    });
    expect(() => cache.set('map_summary', revision(1), 'large', 'x'.repeat(1_000))).toThrowError(
      ContextRevisionCacheError,
    );
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => cache.set('query_result', revision(1), 'cycle', cyclic)).toThrow(/cycle/);
    const getter = vi.fn(() => 'secret');
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: getter });
    expect(() => cache.set('query_result', revision(1), 'accessor', accessor)).toThrow(/shape/);
    expect(getter).not.toHaveBeenCalled();
    expect(() => cache.get('query_result', [], 'bad')).toThrow(/scopes/);
    const scopeGetter = vi.fn(() => 'account-1');
    const unsafeScope = Object.defineProperties(
      {},
      {
        partitionId: { enumerable: true, get: scopeGetter },
        mapId: { enumerable: true, value: 'map-1' },
        knowledgeRevision: { enumerable: true, value: 1 },
      },
    ) as { partitionId: string; mapId: string; knowledgeRevision: number };
    expect(() => cache.get('query_result', [unsafeScope], 'bad')).toThrow(/scope/);
    expect(scopeGetter).not.toHaveBeenCalled();
  });
});
