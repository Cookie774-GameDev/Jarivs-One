import { describe, expect, it } from 'vitest';
import {
  CanvasValidationError,
  createCanvasBlock,
  createCanvasDocument,
  withBlockAdded,
  withBlockContent,
  withPageOrder,
  withPlacement,
  type CanvasBlock,
  type CanvasDocument,
} from './contracts';
import {
  copyBlocks,
  cutBlocks,
  deserializeClipboard,
  pasteBlocks,
  serializeClipboard,
  type CanvasClipboardPayload,
} from './clipboard';
import { createCanvasShape } from './shapes';

const T0 = 1_750_000_000_000;
const T1 = T0 + 60_000;
const T2 = T0 + 120_000;

function baseDoc(): CanvasDocument {
  return createCanvasDocument({
    id: 'doc-1',
    projectId: 'project-1',
    ownerId: 'owner-1',
    title: 'Clipboard Test',
    now: T0,
  });
}

function block(id: string, text = 'hello', now = T0): CanvasBlock {
  return createCanvasBlock({ id, content: { kind: 'text', text }, now });
}

function headingBlock(id: string, text: string, level: 1 | 2 | 3 = 2, now = T0): CanvasBlock {
  return createCanvasBlock({ id, content: { kind: 'heading', level, text }, now });
}

function docWithBlocksAndPlacements(): CanvasDocument {
  let doc = baseDoc();
  doc = withBlockAdded(doc, block('blk-a', 'alpha'), T0);
  doc = withBlockAdded(doc, block('blk-b', 'beta'), T0);
  doc = withBlockAdded(doc, block('blk-c', 'gamma'), T0);
  doc = withPlacement(doc, { blockId: 'blk-a', x: 10, y: 20, width: 200, height: 100 }, T0);
  doc = withPlacement(
    doc,
    { blockId: 'blk-b', x: 300, y: 400, width: 150, height: 80, rotation: 45, z: 2 },
    T0,
  );
  return doc;
}

let idCounter = 0;
function fakeIdFactory(): string {
  idCounter += 1;
  return `new-id-${idCounter}`;
}

function resetIdCounter(): void {
  idCounter = 0;
}

// ---------------------------------------------------------------------------
// copyBlocks
// ---------------------------------------------------------------------------

describe('copyBlocks', () => {
  it('copies a single block without placement', () => {
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-c']);

    expect(payload.schemaVersion).toBe(1);
    expect(payload.blocks).toHaveLength(1);
    expect(payload.blocks[0].id).toBe('blk-c');
    expect(payload.blocks[0].content).toEqual({ kind: 'text', text: 'gamma' });
    expect(payload.placements).toHaveLength(0);
  });

  it('materializes deterministic automatic placements when copying in edgeless mode', () => {
    let doc = createCanvasDocument({
      id: 'edgeless-copy',
      projectId: 'project-1',
      ownerId: 'owner-1',
      layoutMode: 'edgeless',
      now: T0,
    });
    doc = withBlockAdded(doc, block('auto-block'), T0);

    expect(copyBlocks(doc, ['auto-block']).placements).toEqual([
      {
        blockId: 'auto-block',
        x: 0,
        y: 0,
        width: 280,
        height: 180,
        rotation: 0,
        z: 0,
        locked: false,
        hidden: false,
      },
    ]);
  });

  it('copies multiple blocks preserving document order', () => {
    const doc = docWithBlocksAndPlacements();
    // Request out of order; result should follow document order
    const payload = copyBlocks(doc, ['blk-b', 'blk-a']);

    expect(payload.blocks).toHaveLength(2);
    expect(payload.blocks[0].id).toBe('blk-a');
    expect(payload.blocks[1].id).toBe('blk-b');
  });

  it('uses canonical page order instead of storage insertion order', () => {
    const reordered = withPageOrder(docWithBlocksAndPlacements(), ['blk-c', 'blk-a', 'blk-b'], T1);

    expect(copyBlocks(reordered, ['blk-a', 'blk-c']).blocks.map((item) => item.id)).toEqual([
      'blk-c',
      'blk-a',
    ]);
  });

  it('includes placements only for copied blocks', () => {
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a']);

    expect(payload.placements).toHaveLength(1);
    expect(payload.placements[0].blockId).toBe('blk-a');
    expect(payload.placements[0].x).toBe(10);
    expect(payload.placements[0].y).toBe(20);
  });

  it('preserves block content exactly', () => {
    let doc = baseDoc();
    doc = withBlockAdded(doc, headingBlock('blk-h', 'Title', 1), T0);
    const payload = copyBlocks(doc, ['blk-h']);

    expect(payload.blocks[0].content).toEqual({ kind: 'heading', level: 1, text: 'Title' });
  });

  it('returns a deeply frozen payload', () => {
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a', 'blk-b']);

    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload.blocks)).toBe(true);
    expect(Object.isFrozen(payload.placements)).toBe(true);
  });

  it('throws for unknown block ids', () => {
    const doc = docWithBlocksAndPlacements();
    expect(() => copyBlocks(doc, ['nonexistent'])).toThrow(CanvasValidationError);
  });

  it('throws for empty block id list', () => {
    const doc = docWithBlocksAndPlacements();
    expect(() => copyBlocks(doc, [])).toThrow(CanvasValidationError);
  });

  it('deduplicates repeated block ids', () => {
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a', 'blk-a']);
    expect(payload.blocks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// pasteBlocks
// ---------------------------------------------------------------------------

describe('pasteBlocks', () => {
  it('pastes blocks with new collision-free ids', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a', 'blk-b']);
    const result = pasteBlocks(doc, payload, { generateId: fakeIdFactory, now: T1 });

    // Original blocks still present
    expect(result.blocks.some((b) => b.id === 'blk-a')).toBe(true);
    expect(result.blocks.some((b) => b.id === 'blk-b')).toBe(true);
    // New blocks added with factory ids
    expect(result.blocks.some((b) => b.id === 'new-id-1')).toBe(true);
    expect(result.blocks.some((b) => b.id === 'new-id-2')).toBe(true);
    expect(result.blocks).toHaveLength(5);
  });

  it('preserves content through copy-paste', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a']);
    const result = pasteBlocks(doc, payload, { generateId: fakeIdFactory, now: T1 });

    const pasted = result.blocks.find((b) => b.id === 'new-id-1');
    expect(pasted).toBeDefined();
    expect(pasted!.content).toEqual({ kind: 'text', text: 'alpha' });
  });

  it('remaps the canonical shape id together with its pasted block id', () => {
    resetIdCounter();
    let document = baseDoc();
    document = withBlockAdded(
      document,
      createCanvasBlock({
        id: 'shape-a',
        content: {
          kind: 'shape',
          shape: createCanvasShape({
            id: 'shape-a',
            kind: 'diamond',
            fill: '#2f80ed',
            text: 'Decision',
          }),
        },
        now: T0,
      }),
      T0,
    );

    const result = pasteBlocks(document, copyBlocks(document, ['shape-a']), {
      generateId: fakeIdFactory,
      now: T1,
    });
    const pasted = result.blocks.find((item) => item.id === 'new-id-1');
    expect(pasted?.content).toMatchObject({
      kind: 'shape',
      shape: { id: 'new-id-1', kind: 'diamond', text: 'Decision' },
    });
  });

  it('rejects duplicate source ids and orphaned placements in forged payloads', () => {
    const doc = docWithBlocksAndPlacements();
    const valid = copyBlocks(doc, ['blk-a']);

    expect(() =>
      pasteBlocks(
        doc,
        { ...valid, blocks: [valid.blocks[0], valid.blocks[0]] },
        { generateId: fakeIdFactory, now: T1 },
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      pasteBlocks(
        doc,
        {
          ...valid,
          placements: [
            {
              ...valid.placements[0],
              blockId: 'missing-block' as (typeof valid.placements)[number]['blockId'],
            },
          ],
        },
        { generateId: fakeIdFactory, now: T1 },
      ),
    ).toThrow(CanvasValidationError);
  });

  it('offsets placements by the supplied delta', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a']);
    const result = pasteBlocks(doc, payload, {
      generateId: fakeIdFactory,
      now: T1,
      offset: { dx: 50, dy: -30 },
    });

    const pastedPlacement = result.placements.find((p) => p.blockId === 'new-id-1');
    expect(pastedPlacement).toBeDefined();
    expect(pastedPlacement!.x).toBe(60); // 10 + 50
    expect(pastedPlacement!.y).toBe(-10); // 20 + (-30)
    expect(pastedPlacement!.width).toBe(200);
    expect(pastedPlacement!.height).toBe(100);
  });

  it('defaults offset to zero when not supplied', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a']);
    const result = pasteBlocks(doc, payload, { generateId: fakeIdFactory, now: T1 });

    const pastedPlacement = result.placements.find((p) => p.blockId === 'new-id-1');
    expect(pastedPlacement).toBeDefined();
    expect(pastedPlacement!.x).toBe(10);
    expect(pastedPlacement!.y).toBe(20);
  });

  it('remaps placements to new block ids', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-b']);
    const result = pasteBlocks(doc, payload, { generateId: fakeIdFactory, now: T1 });

    // Original placement unchanged
    const original = result.placements.find((p) => p.blockId === 'blk-b');
    expect(original).toBeDefined();
    expect(original!.x).toBe(300);

    // Pasted placement uses new id
    const pasted = result.placements.find((p) => p.blockId === 'new-id-1');
    expect(pasted).toBeDefined();
    expect(pasted!.rotation).toBe(45);
    expect(pasted!.z).toBe(2);
  });

  it('preserves locked and hidden state through copy and paste', () => {
    resetIdCounter();
    const doc = withPlacement(
      docWithBlocksAndPlacements(),
      {
        blockId: 'blk-a',
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        locked: true,
        hidden: true,
      },
      T1,
    );

    const payload = copyBlocks(doc, ['blk-a']);
    const result = pasteBlocks(doc, payload, { generateId: fakeIdFactory, now: T2 });

    expect(result.placements.find((placement) => placement.blockId === 'new-id-1')).toMatchObject({
      locked: true,
      hidden: true,
    });
  });

  it('inserts at a specific index when atIndex is provided', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-c']);
    const result = pasteBlocks(doc, payload, {
      generateId: fakeIdFactory,
      now: T1,
      atIndex: 1,
    });

    expect(result.blocks[1].id).toBe('new-id-1');
    expect(result.pageOrder[1]).toBe('new-id-1');
  });

  it('throws when the id factory produces a duplicate', () => {
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a']);
    const collidingFactory = () => 'blk-a'; // collides with existing

    expect(() => pasteBlocks(doc, payload, { generateId: collidingFactory, now: T1 })).toThrow(
      CanvasValidationError,
    );
  });

  it('throws when the id factory produces duplicates within the paste batch', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a', 'blk-b']);
    const sameIdFactory = () => 'same-id'; // same id for both

    expect(() => pasteBlocks(doc, payload, { generateId: sameIdFactory, now: T1 })).toThrow(
      CanvasValidationError,
    );
  });

  it('bumps localRevision and updatedAt', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a']);
    const result = pasteBlocks(doc, payload, { generateId: fakeIdFactory, now: T1 });

    expect(result.localRevision).toBeGreaterThan(doc.localRevision);
    expect(result.updatedAt).toBe(T1);
  });

  it('returns a frozen document', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a']);
    const result = pasteBlocks(doc, payload, { generateId: fakeIdFactory, now: T1 });

    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cutBlocks
// ---------------------------------------------------------------------------

describe('cutBlocks', () => {
  it('removes specified blocks as a pure document transition', () => {
    const doc = docWithBlocksAndPlacements();
    const result = cutBlocks(doc, ['blk-a', 'blk-b'], T1);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].id).toBe('blk-c');
    expect(result.pageOrder).toHaveLength(1);
  });

  it('removes associated placements', () => {
    const doc = docWithBlocksAndPlacements();
    const result = cutBlocks(doc, ['blk-a'], T1);

    expect(result.placements.some((p) => p.blockId === 'blk-a')).toBe(false);
    // blk-b placement remains
    expect(result.placements.some((p) => p.blockId === 'blk-b')).toBe(true);
  });

  it('does not mutate the original document', () => {
    const doc = docWithBlocksAndPlacements();
    cutBlocks(doc, ['blk-a'], T1);

    expect(doc.blocks).toHaveLength(3);
    expect(doc.placements).toHaveLength(2);
  });

  it('throws for unknown block ids', () => {
    const doc = docWithBlocksAndPlacements();
    expect(() => cutBlocks(doc, ['nonexistent'], T1)).toThrow(CanvasValidationError);
  });

  it('throws for empty block id list', () => {
    const doc = docWithBlocksAndPlacements();
    expect(() => cutBlocks(doc, [], T1)).toThrow(CanvasValidationError);
  });

  it('bumps localRevision and updatedAt', () => {
    const doc = docWithBlocksAndPlacements();
    const result = cutBlocks(doc, ['blk-c'], T1);

    expect(result.localRevision).toBeGreaterThan(doc.localRevision);
    expect(result.updatedAt).toBe(T1);
  });
});

// ---------------------------------------------------------------------------
// Serialization round-trip (CANVAS-186 crash recovery)
// ---------------------------------------------------------------------------

describe('serializeClipboard / deserializeClipboard', () => {
  it('round-trips a payload through JSON', () => {
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a', 'blk-b']);
    const json = serializeClipboard(payload);
    const restored = deserializeClipboard(json);

    expect(restored.schemaVersion).toBe(1);
    expect(restored.blocks).toHaveLength(2);
    expect(restored.blocks[0].id).toBe('blk-a');
    expect(restored.blocks[0].content).toEqual({ kind: 'text', text: 'alpha' });
    expect(restored.placements).toHaveLength(2);
  });

  it('preserves distinct block creation and update timestamps', () => {
    let doc = docWithBlocksAndPlacements();
    doc = withBlockContent(doc, 'blk-a', { kind: 'text', text: 'edited' }, T1);
    const restored = deserializeClipboard(serializeClipboard(copyBlocks(doc, ['blk-a'])));

    expect(restored.blocks[0].createdAt).toBe(T0);
    expect(restored.blocks[0].updatedAt).toBe(T1);
  });

  it('produces a valid JSON string', () => {
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a']);
    const json = serializeClipboard(payload);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('returns a frozen payload from deserialization', () => {
    const doc = docWithBlocksAndPlacements();
    const payload = copyBlocks(doc, ['blk-a']);
    const json = serializeClipboard(payload);
    const restored = deserializeClipboard(json);

    expect(Object.isFrozen(restored)).toBe(true);
    expect(Object.isFrozen(restored.blocks)).toBe(true);
  });

  it('rejects invalid JSON', () => {
    expect(() => deserializeClipboard('not json')).toThrow(CanvasValidationError);
  });

  it('rejects a payload with wrong schema version', () => {
    const bad = JSON.stringify({ schemaVersion: 99, blocks: [], placements: [] });
    expect(() => deserializeClipboard(bad)).toThrow(CanvasValidationError);
  });

  it('rejects a payload with invalid block data', () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      blocks: [{ id: '', content: { kind: 'text', text: 'x' }, createdAt: 0, updatedAt: 0 }],
      placements: [],
    });
    expect(() => deserializeClipboard(bad)).toThrow(CanvasValidationError);
  });

  it('rejects a payload with missing fields', () => {
    expect(() => deserializeClipboard('{}')).toThrow(CanvasValidationError);
    expect(() => deserializeClipboard('{"schemaVersion":1}')).toThrow(CanvasValidationError);
  });

  it('rejects non-string input', () => {
    expect(() => deserializeClipboard(42 as unknown as string)).toThrow(CanvasValidationError);
    expect(() => deserializeClipboard(null as unknown as string)).toThrow(CanvasValidationError);
  });

  it('rejects a payload with orphaned placement referencing unknown block', () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      blocks: [{ id: 'blk-x', content: { kind: 'text', text: 'x' }, createdAt: T0, updatedAt: T0 }],
      placements: [
        { blockId: 'blk-missing', x: 0, y: 0, width: 100, height: 50, rotation: 0, z: 0 },
      ],
    });
    expect(() => deserializeClipboard(bad)).toThrow(CanvasValidationError);
  });
});

// ---------------------------------------------------------------------------
// Integration: copy → paste → cut cycle
// ---------------------------------------------------------------------------

describe('clipboard integration', () => {
  it('supports a full copy-paste-cut cycle', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();

    // Copy two blocks
    const payload = copyBlocks(doc, ['blk-a', 'blk-b']);

    // Paste them
    const afterPaste = pasteBlocks(doc, payload, {
      generateId: fakeIdFactory,
      now: T1,
      offset: { dx: 100, dy: 100 },
    });
    expect(afterPaste.blocks).toHaveLength(5);

    // Cut the originals
    const afterCut = cutBlocks(afterPaste, ['blk-a', 'blk-b'], T2);
    expect(afterCut.blocks).toHaveLength(3);
    expect(afterCut.blocks.every((b) => b.id.startsWith('new-id-') || b.id === 'blk-c')).toBe(true);
  });

  it('pasted blocks can be copied again', () => {
    resetIdCounter();
    const doc = docWithBlocksAndPlacements();
    const payload1 = copyBlocks(doc, ['blk-a']);
    const afterPaste1 = pasteBlocks(doc, payload1, { generateId: fakeIdFactory, now: T1 });

    // Copy the pasted block
    const payload2 = copyBlocks(afterPaste1, ['new-id-1']);
    const afterPaste2 = pasteBlocks(afterPaste1, payload2, {
      generateId: fakeIdFactory,
      now: T2,
      offset: { dx: 10, dy: 10 },
    });

    expect(afterPaste2.blocks).toHaveLength(5); // 3 original + 2 pasted
    expect(afterPaste2.blocks.some((b) => b.id === 'new-id-2')).toBe(true);
  });
});
