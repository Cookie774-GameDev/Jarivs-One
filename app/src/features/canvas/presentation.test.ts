import { describe, expect, it } from 'vitest';
import {
  CanvasValidationError,
  type CanvasBlockId,
  type CanvasDocument,
  type CanvasSpatialPlacement,
} from './contracts';
import type { CanvasViewport } from './camera';
import {
  activeFrameZoomTarget,
  addFrame,
  canEnterFullscreen,
  canExportPdf,
  createPresentation,
  deserializePresentation,
  enterPresentMode,
  exitPresentMode,
  frameNotes,
  frameZoomTarget,
  goToFrame,
  moveFrame,
  nextFrame,
  presentationFromDocument,
  presentationProgress,
  previousFrame,
  removeFrame,
  serializePresentation,
  setFrames,
  setFrameNotes,
  withCapabilities,
  type PresentationState,
} from './presentation';

const viewport: CanvasViewport = { width: 800, height: 600 };

function frameIds(state: PresentationState): readonly string[] {
  return state.frames.map((frame) => frame.id);
}

function placement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): CanvasSpatialPlacement {
  return Object.freeze({
    blockId: id as CanvasBlockId,
    x,
    y,
    width,
    height,
    rotation: 0,
    z: 0,
    locked: false,
    hidden: false,
  });
}

function threeFrames(): PresentationState {
  return addFrame(addFrame(addFrame(createPresentation(), 'a'), 'b'), 'c');
}

function presentingThree(): PresentationState {
  return enterPresentMode(threeFrames());
}

function validationError(fn: () => unknown): CanvasValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof CanvasValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected a CanvasValidationError to be thrown');
}

describe('frame ordering', () => {
  it('starts idle with no frames and an inactive index', () => {
    const state = createPresentation();
    expect(state.status).toBe('idle');
    expect(frameIds(state)).toEqual([]);
    expect(state.currentIndex).toBe(-1);
  });

  it('appends frames in insertion order by default', () => {
    expect(frameIds(threeFrames())).toEqual(['a', 'b', 'c']);
  });

  it('inserts a frame at an explicit index', () => {
    const state = addFrame(threeFrames(), 'x', 1);
    expect(frameIds(state)).toEqual(['a', 'x', 'b', 'c']);
  });

  it('rejects duplicate frame ids', () => {
    const error = validationError(() => addFrame(threeFrames(), 'b'));
    expect(error.code).toBe('duplicate-id');
  });

  it('rejects malformed frame ids', () => {
    expect(validationError(() => addFrame(createPresentation(), '')).code).toBe('invalid-id');
    expect(validationError(() => addFrame(createPresentation(), 'has space')).code).toBe(
      'invalid-id',
    );
  });

  it('rejects an out of range insertion index', () => {
    expect(validationError(() => addFrame(threeFrames(), 'x', -1)).code).toBe('invalid-number');
    expect(validationError(() => addFrame(threeFrames(), 'x', 4)).code).toBe('invalid-number');
    expect(validationError(() => addFrame(threeFrames(), 'x', 1.5)).code).toBe('invalid-number');
  });

  it('removes a frame and preserves the remaining order', () => {
    const state = removeFrame(threeFrames(), 'b');
    expect(frameIds(state)).toEqual(['a', 'c']);
  });

  it('rejects removing an unknown frame', () => {
    expect(validationError(() => removeFrame(threeFrames(), 'zzz')).code).toBe('invalid-reference');
  });

  it('moves a frame to a new index (drag reorder)', () => {
    expect(frameIds(moveFrame(threeFrames(), 'a', 2))).toEqual(['b', 'c', 'a']);
    expect(frameIds(moveFrame(threeFrames(), 'c', 0))).toEqual(['c', 'a', 'b']);
  });

  it('rejects moving to an out of range index or unknown id', () => {
    expect(validationError(() => moveFrame(threeFrames(), 'a', 3)).code).toBe('invalid-number');
    expect(validationError(() => moveFrame(threeFrames(), 'a', -1)).code).toBe('invalid-number');
    expect(validationError(() => moveFrame(threeFrames(), 'zzz', 0)).code).toBe(
      'invalid-reference',
    );
  });

  it('replaces the full order with setFrames and preserves notes for retained ids', () => {
    const noted = setFrameNotes(threeFrames(), 'b', 'keep me');
    const reordered = setFrames(noted, ['c', 'b', 'a']);
    expect(frameIds(reordered)).toEqual(['c', 'b', 'a']);
    expect(frameNotes(reordered, 'b')).toBe('keep me');
    expect(frameNotes(reordered, 'a')).toBe('');
  });

  it('rejects duplicate and malformed ids in setFrames', () => {
    expect(validationError(() => setFrames(createPresentation(), ['a', 'a'])).code).toBe(
      'duplicate-id',
    );
    expect(validationError(() => setFrames(createPresentation(), ['ok', 'bad id'])).code).toBe(
      'invalid-id',
    );
  });

  it('is deterministic for identical operation sequences', () => {
    const left = serializePresentation(addFrame(threeFrames(), 'd', 0));
    const right = serializePresentation(addFrame(threeFrames(), 'd', 0));
    expect(left).toEqual(right);
  });
});

describe('present mode enter and exit', () => {
  it('enters present mode at the first frame', () => {
    const state = presentingThree();
    expect(state.status).toBe('presenting');
    expect(state.currentIndex).toBe(0);
  });

  it('enters with an inactive index when there are no frames', () => {
    const state = enterPresentMode(createPresentation());
    expect(state.status).toBe('presenting');
    expect(state.currentIndex).toBe(-1);
  });

  it('exits present mode and clears the active index', () => {
    const state = exitPresentMode(presentingThree());
    expect(state.status).toBe('idle');
    expect(state.currentIndex).toBe(-1);
  });

  it('treats enter and exit as idempotent', () => {
    const presenting = presentingThree();
    expect(enterPresentMode(presenting)).toEqual(presenting);
    const idle = createPresentation();
    expect(exitPresentMode(idle)).toEqual(idle);
  });

  it('keeps the same frame active when frames are added before it', () => {
    const atB = goToFrame(presentingThree(), 1);
    const inserted = addFrame(atB, 'z', 0);
    expect(frameIds(inserted)).toEqual(['z', 'a', 'b', 'c']);
    expect(inserted.frames[inserted.currentIndex].id).toBe('b');
    expect(inserted.currentIndex).toBe(2);
  });

  it('keeps a valid index when the active frame is removed', () => {
    const atC = goToFrame(presentingThree(), 2);
    const removed = removeFrame(atC, 'c');
    expect(removed.status).toBe('presenting');
    expect(removed.currentIndex).toBe(1);
    expect(frameIds(removed)).toEqual(['a', 'b']);
  });
});

describe('keyboard navigation bounds', () => {
  it('advances with nextFrame and clamps at the last frame', () => {
    const start = presentingThree();
    const one = nextFrame(start);
    const two = nextFrame(one);
    const clamped = nextFrame(two);
    expect(one.currentIndex).toBe(1);
    expect(two.currentIndex).toBe(2);
    expect(clamped.currentIndex).toBe(2);
  });

  it('retreats with previousFrame and clamps at the first frame', () => {
    const start = presentingThree();
    expect(previousFrame(start).currentIndex).toBe(0);
    const middle = goToFrame(start, 2);
    expect(previousFrame(middle).currentIndex).toBe(1);
  });

  it('clamps goToFrame at both bounds', () => {
    const state = presentingThree();
    expect(goToFrame(state, 99).currentIndex).toBe(2);
    expect(goToFrame(state, -5).currentIndex).toBe(0);
  });

  it('rejects a non-integer goToFrame index', () => {
    expect(validationError(() => goToFrame(presentingThree(), 1.5)).code).toBe('invalid-number');
    expect(validationError(() => goToFrame(presentingThree(), Number.NaN)).code).toBe(
      'invalid-number',
    );
  });

  it('is a no-op while idle', () => {
    const idle = threeFrames();
    expect(nextFrame(idle)).toEqual(idle);
    expect(previousFrame(idle)).toEqual(idle);
    expect(goToFrame(idle, 1)).toEqual(idle);
  });

  it('is a no-op when presenting with no frames', () => {
    const empty = enterPresentMode(createPresentation());
    expect(nextFrame(empty).currentIndex).toBe(-1);
    expect(previousFrame(empty).currentIndex).toBe(-1);
  });
});

describe('progress', () => {
  it('reports position, fraction and percent for the active frame', () => {
    const state = goToFrame(presentingThree(), 1);
    const progress = presentationProgress(state);
    expect(progress.total).toBe(3);
    expect(progress.index).toBe(1);
    expect(progress.current).toBe(2);
    expect(progress.fraction).toBeCloseTo(2 / 3);
    expect(progress.percent).toBe(67);
    expect(progress.isFirst).toBe(false);
    expect(progress.isLast).toBe(false);
    expect(progress.hasActiveFrame).toBe(true);
  });

  it('flags the first and last frames', () => {
    const state = presentingThree();
    expect(presentationProgress(state).isFirst).toBe(true);
    expect(presentationProgress(goToFrame(state, 2)).isLast).toBe(true);
  });

  it('reports an empty presentation honestly', () => {
    const progress = presentationProgress(createPresentation());
    expect(progress.total).toBe(0);
    expect(progress.current).toBe(0);
    expect(progress.index).toBe(-1);
    expect(progress.fraction).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.hasActiveFrame).toBe(false);
  });
});

describe('zoom targets', () => {
  const placements = [placement('a', 0, 0, 100, 100), placement('b', 1000, 0, 200, 200)];

  it('fits the requested frame into the viewport', () => {
    const state = presentingThree();
    const target = frameZoomTarget(state, 0, placements, viewport);
    expect(target).toBeDefined();
    expect(target?.x).toBe(50);
    expect(target?.y).toBe(50);
    expect(target?.zoom).toBeCloseTo(5.04);
  });

  it('fits the active frame via activeFrameZoomTarget', () => {
    const state = goToFrame(presentingThree(), 1);
    const target = activeFrameZoomTarget(state, placements, viewport);
    expect(target?.x).toBe(1100);
    expect(target?.y).toBe(100);
    expect(target?.zoom).toBeCloseTo(2.52);
  });

  it('returns undefined when a frame has no placement', () => {
    const state = goToFrame(presentingThree(), 2);
    expect(activeFrameZoomTarget(state, placements, viewport)).toBeUndefined();
    expect(frameZoomTarget(state, 2, placements, viewport)).toBeUndefined();
  });

  it('returns undefined when there is no active frame', () => {
    expect(activeFrameZoomTarget(createPresentation(), placements, viewport)).toBeUndefined();
  });

  it('rejects an out of range frame index', () => {
    const state = presentingThree();
    expect(validationError(() => frameZoomTarget(state, 5, placements, viewport)).code).toBe(
      'invalid-number',
    );
  });
});

describe('presenter notes', () => {
  it('sets and reads notes for a frame', () => {
    const state = setFrameNotes(threeFrames(), 'b', 'talk about b');
    expect(frameNotes(state, 'b')).toBe('talk about b');
    expect(frameNotes(state, 'a')).toBe('');
  });

  it('rejects notes for an unknown frame', () => {
    expect(validationError(() => setFrameNotes(threeFrames(), 'zzz', 'x')).code).toBe(
      'invalid-reference',
    );
    expect(validationError(() => frameNotes(threeFrames(), 'zzz')).code).toBe('invalid-reference');
  });

  it('rejects non-string notes', () => {
    expect(
      validationError(() => setFrameNotes(threeFrames(), 'a', 42 as unknown as string)).code,
    ).toBe('invalid-type');
  });

  it('rejects notes that exceed the canvas text bound', () => {
    const tooLong = 'x'.repeat(100_001);
    expect(validationError(() => setFrameNotes(threeFrames(), 'a', tooLong)).code).toBe(
      'invalid-number',
    );
  });
});

describe('portable deterministic state', () => {
  it('serializes to a stable, portable snapshot', () => {
    const state = setFrameNotes(goToFrame(presentingThree(), 1), 'b', 'notes');
    const snapshot = serializePresentation(state);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.status).toBe('presenting');
    expect(snapshot.currentIndex).toBe(1);
    expect(snapshot.frames).toEqual([
      { id: 'a', notes: '' },
      { id: 'b', notes: 'notes' },
      { id: 'c', notes: '' },
    ]);
    expect(snapshot.capabilities).toEqual({ fullscreen: false, pdfExport: false });
  });

  it('round-trips through deserialize without loss', () => {
    const state = setFrameNotes(goToFrame(presentingThree(), 2), 'c', 'closing');
    const restored = deserializePresentation(serializePresentation(state));
    expect(restored).toEqual(state);
    expect(serializePresentation(restored)).toEqual(serializePresentation(state));
  });

  it('deserializes an idle, empty snapshot', () => {
    const restored = deserializePresentation({
      schemaVersion: 1,
      status: 'idle',
      currentIndex: -1,
      frames: [],
      capabilities: { fullscreen: true, pdfExport: false },
    });
    expect(restored.status).toBe('idle');
    expect(frameIds(restored)).toEqual([]);
    expect(restored.currentIndex).toBe(-1);
    expect(canEnterFullscreen(restored)).toBe(true);
  });
});

describe('malformed state rejection', () => {
  const caps = { fullscreen: false, pdfExport: false };

  it('rejects non-object snapshots', () => {
    expect(validationError(() => deserializePresentation(null)).code).toBe('invalid-type');
    expect(validationError(() => deserializePresentation('nope')).code).toBe('invalid-type');
  });

  it('rejects unknown snapshot, frame, and capability fields', () => {
    const base = {
      schemaVersion: 1,
      status: 'idle',
      currentIndex: -1,
      frames: [{ id: 'a', notes: '' }],
      capabilities: caps,
    };

    expect(validationError(() => deserializePresentation({ ...base, unexpected: true })).code).toBe(
      'unsupported-value',
    );
    expect(
      validationError(() =>
        deserializePresentation({
          ...base,
          frames: [{ id: 'a', notes: '', unexpected: true }],
        }),
      ).code,
    ).toBe('unsupported-value');
    expect(
      validationError(() =>
        deserializePresentation({
          ...base,
          capabilities: { ...caps, unexpected: true },
        }),
      ).code,
    ).toBe('unsupported-value');
  });

  it('rejects an unsupported schema version', () => {
    const error = validationError(() =>
      deserializePresentation({
        schemaVersion: 2,
        status: 'idle',
        currentIndex: -1,
        frames: [],
        capabilities: caps,
      }),
    );
    expect(error.code).toBe('unsupported-value');
  });

  it('rejects an invalid status', () => {
    expect(
      validationError(() =>
        deserializePresentation({
          schemaVersion: 1,
          status: 'sleeping',
          currentIndex: -1,
          frames: [],
          capabilities: caps,
        }),
      ).code,
    ).toBe('unsupported-value');
  });

  it('rejects a non-array frame list', () => {
    expect(
      validationError(() =>
        deserializePresentation({
          schemaVersion: 1,
          status: 'idle',
          currentIndex: -1,
          frames: 'a',
          capabilities: caps,
        }),
      ).code,
    ).toBe('invalid-type');
  });

  it('rejects malformed and duplicate frame ids', () => {
    const base = { schemaVersion: 1, status: 'idle', currentIndex: -1, capabilities: caps };
    expect(
      validationError(() =>
        deserializePresentation({ ...base, frames: [{ id: 'bad id', notes: '' }] }),
      ).code,
    ).toBe('invalid-id');
    expect(
      validationError(() =>
        deserializePresentation({
          ...base,
          frames: [
            { id: 'a', notes: '' },
            { id: 'a', notes: '' },
          ],
        }),
      ).code,
    ).toBe('duplicate-id');
  });

  it('rejects non-string notes in a snapshot frame', () => {
    expect(
      validationError(() =>
        deserializePresentation({
          schemaVersion: 1,
          status: 'idle',
          currentIndex: -1,
          frames: [{ id: 'a', notes: 3 }],
          capabilities: caps,
        }),
      ).code,
    ).toBe('invalid-type');
  });

  it('rejects an out of range or non-integer current index', () => {
    const frames = [{ id: 'a', notes: '' }];
    expect(
      validationError(() =>
        deserializePresentation({
          schemaVersion: 1,
          status: 'presenting',
          currentIndex: 5,
          frames,
          capabilities: caps,
        }),
      ).code,
    ).toBe('invalid-number');
    expect(
      validationError(() =>
        deserializePresentation({
          schemaVersion: 1,
          status: 'presenting',
          currentIndex: 0.5,
          frames,
          capabilities: caps,
        }),
      ).code,
    ).toBe('invalid-number');
  });

  it('rejects an index that contradicts the presentation status', () => {
    expect(
      validationError(() =>
        deserializePresentation({
          schemaVersion: 1,
          status: 'idle',
          currentIndex: 0,
          frames: [{ id: 'a', notes: '' }],
          capabilities: caps,
        }),
      ).code,
    ).toBe('invalid-number');
    expect(
      validationError(() =>
        deserializePresentation({
          schemaVersion: 1,
          status: 'presenting',
          currentIndex: -1,
          frames: [{ id: 'a', notes: '' }],
          capabilities: caps,
        }),
      ).code,
    ).toBe('invalid-number');
  });

  it('rejects non-boolean capabilities', () => {
    expect(
      validationError(() =>
        deserializePresentation({
          schemaVersion: 1,
          status: 'idle',
          currentIndex: -1,
          frames: [],
          capabilities: { fullscreen: 'yes', pdfExport: false },
        }),
      ).code,
    ).toBe('invalid-type');
  });
});

describe('honest capabilities', () => {
  it('defaults to unsupported until the environment says otherwise', () => {
    const state = createPresentation();
    expect(canEnterFullscreen(state)).toBe(false);
    expect(canExportPdf(state)).toBe(false);
  });

  it('reflects provided capabilities without faking execution', () => {
    const state = createPresentation({ fullscreen: true, pdfExport: true });
    expect(canEnterFullscreen(state)).toBe(true);
    expect(canExportPdf(state)).toBe(true);
  });

  it('merges partial capability updates', () => {
    const state = withCapabilities(createPresentation(), { pdfExport: true });
    expect(canExportPdf(state)).toBe(true);
    expect(canEnterFullscreen(state)).toBe(false);
  });

  it('rejects non-boolean capability values', () => {
    expect(
      validationError(() =>
        withCapabilities(createPresentation(), { fullscreen: 'yes' as unknown as boolean }),
      ).code,
    ).toBe('invalid-type');
    expect(
      validationError(() => createPresentation({ pdfExport: 1 as unknown as boolean })).code,
    ).toBe('invalid-type');
  });
});

describe('presentation from a canvas document', () => {
  it('promotes the document presentation order to idle frames', () => {
    const doc = { presentationOrder: ['a', 'b', 'c'] } as unknown as CanvasDocument;
    const state = presentationFromDocument(doc);
    expect(state.status).toBe('idle');
    expect(frameIds(state)).toEqual(['a', 'b', 'c']);
    expect(state.currentIndex).toBe(-1);
    expect(state.frames.every((frame) => frame.notes === '')).toBe(true);
  });
});
