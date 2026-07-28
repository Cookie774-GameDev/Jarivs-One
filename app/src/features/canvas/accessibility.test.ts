import { describe, expect, it } from 'vitest';
import {
  buildCanvasScreenReaderOutline,
  canvasAccessibilityPolicy,
  canvasBlockAccessibleLabel,
  canvasImageAltText,
  canvasLiveAnnouncement,
  canvasZoomAnnouncement,
  decodeCanvasKeyboardCommand,
  findCanvasFocusSuccessor,
  navigateCanvasObjects,
  type CanvasAccessibilityContainer,
} from './accessibility';
import {
  createCanvasBlock,
  createCanvasDocument,
  withBlockAdded,
  withPlacement,
  withPresentationOrder,
  type CanvasDocument,
} from './contracts';
import type { CanvasAssetReference } from './assets';
import { createCanvasShape } from './shapes';

function documentFixture(): CanvasDocument {
  let document = createCanvasDocument({
    id: 'canvas-a11y',
    projectId: 'project-a',
    ownerId: 'owner-a',
    title: 'Research map',
    now: 1,
  });
  const blocks = [
    createCanvasBlock({
      id: 'heading-a',
      content: { kind: 'heading', level: 2, text: 'Evidence' },
      now: 2,
    }),
    createCanvasBlock({
      id: 'note-a',
      content: { kind: 'note', text: 'Alpha finding' },
      now: 3,
    }),
    createCanvasBlock({
      id: 'note-b',
      content: { kind: 'note', text: 'Beta finding' },
      now: 4,
    }),
    createCanvasBlock({
      id: 'code-a',
      content: { kind: 'code', language: 'ts', text: 'const result = true;' },
      now: 5,
    }),
  ];
  for (const block of blocks) {
    document = withBlockAdded(document, block, block.updatedAt);
  }
  document = withPlacement(
    document,
    { blockId: 'heading-a', x: 0, y: 0, width: 100, height: 40 },
    6,
  );
  document = withPlacement(
    document,
    { blockId: 'note-a', x: 0, y: 100, width: 100, height: 80 },
    7,
  );
  document = withPlacement(
    document,
    { blockId: 'note-b', x: 200, y: 100, width: 100, height: 80 },
    8,
  );
  document = withPlacement(
    document,
    { blockId: 'code-a', x: 0, y: 220, width: 100, height: 80 },
    9,
  );
  return withPresentationOrder(document, ['note-b', 'note-a'], 10);
}

describe('canvas accessibility descriptors', () => {
  it('builds an immutable page, frame, group, and object outline in explicit reading order', () => {
    const containers: readonly CanvasAccessibilityContainer[] = [
      {
        id: 'frame-findings',
        kind: 'frame',
        label: 'Findings frame',
        childIds: ['group-evidence', 'note-b'],
      },
      {
        id: 'group-evidence',
        kind: 'group',
        label: 'Evidence group',
        childIds: ['heading-a', 'note-a'],
      },
    ];

    const outline = buildCanvasScreenReaderOutline(documentFixture(), { containers });

    expect(outline.label).toBe('Canvas page: Research map');
    expect(outline.children.map((item) => item.id)).toEqual(['frame-findings', 'code-a']);
    expect(outline.children[0].children.map((item) => item.id)).toEqual([
      'group-evidence',
      'note-b',
    ]);
    expect(outline.children[0].children[0].children.map((item) => item.id)).toEqual([
      'heading-a',
      'note-a',
    ]);
    expect(outline.flatItems.map((item) => item.id)).toEqual([
      'frame-findings',
      'group-evidence',
      'heading-a',
      'note-a',
      'note-b',
      'code-a',
    ]);
    expect(outline.flatItems.find((item) => item.id === 'heading-a')).toMatchObject({
      role: 'heading',
      level: 2,
    });
    expect(outline.children[0].positionInSet).toBe(1);
    expect(outline.children[1].setSize).toBe(2);
    expect(Object.isFrozen(outline)).toBe(true);
    expect(Object.isFrozen(outline.children[0].children)).toBe(true);
    expect(() => {
      (outline.flatItems as unknown as string[]).push('bad');
    }).toThrow();
  });

  it('rejects duplicate ownership, missing children, and container cycles', () => {
    const document = documentFixture();
    expect(() =>
      buildCanvasScreenReaderOutline(document, {
        containers: [
          { id: 'group-a', kind: 'group', label: 'A', childIds: ['note-a'] },
          { id: 'group-b', kind: 'group', label: 'B', childIds: ['note-a'] },
        ],
      }),
    ).toThrow(/more than one container/);
    expect(() =>
      buildCanvasScreenReaderOutline(document, {
        containers: [{ id: 'group-a', kind: 'group', label: 'A', childIds: ['missing'] }],
      }),
    ).toThrow(/unknown child/);
    expect(() =>
      buildCanvasScreenReaderOutline(document, {
        containers: [
          { id: 'group-a', kind: 'group', label: 'A', childIds: ['group-b'] },
          { id: 'group-b', kind: 'group', label: 'B', childIds: ['group-a'] },
        ],
      }),
    ).toThrow(/cycle/);
  });

  it('derives bounded meaningful labels and exposes selection without color alone', () => {
    const longNote = createCanvasBlock({
      id: 'long-note',
      content: { kind: 'note', text: `  ${'word '.repeat(40)}  ` },
      now: 1,
    });
    const label = canvasBlockAccessibleLabel(longNote);
    expect(label.startsWith('Note: word word')).toBe(true);
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBeLessThanOrEqual(96);

    const shape = createCanvasBlock({
      id: 'shape-a',
      content: {
        kind: 'shape',
        shape: createCanvasShape({
          id: 'shape-a',
          kind: 'diamond',
          fill: '#f2c94c',
          text: 'Decision',
        }),
      },
      now: 1,
    });
    expect(canvasBlockAccessibleLabel(shape)).toBe('Diamond shape: Decision');

    const outline = buildCanvasScreenReaderOutline(documentFixture(), {
      selectedIds: ['note-a'],
    });
    const selected = outline.flatItems.find((item) => item.id === 'note-a');
    expect(selected).toMatchObject({
      selected: true,
      stateText: 'Selected',
      selectionCue: 'outline-and-checkmark',
    });
  });
});

describe('canvas keyboard access', () => {
  it('navigates reading order and two-dimensional object positions deterministically', () => {
    const items = buildCanvasScreenReaderOutline(documentFixture()).flatItems;

    expect(navigateCanvasObjects(items, 'heading-a', 'next')).toBe('note-a');
    expect(navigateCanvasObjects(items, 'heading-a', 'end')).toBe('code-a');
    expect(navigateCanvasObjects(items, 'note-a', 'right')).toBe('note-b');
    expect(navigateCanvasObjects(items, 'note-a', 'down')).toBe('code-a');
    expect(navigateCanvasObjects(items, 'heading-a', 'up')).toBe('heading-a');
    expect(navigateCanvasObjects(items, null, 'next')).toBe('heading-a');
  });

  it('selects a stable focus successor after one or more objects are removed', () => {
    const items = buildCanvasScreenReaderOutline(documentFixture()).flatItems;

    expect(findCanvasFocusSuccessor(items, 'note-a', ['note-a', 'note-b'])).toBe('code-a');
    expect(findCanvasFocusSuccessor(items, 'code-a', ['code-a'])).toBe('note-b');
    expect(
      findCanvasFocusSuccessor(
        items,
        'note-a',
        items.map((item) => item.id),
      ),
    ).toBeNull();
  });

  it('decodes keyboard creation, movement, activation, deletion, and escape commands', () => {
    expect(
      decodeCanvasKeyboardCommand({
        key: 'N',
        altKey: true,
        shiftKey: true,
        layoutMode: 'edgeless',
        selectedIds: [],
      }),
    ).toEqual({ type: 'create', kind: 'note' });
    expect(
      decodeCanvasKeyboardCommand({
        key: 'ArrowRight',
        shiftKey: true,
        layoutMode: 'edgeless',
        selectedIds: ['note-a'],
      }),
    ).toEqual({ type: 'move', ids: ['note-a'], dx: 10, dy: 0 });
    expect(
      decodeCanvasKeyboardCommand({
        key: 'Enter',
        layoutMode: 'page',
        selectedIds: ['note-a'],
      }),
    ).toEqual({ type: 'activate', id: 'note-a' });
    expect(
      decodeCanvasKeyboardCommand({
        key: 'Delete',
        layoutMode: 'page',
        selectedIds: ['note-a', 'note-b'],
      }),
    ).toEqual({ type: 'delete', ids: ['note-a', 'note-b'] });
    expect(
      decodeCanvasKeyboardCommand({
        key: 'Escape',
        layoutMode: 'page',
        selectedIds: ['note-a'],
      }),
    ).toEqual({ type: 'clear-selection' });
    expect(
      decodeCanvasKeyboardCommand({
        key: 'ArrowRight',
        editableTarget: true,
        layoutMode: 'edgeless',
        selectedIds: ['note-a'],
      }),
    ).toBeNull();
  });
});

describe('canvas assistive announcements and preferences', () => {
  it('describes provided, decorative, missing, and unavailable image alt text states', () => {
    const base = {
      id: 'asset-a',
      projectId: 'project-a',
      ownerId: 'owner-a',
      missing: false,
      altText: 'Diagram of the evidence flow',
      original: { filename: 'evidence.png' },
    } as CanvasAssetReference;

    expect(canvasImageAltText(base)).toEqual({
      state: 'provided',
      text: 'Diagram of the evidence flow',
    });
    expect(canvasImageAltText({ ...base, altText: '' })).toEqual({
      state: 'decorative',
      text: '',
    });
    expect(canvasImageAltText({ ...base, missing: true })).toEqual({
      state: 'missing',
      text: 'Missing image: evidence.png',
    });
    expect(canvasImageAltText({ ...base, altText: null })).toEqual({
      state: 'required',
      text: 'Image description needed: evidence.png',
    });
    expect(canvasImageAltText({ ...base, altText: '   \t ' })).toEqual({
      state: 'required',
      text: 'Image description needed: evidence.png',
    });
  });

  it('returns polite bounded live announcements for zoom and object operations', () => {
    expect(canvasZoomAnnouncement(1.25)).toEqual({
      politeness: 'polite',
      message: 'Canvas zoom 125 percent',
    });
    expect(canvasLiveAnnouncement({ type: 'moved', count: 2, dx: -10, dy: 0 })).toEqual({
      politeness: 'polite',
      message: 'Moved 2 canvas objects left 10 pixels',
    });
    expect(
      canvasLiveAnnouncement({ type: 'focused', label: '  A   very   spaced label  ' }),
    ).toEqual({
      politeness: 'polite',
      message: 'Focused A very spaced label',
    });
    expect(canvasZoomAnnouncement(Number.MAX_VALUE).message.length).toBeLessThanOrEqual(180);
  });

  it('combines reduced motion, forced colors, higher contrast, and non-color cues', () => {
    expect(
      canvasAccessibilityPolicy({
        reducedMotion: true,
        forcedColors: true,
        prefersMoreContrast: true,
      }),
    ).toEqual({
      animationDurationMs: 0,
      animateCamera: false,
      contrast: 'forced',
      focusIndicator: 'system-outline',
      selectionIndicator: 'outline-and-checkmark',
      useTransparency: false,
    });
    expect(
      canvasAccessibilityPolicy({
        reducedMotion: false,
        forcedColors: false,
        prefersMoreContrast: true,
      }).contrast,
    ).toBe('more');
  });
});
