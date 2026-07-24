import { describe, expect, it, vi } from 'vitest';
import type { FsReadResult } from '@/lib/fs';
import { contextMapCollectionKey, type ContextMapRecord, type ContextTreeNode } from './tree';
import {
  localKnowledgeChunkSourceMetadata,
  loadExplicitlySelectedContextMap,
  retrieveApprovedLocalKnowledge,
} from './retrieval';

function fileNode(path: string, overrides: Partial<ContextTreeNode> = {}): ContextTreeNode {
  return {
    id: `file:${path}`,
    title: path.split(/[\\/]/).at(-1) ?? path,
    kind: 'file',
    summary: '',
    path,
    modifiedAt: 1_786_000_000_000,
    ...overrides,
  };
}

function selectedMap(nodes: ContextTreeNode[]): ContextMapRecord {
  return {
    id: 'context-map-a',
    projectId: 'project-a',
    rootDir: 'C:\\approved-vault',
    name: 'Approved vault',
    status: 'active',
    createdAt: 1,
    updatedAt: 2,
    tree: {
      version: 1,
      projectId: 'project-a',
      rootDir: 'C:\\approved-vault',
      generatedAt: 1_786_000_000_000,
      model: 'local-fallback',
      fileCount: nodes.length,
      totalBytes: 1_000,
      summary: 'Approved local knowledge.',
      nodes,
    },
  };
}

function successfulRead(path: string, content: string): FsReadResult {
  return { ok: true, path, content };
}

describe('retrieveApprovedLocalKnowledge', () => {
  it('uses only the explicitly selected map instead of falling back to another active map', () => {
    const map = selectedMap([fileNode('notes\\Acme.md')]);
    const otherMap: ContextMapRecord = {
      ...map,
      id: 'context-map-b',
      rootDir: 'C:\\other-vault',
      tree: { ...map.tree, rootDir: 'C:\\other-vault' },
    };
    localStorage.setItem(
      contextMapCollectionKey('project-a'),
      JSON.stringify({
        version: 1,
        projectId: 'project-a',
        selectedMapId: null,
        maps: [map, otherMap],
      }),
    );
    expect(loadExplicitlySelectedContextMap('project-a')).toBeNull();

    localStorage.setItem(
      contextMapCollectionKey('project-a'),
      JSON.stringify({
        version: 1,
        projectId: 'project-a',
        selectedMapId: 'missing-selection',
        maps: [map, otherMap],
      }),
    );
    expect(loadExplicitlySelectedContextMap('project-a')).toBeNull();

    const deletedMap = { ...map, status: 'deleted' as const };
    localStorage.setItem(
      contextMapCollectionKey('project-a'),
      JSON.stringify({
        version: 1,
        projectId: 'project-a',
        selectedMapId: deletedMap.id,
        maps: [deletedMap, otherMap],
      }),
    );
    expect(loadExplicitlySelectedContextMap('project-a')).toBeNull();

    localStorage.setItem(
      contextMapCollectionKey('project-a'),
      JSON.stringify({
        version: 1,
        projectId: 'project-a',
        selectedMapId: map.id,
        maps: [map, otherMap],
      }),
    );
    expect(loadExplicitlySelectedContextMap('project-a')?.id).toBe(map.id);
    localStorage.removeItem(contextMapCollectionKey('project-a'));
  });

  it('parses and ranks bounded Markdown chunks with exact local provenance', async () => {
    const map = selectedMap([
      fileNode('notes\\Clients.md', {
        title: 'Clients',
        summary: 'Acme renewal and billing notes.',
        tags: ['client'],
      }),
      fileNode('notes\\Unrelated.md', {
        title: 'Unrelated',
        summary: 'Office furniture.',
      }),
    ]);
    const readTextFileSample = vi.fn(async (path: string) =>
      successfulRead(
        path,
        path.endsWith('Clients.md')
          ? [
              '---',
              'tags: [client, acme]',
              'contact: Jamie',
              '---',
              '# Acme',
              '',
              'General account notes.',
              '',
              '## Renewal plan',
              '',
              '- Renew the Acme support agreement in October.',
              '- Confirm billing with [[Finance]].',
              '',
              'Use the [approved proposal](proposals/acme.md).',
            ].join('\n')
          : '# Furniture\n\nOrder another chair.',
      ),
    );

    const results = await retrieveApprovedLocalKnowledge(
      {
        projectId: 'project-a',
        query: 'What is the Acme renewal and billing plan?',
      },
      {
        loadSelectedMap: () => map,
        readTextFileSample,
        now: () => 1_786_300_000_000,
      },
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      mapId: 'context-map-a',
      title: 'Clients',
      relativePath: 'notes/Clients.md',
      heading: 'Renewal plan',
      lineStart: 9,
      tags: ['acme', 'client'],
      wikiLinks: ['Finance'],
      markdownLinks: [{ label: 'approved proposal', target: 'proposals/acme.md' }],
      modifiedAt: 1_786_000_000_000,
    });
    expect(results[0]?.excerpt).toContain('Renew the Acme support agreement');
    expect(results[0]?.excerpt).toContain('[[Finance]]');
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
    expect(results[0]?.sourceId).toMatch(/^jlocal_[a-f0-9]{16}$/);
    expect(readTextFileSample).toHaveBeenCalledWith(
      'C:\\approved-vault\\notes\\Clients.md',
      64 * 1024,
      { root: 'C:\\approved-vault' },
    );
  });

  it('never reads denied paths and rejects secret-bearing or unsupported content', async () => {
    const map = selectedMap([
      fileNode('..\\outside.md'),
      fileNode('.env.local'),
      fileNode('credentials\\oauth_credentials.json'),
      fileNode('notes\\secret.md'),
      fileNode('notes\\safe.txt', { summary: 'Acme support renewal.' }),
      fileNode('images\\diagram.png'),
    ]);
    const readTextFileSample = vi.fn(
      async (path: string, _maxBytes: number, _options: { root: string }) =>
        successfulRead(
          path,
          path.endsWith('secret.md')
            ? 'ACME renewal\nOPENAI_API_KEY="synthetic-secret-value-that-must-be-blocked"'
            : 'Acme support renewal is scheduled for October.',
        ),
    );

    const results = await retrieveApprovedLocalKnowledge(
      { projectId: 'project-a', query: 'Acme support renewal' },
      {
        loadSelectedMap: () => map,
        readTextFileSample,
        now: () => 1_786_300_000_000,
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.relativePath).toBe('notes/safe.txt');
    expect(JSON.stringify(results)).not.toMatch(/synthetic-secret|OPENAI_API_KEY|credentials/i);
    expect(readTextFileSample).toHaveBeenCalledTimes(2);
    for (const call of readTextFileSample.mock.calls) {
      expect(call[2]).toEqual({ root: 'C:\\approved-vault' });
    }
    expect(readTextFileSample.mock.calls.map(([path]) => path)).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('outside'),
        expect.stringContaining('.env'),
        expect.stringContaining('oauth_credentials'),
        expect.stringContaining('diagram.png'),
      ]),
    );
  });

  it('supports MDX and selected structured text while deriving bounded backlinks', async () => {
    const map = selectedMap([
      fileNode('notes\\Customer.mdx', { title: 'Customer', summary: 'Acme account.' }),
      fileNode('notes\\Finance.md', { title: 'Finance', summary: 'Acme billing.' }),
      fileNode('data\\accounts.yaml', { title: 'Accounts', summary: 'Acme billing data.' }),
    ]);
    const readTextFileSample = vi.fn(async (path: string) => {
      if (path.endsWith('Customer.mdx')) {
        return successfulRead(
          path,
          [
            '---',
            'tags:',
            '  - acme',
            '  - client',
            '---',
            '# Account',
            '',
            'Acme billing details are tracked in [[Finance]].',
          ].join('\n'),
        );
      }
      if (path.endsWith('Finance.md')) {
        return successfulRead(
          path,
          '# Finance\n\nAnnual Acme billing. Related customer: [[Customer]].',
        );
      }
      return successfulRead(path, 'account: Acme\nbilling: annual');
    });

    const results = await retrieveApprovedLocalKnowledge(
      { projectId: 'project-a', query: 'Acme billing', maxResults: 6 },
      {
        loadSelectedMap: () => map,
        readTextFileSample,
        now: () => 1_786_300_000_000,
      },
    );

    expect(results.map((result) => result.relativePath)).toEqual(
      expect.arrayContaining(['notes/Customer.mdx', 'notes/Finance.md', 'data/accounts.yaml']),
    );
    expect(results.find((result) => result.relativePath === 'notes/Customer.mdx')).toMatchObject({
      tags: ['acme', 'client'],
      wikiLinks: ['Finance'],
      backlinks: ['notes/Finance.md'],
    });
    expect(results.find((result) => result.relativePath === 'notes/Finance.md')).toMatchObject({
      backlinks: ['notes/Customer.mdx'],
    });
  });

  it('canonicalizes wiki fragments and safe relative Markdown links for backlinks', async () => {
    const map = selectedMap([
      fileNode('notes\\Finance.md', { title: 'Finance', summary: 'Acme renewal ledger.' }),
      fileNode('notes\\projects\\Customer.md', { title: 'Customer' }),
      fileNode('Outside.md', { title: 'Outside' }),
    ]);
    const readTextFileSample = vi.fn(async (path: string) => {
      if (path.endsWith('Finance.md')) {
        return successfulRead(path, '# Q4\n\nThe decisive Acme renewal ledger.');
      }
      if (path.endsWith('Customer.md')) {
        return successfulRead(
          path,
          ['# Customer', '', 'See [[Finance#Q4|billing]] and [the ledger](../Finance.md#Q4).'].join(
            '\n',
          ),
        );
      }
      return successfulRead(path, '[Outside the map](../Finance.md)');
    });

    const results = await retrieveApprovedLocalKnowledge(
      { projectId: 'project-a', query: 'decisive Acme renewal ledger' },
      {
        loadSelectedMap: () => map,
        readTextFileSample,
        now: () => 1_786_300_000_000,
      },
    );

    expect(results.find((result) => result.relativePath === 'notes/Finance.md')).toMatchObject({
      backlinks: ['notes/projects/Customer.md'],
    });
  });

  it('keeps Markdown preambles and resolves aliased wiki-link targets', async () => {
    const map = selectedMap([fileNode('notes\\Kickoff.md', { title: 'Kickoff' })]);
    const readTextFileSample = vi.fn(async (path: string) =>
      successfulRead(
        path,
        [
          'The Acme kickoff owner is Jamie. See [[Finance|the finance note]].',
          '',
          '# Later',
          '',
          'Unrelated follow-up.',
        ].join('\n'),
      ),
    );

    const results = await retrieveApprovedLocalKnowledge(
      { projectId: 'project-a', query: 'Acme kickoff owner' },
      {
        loadSelectedMap: () => map,
        readTextFileSample,
        now: () => 1_786_300_000_000,
      },
    );

    expect(results[0]).toMatchObject({
      relativePath: 'notes/Kickoff.md',
      lineStart: 1,
      wikiLinks: ['Finance'],
    });
    expect(results[0]?.heading).toBeUndefined();
    expect(results[0]?.excerpt).toContain('Acme kickoff owner');
  });

  it('finds query hits after the first excerpt window without overstating line ranges', async () => {
    const map = selectedMap([fileNode('notes\\Long.txt', { title: 'Long note' })]);
    const content = [
      ...Array.from({ length: 300 }, (_, index) => `filler line ${index}`),
      'The decisive Acme renewal owner is Jamie.',
    ].join('\n');
    const readTextFileSample = vi.fn(async (path: string) => successfulRead(path, content));

    const results = await retrieveApprovedLocalKnowledge(
      { projectId: 'project-a', query: 'decisive Acme renewal owner' },
      {
        loadSelectedMap: () => map,
        readTextFileSample,
        now: () => 1_786_300_000_000,
      },
    );

    expect(results[0]?.excerpt).toContain('decisive Acme renewal owner');
    expect(results[0]?.lineStart).toBeGreaterThan(1);
    expect(results[0]?.lineEnd).toBeGreaterThanOrEqual(results[0]?.lineStart ?? 0);
    expect(results[0]?.excerpt.length).toBeLessThanOrEqual(1_600);
  });

  it('finds late query hits in structured text and long Markdown sections', async () => {
    const map = selectedMap([
      fileNode('data\\archive.json', { title: 'Archive' }),
      fileNode('notes\\record.md', { title: 'Record' }),
    ]);
    const filler = Array.from({ length: 220 }, (_, index) => `filler_${index}: "value"`);
    const readTextFileSample = vi.fn(async (path: string) =>
      successfulRead(
        path,
        path.endsWith('.json')
          ? [...filler, '"critical_fact": "quasar approval is Jamie"'].join('\n')
          : ['# Record', '', ...filler, 'The quasar approval is Jamie.'].join('\n'),
      ),
    );

    const results = await retrieveApprovedLocalKnowledge(
      { projectId: 'project-a', query: 'quasar approval Jamie', maxResults: 6 },
      {
        loadSelectedMap: () => map,
        readTextFileSample,
        now: () => 1_786_300_000_000,
      },
    );

    expect(results.map((result) => result.relativePath)).toEqual(
      expect.arrayContaining(['data/archive.json', 'notes/record.md']),
    );
    for (const result of results) {
      expect(result.excerpt).toContain('quasar approval');
      expect(result.lineStart).toBeGreaterThan(1);
      expect(result.excerpt.length).toBeLessThanOrEqual(1_600);
    }
  });

  it('rejects relative roots and omits invalid source timestamps', async () => {
    const relativeRootMap = {
      ...selectedMap([fileNode('notes\\Acme.md')]),
      rootDir: 'approved-vault',
      tree: {
        ...selectedMap([]).tree,
        rootDir: 'approved-vault',
        nodes: [fileNode('notes\\Acme.md')],
      },
    };
    const invalidTimestampMap = selectedMap([
      fileNode('notes\\Acme.md', { modifiedAt: Number.MAX_SAFE_INTEGER + 1 }),
    ]);
    const readTextFileSample = vi.fn(async (path: string) =>
      successfulRead(path, 'The Acme renewal owner is Jamie.'),
    );
    const deps = {
      loadSelectedMap: () => relativeRootMap,
      readTextFileSample,
      now: () => 1_786_300_000_000,
    };

    await expect(
      retrieveApprovedLocalKnowledge({ projectId: 'project-a', query: 'Acme renewal' }, deps),
    ).resolves.toEqual([]);
    expect(readTextFileSample).not.toHaveBeenCalled();

    const results = await retrieveApprovedLocalKnowledge(
      { projectId: 'project-a', query: 'Acme renewal' },
      { ...deps, loadSelectedMap: () => invalidTimestampMap },
    );
    expect(results[0]).not.toHaveProperty('modifiedAt');
  });

  it('bounds source labels and falls back to exact line anchors for oversized heading fragments', () => {
    const metadata = localKnowledgeChunkSourceMetadata({
      sourceId: 'jlocal_5555555555555555',
      mapId: 'context-map-a',
      title: 'T'.repeat(240),
      relativePath: `notes/${'p'.repeat(360)}.md`,
      heading: '更新'.repeat(240),
      lineStart: 81,
      lineEnd: 95,
      excerpt: 'Acme renewal.',
      tags: [],
      wikiLinks: [],
      markdownLinks: [],
      backlinks: [],
      modifiedAt: 90,
      score: 1,
      contentHash: 'e'.repeat(64),
    });

    expect(metadata.label.length).toBeLessThanOrEqual(240);
    expect(metadata.uri.length).toBeLessThanOrEqual(480);
    expect(metadata.uri).toMatch(/#L81-L95$/);
  });

  it('requires the exact selected project map and returns a small deterministic result set', async () => {
    const nodes = Array.from({ length: 12 }, (_, index) =>
      fileNode(`notes\\topic-${index}.md`, {
        title: index === 7 ? 'Acme Renewal' : `Topic ${index}`,
        summary: `Acme renewal reference ${index}.`,
        modifiedAt: 1_786_000_000_000 + index,
      }),
    );
    const map = selectedMap(nodes);
    const readTextFileSample = vi.fn(async (path: string) =>
      successfulRead(
        path,
        `# ${path.includes('topic-7') ? 'Acme Renewal' : 'Reference'}\n\nAcme renewal details for this note. ${'bounded '.repeat(900)}`,
      ),
    );
    const deps = {
      loadSelectedMap: (projectId: string | null) => (projectId === 'project-a' ? map : null),
      readTextFileSample,
      now: () => 1_786_300_000_000,
    };

    await expect(
      retrieveApprovedLocalKnowledge({ projectId: 'project-b', query: 'Acme renewal' }, deps),
    ).resolves.toEqual([]);
    const results = await retrieveApprovedLocalKnowledge(
      {
        projectId: 'project-a',
        query: 'Acme renewal',
        maxResults: 3,
      },
      deps,
    );

    expect(results).toHaveLength(3);
    expect(results[0]?.relativePath).toBe('notes/topic-7.md');
    expect(results.every((result) => result.excerpt.length <= 1_600)).toBe(true);
    expect(new Set(results.map((result) => result.sourceId)).size).toBe(3);
    expect(readTextFileSample).toHaveBeenCalledTimes(8);
  });

  it('does not retrieve from an absent, deleted, or queryless selected map', async () => {
    const readTextFileSample = vi.fn();
    const deleted = { ...selectedMap([fileNode('notes\\a.md')]), status: 'deleted' as const };

    for (const [map, query] of [
      [null, 'Acme'],
      [deleted, 'Acme'],
      [selectedMap([fileNode('notes\\a.md')]), 'the and please'],
    ] as const) {
      await expect(
        retrieveApprovedLocalKnowledge(
          { projectId: 'project-a', query },
          {
            loadSelectedMap: () => map,
            readTextFileSample,
            now: () => 1_786_300_000_000,
          },
        ),
      ).resolves.toEqual([]);
    }
    expect(readTextFileSample).not.toHaveBeenCalled();
  });
});
