import { describe, expect, it } from 'vitest';
import {
  CanvasValidationError,
  createCanvasBlock,
  createCanvasDocument,
  withBlockAdded,
  withArchived,
  withDeleted,
  withPlacement,
  type CanvasDocument,
} from './contracts';
import {
  createCanvasGlobalSearchIndex,
  requestCanvasGlobalSearchNavigation,
  selectCanvasGlobalSearchResult,
  subscribeCanvasGlobalSearchNavigation,
  takePendingCanvasGlobalSearchNavigation,
} from './globalSearch';

const NOW = 1_750_000_000_000;

function documentWithText(input: {
  id: string;
  projectId?: string;
  ownerId?: string;
  title: string;
  blockId: string;
  text: string;
  x?: number;
}): CanvasDocument {
  let document = createCanvasDocument({
    id: input.id,
    projectId: input.projectId ?? 'project-1',
    ownerId: input.ownerId ?? 'owner-1',
    title: input.title,
    now: NOW,
  });
  document = withBlockAdded(
    document,
    createCanvasBlock({
      id: input.blockId,
      content: { kind: 'text', text: input.text },
      now: NOW,
    }),
    NOW,
  );
  return withPlacement(
    document,
    {
      blockId: input.blockId,
      x: input.x ?? 100,
      y: 200,
      width: 300,
      height: 120,
    },
    NOW,
  );
}

describe('Canvas global search', () => {
  it('finds canvas titles and textual content across account-scoped documents', () => {
    const first = documentWithText({
      id: 'canvas-alpha',
      title: 'Launch roadmap',
      blockId: 'alpha-note',
      text: 'Coordinate the beta launch',
    });
    const second = documentWithText({
      id: 'canvas-beta',
      title: 'Research board',
      blockId: 'beta-note',
      text: 'Interview synthesis',
      x: 800,
    });
    const index = createCanvasGlobalSearchIndex({
      ownerId: 'owner-1',
      documents: [second, first],
    });

    expect(index.query({ text: 'roadmap' })).toMatchObject([
      {
        documentId: 'canvas-alpha',
        canvasTitle: 'Launch roadmap',
        objectId: 'canvas-alpha',
        objectType: 'document',
      },
    ]);
    expect(index.query({ text: 'interview' })).toMatchObject([
      {
        documentId: 'canvas-beta',
        canvasTitle: 'Research board',
        objectId: 'beta-note',
        objectType: 'text',
        focus: { x: 800, y: 200, width: 300, height: 120 },
      },
    ]);
  });

  it('combines existing Canvas filters and ranks results deterministically across canvases', () => {
    const zeta = documentWithText({
      id: 'canvas-zeta',
      title: 'Zeta',
      blockId: 'zeta-note',
      text: 'shared phrase',
    });
    const alpha = documentWithText({
      id: 'canvas-alpha',
      title: 'Alpha',
      blockId: 'alpha-note',
      text: 'shared phrase',
    });
    const index = createCanvasGlobalSearchIndex({
      ownerId: 'owner-1',
      documents: [zeta, alpha],
    });

    expect(
      index.query({ text: 'shared', objectType: 'text' }).map((result) => result.documentId),
    ).toEqual(['canvas-alpha', 'canvas-zeta']);
    expect(index.query({ objectType: 'document', limit: 1 })).toMatchObject([
      { documentId: 'canvas-alpha', objectType: 'document' },
    ]);
  });

  it('fails closed instead of indexing a document outside the owner or project scope', () => {
    const wrongOwner = documentWithText({
      id: 'canvas-other-owner',
      ownerId: 'owner-2',
      title: 'Private',
      blockId: 'private-note',
      text: 'must not leak',
    });
    const wrongProject = documentWithText({
      id: 'canvas-other-project',
      projectId: 'project-2',
      title: 'Other project',
      blockId: 'other-note',
      text: 'must not leak',
    });

    expect(() =>
      createCanvasGlobalSearchIndex({ ownerId: 'owner-1', documents: [wrongOwner] }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      createCanvasGlobalSearchIndex({
        ownerId: 'owner-1',
        projectId: 'project-1',
        documents: [wrongProject],
      }),
    ).toThrow(CanvasValidationError);
  });

  it('supports explicit account-global multi-project indexing and skips archived or deleted canvases', () => {
    const projectOne = documentWithText({
      id: 'canvas-project-one',
      projectId: 'project-1',
      title: 'Project one',
      blockId: 'project-one-note',
      text: 'shared account result',
    });
    const projectTwo = documentWithText({
      id: 'canvas-project-two',
      projectId: 'project-2',
      title: 'Project two',
      blockId: 'project-two-note',
      text: 'shared account result',
    });
    const archived = withArchived(
      documentWithText({
        id: 'canvas-archived',
        title: 'Archived',
        blockId: 'archived-note',
        text: 'shared account result',
      }),
      true,
      NOW + 1,
    );
    const deleted = withDeleted(
      documentWithText({
        id: 'canvas-deleted',
        title: 'Deleted',
        blockId: 'deleted-note',
        text: 'shared account result',
      }),
      true,
      NOW + 1,
    );

    const results = createCanvasGlobalSearchIndex({
      ownerId: 'owner-1',
      documents: [deleted, projectTwo, archived, projectOne],
    }).query({ text: 'shared' });

    expect(results.map((result) => result.documentId)).toEqual([
      'canvas-project-one',
      'canvas-project-two',
    ]);
  });

  it('rejects duplicate document identities and malformed queries', () => {
    const document = documentWithText({
      id: 'canvas-one',
      title: 'One',
      blockId: 'one-note',
      text: 'one',
    });

    expect(() =>
      createCanvasGlobalSearchIndex({
        ownerId: 'owner-1',
        documents: [document, document],
      }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      createCanvasGlobalSearchIndex({
        ownerId: 'owner-1',
        documents: [document],
        unexpected: true,
      } as never),
    ).toThrow(CanvasValidationError);
    const index = createCanvasGlobalSearchIndex({
      ownerId: 'owner-1',
      documents: [document],
    });
    expect(() => index.query({ text: 'x'.repeat(1_001) })).toThrow(CanvasValidationError);
  });

  it('turns a selected result into a validated Canvas route and zoom intent', () => {
    const document = documentWithText({
      id: 'canvas-focus',
      title: 'Focus',
      blockId: 'focus-note',
      text: 'Zoom here',
      x: 600,
    });
    const [result] = createCanvasGlobalSearchIndex({
      ownerId: 'owner-1',
      documents: [document],
    }).query({ text: 'zoom' });

    const selection = selectCanvasGlobalSearchResult(
      result,
      {
        ownerId: 'owner-1',
        projectId: 'project-1',
      },
      {
        width: 1_200,
        height: 800,
      },
    );

    expect(selection).toMatchObject({
      route: 'canvas',
      documentId: 'canvas-focus',
      projectId: 'project-1',
      objectId: 'focus-note',
    });
    expect(Number.isFinite(selection.camera.x)).toBe(true);
    expect(Number.isFinite(selection.camera.y)).toBe(true);
    expect(selection.camera.zoom).toBeGreaterThan(0);
    expect(Object.isFrozen(selection)).toBe(true);
  });

  it('rejects forged results and leaves source documents immutable', () => {
    const document = documentWithText({
      id: 'canvas-safe',
      title: 'Safe',
      blockId: 'safe-note',
      text: 'Source',
    });
    const before = JSON.stringify(document);
    const [result] = createCanvasGlobalSearchIndex({
      ownerId: 'owner-1',
      documents: [document],
    }).query({ text: 'source' });

    expect(() =>
      selectCanvasGlobalSearchResult(
        { ...result, ownerId: 'bad owner' as never },
        { ownerId: 'owner-1', projectId: 'project-1' },
        { width: 1_200, height: 800 },
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      selectCanvasGlobalSearchResult(
        { ...result, unexpected: true } as never,
        { ownerId: 'owner-1', projectId: 'project-1' },
        {
          width: 1_200,
          height: 800,
        },
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      selectCanvasGlobalSearchResult(
        { ...result, ownerId: 'owner-2' },
        { ownerId: 'owner-1', projectId: 'project-1' },
        {
          width: 1_200,
          height: 800,
        },
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      selectCanvasGlobalSearchResult(
        { ...result, projectId: 'project-2' },
        { ownerId: 'owner-1', projectId: 'project-1' },
        {
          width: 1_200,
          height: 800,
        },
      ),
    ).toThrow(CanvasValidationError);
    expect(JSON.stringify(document)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('never projects icon, thumbnail, or document camera metadata into global results', () => {
    const source = {
      ...documentWithText({
        id: 'canvas-private-metadata',
        title: 'Public title',
        blockId: 'public-note',
        text: 'Searchable words',
      }),
      icon: 'private-icon-marker',
      thumbnail: 'data:image/png;base64,private-thumbnail-marker',
      camera: { x: 98_765, y: -43_210, zoom: 7 },
    } as CanvasDocument;

    const results = createCanvasGlobalSearchIndex({
      ownerId: 'owner-1',
      projectId: 'project-1',
      documents: [source],
    }).query({ text: 'searchable' });
    const serialized = JSON.stringify(results);

    expect(serialized).not.toContain('private-icon-marker');
    expect(serialized).not.toContain('private-thumbnail-marker');
    expect(serialized).not.toContain('98765');
    expect(serialized).not.toContain('-43210');
  });

  it('delivers a validated selection to a mounted canvas or a later one-shot consumer', () => {
    const document = documentWithText({
      id: 'canvas-navigation',
      title: 'Navigation',
      blockId: 'navigation-note',
      text: 'Open this result',
    });
    const [result] = createCanvasGlobalSearchIndex({
      ownerId: 'owner-1',
      projectId: 'project-1',
      documents: [document],
    }).query({ text: 'open' });
    const scope = { ownerId: 'owner-1', projectId: 'project-1' };
    const observed: string[] = [];
    const unsubscribe = subscribeCanvasGlobalSearchNavigation(scope, (selection) => {
      observed.push(selection.documentId);
    });

    requestCanvasGlobalSearchNavigation(result, scope, { width: 1_200, height: 800 });
    expect(observed).toEqual(['canvas-navigation']);
    expect(takePendingCanvasGlobalSearchNavigation(scope)).toBeUndefined();
    unsubscribe();

    requestCanvasGlobalSearchNavigation(result, scope, { width: 1_200, height: 800 });
    expect(takePendingCanvasGlobalSearchNavigation(scope)).toMatchObject({
      documentId: 'canvas-navigation',
      objectId: 'navigation-note',
    });
    expect(takePendingCanvasGlobalSearchNavigation(scope)).toBeUndefined();
  });

  it('drops pending navigation instead of exposing it to a different owner or project', () => {
    const document = documentWithText({
      id: 'canvas-private-navigation',
      title: 'Private navigation',
      blockId: 'private-navigation-note',
      text: 'Private result',
    });
    const [result] = createCanvasGlobalSearchIndex({
      ownerId: 'owner-1',
      projectId: 'project-1',
      documents: [document],
    }).query({ text: 'private' });

    requestCanvasGlobalSearchNavigation(
      result,
      { ownerId: 'owner-1', projectId: 'project-1' },
      { width: 1_200, height: 800 },
    );

    expect(
      takePendingCanvasGlobalSearchNavigation({
        ownerId: 'owner-2',
        projectId: 'project-1',
      }),
    ).toBeUndefined();
    expect(
      takePendingCanvasGlobalSearchNavigation({
        ownerId: 'owner-1',
        projectId: 'project-1',
      }),
    ).toBeUndefined();
  });
});
