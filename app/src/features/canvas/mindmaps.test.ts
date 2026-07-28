import { describe, expect, it } from 'vitest';
import { CanvasValidationError } from './contracts';
import {
  addMindMapChild,
  addMindMapSibling,
  applyMindMapAiPreview,
  branchToOutline,
  createMindMap,
  createMindMapAiRequest,
  layoutMindMap,
  navigateMindMap,
  previewMindMapAiChange,
  reorderMindMapBranch,
  setMindMapBranchCollapsed,
  setMindMapConnectorStyle,
  setMindMapDirection,
  setMindMapNodeStyle,
  undoMindMapAiPreview,
  type MindMap,
  validateMindMap,
} from './mindmaps';

const NOW = 1_700_000_000_000;

function baseMap(): MindMap {
  return createMindMap({
    id: 'map-1',
    rootId: 'root',
    label: 'VibeSpace',
    now: NOW,
  });
}

function populatedMap(): MindMap {
  let map = baseMap();
  map = addMindMapChild(map, {
    parentId: 'root',
    nodeId: 'product',
    label: 'Product',
    now: NOW + 1,
  });
  map = addMindMapChild(map, {
    parentId: 'root',
    nodeId: 'engineering',
    label: 'Engineering',
    now: NOW + 2,
  });
  map = addMindMapChild(map, {
    parentId: 'product',
    nodeId: 'research',
    label: 'Research',
    now: NOW + 3,
  });
  return map;
}

describe('canvas mind maps', () => {
  describe('manual editing', () => {
    it('creates an immutable root with safe defaults', () => {
      const map = baseMap();

      expect(map).toMatchObject({
        schemaVersion: 1,
        id: 'map-1',
        rootId: 'root',
        direction: 'right',
        connectorStyle: 'curved',
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(map.nodes).toEqual([
        {
          id: 'root',
          parentId: null,
          childIds: [],
          label: 'VibeSpace',
          collapsed: false,
          style: {
            shape: 'rounded',
            fill: '#232328',
            textColor: '#f5f5f7',
            borderColor: '#4f4f58',
          },
        },
      ]);
      expect(Object.isFrozen(map)).toBe(true);
      expect(Object.isFrozen(map.nodes[0].style)).toBe(true);
    });

    it('adds children and siblings in deterministic order without mutating the source', () => {
      const original = baseMap();
      const withChild = addMindMapChild(original, {
        parentId: 'root',
        nodeId: 'first',
        label: 'First',
        now: NOW + 1,
      });
      const withSibling = addMindMapSibling(withChild, {
        siblingId: 'first',
        nodeId: 'second',
        label: 'Second',
        now: NOW + 2,
      });

      expect(original.nodes).toHaveLength(1);
      expect(withSibling.nodes.find((node) => node.id === 'root')?.childIds).toEqual([
        'first',
        'second',
      ]);
      expect(withSibling.nodes.find((node) => node.id === 'second')?.parentId).toBe('root');
      expect(withSibling.updatedAt).toBe(NOW + 2);
    });

    it('rejects a sibling for the root and duplicate or unknown references', () => {
      const map = populatedMap();

      expect(() =>
        addMindMapSibling(map, {
          siblingId: 'root',
          nodeId: 'other',
          label: 'Other',
          now: NOW + 4,
        }),
      ).toThrow(CanvasValidationError);
      expect(() =>
        addMindMapChild(map, {
          parentId: 'missing',
          nodeId: 'other',
          label: 'Other',
          now: NOW + 4,
        }),
      ).toThrow(CanvasValidationError);
      expect(() =>
        addMindMapChild(map, {
          parentId: 'root',
          nodeId: 'product',
          label: 'Duplicate',
          now: NOW + 4,
        }),
      ).toThrow(CanvasValidationError);
    });

    it('collapses and expands a complete branch', () => {
      const map = populatedMap();
      const collapsed = setMindMapBranchCollapsed(map, 'product', true, NOW + 4);
      const expanded = setMindMapBranchCollapsed(collapsed, 'product', false, NOW + 5);

      expect(collapsed.nodes.find((node) => node.id === 'product')?.collapsed).toBe(true);
      expect(expanded.nodes.find((node) => node.id === 'product')?.collapsed).toBe(false);
      expect(map.nodes.find((node) => node.id === 'product')?.collapsed).toBe(false);
    });

    it('reorders siblings by insertion index and rejects cross-parent reorder', () => {
      const map = populatedMap();
      const reordered = reorderMindMapBranch(map, {
        parentId: 'root',
        nodeId: 'engineering',
        index: 0,
        now: NOW + 4,
      });

      expect(reordered.nodes.find((node) => node.id === 'root')?.childIds).toEqual([
        'engineering',
        'product',
      ]);
      expect(() =>
        reorderMindMapBranch(map, {
          parentId: 'root',
          nodeId: 'research',
          index: 0,
          now: NOW + 4,
        }),
      ).toThrow(CanvasValidationError);
    });

    it('supports keyboard tree navigation while respecting collapsed branches', () => {
      const map = populatedMap();

      expect(navigateMindMap(map, 'root', 'ArrowRight')).toBe('product');
      expect(navigateMindMap(map, 'product', 'ArrowDown')).toBe('engineering');
      expect(navigateMindMap(map, 'engineering', 'ArrowUp')).toBe('product');
      expect(navigateMindMap(map, 'research', 'ArrowLeft')).toBe('product');

      const collapsed = setMindMapBranchCollapsed(map, 'product', true, NOW + 4);
      expect(navigateMindMap(collapsed, 'product', 'ArrowRight')).toBe('product');
    });

    it('changes direction, node style, and connector style immutably', () => {
      let map = populatedMap();
      map = setMindMapDirection(map, 'down', NOW + 4);
      map = setMindMapConnectorStyle(map, 'elbow', NOW + 5);
      map = setMindMapNodeStyle(
        map,
        'product',
        {
          shape: 'pill',
          fill: '#123456',
          textColor: '#ffffff',
          borderColor: '#abcdef',
        },
        NOW + 6,
      );

      expect(map.direction).toBe('down');
      expect(map.connectorStyle).toBe('elbow');
      expect(map.nodes.find((node) => node.id === 'product')?.style).toEqual({
        shape: 'pill',
        fill: '#123456',
        textColor: '#ffffff',
        borderColor: '#abcdef',
      });
    });

    it('rejects unsafe labels, styles, directions, timestamps, and unknown nodes', () => {
      const map = baseMap();

      expect(() =>
        addMindMapChild(map, {
          parentId: 'root',
          nodeId: 'bad',
          label: 'bad\u0000label',
          now: NOW + 1,
        }),
      ).toThrow(CanvasValidationError);
      expect(() => setMindMapDirection(map, 'diagonal' as never, NOW + 1)).toThrow(
        CanvasValidationError,
      );
      expect(() => setMindMapConnectorStyle(map, 'animated' as never, NOW + 1)).toThrow(
        CanvasValidationError,
      );
      expect(() => setMindMapNodeStyle(map, 'missing', { fill: '#ffffff' }, NOW + 1)).toThrow(
        CanvasValidationError,
      );
      expect(() => setMindMapBranchCollapsed(map, 'root', true, Number.NaN)).toThrow(
        CanvasValidationError,
      );
    });

    it('rejects oversized maps before traversing attacker-controlled node graphs', () => {
      const map = baseMap();
      let error: unknown;
      try {
        validateMindMap({
          ...map,
          nodes: Array.from({ length: 10_001 }, () => map.nodes[0]),
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toMatchObject({
        code: 'invalid-number',
        path: 'mindMap.nodes',
      });
    });

    it('rejects pathologically deep maps before layout recursion can exhaust the stack', () => {
      const style = baseMap().nodes[0].style;
      const nodes = Array.from({ length: 514 }, (_, index) => ({
        id: `n${index}`,
        parentId: index === 0 ? null : `n${index - 1}`,
        childIds: index === 513 ? [] : [`n${index + 1}`],
        label: `Node ${index}`,
        collapsed: false,
        style,
      }));
      let error: unknown;
      try {
        validateMindMap({
          schemaVersion: 1,
          id: 'deep-map',
          rootId: 'n0',
          direction: 'right',
          connectorStyle: 'curved',
          nodes,
          createdAt: NOW,
          updatedAt: NOW,
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toMatchObject({
        code: 'invalid-number',
        path: 'mindMap.nodes',
      });
    });
  });

  describe('automatic layout', () => {
    it('lays out every visible node deterministically in rightward mode', () => {
      const map = populatedMap();
      const first = layoutMindMap(map);
      const second = layoutMindMap(map);

      expect(first).toEqual(second);
      expect(first).toEqual([
        { nodeId: 'root', x: 0, y: 72, width: 180, height: 56, depth: 0 },
        { nodeId: 'product', x: 260, y: 0, width: 180, height: 56, depth: 1 },
        { nodeId: 'research', x: 520, y: 0, width: 180, height: 56, depth: 2 },
        { nodeId: 'engineering', x: 260, y: 144, width: 180, height: 56, depth: 1 },
      ]);
      expect(Object.isFrozen(first)).toBe(true);
    });

    it('excludes descendants of collapsed branches and rotates axes for down mode', () => {
      const collapsed = setMindMapBranchCollapsed(populatedMap(), 'product', true, NOW + 4);
      const down = setMindMapDirection(collapsed, 'down', NOW + 5);
      const placements = layoutMindMap(down);

      expect(placements.map((placement) => placement.nodeId)).toEqual([
        'root',
        'product',
        'engineering',
      ]);
      expect(placements).toEqual([
        { nodeId: 'root', x: 72, y: 0, width: 180, height: 56, depth: 0 },
        { nodeId: 'product', x: 0, y: 136, width: 180, height: 56, depth: 1 },
        { nodeId: 'engineering', x: 144, y: 136, width: 180, height: 56, depth: 1 },
      ]);
    });

    it('supports left and balanced two-sided direction options', () => {
      const map = populatedMap();
      const left = layoutMindMap(setMindMapDirection(map, 'left', NOW + 4));
      const both = layoutMindMap(setMindMapDirection(map, 'both', NOW + 4));

      expect(left.find((item) => item.nodeId === 'product')?.x).toBe(-260);
      expect(both.find((item) => item.nodeId === 'product')?.x).toBe(260);
      expect(both.find((item) => item.nodeId === 'engineering')?.x).toBe(-260);
    });
  });

  describe('AI requests, previews, and undo', () => {
    const kinds = [
      'convert-text',
      'generate-from-prompt',
      'expand-node',
      'summarize-branch',
      'identify-missing-branches',
    ] as const;

    it.each(kinds)('creates a bounded model-router request for %s', (kind) => {
      const map = populatedMap();
      const request = createMindMapAiRequest(map, {
        id: `request-${kind}`,
        kind,
        input: 'Create a concise, useful result.',
        targetNodeId: kind === 'generate-from-prompt' ? null : 'product',
        modelId: 'ollama:free-model',
        now: NOW + 4,
      });

      expect(request).toMatchObject({
        id: `request-${kind}`,
        kind,
        mapId: 'map-1',
        input: 'Create a concise, useful result.',
        modelId: 'ollama:free-model',
        previewRequired: true,
        createdAt: NOW + 4,
      });
      expect(Object.isFrozen(request)).toBe(true);
    });

    it('previews a proposed AI map without applying it, then applies and undoes exactly', () => {
      const before = populatedMap();
      const request = createMindMapAiRequest(before, {
        id: 'request-expand',
        kind: 'expand-node',
        input: 'Add customer discovery topics',
        targetNodeId: 'product',
        modelId: 'ollama:free-model',
        now: NOW + 4,
      });
      const proposed = addMindMapChild(before, {
        parentId: 'product',
        nodeId: 'interviews',
        label: 'Customer interviews',
        now: NOW + 5,
      });
      const preview = previewMindMapAiChange(before, request, proposed, NOW + 6);

      expect(before.nodes.some((node) => node.id === 'interviews')).toBe(false);
      expect(preview.before).toEqual(before);
      expect(preview.after).toEqual(proposed);
      expect(preview.addedNodeIds).toEqual(['interviews']);
      expect(preview.removedNodeIds).toEqual([]);
      expect(applyMindMapAiPreview(preview)).toEqual(proposed);
      expect(undoMindMapAiPreview(preview)).toEqual(before);
      expect(Object.isFrozen(preview)).toBe(true);
    });

    it('rejects previews that change map identity or do not match their request', () => {
      const before = populatedMap();
      const request = createMindMapAiRequest(before, {
        id: 'request-expand',
        kind: 'expand-node',
        input: 'Expand',
        targetNodeId: 'product',
        modelId: 'ollama:free-model',
        now: NOW + 4,
      });
      const other = createMindMap({
        id: 'map-2',
        rootId: 'other-root',
        label: 'Other',
        now: NOW,
      });

      expect(() => previewMindMapAiChange(before, request, other, NOW + 5)).toThrow(
        CanvasValidationError,
      );
      expect(() =>
        previewMindMapAiChange(before, { ...request, mapId: 'map-2' as never }, before, NOW + 5),
      ).toThrow(CanvasValidationError);
      expect(() =>
        previewMindMapAiChange(
          before,
          { ...request, input: 'unsafe\u0001request' },
          before,
          NOW + 5,
        ),
      ).toThrow(CanvasValidationError);
      expect(() => previewMindMapAiChange(before, null as never, before, NOW + 5)).toThrow(
        CanvasValidationError,
      );
    });

    it('rejects missing targets, unsupported models, control characters, and oversized input', () => {
      const map = populatedMap();

      expect(() =>
        createMindMapAiRequest(map, {
          id: 'bad-target',
          kind: 'expand-node',
          input: 'Expand',
          targetNodeId: null,
          modelId: 'ollama:free-model',
          now: NOW + 4,
        }),
      ).toThrow(CanvasValidationError);
      expect(() =>
        createMindMapAiRequest(map, {
          id: 'bad-model',
          kind: 'generate-from-prompt',
          input: 'Generate',
          targetNodeId: null,
          modelId: 'bad model!',
          now: NOW + 4,
        }),
      ).toThrow(CanvasValidationError);
      expect(() =>
        createMindMapAiRequest(map, {
          id: 'bad-input',
          kind: 'generate-from-prompt',
          input: 'bad\u0001input',
          targetNodeId: null,
          modelId: 'ollama:free-model',
          now: NOW + 4,
        }),
      ).toThrow(CanvasValidationError);
      expect(() =>
        createMindMapAiRequest(map, {
          id: 'too-large',
          kind: 'generate-from-prompt',
          input: 'x'.repeat(100_001),
          targetNodeId: null,
          modelId: 'ollama:free-model',
          now: NOW + 4,
        }),
      ).toThrow(CanvasValidationError);
    });
  });

  describe('outline conversion', () => {
    it('converts a branch back into deterministic indented outline text', () => {
      expect(branchToOutline(populatedMap(), 'product')).toBe('- Product\n  - Research');
    });

    it('includes collapsed descendants because outline conversion targets stored content', () => {
      const map = setMindMapBranchCollapsed(populatedMap(), 'product', true, NOW + 4);
      expect(branchToOutline(map, 'product')).toBe('- Product\n  - Research');
    });
  });
});
