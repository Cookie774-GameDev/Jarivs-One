/**
 * Adapted from OpenWhip 1.1.0's overlay physics at commit
 * 83b976d7695934362b558b6340cb576c3b5656bb (MIT).
 * See OPENWHIP_NOTICE.md. VibeSpace keeps the original tuning while replacing
 * global keyboard automation with exact in-app terminal references.
 */

export const OPENWHIP_PHYSICS = {
  segments: 28,
  segmentLength: 25,
  taper: 0.6,
  gravity: 1.2,
  damping: 0.96,
  constraintIterations: 20,
  maxStretchRatio: 1.2,
  baseTargetAngle: -1.12,
  handleAimByMouseX: 0.4,
  handleAimByMouseY: 0.2,
  handleAimClamp: 2,
  handleSpring: 0.7,
  handleAngularDamping: 0.078,
  basePoseSegments: 2,
  basePoseStiffStart: 0.9,
  basePoseStiffEnd: 0.8,
  handleMaxBendDegrees: 16,
  tipMaxBendDegrees: 130,
  bendRigidityStart: 0.8,
  bendRigidityEnd: 0.12,
  wallBounce: 0.42,
  wallFriction: 0.86,
  crackSpeed: 340,
  crackCooldownMs: 200,
  firstCrackGraceMs: 350,
  arcWidth: 260,
  arcHeight: 185,
} as const;

export interface WhipPoint {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
}

export interface WhipPointer {
  x: number;
  y: number;
}

export interface OpenWhipState {
  points: WhipPoint[];
  handleAngle: number;
  handleAngularVelocity: number;
  previousPointer: WhipPointer;
  spawnedAt: number;
  lastCrackAt: number;
}

export interface WhipBounds {
  width: number;
  height: number;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

function wrapPi(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function openWhipSegmentLength(index: number): number {
  const progress = index / (OPENWHIP_PHYSICS.segments - 1);
  return OPENWHIP_PHYSICS.segmentLength * (1 - progress * (1 - OPENWHIP_PHYSICS.taper));
}

export function createOpenWhipState(pointer: WhipPointer, now: number): OpenWhipState {
  const points = Array.from({ length: OPENWHIP_PHYSICS.segments }, (_, index) => {
    const progress = index / (OPENWHIP_PHYSICS.segments - 1);
    const x = pointer.x + progress * OPENWHIP_PHYSICS.arcWidth;
    const y = pointer.y - Math.sin(progress * Math.PI * 0.75) * OPENWHIP_PHYSICS.arcHeight;
    return { x, y, previousX: x, previousY: y };
  });
  return {
    points,
    handleAngle: OPENWHIP_PHYSICS.baseTargetAngle,
    handleAngularVelocity: 0,
    previousPointer: { ...pointer },
    spawnedAt: now,
    lastCrackAt: 0,
  };
}

function applyBasePose(state: OpenWhipState): void {
  const directionX = Math.cos(state.handleAngle);
  const directionY = Math.sin(state.handleAngle);
  const guided = Math.min(OPENWHIP_PHYSICS.basePoseSegments, state.points.length - 1);
  for (let index = 1; index <= guided; index += 1) {
    const progress = (index - 1) / Math.max(guided - 1, 1);
    const stiffness = lerp(
      OPENWHIP_PHYSICS.basePoseStiffStart,
      OPENWHIP_PHYSICS.basePoseStiffEnd,
      progress,
    );
    const previous = state.points[index - 1]!;
    const point = state.points[index]!;
    const targetLength = openWhipSegmentLength(index - 1);
    point.x = lerp(point.x, previous.x + directionX * targetLength, stiffness);
    point.y = lerp(point.y, previous.y + directionY * targetLength, stiffness);
  }
}

function applyBendLimits(points: WhipPoint[]): void {
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = points[index - 1]!;
    const point = points[index]!;
    const after = points[index + 1]!;
    const firstX = before.x - point.x;
    const firstY = before.y - point.y;
    const secondX = after.x - point.x;
    const secondY = after.y - point.y;
    const firstLength = Math.hypot(firstX, firstY) || 0.0001;
    const secondLength = Math.hypot(secondX, secondY) || 0.0001;
    const firstNormalX = firstX / firstLength;
    const firstNormalY = firstY / firstLength;
    const secondNormalX = secondX / secondLength;
    const secondNormalY = secondY / secondLength;
    const dot = clamp(firstNormalX * secondNormalX + firstNormalY * secondNormalY, -1, 1);
    const angle = Math.acos(dot);
    const progress = index / (points.length - 2);
    const maxBend =
      (lerp(OPENWHIP_PHYSICS.handleMaxBendDegrees, OPENWHIP_PHYSICS.tipMaxBendDegrees, progress) *
        Math.PI) /
      180;
    if (Math.PI - angle <= maxBend) continue;

    const cross = firstNormalX * secondNormalY - firstNormalY * secondNormalX;
    const targetAngle =
      Math.atan2(firstNormalY, firstNormalX) + (cross >= 0 ? 1 : -1) * (Math.PI - maxBend);
    const rigidity = lerp(
      OPENWHIP_PHYSICS.bendRigidityStart,
      OPENWHIP_PHYSICS.bendRigidityEnd,
      progress,
    );
    after.x = lerp(after.x, point.x + Math.cos(targetAngle) * secondLength, rigidity);
    after.y = lerp(after.y, point.y + Math.sin(targetAngle) * secondLength, rigidity);
  }
}

function capSegmentStretch(points: WhipPoint[]): void {
  for (let index = 0; index < points.length - 1; index += 1) {
    const point = points[index]!;
    const next = points[index + 1]!;
    const deltaX = next.x - point.x;
    const deltaY = next.y - point.y;
    const distance = Math.hypot(deltaX, deltaY) || 0.0001;
    const maxLength = openWhipSegmentLength(index) * OPENWHIP_PHYSICS.maxStretchRatio;
    if (distance <= maxLength) continue;
    const ratio = maxLength / distance;
    next.x = point.x + deltaX * ratio;
    next.y = point.y + deltaY * ratio;
  }
}

function applyWallCollisions(points: WhipPoint[], bounds: WhipBounds): void {
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    let velocityX = point.x - point.previousX;
    let velocityY = point.y - point.previousY;
    let hit = false;
    if (point.x < 0 || point.x > bounds.width) {
      point.x = clamp(point.x, 0, bounds.width);
      velocityX = -velocityX * OPENWHIP_PHYSICS.wallBounce;
      velocityY *= OPENWHIP_PHYSICS.wallFriction;
      hit = true;
    }
    if (point.y < 0 || point.y > bounds.height) {
      point.y = clamp(point.y, 0, bounds.height);
      velocityY = -velocityY * OPENWHIP_PHYSICS.wallBounce;
      velocityX *= OPENWHIP_PHYSICS.wallFriction;
      hit = true;
    }
    if (hit) {
      point.previousX = point.x - velocityX;
      point.previousY = point.y - velocityY;
    }
  }
}

export function shouldTriggerWhipCrack(
  tipSpeed: number,
  now: number,
  spawnedAt: number,
  lastCrackAt: number,
): boolean {
  return (
    Number.isFinite(tipSpeed) &&
    tipSpeed > OPENWHIP_PHYSICS.crackSpeed &&
    now - spawnedAt >= OPENWHIP_PHYSICS.firstCrackGraceMs &&
    now - lastCrackAt > OPENWHIP_PHYSICS.crackCooldownMs
  );
}

/** Advances the original OpenWhip Verlet chain in place and reports a crack. */
export function advanceOpenWhip(
  state: OpenWhipState,
  pointer: WhipPointer,
  bounds: WhipBounds,
  now: number,
): boolean {
  const aimDelta = clamp(
    (pointer.x - state.previousPointer.x) * OPENWHIP_PHYSICS.handleAimByMouseX +
      (pointer.y - state.previousPointer.y) * OPENWHIP_PHYSICS.handleAimByMouseY,
    -OPENWHIP_PHYSICS.handleAimClamp,
    OPENWHIP_PHYSICS.handleAimClamp,
  );
  const targetAngle = OPENWHIP_PHYSICS.baseTargetAngle + aimDelta;
  state.handleAngularVelocity +=
    wrapPi(targetAngle - state.handleAngle) * OPENWHIP_PHYSICS.handleSpring;
  state.handleAngularVelocity *= OPENWHIP_PHYSICS.handleAngularDamping;
  state.handleAngle = wrapPi(state.handleAngle + state.handleAngularVelocity);

  for (let index = 1; index < state.points.length; index += 1) {
    const point = state.points[index]!;
    const velocityX = (point.x - point.previousX) * OPENWHIP_PHYSICS.damping;
    const velocityY = (point.y - point.previousY) * OPENWHIP_PHYSICS.damping;
    point.previousX = point.x;
    point.previousY = point.y;
    point.x += velocityX;
    point.y += velocityY + OPENWHIP_PHYSICS.gravity;
  }

  const handle = state.points[0]!;
  handle.x = pointer.x;
  handle.y = pointer.y;
  handle.previousX = pointer.x;
  handle.previousY = pointer.y;

  capSegmentStretch(state.points);
  applyWallCollisions(state.points, bounds);
  applyBasePose(state);

  for (let iteration = 0; iteration < OPENWHIP_PHYSICS.constraintIterations; iteration += 1) {
    for (let index = 0; index < state.points.length - 1; index += 1) {
      const point = state.points[index]!;
      const next = state.points[index + 1]!;
      const deltaX = next.x - point.x;
      const deltaY = next.y - point.y;
      const distance = Math.hypot(deltaX, deltaY) || 0.0001;
      const difference = ((distance - openWhipSegmentLength(index)) / distance) * 0.5;
      const offsetX = deltaX * difference;
      const offsetY = deltaY * difference;
      if (index === 0) {
        next.x -= offsetX * 2;
        next.y -= offsetY * 2;
      } else {
        point.x += offsetX;
        point.y += offsetY;
        next.x -= offsetX;
        next.y -= offsetY;
      }
    }
    applyBendLimits(state.points);
    applyBasePose(state);
    capSegmentStretch(state.points);
    applyWallCollisions(state.points, bounds);
  }

  const tip = state.points[state.points.length - 1]!;
  const tipSpeed = Math.hypot(tip.x - tip.previousX, tip.y - tip.previousY);
  const cracked = shouldTriggerWhipCrack(tipSpeed, now, state.spawnedAt, state.lastCrackAt);
  if (cracked) state.lastCrackAt = now;
  state.previousPointer = { ...pointer };
  return cracked;
}

function splinePoint(points: readonly WhipPoint[], index: number): WhipPointer {
  if (index < 0) {
    const first = points[0]!;
    const second = points[1] ?? first;
    return { x: 2 * first.x - second.x, y: 2 * first.y - second.y };
  }
  if (index >= points.length) {
    const last = points[points.length - 1]!;
    const before = points[points.length - 2] ?? last;
    return { x: 2 * last.x - before.x, y: 2 * last.y - before.y };
  }
  return points[index]!;
}

export function openWhipBezier(points: readonly WhipPoint[], index: number) {
  const before = splinePoint(points, index - 1);
  const start = points[index]!;
  const end = points[index + 1]!;
  const after = splinePoint(points, index + 2);
  return {
    firstControlX: start.x + (end.x - before.x) / 6,
    firstControlY: start.y + (end.y - before.y) / 6,
    secondControlX: end.x - (after.x - start.x) / 6,
    secondControlY: end.y - (after.y - start.y) / 6,
    endX: end.x,
    endY: end.y,
  };
}
