import { describe, expect, it } from 'vitest';

import type { CanvasAttachmentReference } from './attachments';
import type { CanvasDocument } from './contracts';
import type { CanvasFrame } from './frames';
import type { CanvasLinkedContent } from './linkedContent';
import {
  compileCanvasAiContext,
  type CanvasAiContextInput,
  type CanvasAiRecentChange,
} from './aiContext';

function documentFixture(): CanvasDocument {
  return {
    schemaVersion: 1,
    id: 'canvas-1',
    projectId: 'project-1',
    ownerId: 'owner-1',
    title: 'Launch plan',
    icon: null,
    thumbnail: null,
    layoutMode: 'edgeless',
    camera: { x: 10, y: 20, zoom: 1.5 },
    background: { kind: 'grid', color: '#ffffff' },
    blocks: [
      {
        id: 'block-2',
        content: { kind: 'code', language: 'ts', text: 'const token = "sk-secret123456";' },
        createdAt: 20,
        updatedAt: 40,
      },
      {
        id: 'block-1',
        content: { kind: 'heading', level: 2, text: 'Launch\u0000 checklist' },
        createdAt: 10,
        updatedAt: 30,
      },
      {
        id: 'block-3',
        content: { kind: 'note', text: 'Outside visible frame' },
        createdAt: 30,
        updatedAt: 50,
      },
    ],
    pageOrder: ['block-1', 'block-2', 'block-3'],
    placements: [
      { blockId: 'block-1', x: 0, y: 0, width: 200, height: 100, rotation: 0, z: 1 },
      { blockId: 'block-2', x: 210, y: 0, width: 200, height: 100, rotation: 0, z: 2 },
      { blockId: 'block-3', x: 500, y: 0, width: 200, height: 100, rotation: 0, z: 3 },
    ],
    presentationOrder: ['block-1'],
    localRevision: 5,
    syncRevision: 4,
    createdAt: 1,
    updatedAt: 50,
    archivedAt: null,
    deletedAt: null,
  } as unknown as CanvasDocument;
}

function frameFixture(): CanvasFrame & {
  canvasId: string;
  projectId: string;
  ownerId: string;
} {
  return {
    canvasId: 'canvas-1',
    projectId: 'project-1',
    ownerId: 'owner-1',
    id: 'frame-1',
    name: 'Main frame',
    background: { kind: 'plain', color: '#ffffff' },
    children: ['block-2', 'block-1'],
    x: -10,
    y: -20,
    width: 500,
    height: 300,
    z: 1,
    locked: false,
    collapsed: false,
    thumbnail: 'data:image/png;base64,should-not-leak',
    exportDescriptor: { exportable: true, label: 'Main export', scale: 2 },
    createdAt: 1,
    updatedAt: 50,
  };
}

function linkedFixture(): CanvasLinkedContent {
  return {
    id: 'linked-1',
    kind: 'project-file',
    projectId: 'project-1',
    ownerId: 'owner-1',
    sourceId: 'src/readme',
    title: 'Release notes',
    icon: 'file',
    status: 'active',
    available: true,
    preview: {
      summary: 'API_KEY=abcdef123456 and rollout details',
      excerpt: 'Ship on Friday\u0007',
      capturedAt: 45,
    },
    snapshot: null,
    openAction: {
      kind: 'vibespace-resource',
      resourceKind: 'project-file',
      resourceId: 'src/readme',
      requiresUserGesture: true,
    },
    createdAt: 1,
    updatedAt: 45,
  } as CanvasLinkedContent;
}

function attachmentFixture(mimeType: string): CanvasAttachmentReference {
  return {
    id: mimeType.startsWith('text/') ? 'attachment-text' : 'attachment-binary',
    projectId: 'project-1',
    ownerId: 'owner-1',
    source: {
      kind: 'project-file',
      reference: mimeType.startsWith('text/') ? 'notes/readme.txt' : 'images/mockup.png',
      filename: mimeType.startsWith('text/') ? 'readme.txt' : 'mockup.png',
      mimeType,
      byteSize: 128,
      checksum: { algorithm: 'sha-256', digest: 'a'.repeat(64) },
      originUrl: null,
    },
    preview: mimeType.startsWith('text/')
      ? { text: 'Release owner: Ada', truncated: false, lineCount: 1, encoding: 'utf-8' }
      : null,
    missing: false,
    createdAt: 1,
    updatedAt: 45,
  } as unknown as CanvasAttachmentReference;
}

function inputFixture(): CanvasAiContextInput {
  const recentChanges: readonly CanvasAiRecentChange[] = [
    {
      canvasId: 'canvas-1',
      projectId: 'project-1',
      ownerId: 'owner-1',
      id: 'change-2',
      kind: 'text-change',
      label: 'Updated credentials password=hunter2',
      objectIds: ['block-2'],
      timestamp: 48,
    },
    {
      canvasId: 'canvas-1',
      projectId: 'project-1',
      ownerId: 'owner-1',
      id: 'change-1',
      kind: 'object-create',
      label: 'Added checklist',
      objectIds: ['block-1'],
      timestamp: 47,
    },
  ];
  return {
    document: documentFixture(),
    selectedBlockIds: ['block-2', 'unknown', 'block-1', 'block-2'],
    visibleFrame: frameFixture(),
    linkedProjectSources: [linkedFixture()],
    recentChanges,
    attachments: [attachmentFixture('text/plain'), attachmentFixture('image/png')],
    composer: {
      slashReference: {
        canvasId: 'canvas-1',
        projectId: 'project-1',
        ownerId: 'owner-1',
        token: '/canvas',
        targetId: 'block-1',
        label: 'Launch checklist',
      },
      snapshot: {
        canvasId: 'canvas-1',
        projectId: 'project-1',
        ownerId: 'owner-1',
        id: 'snapshot-1',
        label: 'Before launch',
        capturedAt: 49,
      },
    },
  };
}

describe('compileCanvasAiContext', () => {
  it('compiles scoped canvas, selection, visible-frame, source, change, and composer context', () => {
    const context = compileCanvasAiContext(inputFixture());

    expect(context.canvas).toEqual({
      id: 'canvas-1',
      projectId: 'project-1',
      title: 'Launch plan',
      layoutMode: 'edgeless',
      localRevision: 5,
      updatedAt: 50,
      camera: { x: 10, y: 20, zoom: 1.5 },
      blockCount: 3,
      blockKinds: { code: 1, heading: 1, note: 1 },
    });
    expect(context.selection.map((block) => block.id)).toEqual(['block-1', 'block-2']);
    expect(context.visibleFrame?.childIds).toEqual(['block-1', 'block-2']);
    expect(context.visibleFrame).not.toHaveProperty('thumbnail');
    expect(context.linkedProjectSources[0]).toMatchObject({
      id: 'linked-1',
      sourceId: 'src/readme',
      label: 'Release notes',
    });
    expect(context.recentChanges.map((change) => change.id)).toEqual(['change-2', 'change-1']);
    expect(context.composer).toMatchObject({
      currentCanvasId: 'canvas-1',
      selectedBlockIds: ['block-1', 'block-2'],
      visibleFrameId: 'frame-1',
      snapshotId: 'snapshot-1',
      slashReference: { token: '/canvas', targetId: 'block-1', label: 'Launch checklist' },
    });
    expect(context.prompt).toContain('Active canvas: Launch plan (canvas-1)');
    expect(context.prompt).toContain('Visible frame: Main frame (frame-1)');
  });

  it('redacts detected secrets and strips control characters from every model-facing string', () => {
    const serialized = JSON.stringify(compileCanvasAiContext(inputFixture()));

    expect(serialized).not.toContain('sk-secret123456');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('abcdef123456');
    expect(serialized).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u);
    expect(serialized).toContain('[redacted:');
  });

  it('omits binary data by default and exposes only bounded metadata behind a capability', () => {
    const input = inputFixture();
    const ordinary = compileCanvasAiContext(input);
    const capable = compileCanvasAiContext({
      ...input,
      capabilities: { includeBinaryAttachmentMetadata: true },
    });

    expect(ordinary.attachments.map((attachment) => attachment.id)).toEqual(['attachment-text']);
    expect(JSON.stringify(ordinary)).not.toContain('mockup.png');
    expect(capable.attachments).toContainEqual({
      id: 'attachment-binary',
      filename: 'mockup.png',
      mimeType: 'image/png',
      byteSize: 128,
      missing: false,
      preview: null,
      binaryMetadataOnly: true,
    });
    expect(JSON.stringify(capable)).not.toContain('data:image');
    expect(JSON.stringify(capable)).not.toContain('a'.repeat(64));
  });

  it('returns deterministic detached frozen output and bounded Prompt Forge canvas sources', () => {
    const input = inputFixture();
    const before = structuredClone(input);
    const first = compileCanvasAiContext(input);
    const second = compileCanvasAiContext(input);

    expect(first).toEqual(second);
    expect(input).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.selection)).toBe(true);
    expect(Object.isFrozen(first.selection[0])).toBe(true);
    expect(
      first.promptForgeSources.map(({ id, kind, label, reference }) => ({
        id,
        kind,
        label,
        reference,
      })),
    ).toEqual([
      {
        id: 'canvas:canvas-1',
        kind: 'canvas',
        label: 'Launch plan',
        reference: 'canvas:canvas-1',
      },
      {
        id: 'canvas-block:canvas-1:block-1',
        kind: 'canvas',
        label: 'heading block block-1',
        reference: 'canvas:canvas-1#block-1',
      },
      {
        id: 'canvas-block:canvas-1:block-2',
        kind: 'canvas',
        label: 'code block block-2',
        reference: 'canvas:canvas-1#block-2',
      },
    ]);
  });

  it('excludes cross-owner sources and clamps caller-supplied limits to safe ceilings', () => {
    const input = inputFixture();
    const crossOwnerSource = {
      ...linkedFixture(),
      id: 'linked-other-owner',
      ownerId: 'owner-2',
    } as CanvasLinkedContent;
    const crossOwnerAttachment = {
      ...attachmentFixture('text/plain'),
      id: 'attachment-other-owner',
      ownerId: 'owner-2',
    } as CanvasAttachmentReference;
    const context = compileCanvasAiContext({
      ...input,
      linkedProjectSources: [...(input.linkedProjectSources ?? []), crossOwnerSource],
      attachments: [...(input.attachments ?? []), crossOwnerAttachment],
      limits: {
        maxSelectionBlocks: Number.MAX_SAFE_INTEGER,
        maxLinkedSources: Number.MAX_SAFE_INTEGER,
      },
    });

    expect(context.linkedProjectSources.map((source) => source.id)).toEqual(['linked-1']);
    expect(context.attachments.map((attachment) => attachment.id)).toEqual(['attachment-text']);
    expect(context.selection).toHaveLength(2);
  });

  it('omits frame, change, snapshot, and slash context that is not bound to the active canvas', () => {
    const input = inputFixture();
    const context = compileCanvasAiContext({
      ...input,
      visibleFrame: { ...frameFixture(), canvasId: 'canvas-other' },
      recentChanges: [
        ...(input.recentChanges ?? []),
        {
          canvasId: 'canvas-other',
          projectId: 'project-1',
          ownerId: 'owner-1',
          id: 'change-other',
          kind: 'text-change',
          label: 'Cross-canvas edit',
          objectIds: ['block-1'],
          timestamp: 99,
        },
      ],
      composer: {
        snapshot: {
          canvasId: 'canvas-1',
          projectId: 'project-other',
          ownerId: 'owner-1',
          id: 'snapshot-other',
          label: 'Cross-project snapshot',
          capturedAt: 99,
        },
        slashReference: {
          canvasId: 'canvas-1',
          projectId: 'project-1',
          ownerId: 'owner-1',
          token: '/canvas',
          targetId: 'missing-target',
          label: 'Unknown target',
        },
      },
    });

    expect(context.visibleFrame).toBeNull();
    expect(context.visibleBlocks).toEqual([]);
    expect(context.recentChanges.map((change) => change.id)).not.toContain('change-other');
    expect(context.composer).toMatchObject({
      visibleFrameId: null,
      snapshotId: null,
      snapshotLabel: null,
      snapshotCapturedAt: null,
      slashReference: null,
    });
    expect(JSON.stringify(context)).not.toContain('canvas-other');
    expect(JSON.stringify(context)).not.toContain('project-other');
  });
});
