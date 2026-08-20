import { describe, expect, it, vi } from 'vitest';
import type { SecondBrainChange } from './nightlySecondBrain';
import {
  applySiyuanManagedChanges,
  proposeSiyuanManagedChanges,
  rollbackSiyuanManagedChanges,
} from './siyuanManagedKnowledge';
import type { ProductionSiyuanRlmPort, SiyuanManagedDocument } from './siyuanRlmProduction';

function memoryPort(
  initial: readonly SiyuanManagedDocument[] = [],
  options: { failCreatePath?: string } = {},
) {
  const documents = new Map(initial.map((document) => [document.id, { ...document }]));
  const events: string[] = [];
  let nextId = 1;
  const port: ProductionSiyuanRlmPort = {
    searchBlocks: vi.fn(async () => []),
    getBlock: vi.fn(async () => {
      throw new Error('unused');
    }),
    readManagedDocument: vi.fn(async (_projectId, lookup) => {
      events.push(`read:${lookup.query}`);
      return (
        [...documents.values()].find((document) => document.markdown.includes(lookup.marker)) ??
        null
      );
    }),
    createManagedDocument: vi.fn(async (_projectId, path, markdown) => {
      if (path === options.failCreatePath) throw new Error('injected_create_failure');
      const document = {
        id: `created-${nextId++}`,
        notebookId: 'managed-notebook',
        path,
        markdown,
      };
      documents.set(document.id, document);
      events.push(`create:${path}`);
      return document;
    }),
    updateManagedDocument: vi.fn(async (_projectId, id, expected, markdown) => {
      const current = documents.get(id);
      if (!current || current.markdown !== expected) throw new Error('siyuan_conflict');
      const updated = { ...current, markdown };
      documents.set(id, updated);
      events.push(`update:${id}`);
      return updated;
    }),
    deleteManagedDocument: vi.fn(async (_projectId, id, expected) => {
      const current = documents.get(id);
      if (!current || current.markdown !== expected) throw new Error('siyuan_conflict');
      documents.delete(id);
      events.push(`delete:${id}`);
    }),
    createManagedSnapshot: vi.fn(async (_projectId, memo) => {
      events.push(`snapshot:${memo}`);
    }),
    stopActive: vi.fn(async () => undefined),
  };
  return { documents, events, port };
}

const proposal = Object.freeze({
  target: 'context_map' as const,
  content: 'The project uses the pinned SiYuan v3.8.1 runtime.',
  provenance: Object.freeze(['project:alpha:1', 'context:map:2']),
  confidence: 0.96,
});

describe('SiYuan managed Nightly knowledge', () => {
  it('proposes marker-bound source-linked changes without performing writes', async () => {
    const { events, port } = memoryPort();
    const changes = await proposeSiyuanManagedChanges({
      projectId: 'project-alpha',
      proposals: [proposal],
      port,
      now: 123,
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id: 'second-brain-change-123-0',
      target: 'context_map',
      backend: 'siyuan',
      path: '/VibeSpace Managed/Project Context',
      before: '',
    });
    expect(changes[0].after).toContain('<!-- vibespace-managed-key:project-context -->');
    expect(changes[0].after).toContain('Sources: project:alpha:1, context:map:2');
    expect(events).toEqual(['read:VibeSpace Project Context']);
  });

  it('creates a snapshot before typed writes and returns authoritative created identities', async () => {
    const { documents, events, port } = memoryPort();
    const changes = await proposeSiyuanManagedChanges({
      projectId: 'project-alpha',
      proposals: [proposal],
      port,
      now: 123,
    });
    events.length = 0;

    const receipt = await applySiyuanManagedChanges({
      projectId: 'project-alpha',
      changes,
      port,
    });

    expect(receipt.snapshotCreated).toBe(true);
    expect(receipt.changes[0].targetBlockId).toBe('created-1');
    expect(events[0]).toMatch(/^snapshot:Nightly managed context /u);
    expect(events[1]).toBe('create:/VibeSpace Managed/Project Context');
    expect(documents.get('created-1')?.markdown).toBe(changes[0].after);
  });

  it('rolls back new and updated documents using current authoritative content', async () => {
    const existing = {
      id: 'existing-1',
      notebookId: 'managed-notebook',
      path: '/VibeSpace Managed/User Profile',
      markdown:
        '# VibeSpace User Profile\n\n<!-- vibespace-managed-key:user-profile -->\n\n- Before\n',
    };
    const { documents, port } = memoryPort([existing]);
    const proposed = await proposeSiyuanManagedChanges({
      projectId: 'project-alpha',
      proposals: [
        {
          target: 'user_md',
          content: 'Prefers concise updates.',
          provenance: ['chat:1'],
          confidence: 0.9,
        },
        proposal,
      ],
      port,
      now: 321,
    });
    const receipt = await applySiyuanManagedChanges({
      projectId: 'project-alpha',
      changes: proposed,
      port,
    });

    await rollbackSiyuanManagedChanges({
      projectId: 'project-alpha',
      changes: [...receipt.changes].reverse(),
      port,
    });

    expect(documents.get('existing-1')?.markdown).toBe(existing.markdown);
    expect([...documents.values()]).toHaveLength(1);
  });

  it('compensates earlier writes in reverse order when a later mutation fails', async () => {
    const { documents, events, port } = memoryPort([], {
      failCreatePath: '/VibeSpace Managed/Working Context',
    });
    const changes = await proposeSiyuanManagedChanges({
      projectId: 'project-alpha',
      proposals: [
        proposal,
        {
          target: 'related_markdown',
          content: 'Keep the verification fixture outside the release bundle.',
          provenance: ['project:alpha:2'],
          confidence: 0.94,
        },
      ],
      port,
      now: 456,
    });
    events.length = 0;

    await expect(
      applySiyuanManagedChanges({ projectId: 'project-alpha', changes, port }),
    ).rejects.toThrow('injected_create_failure');
    expect([...documents.values()]).toHaveLength(0);
    expect(events).toEqual([
      expect.stringMatching(/^snapshot:Nightly managed context /u),
      'create:/VibeSpace Managed/Project Context',
      'read:VibeSpace Project Context',
      'delete:created-1',
    ]);
  });

  it('fails closed on reviewed-target drift before any snapshot or mutation', async () => {
    const { events, port } = memoryPort();
    const invalid: SecondBrainChange = {
      id: 'invalid',
      target: 'context_map',
      backend: 'siyuan',
      path: '/wrong',
      before: '',
      after: '<!-- vibespace-managed-key:project-context -->',
      provenance: ['project:1'],
      confidence: 1,
    };

    await expect(
      applySiyuanManagedChanges({ projectId: 'project-alpha', changes: [invalid], port }),
    ).rejects.toThrow('siyuan_managed_change_target_invalid');
    expect(events).toEqual([]);
  });
});
