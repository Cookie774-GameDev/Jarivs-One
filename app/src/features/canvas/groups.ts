/**
 * Infinite Idea Canvas - Groups domain slice.
 *
 * Framework-agnostic, deterministic, side-effect-free operations for canvas
 * groups: create from selection, ungroup, nested groups, move as one, bounds
 * calculation, and safe style propagation to compatible children. Membership
 * is validated against duplicate and cyclic nesting. Every operation reuses the
 * canonical contracts validation error and the canonical spatial placement
 * type, and movement reuses the geometry module's translation helper rather
 * than duplicating document content or geometry math. All results are deeply
 * frozen so the existing history/undo layer can treat them as immutable.
 */
import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TIMESTAMP,
  CanvasValidationError,
  type CanvasSpatialPlacement,
  type CanvasValidationErrorCode,
} from './contracts';
import { translateCanvasPlacements, type CanvasGeometryDelta } from './geometry';

// ---------------------------------------------------------------------------
// Constants and helpers
// ---------------------------------------------------------------------------

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function assertGroupId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    fail('invalid-id', path, 'expected a stable id matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/');
  }
  return value;
}

function assertTimestamp(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail('invalid-timestamp', path, 'expected an integer timestamp');
  }
  if (value < 0 || value > CANVAS_MAX_TIMESTAMP) {
    fail('invalid-timestamp', path, 'timestamp out of range');
  }
  return value;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasGroup {
  readonly id: string;
  readonly children: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateCanvasGroupInput {
  readonly id: string;
  readonly selection: readonly string[];
  readonly now: number;
}

export interface CanvasGroupBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasGroupStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly opacity?: number;
}

export interface CanvasGroupStyleResult {
  readonly updated: readonly string[];
  readonly skipped: readonly string[];
}

// ---------------------------------------------------------------------------
// Factory and structural operations
// ---------------------------------------------------------------------------

export function createGroupFromSelection(input: CreateCanvasGroupInput): CanvasGroup {
  const id = assertGroupId(input.id, 'group.id');
  const now = assertTimestamp(input.now, 'group.now');
  if (!Array.isArray(input.selection)) {
    fail('invalid-type', 'group.selection', 'expected an array of member ids');
  }
  if (input.selection.length === 0) {
    fail('invalid-reference', 'group.selection', 'group requires at least one member');
  }
  const seen = new Set<string>();
  const children: string[] = [];
  for (let index = 0; index < input.selection.length; index += 1) {
    const member = assertGroupId(input.selection[index], 'group.selection[' + index + ']');
    if (member === id) {
      fail('invalid-reference', 'group.selection[' + index + ']', 'a group cannot contain itself');
    }
    if (!seen.has(member)) {
      seen.add(member);
      children.push(member);
    }
  }
  return deepFreeze({ id, children, createdAt: now, updatedAt: now });
}

export function ungroup(group: CanvasGroup): readonly string[] {
  return Object.freeze([...group.children]);
}

function assertNoCycle(
  groupId: string,
  memberId: string,
  groupsById: ReadonlyMap<string, CanvasGroup>,
): void {
  const visited = new Set<string>();
  const stack: string[] = [memberId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const currentGroup = groupsById.get(current);
    if (!currentGroup) {
      continue;
    }
    for (const child of currentGroup.children) {
      if (child === groupId) {
        fail(
          'invalid-reference',
          'memberId',
          'membership cycle detected: group "' +
            groupId +
            '" cannot be nested inside "' +
            memberId +
            '"',
        );
      }
      if (groupsById.has(child)) {
        stack.push(child);
      }
    }
  }
}

export function addGroupMember(
  group: CanvasGroup,
  memberId: string,
  groupsById: ReadonlyMap<string, CanvasGroup>,
  now: number,
): CanvasGroup {
  const at = assertTimestamp(now, 'now');
  const member = assertGroupId(memberId, 'memberId');
  if (member === group.id) {
    fail('invalid-reference', 'memberId', 'a group cannot contain itself');
  }
  if (group.children.includes(member)) {
    fail('duplicate-id', 'memberId', 'duplicate member "' + member + '"');
  }
  if (groupsById.has(member)) {
    assertNoCycle(group.id, member, groupsById);
  }
  return deepFreeze({ ...group, children: [...group.children, member], updatedAt: at });
}

export function removeGroupMember(group: CanvasGroup, memberId: string, now: number): CanvasGroup {
  const at = assertTimestamp(now, 'now');
  const member = assertGroupId(memberId, 'memberId');
  if (!group.children.includes(member)) {
    fail('invalid-reference', 'memberId', 'group has no member "' + member + '"');
  }
  return deepFreeze({
    ...group,
    children: group.children.filter((existing) => existing !== member),
    updatedAt: at,
  });
}

// ---------------------------------------------------------------------------
// Derived geometry and styling
// ---------------------------------------------------------------------------

export function resolveGroupMembers(
  group: CanvasGroup,
  groupsById: ReadonlyMap<string, CanvasGroup>,
): readonly string[] {
  const members: string[] = [];
  const seenLeaves = new Set<string>();

  const expand = (current: CanvasGroup, ancestry: ReadonlySet<string>): void => {
    for (const child of current.children) {
      const nested = groupsById.get(child);
      if (nested) {
        if (ancestry.has(child)) {
          fail(
            'invalid-reference',
            'groups',
            'membership cycle detected involving group "' + child + '"',
          );
        }
        const nextAncestry = new Set(ancestry);
        nextAncestry.add(child);
        expand(nested, nextAncestry);
      } else if (!seenLeaves.has(child)) {
        seenLeaves.add(child);
        members.push(child);
      }
    }
  };

  expand(group, new Set([group.id]));
  return Object.freeze(members);
}

export function moveGroup(
  group: CanvasGroup,
  groupsById: ReadonlyMap<string, CanvasGroup>,
  placements: readonly CanvasSpatialPlacement[],
  delta: CanvasGeometryDelta,
): readonly CanvasSpatialPlacement[] {
  const members = resolveGroupMembers(group, groupsById);
  return translateCanvasPlacements(placements, members, delta);
}

export function computeGroupBounds(
  group: CanvasGroup,
  groupsById: ReadonlyMap<string, CanvasGroup>,
  placements: readonly CanvasSpatialPlacement[],
): CanvasGroupBounds {
  const members = resolveGroupMembers(group, groupsById);
  const memberSet = new Set(members);
  const placed = placements.filter((placement) => memberSet.has(placement.blockId));
  if (placed.length === 0) {
    fail('invalid-reference', 'placements', 'group "' + group.id + '" has no placed members');
  }
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const placement of placed) {
    if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) {
      fail('invalid-number', 'placements', 'placement coordinates must be finite');
    }
    if (!Number.isFinite(placement.width) || !Number.isFinite(placement.height)) {
      fail('invalid-number', 'placements', 'placement size must be finite');
    }
    left = Math.min(left, placement.x);
    top = Math.min(top, placement.y);
    right = Math.max(right, placement.x + placement.width);
    bottom = Math.max(bottom, placement.y + placement.height);
  }
  return deepFreeze({ x: left, y: top, width: right - left, height: bottom - top });
}

export function propagateGroupStyle(
  group: CanvasGroup,
  groupsById: ReadonlyMap<string, CanvasGroup>,
  style: CanvasGroupStyle,
  compatibleIds: readonly string[],
): CanvasGroupStyleResult {
  if (typeof style !== 'object' || style === null) {
    fail('invalid-type', 'style', 'expected a style object');
  }
  const hasFill = style.fill !== undefined;
  const hasStroke = style.stroke !== undefined;
  const hasOpacity = style.opacity !== undefined;
  if (!hasFill && !hasStroke && !hasOpacity) {
    fail('unsupported-value', 'style', 'style must define at least one of fill, stroke, opacity');
  }
  if (hasFill && (typeof style.fill !== 'string' || !COLOR_PATTERN.test(style.fill))) {
    fail('unsupported-value', 'style.fill', 'expected a #rrggbb hex color');
  }
  if (hasStroke && (typeof style.stroke !== 'string' || !COLOR_PATTERN.test(style.stroke))) {
    fail('unsupported-value', 'style.stroke', 'expected a #rrggbb hex color');
  }
  if (hasOpacity) {
    const opacity = style.opacity;
    if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      fail('invalid-number', 'style.opacity', 'opacity must be a finite number between 0 and 1');
    }
  }

  const compatible = new Set(compatibleIds);
  const members = resolveGroupMembers(group, groupsById);
  const updated: string[] = [];
  const skipped: string[] = [];
  for (const member of members) {
    if (compatible.has(member)) {
      updated.push(member);
    } else {
      skipped.push(member);
    }
  }
  return deepFreeze({ updated, skipped });
}
