import { describe, expect, it, vi } from 'vitest';
import {
  createCanvasObjectContextReference,
  createCanvasRetrievalAttachments,
  createContextClusterCanvasTransfer,
  createContextEntityCanvasOpenRequest,
  exportOpenJsonCanvas,
  importOpenJsonCanvas,
  linkCanvasFrameToContext,
  type ContextCanvasEntityReference,
  type VibeSpaceCanvasDocument,
} from './contextCanvasIntegration';
import { retrieveContextForConsumer } from './contextResponseIntegration';

const entity: ContextCanvasEntityReference = {
  projectId: 'project-1',
  mapId: 'map-1',
  entityId: 'entity-1',
  kind: 'function',
  label: 'authorizeRelease',
  path: 'src/release.ts',
};

const document: VibeSpaceCanvasDocument = {
  schemaVersion: 1,
  id: 'canvas-1',
  projectId: 'project-1',
  title: 'Release planning',
  updatedAt: 1_000,
  objects: [
    {
      id: 'object-1',
      type: 'text',
      label: 'Release gate',
      text: 'Ship only after the security suite passes.',
      x: 10,
      y: 20,
      width: 320,
      height: 180,
      selected: true,
      contextReferences: [entity],
    },
    {
      id: 'object-2',
      type: 'link',
      label: 'Runbook',
      url: 'https://example.test/runbook',
      x: 400,
      y: 20,
      width: 320,
      height: 180,
      selected: false,
      contextReferences: [],
    },
  ],
  connections: [
    {
      id: 'connection-1',
      fromObjectId: 'object-1',
      toObjectId: 'object-2',
      label: 'uses',
    },
  ],
};

describe('Context and Infinite Canvas interoperability', () => {
  it('creates an immutable request to open one Context entity on Canvas', () => {
    const request = createContextEntityCanvasOpenRequest(entity, {
      canvasId: 'canvas-1',
      frameId: 'frame-1',
    });
    expect(request).toEqual({
      schemaVersion: 1,
      type: 'context_entity.open_on_canvas',
      entity,
      target: { canvasId: 'canvas-1', frameId: 'frame-1' },
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.entity)).toBe(true);
  });

  it('links a Canvas frame to deduplicated Context entities in the same project', () => {
    const link = linkCanvasFrameToContext(
      { projectId: 'project-1', canvasId: 'canvas-1', frameId: 'frame-1' },
      [entity, entity],
    );
    expect(link.contextReferences).toEqual([entity]);
    expect(Object.isFrozen(link.contextReferences)).toBe(true);
    expect(() =>
      linkCanvasFrameToContext(
        { projectId: 'project-2', canvasId: 'canvas-1', frameId: 'frame-1' },
        [entity],
      ),
    ).toThrow(/project mismatch/i);
  });

  it('packages a selected Context cluster for Canvas without duplicating either domain', () => {
    const transfer = createContextClusterCanvasTransfer({
      projectId: 'project-1',
      mapId: 'map-1',
      clusterId: 'cluster-1',
      label: 'Release cluster',
      entities: [entity],
    });
    expect(transfer).toMatchObject({
      schemaVersion: 1,
      type: 'context_cluster.send_to_canvas',
      projectId: 'project-1',
      mapId: 'map-1',
      clusterId: 'cluster-1',
      label: 'Release cluster',
      entities: [entity],
    });
  });

  it('turns selected Canvas objects into Context references used by shared retrieval', async () => {
    expect(createCanvasObjectContextReference(document, document.objects[0])).toEqual({
      entityId: 'canvas:canvas-1:object-1',
      kind: 'canvas_object',
      label: 'Release gate',
      sourceId: 'canvas:canvas-1',
    });
    const attachments = createCanvasRetrievalAttachments(document, 2_000);
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      projectId: 'project-1',
      mapId: 'canvas-1',
      nodeId: 'canvas:canvas-1:object-1',
      title: 'Release gate',
      summary: 'Ship only after the security suite passes.',
      exactExcerpt: 'Ship only after the security suite passes.',
      source: { type: 'linked_vibespace_content', label: 'Release planning' },
      freshness: 'current',
    });
    const retrieval = await retrieveContextForConsumer({
      consumer: 'chat',
      projectId: 'project-1',
      userText: 'When can we ship?',
      attachments,
      now: 2_000,
      createQueryId: () => 'canvas-query-1',
    });
    expect(retrieval).toMatchObject({
      queryId: 'canvas-query-1',
      items: [
        {
          entity: { entityId: 'canvas:canvas-1:object-1' },
          exactExcerpt: 'Ship only after the security suite passes.',
        },
      ],
    });
  });

  it('keeps Canvas locators as summaries instead of claiming exact source excerpts', async () => {
    const locatorDocument: VibeSpaceCanvasDocument = {
      ...document,
      objects: [
        {
          id: 'file-1',
          type: 'file',
          label: 'Runbook file',
          file: 'docs/runbook.md',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          selected: true,
          contextReferences: [],
        },
        { ...document.objects[1], selected: true },
        {
          id: 'group-1',
          type: 'group',
          label: 'Release documents',
          groupLabel: 'Release documents',
          x: 0,
          y: 200,
          width: 500,
          height: 300,
          selected: true,
          contextReferences: [],
        },
      ],
      connections: [],
    };
    const attachments = createCanvasRetrievalAttachments(locatorDocument, 2_000);
    expect(attachments).toHaveLength(3);
    expect(attachments.every((attachment) => attachment.exactExcerpt === undefined)).toBe(true);
    const retrieval = await retrieveContextForConsumer({
      consumer: 'chat',
      projectId: 'project-1',
      userText: 'Find the runbook and release documents',
      attachments,
      now: 2_000,
      createQueryId: () => 'canvas-query-locators',
    });
    expect(Object.values(retrieval.evidenceKinds)).toEqual(['summary', 'summary', 'summary']);
  });

  it('translates through open JSON Canvas without replacing the richer internal model', () => {
    const compatible = exportOpenJsonCanvas(document);
    expect(compatible).toEqual({
      nodes: [
        {
          id: 'object-1',
          type: 'text',
          text: 'Ship only after the security suite passes.',
          x: 10,
          y: 20,
          width: 320,
          height: 180,
        },
        {
          id: 'object-2',
          type: 'link',
          url: 'https://example.test/runbook',
          x: 400,
          y: 20,
          width: 320,
          height: 180,
        },
      ],
      edges: [
        {
          id: 'connection-1',
          fromNode: 'object-1',
          toNode: 'object-2',
          label: 'uses',
        },
      ],
    });
    expect(JSON.stringify(compatible)).not.toContain('contextReferences');
    const imported = importOpenJsonCanvas(compatible, {
      id: 'canvas-imported',
      projectId: 'project-1',
      title: 'Imported board',
      now: 3_000,
    });
    expect(imported).toMatchObject({
      schemaVersion: 1,
      id: 'canvas-imported',
      projectId: 'project-1',
      title: 'Imported board',
      compatibilitySource: { format: 'open-json-canvas', version: 1 },
    });
    expect(imported.objects[0]).toMatchObject({
      id: 'object-1',
      type: 'text',
      label: 'Ship only after the security suite passes.',
      contextReferences: [],
    });
  });

  it('rejects executable URLs, accessor boundaries, and dangling compatibility edges', () => {
    expect(() =>
      importOpenJsonCanvas(
        {
          nodes: [
            {
              id: 'node-1',
              type: 'link',
              url: 'javascript:alert(1)',
              x: 0,
              y: 0,
              width: 100,
              height: 100,
            },
          ],
          edges: [],
        },
        { id: 'canvas-1', projectId: 'project-1', title: 'Unsafe', now: 1 },
      ),
    ).toThrow(/unsafe link/i);

    const getter = vi.fn(() => []);
    const hostile = { edges: [] };
    Object.defineProperty(hostile, 'nodes', { enumerable: true, get: getter });
    expect(() =>
      importOpenJsonCanvas(hostile, {
        id: 'canvas-1',
        projectId: 'project-1',
        title: 'Unsafe',
        now: 1,
      }),
    ).toThrow(/boundary/i);
    expect(getter).not.toHaveBeenCalled();

    expect(() =>
      importOpenJsonCanvas(
        {
          nodes: [{ id: 'node-1', type: 'text', text: 'One', x: 0, y: 0, width: 100, height: 100 }],
          edges: [{ id: 'edge-1', fromNode: 'node-1', toNode: 'missing' }],
        },
        { id: 'canvas-1', projectId: 'project-1', title: 'Broken', now: 1 },
      ),
    ).toThrow(/dangling edge/i);
  });
});
