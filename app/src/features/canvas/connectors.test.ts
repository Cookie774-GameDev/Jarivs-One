import { describe, expect, it } from 'vitest';
import {
  CANVAS_CONNECTOR_ANCHORS,
  CANVAS_CONNECTOR_ARROWS,
  CANVAS_CONNECTOR_OBSTACLE_MARGIN,
  CANVAS_CONNECTOR_STYLES,
  CANVAS_MAX_CONNECTOR_LABEL_LENGTH,
  CanvasValidationError,
  assertUniqueConnectorIds,
  connectorById,
  connectorSelectionId,
  connectorSelectionIds,
  createConnectorCollection,
  createCanvasConnector,
  isConnectorSelected,
  isCanvasConnectorAnchor,
  isCanvasConnectorArrow,
  isCanvasConnectorStyle,
  parseCanvasConnector,
  parseCanvasConnectorId,
  resolveAnchorPoint,
  resolveConnectorEndpoints,
  resolveConnectorEndpointsFromDocument,
  resolveConnectorRoute,
  resolveConnectorRouteFromDocument,
  validateConnectorReferences,
  withConnectorAdded,
  withConnectorRemoved,
  withConnectorUpdated,
  type CanvasConnector,
  type CanvasConnectorRoute,
  type CanvasPoint,
  type CreateCanvasConnectorInput,
} from './connectors';
import {
  CanvasValidationError as ContractCanvasValidationError,
  createCanvasBlock,
  createCanvasDocument,
  parseCanvasBlockId,
  withBlockAdded,
  withPlacement,
  type CanvasBlockId,
  type CanvasDocument,
  type CanvasSpatialPlacement,
  type CanvasValidationErrorCode,
} from './contracts';
import { createCanvasSelection, selectCanvasBlock, selectionHas } from './selection';

const T0 = 1_750_000_000_000;
const T1 = T0 + 60_000;

function placement(
  blockId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): CanvasSpatialPlacement {
  return { blockId, x, y, width, height, rotation: 0, z: 0 } as unknown as CanvasSpatialPlacement;
}

const placementA = placement('blk-a', 0, 0, 100, 40);
const placementB = placement('blk-b', 300, 120, 80, 60);

function endpoint(blockId: string, anchor: string): { blockId: string; anchor: string } {
  return { blockId, anchor };
}

function connectorInput(overrides: Record<string, unknown> = {}): CreateCanvasConnectorInput {
  return {
    id: 'conn-1',
    source: endpoint('blk-a', 'right'),
    target: endpoint('blk-b', 'left'),
    now: T0,
    ...overrides,
  } as CreateCanvasConnectorInput;
}

function layoutOf(
  ...placements: CanvasSpatialPlacement[]
): ReadonlyMap<CanvasBlockId, CanvasSpatialPlacement> {
  return new Map(placements.map((item) => [parseCanvasBlockId(item.blockId), item]));
}

function docWithPlacements(): CanvasDocument {
  let doc = createCanvasDocument({
    id: 'doc-1',
    projectId: 'project-1',
    ownerId: 'owner-1',
    title: 'Ideas',
    now: T0,
  });
  doc = withBlockAdded(
    doc,
    createCanvasBlock({ id: 'blk-a', content: { kind: 'text', text: 'alpha' }, now: T0 }),
    T0,
  );
  doc = withBlockAdded(
    doc,
    createCanvasBlock({ id: 'blk-b', content: { kind: 'text', text: 'beta' }, now: T0 }),
    T0,
  );
  doc = withPlacement(doc, { blockId: 'blk-a', x: 0, y: 0, width: 100, height: 40 }, T0);
  doc = withPlacement(doc, { blockId: 'blk-b', x: 300, y: 120, width: 80, height: 60 }, T0);
  return doc;
}

function expectCanvasError(fn: () => unknown, code: CanvasValidationErrorCode): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ContractCanvasValidationError);
    expect((error as CanvasValidationError).code).toBe(code);
    return;
  }
  throw new Error(`expected CanvasValidationError(${code}) but nothing was thrown`);
}

function collinear(points: readonly CanvasPoint[]): boolean {
  if (points.length < 3) return true;
  const [a, b] = points;
  return points.every((p) => (b.x - a.x) * (p.y - a.y) === (b.y - a.y) * (p.x - a.x));
}

describe('canvas connector identifiers', () => {
  it('accepts stable alphanumeric ids with hyphen and underscore', () => {
    expect(parseCanvasConnectorId('conn-1')).toBe('conn-1');
    expect(parseCanvasConnectorId('conn_x2')).toBe('conn_x2');
    expect(parseCanvasConnectorId('V1StGXR8_Z5jdHi6B-myT')).toBe('V1StGXR8_Z5jdHi6B-myT');
  });

  it('rejects malformed ids fail-closed', () => {
    expectCanvasError(() => parseCanvasConnectorId(''), 'invalid-id');
    expectCanvasError(() => parseCanvasConnectorId('-lead'), 'invalid-id');
    expectCanvasError(() => parseCanvasConnectorId('has space'), 'invalid-id');
    expectCanvasError(() => parseCanvasConnectorId(42), 'invalid-id');
    expectCanvasError(() => parseCanvasConnectorId('x'.repeat(65)), 'invalid-id');
  });

  it('exposes the supported anchor, style, and arrow vocabularies', () => {
    expect(CANVAS_CONNECTOR_ANCHORS).toEqual(['top', 'right', 'bottom', 'left', 'center']);
    expect(CANVAS_CONNECTOR_STYLES).toEqual(['straight', 'elbow', 'curved', 'hand-drawn']);
    expect(CANVAS_CONNECTOR_ARROWS).toEqual(['none', 'arrow']);
    expect(isCanvasConnectorAnchor('top')).toBe(true);
    expect(isCanvasConnectorAnchor('diagonal')).toBe(false);
    expect(isCanvasConnectorStyle('elbow')).toBe(true);
    expect(isCanvasConnectorStyle('zigzag')).toBe(false);
    expect(isCanvasConnectorArrow('arrow')).toBe(true);
    expect(isCanvasConnectorArrow('diamond')).toBe(false);
  });
});

describe('canvas connector creation and validation', () => {
  it('creates a frozen connector with deterministic defaults', () => {
    const connector = createCanvasConnector(connectorInput());
    expect(connector).toMatchObject({
      id: 'conn-1',
      source: { blockId: 'blk-a', anchor: 'right' },
      target: { blockId: 'blk-b', anchor: 'left' },
      style: 'straight',
      startArrow: 'none',
      endArrow: 'arrow',
      label: null,
      createdAt: T0,
      updatedAt: T0,
    });
    expect(Object.isFrozen(connector)).toBe(true);
    expect(Object.isFrozen(connector.source)).toBe(true);
  });

  it('preserves explicit style, arrows, and bounded labels', () => {
    const connector = createCanvasConnector(
      connectorInput({
        style: 'elbow',
        startArrow: 'arrow',
        endArrow: 'none',
        label: 'depends on',
      }),
    );
    expect(connector.style).toBe('elbow');
    expect(connector.startArrow).toBe('arrow');
    expect(connector.endArrow).toBe('none');
    expect(connector.label).toBe('depends on');
  });

  it('normalizes empty labels to null', () => {
    expect(createCanvasConnector(connectorInput({ label: '' })).label).toBeNull();
    expect(createCanvasConnector(connectorInput({ label: null })).label).toBeNull();
  });

  it('rejects malformed connectors, endpoints, styles, arrows, and labels', () => {
    expectCanvasError(() => createCanvasConnector(connectorInput({ id: 'bad id' })), 'invalid-id');
    expectCanvasError(
      () => createCanvasConnector(connectorInput({ source: endpoint('blk-a', 'diagonal') })),
      'unsupported-value',
    );
    expectCanvasError(
      () => createCanvasConnector(connectorInput({ source: endpoint('bad block', 'right') })),
      'invalid-id',
    );
    expectCanvasError(
      () => createCanvasConnector(connectorInput({ style: 'zigzag' })),
      'unsupported-value',
    );
    expectCanvasError(
      () => createCanvasConnector(connectorInput({ endArrow: 'diamond' })),
      'unsupported-value',
    );
    expectCanvasError(
      () =>
        createCanvasConnector(
          connectorInput({ label: 'x'.repeat(CANVAS_MAX_CONNECTOR_LABEL_LENGTH + 1) }),
        ),
      'unsupported-value',
    );
    expectCanvasError(
      () => createCanvasConnector(connectorInput({ label: 'bad\u0000text' })),
      'unsupported-value',
    );
    expectCanvasError(
      () => createCanvasConnector(connectorInput({ now: -1 })),
      'invalid-timestamp',
    );
    expectCanvasError(
      () => createCanvasConnector(connectorInput({ now: Number.NaN })),
      'invalid-timestamp',
    );
  });

  it('parses a strict connector payload and round-trips created connectors', () => {
    const connector = createCanvasConnector(connectorInput({ label: 'flow' }));
    const raw = JSON.parse(JSON.stringify(connector)) as unknown;
    expect(parseCanvasConnector(raw)).toEqual(connector);
  });

  it('rejects malformed parse input fail-closed', () => {
    const validRaw = JSON.parse(JSON.stringify(createCanvasConnector(connectorInput()))) as Record<
      string,
      unknown
    >;
    expectCanvasError(() => parseCanvasConnector(null), 'invalid-type');
    expectCanvasError(() => parseCanvasConnector([]), 'invalid-type');
    expectCanvasError(() => parseCanvasConnector({}), 'invalid-id');
    expectCanvasError(() => parseCanvasConnector({ ...validRaw, extra: 1 }), 'invalid-type');
    expectCanvasError(
      () => parseCanvasConnector({ ...validRaw, style: 'zigzag' }),
      'unsupported-value',
    );
    expectCanvasError(
      () => parseCanvasConnector({ ...validRaw, createdAt: T1, updatedAt: T0 }),
      'invalid-timestamp',
    );
  });
});

describe('connector collection transitions', () => {
  it('builds a validated collection and rejects duplicate ids', () => {
    const collection = createConnectorCollection([
      connectorInput({ id: 'conn-1' }),
      connectorInput({ id: 'conn-2' }),
    ]);
    expect(collection).toHaveLength(2);
    expect(Object.isFrozen(collection)).toBe(true);
    expectCanvasError(
      () =>
        createConnectorCollection([
          connectorInput({ id: 'conn-1' }),
          connectorInput({ id: 'conn-1' }),
        ]),
      'duplicate-id',
    );
  });

  it('adds and removes connectors immutably', () => {
    const start = createConnectorCollection([connectorInput({ id: 'conn-1' })]);
    const added = withConnectorAdded(start, connectorInput({ id: 'conn-2' }));
    expect(added).toHaveLength(2);
    expect(start).toHaveLength(1);
    expectCanvasError(
      () => withConnectorAdded(added, connectorInput({ id: 'conn-2' })),
      'duplicate-id',
    );
    const removed = withConnectorRemoved(added, 'conn-1');
    expect(removed.map((c) => c.id)).toEqual(['conn-2']);
    expect(withConnectorRemoved(removed, 'conn-9')).toBe(removed);
  });

  it('updates a connector with re-validation and an updatedAt bump', () => {
    const start = createConnectorCollection([connectorInput({ id: 'conn-1' })]);
    const updated = withConnectorUpdated(start, 'conn-1', { style: 'curved', label: 'next' }, T1);
    expect(updated[0].style).toBe('curved');
    expect(updated[0].label).toBe('next');
    expect(updated[0].createdAt).toBe(T0);
    expect(updated[0].updatedAt).toBe(T1);
    expectCanvasError(
      () => withConnectorUpdated(start, 'conn-9', { style: 'curved' }, T1),
      'invalid-reference',
    );
    expectCanvasError(
      () => withConnectorUpdated(start, 'conn-1', { style: 'zigzag' }, T1),
      'unsupported-value',
    );
    expectCanvasError(
      () => withConnectorUpdated(start, 'conn-1', { style: 'curved' }, T0 - 1),
      'invalid-timestamp',
    );
  });

  it('exposes duplicate-id assertion and id lookup helpers', () => {
    const collection = createConnectorCollection([connectorInput({ id: 'conn-1' })]);
    expect(() => assertUniqueConnectorIds(collection)).not.toThrow();
    expect(connectorById(collection, 'conn-1')?.id).toBe('conn-1');
    expect(connectorById(collection, 'conn-9')).toBeUndefined();
  });
});

describe('connection anchors', () => {
  it('resolves each semantic anchor to a deterministic world point', () => {
    expect(resolveAnchorPoint(placementA, 'top')).toEqual({ x: 50, y: 0 });
    expect(resolveAnchorPoint(placementA, 'bottom')).toEqual({ x: 50, y: 40 });
    expect(resolveAnchorPoint(placementA, 'left')).toEqual({ x: 0, y: 20 });
    expect(resolveAnchorPoint(placementA, 'right')).toEqual({ x: 100, y: 20 });
    expect(resolveAnchorPoint(placementA, 'center')).toEqual({ x: 50, y: 20 });
  });

  it('rejects non-finite placement geometry', () => {
    const bad = placement('blk-a', Number.NaN, 0, 100, 40);
    expectCanvasError(() => resolveAnchorPoint(bad, 'right'), 'invalid-number');
    const negative = placement('blk-a', 0, 0, -10, 40);
    expectCanvasError(() => resolveAnchorPoint(negative, 'right'), 'invalid-number');
  });
});

describe('movement-safe endpoint resolution', () => {
  const connector = createCanvasConnector(connectorInput());

  it('resolves endpoints from the current document layout', () => {
    const doc = docWithPlacements();
    expect(resolveConnectorEndpointsFromDocument(connector, doc)).toEqual({
      source: { x: 100, y: 20 },
      target: { x: 300, y: 150 },
    });
  });

  it('keeps connectors attached when the referenced block moves', () => {
    const doc = docWithPlacements();
    const before = resolveConnectorEndpointsFromDocument(connector, doc);
    const moved = withPlacement(
      doc,
      { blockId: 'blk-b', x: 500, y: 200, width: 80, height: 60 },
      T1,
    );
    const after = resolveConnectorEndpointsFromDocument(connector, moved);
    expect(before.target).toEqual({ x: 300, y: 150 });
    expect(after.target).toEqual({ x: 500, y: 230 });
    expect(after.source).toEqual(before.source);
  });

  it('fails closed when a referenced block is missing from the layout', () => {
    const layout = layoutOf(placementA);
    expectCanvasError(() => resolveConnectorEndpoints(connector, layout), 'invalid-reference');
  });

  it('validates connector references against document blocks', () => {
    const doc = docWithPlacements();
    expect(() => validateConnectorReferences(connector, doc)).not.toThrow();
    const dangling = createCanvasConnector(
      connectorInput({ id: 'conn-x', target: endpoint('blk-zzz', 'left') }),
    );
    expectCanvasError(() => validateConnectorReferences(dangling, doc), 'invalid-reference');
  });
});

describe('connector route styles', () => {
  const layout = layoutOf(placementA, placementB);

  it('renders a straight route as two deterministic points and an SVG path', () => {
    const connector = createCanvasConnector(connectorInput({ style: 'straight' }));
    const route = resolveConnectorRoute(connector, layout);
    expect(route.style).toBe('straight');
    expect(route.points).toEqual([
      { x: 100, y: 20 },
      { x: 300, y: 150 },
    ]);
    expect(route.path).toBe('M 100 20 L 300 150');
    expect(route.source).toEqual({ x: 100, y: 20 });
    expect(route.target).toEqual({ x: 300, y: 150 });
  });

  it('renders a horizontal-first elbow route with an orthogonal bridge', () => {
    const connector = createCanvasConnector(connectorInput({ style: 'elbow' }));
    const route = resolveConnectorRoute(connector, layout);
    expect(route.points).toEqual([
      { x: 100, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 150 },
      { x: 300, y: 150 },
    ]);
    expect(route.path).toBe('M 100 20 L 200 20 L 200 150 L 300 150');
  });

  it('renders a vertical-first elbow route from vertical anchors', () => {
    const connector = createCanvasConnector(
      connectorInput({
        id: 'conn-v',
        source: endpoint('blk-a', 'bottom'),
        target: endpoint('blk-b', 'top'),
        style: 'elbow',
      }),
    );
    const route = resolveConnectorRoute(connector, layout);
    expect(route.points).toEqual([
      { x: 50, y: 40 },
      { x: 50, y: 80 },
      { x: 340, y: 80 },
      { x: 340, y: 120 },
    ]);
  });

  it('renders a curved route as a deterministic cubic bezier', () => {
    const connector = createCanvasConnector(connectorInput({ style: 'curved' }));
    const route = resolveConnectorRoute(connector, layout);
    const again = resolveConnectorRoute(connector, layout);
    expect(route.points).toHaveLength(4);
    expect(route.points[0]).toEqual({ x: 100, y: 20 });
    expect(route.points[3]).toEqual({ x: 300, y: 150 });
    expect(route.path.startsWith('M 100 20 C ')).toBe(true);
    expect(route).toEqual(again);
  });

  it('renders a deterministic hand-drawn route with exact endpoints', () => {
    const connector = createCanvasConnector(connectorInput({ style: 'hand-drawn' }));
    const route = resolveConnectorRoute(connector, layout);
    const again = resolveConnectorRoute(connector, layout);
    expect(route.points).toHaveLength(7);
    expect(route.points[0]).toEqual({ x: 100, y: 20 });
    expect(route.points[6]).toEqual({ x: 300, y: 150 });
    expect(collinear(route.points)).toBe(false);
    expect(route.path.startsWith('M 100 20 L ')).toBe(true);
    expect(route).toEqual(again);
  });

  it('re-resolves route geometry when objects move', () => {
    const connector = createCanvasConnector(connectorInput({ style: 'straight' }));
    const doc = docWithPlacements();
    const before = resolveConnectorRouteFromDocument(connector, doc);
    const moved = withPlacement(
      doc,
      { blockId: 'blk-b', x: 500, y: 200, width: 80, height: 60 },
      T1,
    );
    const after = resolveConnectorRouteFromDocument(connector, moved);
    expect(before.target).toEqual({ x: 300, y: 150 });
    expect(after.target).toEqual({ x: 500, y: 230 });
    expect(after.points[1]).toEqual({ x: 500, y: 230 });
  });
});

describe('practical obstacle avoidance for elbow routes', () => {
  it('routes the orthogonal bridge around a blocking object', () => {
    const doc = docWithPlacements();
    let blocked = withBlockAdded(
      doc,
      createCanvasBlock({ id: 'blk-c', content: { kind: 'text', text: 'gamma' }, now: T0 }),
      T0,
    );
    blocked = withPlacement(
      blocked,
      { blockId: 'blk-c', x: 180, y: 60, width: 40, height: 40 },
      T0,
    );

    const connector = createCanvasConnector(connectorInput({ style: 'elbow' }));
    const route = resolveConnectorRouteFromDocument(connector, blocked);
    const expandedLeft = 180 - CANVAS_CONNECTOR_OBSTACLE_MARGIN;
    const expandedRight = 180 + 40 + CANVAS_CONNECTOR_OBSTACLE_MARGIN;
    const bridgeX = route.points[1].x;
    expect(bridgeX === route.points[2].x).toBe(true);
    expect(bridgeX <= expandedLeft || bridgeX >= expandedRight).toBe(true);
    expect(bridgeX).not.toBe(200);
    expect(route).toEqual(resolveConnectorRouteFromDocument(connector, blocked));
  });

  it('leaves the route unchanged when no object blocks the corridor', () => {
    const doc = docWithPlacements();
    let clear = withBlockAdded(
      doc,
      createCanvasBlock({ id: 'blk-c', content: { kind: 'text', text: 'gamma' }, now: T0 }),
      T0,
    );
    clear = withPlacement(clear, { blockId: 'blk-c', x: 1000, y: 1000, width: 40, height: 40 }, T0);
    const connector = createCanvasConnector(connectorInput({ style: 'elbow' }));
    const route = resolveConnectorRouteFromDocument(connector, clear);
    expect(route.points[1].x).toBe(200);
  });
});

describe('arrow configuration and labels', () => {
  it('defaults to a flowchart end arrow and supports both ends', () => {
    const connector = createCanvasConnector(connectorInput());
    expect(connector.startArrow).toBe('none');
    expect(connector.endArrow).toBe('arrow');
    const both = createCanvasConnector(
      connectorInput({ id: 'conn-both', startArrow: 'arrow', endArrow: 'arrow' }),
    );
    expect(both.startArrow).toBe('arrow');
    expect(both.endArrow).toBe('arrow');
  });

  it('keeps labels bounded and free of control characters', () => {
    const maxLabel = 'x'.repeat(CANVAS_MAX_CONNECTOR_LABEL_LENGTH);
    expect(createCanvasConnector(connectorInput({ label: maxLabel })).label).toBe(maxLabel);
    expectCanvasError(
      () =>
        createCanvasConnector(
          connectorInput({ label: 'x'.repeat(CANVAS_MAX_CONNECTOR_LABEL_LENGTH + 1) }),
        ),
      'unsupported-value',
    );
    expectCanvasError(
      () => createCanvasConnector(connectorInput({ label: 'line\nbreak' })),
      'unsupported-value',
    );
  });
});

describe('keyboard selection identity', () => {
  it('exposes stable, selection-compatible connector identifiers', () => {
    const connector = createCanvasConnector(connectorInput({ id: 'conn-1' }));
    const id = connectorSelectionId(connector);
    expect(id).toBe('conn-1');

    let selection = createCanvasSelection();
    selection = selectCanvasBlock(selection, id);
    expect(selectionHas(selection, id)).toBe(true);
    expect(isConnectorSelected(connector, selection)).toBe(true);

    const recreated = createCanvasConnector(connectorInput({ id: 'conn-1', style: 'curved' }));
    expect(connectorSelectionId(recreated)).toBe(id);
    expect(isConnectorSelected(recreated, selection)).toBe(true);
  });

  it('lists selection ids for a collection', () => {
    const collection = createConnectorCollection([
      connectorInput({ id: 'conn-1' }),
      connectorInput({ id: 'conn-2' }),
    ]);
    const ids = connectorSelectionIds(collection);
    expect(ids).toEqual(['conn-1', 'conn-2']);
    expect(Object.isFrozen(ids)).toBe(true);
  });
});
