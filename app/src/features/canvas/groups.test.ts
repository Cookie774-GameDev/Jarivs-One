import { describe, expect, it } from 'vitest';
import {
  CanvasValidationError,
  type CanvasBlockId,
  type CanvasSpatialPlacement,
} from './contracts';
import {
  addGroupMember,
  computeGroupBounds,
  createGroupFromSelection,
  moveGroup,
  propagateGroupStyle,
  removeGroupMember,
  resolveGroupMembers,
  ungroup,
  type CanvasGroup,
} from './groups';

const NOW = 1_700_000_000_000;

function placement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): CanvasSpatialPlacement {
  return {
    blockId: id as CanvasBlockId,
    x,
    y,
    width,
    height,
    rotation: 0,
    z: 0,
    locked: false,
    hidden: false,
  };
}

function groupById(groups: readonly CanvasGroup[]): ReadonlyMap<string, CanvasGroup> {
  return new Map(groups.map((group) => [group.id, group]));
}

describe('canvas groups', () => {
  describe('createGroupFromSelection', () => {
    it('creates a frozen group preserving deterministic selection order', () => {
      const group = createGroupFromSelection({ id: 'g1', selection: ['b2', 'b1'], now: NOW });

      expect(group.id).toBe('g1');
      expect(group.children).toEqual(['b2', 'b1']);
      expect(group.createdAt).toBe(NOW);
      expect(group.updatedAt).toBe(NOW);
      expect(Object.isFrozen(group)).toBe(true);
      expect(Object.isFrozen(group.children)).toBe(true);
    });

    it('rejects duplicate membership while preserving first-occurrence order', () => {
      const group = createGroupFromSelection({ id: 'g1', selection: ['b1', 'b2', 'b1'], now: NOW });
      expect(group.children).toEqual(['b1', 'b2']);
    });

    it('rejects empty selections, invalid ids, and self-membership', () => {
      expect(() => createGroupFromSelection({ id: 'g1', selection: [], now: NOW })).toThrow(
        CanvasValidationError,
      );
      expect(() =>
        createGroupFromSelection({ id: 'g1', selection: ['bad id!'], now: NOW }),
      ).toThrow(CanvasValidationError);
      expect(() =>
        createGroupFromSelection({ id: 'bad id!', selection: ['b1'], now: NOW }),
      ).toThrow(CanvasValidationError);
      expect(() => createGroupFromSelection({ id: 'g1', selection: ['g1'], now: NOW })).toThrow(
        /self/i,
      );
    });
  });

  describe('ungroup', () => {
    it('returns the members in deterministic order', () => {
      const group = createGroupFromSelection({ id: 'g1', selection: ['b2', 'b1'], now: NOW });
      const members = ungroup(group);
      expect(members).toEqual(['b2', 'b1']);
      expect(Object.isFrozen(members)).toBe(true);
    });
  });

  describe('nested groups and membership rules', () => {
    const inner = createGroupFromSelection({ id: 'inner', selection: ['b1', 'b3'], now: NOW });
    const outer = createGroupFromSelection({ id: 'outer', selection: ['inner', 'b2'], now: NOW });
    const registry = groupById([inner, outer]);

    it('appends a member immutably and bumps updatedAt', () => {
      const updated = addGroupMember(inner, 'b4', registry, NOW + 1);
      expect(updated.children).toEqual(['b1', 'b3', 'b4']);
      expect(updated.updatedAt).toBe(NOW + 1);
      expect(inner.children).toEqual(['b1', 'b3']);
    });

    it('rejects duplicate membership, self-membership, and cyclic nesting', () => {
      expect(() => addGroupMember(inner, 'b1', registry, NOW + 1)).toThrow(/duplicate/i);
      expect(() => addGroupMember(inner, 'inner', registry, NOW + 1)).toThrow(/self/i);
      // outer already contains inner; adding outer into inner would create a cycle.
      expect(() => addGroupMember(inner, 'outer', registry, NOW + 1)).toThrow(/cycle/i);
    });

    it('removes a member and rejects removing a missing member', () => {
      const updated = removeGroupMember(inner, 'b3', NOW + 1);
      expect(updated.children).toEqual(['b1']);
      expect(() => removeGroupMember(inner, 'ghost', NOW + 1)).toThrow(CanvasValidationError);
    });
  });

  describe('resolveGroupMembers', () => {
    it('flattens nested groups deterministically and dedupes shared leaves', () => {
      const inner = createGroupFromSelection({ id: 'inner', selection: ['b1', 'b3'], now: NOW });
      const outer = createGroupFromSelection({
        id: 'outer',
        selection: ['inner', 'b2', 'b1'],
        now: NOW,
      });
      const members = resolveGroupMembers(outer, groupById([inner, outer]));
      expect(members).toEqual(['b1', 'b3', 'b2']);
    });
  });

  describe('moveGroup', () => {
    it('moves every nested member as one and leaves unrelated placements untouched', () => {
      const inner = createGroupFromSelection({ id: 'inner', selection: ['b1', 'b3'], now: NOW });
      const outer = createGroupFromSelection({ id: 'outer', selection: ['inner', 'b2'], now: NOW });
      const registry = groupById([inner, outer]);
      const placements = [
        placement('b1', 0, 0, 10, 10),
        placement('b2', 20, 20, 10, 10),
        placement('b3', 40, 40, 10, 10),
        placement('other', 100, 100, 10, 10),
      ];

      const moved = moveGroup(outer, registry, placements, { x: 5, y: -5 });
      const byId = new Map(moved.map((entry) => [entry.blockId, entry]));

      expect(byId.get('b1' as CanvasBlockId)).toMatchObject({ x: 5, y: -5 });
      expect(byId.get('b2' as CanvasBlockId)).toMatchObject({ x: 25, y: 15 });
      expect(byId.get('b3' as CanvasBlockId)).toMatchObject({ x: 45, y: 35 });
      expect(byId.get('other' as CanvasBlockId)).toMatchObject({ x: 100, y: 100 });
    });

    it('rejects non-finite movement deltas', () => {
      const group = createGroupFromSelection({ id: 'g1', selection: ['b1'], now: NOW });
      expect(() =>
        moveGroup(group, groupById([group]), [placement('b1', 0, 0, 10, 10)], {
          x: Number.NaN,
          y: 0,
        }),
      ).toThrow(/finite/i);
    });
  });

  describe('computeGroupBounds', () => {
    it('computes the bounding box across nested members', () => {
      const inner = createGroupFromSelection({ id: 'inner', selection: ['b1'], now: NOW });
      const outer = createGroupFromSelection({ id: 'outer', selection: ['inner', 'b2'], now: NOW });
      const registry = groupById([inner, outer]);
      const placements = [placement('b1', 0, 0, 100, 100), placement('b2', 150, 50, 50, 50)];

      expect(computeGroupBounds(outer, registry, placements)).toEqual({
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      });
    });

    it('rejects groups with no placed members', () => {
      const group = createGroupFromSelection({ id: 'g1', selection: ['b1'], now: NOW });
      expect(() =>
        computeGroupBounds(group, groupById([group]), [placement('other', 0, 0, 5, 5)]),
      ).toThrow(CanvasValidationError);
    });
  });

  describe('propagateGroupStyle', () => {
    const inner = createGroupFromSelection({ id: 'inner', selection: ['b1', 'b3'], now: NOW });
    const outer = createGroupFromSelection({ id: 'outer', selection: ['inner', 'b2'], now: NOW });
    const registry = groupById([inner, outer]);

    it('applies style only to compatible members and safely skips the rest', () => {
      const result = propagateGroupStyle(outer, registry, { fill: '#ff0000' }, ['b1', 'b2']);
      expect(result.updated).toEqual(['b1', 'b2']);
      expect(result.skipped).toEqual(['b3']);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('validates the style payload', () => {
      expect(() => propagateGroupStyle(outer, registry, {}, ['b1'])).toThrow(CanvasValidationError);
      expect(() => propagateGroupStyle(outer, registry, { fill: 'red' }, ['b1'])).toThrow(
        CanvasValidationError,
      );
      expect(() => propagateGroupStyle(outer, registry, { opacity: 2 }, ['b1'])).toThrow(
        CanvasValidationError,
      );
      expect(
        propagateGroupStyle(outer, registry, { stroke: '#00ff00', opacity: 0.5 }, ['b3']),
      ).toEqual({ updated: ['b3'], skipped: ['b1', 'b2'] });
    });
  });
});
