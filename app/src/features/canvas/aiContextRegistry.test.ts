import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileCanvasAiContext } from './aiContext';
import {
  createCanvasBlock,
  createCanvasDocument,
  withBlockAdded,
  type CanvasDocument,
} from './contracts';
import {
  buildActiveCanvasChatAttachments,
  clearActiveCanvasAiContextForTests,
  mergeActiveCanvasPromptForgeSources,
  publishActiveCanvasAiContextProvider,
  readActiveCanvasAiContext,
} from './aiContextRegistry';
import type { PromptForgeSourceCandidate } from '@/features/prompt-forge/sourcePack';

function documentFixture(title: string): CanvasDocument {
  const document = createCanvasDocument({
    id: 'canvas-1',
    projectId: 'project-1',
    ownerId: 'account-1',
    title,
    now: 10,
  });
  return withBlockAdded(
    document,
    createCanvasBlock({
      id: 'note-1',
      content: { kind: 'note', text: 'Ship the desktop beta.' },
      now: 20,
    }),
    20,
  );
}

function context(title = 'Launch canvas') {
  return compileCanvasAiContext({
    document: documentFixture(title),
    selectedBlockIds: ['note-1'],
  });
}

afterEach(() => {
  clearActiveCanvasAiContextForTests();
});

describe('active Canvas AI context registry', () => {
  it('rejects a publication whose account and document owner differ', () => {
    const provider = vi.fn(() => context());
    publishActiveCanvasAiContextProvider({
      accountId: 'account-1',
      ownerId: 'account-1',
      projectId: 'project-1',
      canvasId: 'canvas-1',
      getContext: () => context('Stale context'),
    });
    publishActiveCanvasAiContextProvider({
      accountId: 'account-1',
      ownerId: 'account-other',
      projectId: 'project-1',
      canvasId: 'canvas-1',
      getContext: provider,
    });

    expect(
      readActiveCanvasAiContext({ accountId: 'account-1', projectId: 'project-1' }),
    ).toBeNull();
    expect(provider).not.toHaveBeenCalled();
  });

  it('compiles lazily only for the exact active account and project scope', () => {
    const provider = vi.fn(() => context());
    const release = publishActiveCanvasAiContextProvider({
      accountId: 'account-1',
      ownerId: 'account-1',
      projectId: 'project-1',
      canvasId: 'canvas-1',
      getContext: provider,
    });

    expect(provider).not.toHaveBeenCalled();
    expect(
      readActiveCanvasAiContext({ accountId: 'account-other', projectId: 'project-1' }),
    ).toBeNull();
    expect(provider).not.toHaveBeenCalled();
    expect(
      readActiveCanvasAiContext({ accountId: 'account-1', projectId: 'project-other' }),
    ).toBeNull();
    expect(provider).not.toHaveBeenCalled();

    const active = readActiveCanvasAiContext({
      accountId: 'account-1',
      projectId: 'project-1',
    });
    expect(active?.canvas).toMatchObject({ id: 'canvas-1', title: 'Launch canvas' });
    expect(active?.selection.map(({ id }) => id)).toEqual(['note-1']);
    expect(provider).toHaveBeenCalledTimes(1);

    release();
    expect(
      readActiveCanvasAiContext({ accountId: 'account-1', projectId: 'project-1' }),
    ).toBeNull();
  });

  it('keeps a newer publication when an older lease releases', () => {
    const releaseFirst = publishActiveCanvasAiContextProvider({
      accountId: 'account-1',
      ownerId: 'account-1',
      projectId: 'project-1',
      canvasId: 'canvas-1',
      getContext: () => context('First'),
    });
    const releaseSecond = publishActiveCanvasAiContextProvider({
      accountId: 'account-1',
      ownerId: 'account-1',
      projectId: 'project-1',
      canvasId: 'canvas-1',
      getContext: () => context('Second'),
    });

    releaseFirst();
    expect(
      readActiveCanvasAiContext({ accountId: 'account-1', projectId: 'project-1' })?.canvas.title,
    ).toBe('Second');
    releaseSecond();
    expect(
      readActiveCanvasAiContext({ accountId: 'account-1', projectId: 'project-1' }),
    ).toBeNull();
  });

  it('merges bounded Canvas sources only while the matching Canvas route is active', () => {
    const base: PromptForgeSourceCandidate = Object.freeze({
      id: 'chat-1',
      kind: 'chat',
      label: 'Current chat',
      reference: 'chat://chat-1',
      content: 'Conversation context',
      verified: true,
      explicit: true,
      projectScoped: true,
      trust: 'project',
      exactMatch: true,
      lexicalScore: 1,
      semanticScore: null,
      taskIntentScore: 1,
      observedAt: 20,
      whySelected: 'Current chat',
    });
    const provider = vi.fn(() => context());
    publishActiveCanvasAiContextProvider({
      accountId: 'account-1',
      ownerId: 'account-1',
      projectId: 'project-1',
      canvasId: 'canvas-1',
      getContext: provider,
    });

    expect(
      mergeActiveCanvasPromptForgeSources(
        [base],
        { accountId: 'account-1', projectId: 'project-1' },
        false,
      ).map(({ id }) => id),
    ).toEqual(['chat-1']);
    expect(provider).not.toHaveBeenCalled();

    const merged = mergeActiveCanvasPromptForgeSources(
      [base],
      { accountId: 'account-1', projectId: 'project-1' },
      true,
    );
    expect(merged.map(({ id }) => id)).toEqual([
      'chat-1',
      'canvas:canvas-1',
      'canvas-block:canvas-1:note-1',
    ]);
    expect(merged[2]).toMatchObject({
      kind: 'canvas',
      label: 'note block note-1',
      reference: 'canvas:canvas-1#note-1',
    });
    expect(Object.isFrozen(merged)).toBe(true);
  });

  it('builds immutable request-scoped chat attachments for the current canvas', () => {
    publishActiveCanvasAiContextProvider({
      accountId: 'account-1',
      ownerId: 'account-1',
      projectId: 'project-1',
      canvasId: 'canvas-1',
      getContext: () => context(),
    });

    const attachments = buildActiveCanvasChatAttachments(
      { accountId: 'account-1', projectId: 'project-1' },
      'current',
    );

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      projectId: 'project-1',
      mapId: 'canvas-1',
      nodeId: 'canvas:canvas-1',
      title: 'Launch canvas',
      kind: 'root',
      attachmentLevel: 'map_summary',
      source: { type: 'linked_vibespace_content', label: 'Canvas: Launch canvas' },
      freshness: 'current',
      itemCount: 1,
    });
    expect(attachments[0]?.summary).toContain('Active canvas: Launch canvas (canvas-1)');
    expect(attachments[0]?.summary).toContain('Object types: note=1');
    expect(Object.isFrozen(attachments)).toBe(true);
    expect(Object.isFrozen(attachments[0])).toBe(true);
    expect(JSON.stringify(attachments)).not.toContain('account-1');
  });

  it('attaches at most eight selected objects and rejects the wrong account or project', () => {
    let document = createCanvasDocument({
      id: 'canvas-1',
      projectId: 'project-1',
      ownerId: 'account-1',
      title: 'Selection canvas',
      now: 10,
    });
    const selectedBlockIds: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const id = `note-${index + 1}`;
      selectedBlockIds.push(id);
      document = withBlockAdded(
        document,
        createCanvasBlock({
          id,
          content: { kind: 'note', text: `Selection ${index + 1}` },
          now: 20 + index,
        }),
        20 + index,
      );
    }
    const selectedDocument = document;
    publishActiveCanvasAiContextProvider({
      accountId: 'account-1',
      ownerId: 'account-1',
      projectId: 'project-1',
      canvasId: 'canvas-1',
      getContext: () =>
        compileCanvasAiContext({
          document: selectedDocument,
          selectedBlockIds,
        }),
    });

    expect(
      buildActiveCanvasChatAttachments(
        { accountId: 'account-other', projectId: 'project-1' },
        'selection',
      ),
    ).toEqual([]);
    expect(
      buildActiveCanvasChatAttachments(
        { accountId: 'account-1', projectId: 'project-other' },
        'selection',
      ),
    ).toEqual([]);

    const attachments = buildActiveCanvasChatAttachments(
      { accountId: 'account-1', projectId: 'project-1' },
      'selection',
    );
    expect(attachments).toHaveLength(8);
    expect(attachments.map(({ nodeId }) => nodeId)).toEqual(
      selectedBlockIds.slice(0, 8).map((id) => `canvas:canvas-1:${id}`),
    );
    expect(attachments[0]).toMatchObject({
      title: 'note block note-1',
      summary: 'Selection 1',
      exactExcerpt: 'Selection 1',
      attachmentLevel: 'block',
      itemCount: 1,
    });
  });
});
