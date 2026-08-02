import { describe, expect, it } from 'vitest';
import {
  ContextSearchResultError,
  buildContextSearchResults,
  selectContextSearchResult,
  type ContextSearchResultCandidateV1,
} from './searchResults';

function candidate(
  overrides: Partial<ContextSearchResultCandidateV1> = {},
): ContextSearchResultCandidateV1 {
  return {
    version: 1,
    id: 'result-1',
    accountId: 'account-1',
    mapId: 'map-1',
    entityId: 'entity-1',
    sourceId: 'source-1',
    title: 'Security review',
    path: 'notes/security-review.md',
    sourceType: 'local_file',
    excerpt: 'Rotate the signing key before release.',
    matchReason: {
      kind: 'content',
      detail: 'Matched exact phrase: signing key',
    },
    relevantProperty: {
      name: 'status',
      valuePreview: 'blocked',
    },
    location: {
      lineStart: 41,
      lineEnd: 43,
      blockId: 'release-checklist',
    },
    freshnessEvidence: {
      sourceStatus: 'ready',
      indexedAt: 100,
      sourceUpdatedAt: 90,
      indexedRevision: 'revision-2',
      sourceRevision: 'revision-2',
    },
    score: 0.92,
    ...overrides,
  };
}

describe('Context search result contracts', () => {
  it('builds a complete immutable display result with derived freshness and safe source action', () => {
    const [result] = buildContextSearchResults({
      accountId: 'account-1',
      mapId: 'map-1',
      candidates: [candidate()],
      limit: 20,
    });

    expect(result).toEqual({
      version: 1,
      id: 'result-1',
      accountId: 'account-1',
      mapId: 'map-1',
      entityId: 'entity-1',
      sourceId: 'source-1',
      title: 'Security review',
      path: 'notes/security-review.md',
      sourceType: 'local_file',
      excerpt: 'Rotate the signing key before release.',
      matchReason: {
        kind: 'content',
        detail: 'Matched exact phrase: signing key',
      },
      relevantProperty: {
        name: 'status',
        valuePreview: 'blocked',
      },
      location: {
        lineStart: 41,
        lineEnd: 43,
        blockId: 'release-checklist',
      },
      freshness: {
        status: 'current',
        indexedAt: 100,
        sourceUpdatedAt: 90,
        sourceRevision: 'revision-2',
      },
      sourceAction: {
        kind: 'open_local_source',
        sourceId: 'source-1',
        path: 'notes/security-review.md',
        location: {
          lineStart: 41,
          lineEnd: 43,
          blockId: 'release-checklist',
        },
      },
      score: 0.92,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.location)).toBe(true);
    expect(Object.isFrozen(result?.sourceAction)).toBe(true);
  });

  it('supports line, page, and block provenance plus an explicit empty relevant-property state', () => {
    const [result] = buildContextSearchResults({
      accountId: 'account-1',
      mapId: 'map-1',
      candidates: [
        candidate({
          sourceType: 'local_file',
          path: 'documents/release.pdf',
          relevantProperty: null,
          location: {
            lineStart: 8,
            lineEnd: 9,
            page: 12,
            blockId: 'approval-table',
          },
        }),
      ],
      limit: 1,
    });

    expect(result?.location).toEqual({
      lineStart: 8,
      lineEnd: 9,
      page: 12,
      blockId: 'approval-table',
    });
    expect(result?.relevantProperty).toBeNull();
  });

  it.each([
    ['local_folder', 'open_local_source'],
    ['local_file', 'open_local_source'],
    ['portable_markdown_folder', 'open_local_source'],
    ['github_repository', 'open_github_source'],
    ['linked_vibespace_content', 'open_vibespace_source'],
  ] as const)(
    'derives %s source actions without caller-supplied executable targets',
    (sourceType, kind) => {
      const [result] = buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: [candidate({ sourceType })],
        limit: 1,
      });

      expect(result?.sourceAction).toMatchObject({
        kind,
        sourceId: 'source-1',
        path: 'notes/security-review.md',
      });
      expect(result?.sourceAction).not.toHaveProperty('command');
      expect(result?.sourceAction).not.toHaveProperty('url');
    },
  );

  it('derives stale and unavailable freshness from trusted status, revision, and time evidence', () => {
    const results = buildContextSearchResults({
      accountId: 'account-1',
      mapId: 'map-1',
      candidates: [
        candidate({
          id: 'result-revision-stale',
          freshnessEvidence: {
            sourceStatus: 'ready',
            indexedAt: 90,
            sourceUpdatedAt: 100,
            indexedRevision: 'revision-1',
            sourceRevision: 'revision-2',
          },
        }),
        candidate({
          id: 'result-offline',
          entityId: 'entity-2',
          freshnessEvidence: {
            sourceStatus: 'offline',
            indexedAt: 100,
            sourceUpdatedAt: 100,
            indexedRevision: 'revision-2',
            sourceRevision: 'revision-2',
          },
        }),
      ],
      limit: 2,
    });

    expect(results.map(({ freshness }) => freshness.status)).toEqual(['stale', 'offline']);
  });

  it('turns selection into an exact map-node highlight and source-focus command', () => {
    const [result] = buildContextSearchResults({
      accountId: 'account-1',
      mapId: 'map-1',
      candidates: [candidate()],
      limit: 1,
    });

    expect(
      selectContextSearchResult({
        accountId: 'account-1',
        mapId: 'map-1',
        result,
      }),
    ).toEqual({
      version: 1,
      accountId: 'account-1',
      mapId: 'map-1',
      nodeId: 'entity-1',
      sourceId: 'source-1',
      highlight: 'context_map_node',
      focus: {
        path: 'notes/security-review.md',
        lineStart: 41,
        lineEnd: 43,
        blockId: 'release-checklist',
      },
      sourceAction: {
        kind: 'open_local_source',
        sourceId: 'source-1',
        path: 'notes/security-review.md',
        location: {
          lineStart: 41,
          lineEnd: 43,
          blockId: 'release-checklist',
        },
      },
    });
  });

  it('rejects cross-scope, unsafe, ambiguous, duplicate, and oversized result evidence', () => {
    const build = (entries: unknown[]) =>
      buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: entries as ContextSearchResultCandidateV1[],
        limit: 20,
      });

    expect(() => build([candidate({ accountId: 'account-2' })])).toThrowError(
      expect.objectContaining({ code: 'scope_mismatch' }),
    );
    expect(() => build([candidate({ path: '../private.txt' })])).toThrowError(
      expect.objectContaining({ code: 'invalid_result' }),
    );
    expect(() => build([candidate({ excerpt: 'unsafe\u0000excerpt' })])).toThrowError(
      expect.objectContaining({ code: 'invalid_result' }),
    );
    expect(() =>
      build([
        candidate({
          location: { lineStart: 4, page: 2 } as ContextSearchResultCandidateV1['location'],
        }),
      ]),
    ).toThrowError(expect.objectContaining({ code: 'invalid_result' }));
    expect(() => build([candidate(), candidate()])).toThrowError(
      expect.objectContaining({ code: 'duplicate_id' }),
    );
    expect(() =>
      buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: Array.from({ length: 101 }, (_, index) =>
          candidate({ id: `result-${index}`, entityId: `entity-${index}` }),
        ),
        limit: 20,
      }),
    ).toThrowError(expect.objectContaining({ code: 'too_many_results' }));
    expect(() => build([candidate({ score: Number.NaN })])).toThrowError(
      expect.objectContaining({ code: 'invalid_result' }),
    );
  });

  it('fails closed on forged selection scope and malformed runtime objects', () => {
    const [result] = buildContextSearchResults({
      accountId: 'account-1',
      mapId: 'map-1',
      candidates: [candidate()],
      limit: 1,
    });

    expect(() =>
      selectContextSearchResult({
        accountId: 'account-2',
        mapId: 'map-1',
        result,
      }),
    ).toThrowError(expect.objectContaining({ code: 'scope_mismatch' }));
    expect(() =>
      buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: [
          Object.defineProperty({}, 'id', {
            enumerable: true,
            get() {
              throw new Error('must not invoke accessors');
            },
          }) as ContextSearchResultCandidateV1,
        ],
        limit: 1,
      }),
    ).toThrowError(ContextSearchResultError);

    const symbolField = candidate();
    Object.defineProperty(symbolField, Symbol('hidden-action'), {
      enumerable: true,
      value: 'must not be ignored',
    });
    expect(() =>
      buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: [symbolField],
        limit: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_result' }));
  });

  it('rejects sparse, accessor-backed, and extended candidate arrays without invoking accessors', () => {
    const sparse = [candidate(), , candidate({ id: 'result-3', entityId: 'entity-3' })];
    expect(() =>
      buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: sparse as ContextSearchResultCandidateV1[],
        limit: 3,
      }),
    ).toThrowError(ContextSearchResultError);

    let accessorCalls = 0;
    const accessorBacked = [candidate()];
    Object.defineProperty(accessorBacked, '0', {
      enumerable: true,
      configurable: true,
      get() {
        accessorCalls += 1;
        return candidate();
      },
    });
    expect(() =>
      buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: accessorBacked,
        limit: 1,
      }),
    ).toThrowError(ContextSearchResultError);
    expect(accessorCalls).toBe(0);

    const extended = [candidate()] as ContextSearchResultCandidateV1[] & {
      hidden?: string;
    };
    extended.hidden = 'must not be ignored';
    expect(() =>
      buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: extended,
        limit: 1,
      }),
    ).toThrowError(ContextSearchResultError);
  });

  it('rejects transparent proxies at root, candidate, and nested record boundaries', () => {
    expect(() =>
      buildContextSearchResults(
        new Proxy(
          {
            accountId: 'account-1',
            mapId: 'map-1',
            candidates: [candidate()],
            limit: 1,
          },
          {},
        ),
      ),
    ).toThrowError(ContextSearchResultError);
    expect(() =>
      buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: [new Proxy(candidate(), {})],
        limit: 1,
      }),
    ).toThrowError(ContextSearchResultError);
    expect(() =>
      buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: [
          candidate({
            matchReason: new Proxy(
              {
                kind: 'content' as const,
                detail: 'Matched exact phrase',
              },
              {},
            ),
          }),
        ],
        limit: 1,
      }),
    ).toThrowError(ContextSearchResultError);
  });

  it('rejects C1, bidi, and single-line whitespace control text', () => {
    const build = (entry: ContextSearchResultCandidateV1) =>
      buildContextSearchResults({
        accountId: 'account-1',
        mapId: 'map-1',
        candidates: [entry],
        limit: 1,
      });

    expect(() => build(candidate({ title: 'Unsafe\u009btitle' }))).toThrowError(
      ContextSearchResultError,
    );
    expect(() => build(candidate({ excerpt: 'Spoof\u202erelease' }))).toThrowError(
      ContextSearchResultError,
    );
    expect(() => build(candidate({ path: 'notes/\tspoof.md' }))).toThrowError(
      ContextSearchResultError,
    );
  });
});
