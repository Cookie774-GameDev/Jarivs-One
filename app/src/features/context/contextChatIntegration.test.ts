import { describe, expect, it } from 'vitest';
import {
  CONTEXT_CHAT_ATTACHMENT_LEVELS,
  buildContextChatAttachment,
  buildMapSummaryChatAttachment,
  contextAttachmentTokenView,
  contextChatAttachmentKey,
  contextChatAttachmentMatchesProject,
  contextMapPickerOption,
  normalizeContextChatAttachment,
} from './contextChatIntegration';
import type { ContextMapRecord } from './tree';

const now = Date.UTC(2026, 6, 26, 12);
const map: ContextMapRecord = {
  id: 'map-1',
  projectId: 'project-1',
  rootDir: 'C:/project',
  name: 'Release map',
  status: 'active',
  createdAt: now - 2_000,
  updatedAt: now - 1_000,
  sourceType: 'github_repository',
  sourceLabel: 'octo/repo',
  branchRef: 'feature/chat-context',
  lastIndexedAt: now - 1_000,
  tree: {
    version: 1,
    projectId: 'project-1',
    rootDir: 'C:/project',
    generatedAt: now - 1_000,
    model: 'local-fallback',
    fileCount: 2,
    totalBytes: 100,
    summary: 'Release context',
    nodes: [
      {
        id: 'root-1',
        title: 'Release map',
        kind: 'root',
        summary: 'Root',
        children: [
          { id: 'note-1', title: 'Plan', kind: 'note', summary: 'Plan' },
          { id: 'file-1', title: 'app.ts', kind: 'file', summary: 'App' },
        ],
      },
    ],
  },
};

describe('Context chat integration', () => {
  it('supports every approved attachment level through one closed contract', () => {
    expect(CONTEXT_CHAT_ATTACHMENT_LEVELS).toEqual([
      'map_summary',
      'entity',
      'note',
      'heading',
      'block',
      'saved_view',
      'search_results',
      'github_pull_request',
      'graph_cluster',
    ]);
    for (const attachmentLevel of CONTEXT_CHAT_ATTACHMENT_LEVELS) {
      expect(
        buildContextChatAttachment({
          projectId: 'project-1',
          rootDir: 'C:/project',
          generatedAt: now,
          nodeId: `node-${attachmentLevel}`,
          mapId: 'map-1',
          title: attachmentLevel,
          kind: attachmentLevel === 'note' ? 'note' : 'symbol',
          summary: 'Scoped Context',
          attachmentLevel,
          source: {
            type: attachmentLevel === 'github_pull_request' ? 'github_repository' : 'local_folder',
            label: attachmentLevel === 'github_pull_request' ? 'octo/repo#42' : 'Project',
            branchRef: 'main',
          },
          freshness: 'current',
          itemCount: 2,
          lastIndexedAt: now,
        }).attachmentLevel,
      ).toBe(attachmentLevel);
    }
  });

  it('builds a whole-map attachment with truthful source, freshness, recursive count, ref, and indexed time', () => {
    const attachment = buildMapSummaryChatAttachment(map, now);
    expect(attachment).toMatchObject({
      attachmentLevel: 'map_summary',
      mapId: 'map-1',
      source: {
        type: 'github_repository',
        label: 'octo/repo',
        branchRef: 'feature/chat-context',
      },
      freshness: 'current',
      itemCount: 3,
      lastIndexedAt: now - 1_000,
    });
    expect(Object.isFrozen(attachment)).toBe(true);
    expect(Object.isFrozen(attachment.source)).toBe(true);
  });

  it('upgrades the preserved map picker with every required discovery fact', () => {
    const option = contextMapPickerOption(map, now);
    expect(option.label).toBe('Release map');
    expect(option.description).toMatch(/GitHub · octo\/repo · current · 3 entities/i);
    expect(option.metadata).toMatch(/feature\/chat-context · indexed/i);
  });

  it('renders all required token facts while retaining removal as a UI responsibility', () => {
    const token = contextAttachmentTokenView(buildMapSummaryChatAttachment(map, now), now);
    expect(token.label).toBe('Release map');
    expect(token.source).toBe('octo/repo');
    expect(token.freshness).toBe('current');
    expect(token.itemCount).toBe(3);
    expect(token.sublabel).toBe('octo/repo · feature/chat-context · current · 3 items');
    expect(token.accessibleLabel).toContain('source octo/repo');
    expect(contextChatAttachmentKey(buildMapSummaryChatAttachment(map, now))).toBe(
      'p9:project-15:map-16:root-1map_summary',
    );
    expect(
      contextChatAttachmentMatchesProject(buildMapSummaryChatAttachment(map, now), 'project-1'),
    ).toBe(true);
    expect(contextChatAttachmentMatchesProject(buildMapSummaryChatAttachment(map, now), null)).toBe(
      false,
    );
  });

  it('normalizes legacy dropped nodes without breaking the existing event path', () => {
    expect(
      normalizeContextChatAttachment(
        {
          projectId: 'project-1',
          rootDir: 'C:/project',
          generatedAt: now,
          nodeId: 'note-1',
          title: 'Plan',
          kind: 'note',
          summary: 'Plan',
          childrenCount: 2,
        },
        now,
      ),
    ).toMatchObject({
      attachmentLevel: 'note',
      mapId: 'note-1',
      source: { type: 'local_folder', label: 'Local folder', branchRef: 'workspace' },
      freshness: 'current',
      itemCount: 3,
    });
  });

  it('marks old and future index timestamps safely and rejects malformed inputs', () => {
    expect(
      buildMapSummaryChatAttachment({ ...map, lastIndexedAt: now - 2 * 24 * 60 * 60 * 1_000 }, now)
        .freshness,
    ).toBe('stale');
    expect(buildMapSummaryChatAttachment({ ...map, lastIndexedAt: now + 1 }, now).freshness).toBe(
      'unknown',
    );
    expect(() =>
      buildContextChatAttachment({
        ...buildMapSummaryChatAttachment(map, now),
        itemCount: 0,
      }),
    ).toThrow(/item count/i);
    expect(() =>
      buildContextChatAttachment({
        ...buildMapSummaryChatAttachment(map, now),
        attachmentLevel: 'unsafe' as never,
      }),
    ).toThrow(/attachment level/i);
    expect(() =>
      buildContextChatAttachment({
        ...buildMapSummaryChatAttachment(map, now),
        unexpected: 'authority' as never,
      } as never),
    ).toThrow(/fields/i);
    const symbolic = { ...buildMapSummaryChatAttachment(map, now) };
    Object.defineProperty(symbolic, Symbol('hidden'), { value: 'authority', enumerable: true });
    expect(() => buildContextChatAttachment(symbolic)).toThrow(/boundary/i);
    let getterCalls = 0;
    const hostileTags: string[] = [];
    Object.defineProperty(hostileTags, '0', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'secret';
      },
    });
    Object.defineProperty(hostileTags, 'length', { value: 1 });
    expect(() =>
      buildContextChatAttachment({
        ...buildMapSummaryChatAttachment(map, now),
        tags: hostileTags,
      }),
    ).toThrow(/boundary/i);
    expect(getterCalls).toBe(0);
    expect(() =>
      normalizeContextChatAttachment({
        ...buildMapSummaryChatAttachment(map, now),
        itemCount: 0,
      }),
    ).toThrow(/item count/i);
  });
});
