import { describe, expect, it } from 'vitest';
import {
  CanvasValidationError,
  type CanvasBlockId,
  type CanvasSpatialPlacement,
} from './contracts';
import {
  addFrameChild,
  createFrame,
  frameExportDescriptor,
  moveFrame,
  presentationOrderedFrames,
  referenceFrame,
  removeFrameChild,
  renameFrame,
  resizeFrameToContent,
  setFrameBackground,
  setFrameCollapsed,
  setFrameLocked,
  validateContainmentGraph,
  withFrameExport,
  type CanvasFrame,
  type CanvasFrameBackground,
} from './frames';

const NOW = 1_700_000_000_000;

function placement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): CanvasSpatialPlacement {
  return { blockId: id as CanvasBlockId, x, y, width, height, rotation: 0, z: 0 };
}

describe('canvas frames', () => {
  describe('createFrame', () => {
    it('creates a frozen frame with deterministic defaults', () => {
      const frame = createFrame({ id: 'frame1', now: NOW });

      expect(frame.id).toBe('frame1');
      expect(frame.name).toBe('Untitled frame');
      expect(frame.background).toEqual({ kind: 'plain', color: '#ffffff' });
      expect(frame.children).toEqual([]);
      expect(frame.locked).toBe(false);
      expect(frame.collapsed).toBe(false);
      expect(frame.thumbnail).toBeNull();
      expect(frame.exportDescriptor).toEqual({ exportable: true, label: null, scale: 1 });
      expect(frame.createdAt).toBe(NOW);
      expect(frame.updatedAt).toBe(NOW);
      expect(Object.isFrozen(frame)).toBe(true);
      expect(Object.isFrozen(frame.children)).toBe(true);
    });

    it('honors supplied name, background, children, and geometry', () => {
      const frame = createFrame({
        id: 'frame1',
        now: NOW,
        name: '  Section A  ',
        background: { kind: 'grid', color: '#001122' },
        children: ['b1', 'b2'],
        x: 10,
        y: 20,
        width: 400,
        height: 300,
        z: 3,
      });

      expect(frame.name).toBe('Section A');
      expect(frame.background).toEqual({ kind: 'grid', color: '#001122' });
      expect(frame.children).toEqual(['b1', 'b2']);
      expect(frame.x).toBe(10);
      expect(frame.y).toBe(20);
      expect(frame.width).toBe(400);
      expect(frame.height).toBe(300);
      expect(frame.z).toBe(3);
    });

    it('rejects invalid ids, timestamps, geometry, backgrounds, and children', () => {
      expect(() => createFrame({ id: 'bad id!', now: NOW })).toThrow(CanvasValidationError);
      expect(() => createFrame({ id: 'frame1', now: -1 })).toThrow(CanvasValidationError);
      expect(() => createFrame({ id: 'frame1', now: NOW, width: 0 })).toThrow(
        CanvasValidationError,
      );
      expect(() => createFrame({ id: 'frame1', now: NOW, x: Number.NaN })).toThrow(
        CanvasValidationError,
      );
      expect(() =>
        createFrame({
          id: 'frame1',
          now: NOW,
          background: { kind: 'nope', color: '#ffffff' } as unknown as CanvasFrameBackground,
        }),
      ).toThrow(CanvasValidationError);
      expect(() =>
        createFrame({ id: 'frame1', now: NOW, background: { kind: 'plain', color: 'white' } }),
      ).toThrow(CanvasValidationError);
      expect(() => createFrame({ id: 'frame1', now: NOW, children: ['b1', 'b1'] })).toThrow(
        /duplicate/i,
      );
      expect(() => createFrame({ id: 'frame1', now: NOW, children: ['frame1'] })).toThrow(/self/i);
    });
  });

  describe('mutation metadata and locking', () => {
    it('renames an unlocked frame and emits an undo-ready operation', () => {
      const frame = createFrame({ id: 'frame1', now: NOW });
      const result = renameFrame(frame, 'Renamed', NOW + 5);

      expect(result.frame.name).toBe('Renamed');
      expect(result.frame.updatedAt).toBe(NOW + 5);
      expect(result.operation).toEqual({
        type: 'frame-renamed',
        frameId: 'frame1',
        from: 'Untitled frame',
        to: 'Renamed',
        at: NOW + 5,
      });
      expect(frame.name).toBe('Untitled frame');
    });

    it('changes the independent background immutably', () => {
      const frame = createFrame({ id: 'frame1', now: NOW });
      const result = setFrameBackground(frame, { kind: 'dots', color: '#abcdef' }, NOW + 1);

      expect(result.frame.background).toEqual({ kind: 'dots', color: '#abcdef' });
      expect(result.operation.type).toBe('frame-background-changed');
      expect(frame.background.color).toBe('#ffffff');
    });

    it('rejects content and geometry mutations while locked but allows unlock and collapse', () => {
      const base = createFrame({ id: 'frame1', now: NOW });
      const locked = setFrameLocked(base, true, NOW + 1).frame;

      expect(locked.locked).toBe(true);
      expect(() => renameFrame(locked, 'X', NOW + 2)).toThrow(/locked/i);
      expect(() =>
        setFrameBackground(locked, { kind: 'plain', color: '#000000' }, NOW + 2),
      ).toThrow(/locked/i);
      expect(() => addFrameChild(locked, 'b1', NOW + 2)).toThrow(/locked/i);
      expect(() => moveFrame(locked, { x: 5, y: 5 }, NOW + 2)).toThrow(/locked/i);
      expect(() => resizeFrameToContent(locked, [placement('b1', 0, 0, 10, 10)], NOW + 2)).toThrow(
        /locked/i,
      );

      const collapsed = setFrameCollapsed(locked, true, NOW + 3, 'thumb');
      expect(collapsed.frame.collapsed).toBe(true);
      const unlocked = setFrameLocked(locked, false, NOW + 4).frame;
      expect(unlocked.locked).toBe(false);
      expect(renameFrame(unlocked, 'Free', NOW + 5).frame.name).toBe('Free');
    });
  });

  describe('child containment', () => {
    it('adds and removes children immutably with operation metadata', () => {
      const frame = createFrame({ id: 'frame1', now: NOW });
      const added = addFrameChild(frame, 'b1', NOW + 1);
      expect(added.frame.children).toEqual(['b1']);
      expect(added.operation).toEqual({
        type: 'frame-child-added',
        frameId: 'frame1',
        childId: 'b1',
        at: NOW + 1,
      });

      const removed = removeFrameChild(added.frame, 'b1', NOW + 2);
      expect(removed.frame.children).toEqual([]);
      expect(removed.operation.type).toBe('frame-child-removed');
    });

    it('rejects duplicate children, self-containment, and removing missing children', () => {
      const frame = addFrameChild(createFrame({ id: 'frame1', now: NOW }), 'b1', NOW + 1).frame;

      expect(() => addFrameChild(frame, 'b1', NOW + 2)).toThrow(/duplicate/i);
      expect(() => addFrameChild(frame, 'frame1', NOW + 2)).toThrow(/self/i);
      expect(() => removeFrameChild(frame, 'missing', NOW + 2)).toThrow(CanvasValidationError);
    });
  });

  describe('movement and resize-to-content', () => {
    it('moves deterministically by a finite delta', () => {
      const frame = createFrame({ id: 'frame1', now: NOW, x: 100, y: 100 });
      const moved = moveFrame(frame, { x: -25, y: 50 }, NOW + 1);

      expect(moved.frame.x).toBe(75);
      expect(moved.frame.y).toBe(150);
      expect(moved.operation).toEqual({
        type: 'frame-moved',
        frameId: 'frame1',
        dx: -25,
        dy: 50,
        at: NOW + 1,
      });
      expect(() => moveFrame(frame, { x: Number.NaN, y: 0 }, NOW + 1)).toThrow(
        CanvasValidationError,
      );
    });

    it('resizes to the bounding box of placed children plus padding and minimum size', () => {
      const frame = addFrameChild(
        addFrameChild(createFrame({ id: 'frame1', now: NOW }), 'b1', NOW + 1).frame,
        'b2',
        NOW + 2,
      ).frame;
      const placements = [placement('b1', 0, 0, 100, 100), placement('b2', 200, 150, 50, 50)];

      const resized = resizeFrameToContent(frame, placements, NOW + 3, { padding: 10 });

      expect(resized.frame.x).toBe(-10);
      expect(resized.frame.y).toBe(-10);
      expect(resized.frame.width).toBe(250 + 20);
      expect(resized.frame.height).toBe(200 + 20);
      expect(resized.operation.type).toBe('frame-resized');
    });

    it('enforces a minimum size and ignores children without placements', () => {
      const frame = addFrameChild(
        addFrameChild(createFrame({ id: 'frame1', now: NOW }), 'b1', NOW + 1).frame,
        'unplaced',
        NOW + 2,
      ).frame;
      const resized = resizeFrameToContent(frame, [placement('b1', 5, 5, 2, 2)], NOW + 3, {
        padding: 0,
        minSize: 64,
      });

      expect(resized.frame.width).toBe(64);
      expect(resized.frame.height).toBe(64);
    });

    it('rejects resize-to-content when no child has a placement', () => {
      const frame = addFrameChild(createFrame({ id: 'frame1', now: NOW }), 'b1', NOW + 1).frame;
      expect(() =>
        resizeFrameToContent(frame, [placement('other', 0, 0, 10, 10)], NOW + 2),
      ).toThrow(/no placed content/i);
    });
  });

  describe('collapse to thumbnail', () => {
    it('stores a thumbnail when collapsed and clears it when expanded', () => {
      const frame = createFrame({ id: 'frame1', now: NOW });
      const collapsed = setFrameCollapsed(frame, true, NOW + 1, 'data:image/png;base64,abc');
      expect(collapsed.frame.collapsed).toBe(true);
      expect(collapsed.frame.thumbnail).toBe('data:image/png;base64,abc');
      expect(collapsed.operation).toEqual({
        type: 'frame-collapse-changed',
        frameId: 'frame1',
        collapsed: true,
        at: NOW + 1,
      });

      const expanded = setFrameCollapsed(collapsed.frame, false, NOW + 2, 'ignored');
      expect(expanded.frame.collapsed).toBe(false);
      expect(expanded.frame.thumbnail).toBeNull();
    });
  });

  describe('presentation order', () => {
    const frames = [
      createFrame({ id: 'a', now: NOW }),
      createFrame({ id: 'b', now: NOW }),
      createFrame({ id: 'c', now: NOW }),
    ];

    it('derives a deterministic presented subsequence', () => {
      const ordered = presentationOrderedFrames(frames, ['c', 'a']);
      expect(ordered.map((frame) => frame.id)).toEqual(['c', 'a']);
    });

    it('rejects duplicate or unknown presentation ids', () => {
      expect(() => presentationOrderedFrames(frames, ['a', 'a'])).toThrow(/duplicate/i);
      expect(() => presentationOrderedFrames(frames, ['a', 'zzz'])).toThrow(CanvasValidationError);
    });
  });

  describe('export descriptors and linkable references', () => {
    it('updates export metadata immutably and reads it back', () => {
      const frame = createFrame({ id: 'frame1', now: NOW });
      const result = withFrameExport(
        frame,
        { exportable: false, label: 'Slide 1', scale: 2 },
        NOW + 1,
      );

      expect(result.frame.exportDescriptor).toEqual({
        exportable: false,
        label: 'Slide 1',
        scale: 2,
      });
      expect(result.operation.type).toBe('frame-export-changed');
      expect(frameExportDescriptor(result.frame)).toEqual(result.frame.exportDescriptor);
      expect(() =>
        withFrameExport(frame, { exportable: true, label: null, scale: 0 }, NOW + 1),
      ).toThrow(CanvasValidationError);
    });

    it('produces a validated linkable reference', () => {
      const frame = createFrame({ id: 'frame1', now: NOW });
      expect(referenceFrame(frame, 'intro')).toEqual({ frameId: 'frame1', alias: 'intro' });
      expect(() => referenceFrame(frame, '   ')).toThrow(CanvasValidationError);
    });
  });

  describe('validateContainmentGraph', () => {
    it('accepts acyclic nested containment and returns a deterministic topological order', () => {
      const inner = createFrame({ id: 'inner', now: NOW, children: ['b1'] });
      const outer = createFrame({ id: 'outer', now: NOW, children: ['inner', 'b2'] });
      const result = validateContainmentGraph([inner, outer]);

      expect(result.valid).toBe(true);
      expect(result.order).toEqual(['outer', 'inner']);
    });

    it('rejects cyclic containment between frames', () => {
      const a = createFrame({ id: 'a', now: NOW, children: ['b'] });
      const b = createFrame({ id: 'b', now: NOW, children: ['a'] });
      expect(() => validateContainmentGraph([a, b])).toThrow(/cycle/i);
    });

    it('rejects self-containment and duplicate frame ids', () => {
      const self = createFrame({ id: 'a', now: NOW });
      const selfRef = { ...self, children: Object.freeze(['a']) } as CanvasFrame;
      expect(() => validateContainmentGraph([selfRef])).toThrow(/self/i);

      const dup1 = createFrame({ id: 'a', now: NOW });
      const dup2 = createFrame({ id: 'a', now: NOW });
      expect(() => validateContainmentGraph([dup1, dup2])).toThrow(/duplicate/i);
    });

    it('rejects missing references when a block id set is supplied', () => {
      const frame = createFrame({ id: 'a', now: NOW, children: ['known', 'ghost'] });
      expect(() => validateContainmentGraph([frame], ['known'])).toThrow(/missing/i);
      expect(validateContainmentGraph([frame], ['known', 'ghost']).valid).toBe(true);
    });
  });
});
