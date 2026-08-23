import * as React from 'react';
import {
  OPENWHIP_PHYSICS,
  advanceOpenWhip,
  createOpenWhipState,
  openWhipBezier,
  type OpenWhipState,
  type WhipPointer,
} from './whipPhysics';

const HANDLE_EXTRA_WIDTH = 5;
const HANDLE_THICK_SEGMENTS = 2;
const HANDLE_WIDTH = 7;
const TIP_WIDTH = 5;
const OUTLINE_WIDTH = 3;
const FRAME_MS = 1000 / 60;
const MAX_FRAME_STEPS = 2;

export function boundedWhipFrameSteps(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1;
  return Math.max(1, Math.min(MAX_FRAME_STEPS, Math.round(elapsedMs / FRAME_MS)));
}

function drawOpenWhip(
  context: CanvasRenderingContext2D,
  state: OpenWhipState,
  width: number,
  height: number,
): void {
  context.clearRect(0, 0, width, height);
  const points = state.points;
  if (points.length < 2) return;

  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#fff';
  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 0; index < points.length - 1; index += 1) {
    const curve = openWhipBezier(points, index);
    context.bezierCurveTo(
      curve.firstControlX,
      curve.firstControlY,
      curve.secondControlX,
      curve.secondControlY,
      curve.endX,
      curve.endY,
    );
  }
  context.lineWidth = TIP_WIDTH + OUTLINE_WIDTH * 2;
  context.stroke();

  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 0; index < HANDLE_THICK_SEGMENTS; index += 1) {
    const curve = openWhipBezier(points, index);
    context.bezierCurveTo(
      curve.firstControlX,
      curve.firstControlY,
      curve.secondControlX,
      curve.secondControlY,
      curve.endX,
      curve.endY,
    );
  }
  context.lineWidth = HANDLE_WIDTH + HANDLE_EXTRA_WIDTH + OUTLINE_WIDTH * 2;
  context.stroke();

  context.strokeStyle = '#111';
  for (let index = 0; index < points.length - 1; index += 1) {
    const progress = index / Math.max(1, points.length - 2);
    const curve = openWhipBezier(points, index);
    context.beginPath();
    context.moveTo(points[index]!.x, points[index]!.y);
    context.bezierCurveTo(
      curve.firstControlX,
      curve.firstControlY,
      curve.secondControlX,
      curve.secondControlY,
      curve.endX,
      curve.endY,
    );
    context.lineWidth =
      HANDLE_WIDTH +
      (TIP_WIDTH - HANDLE_WIDTH) * progress +
      (index < HANDLE_THICK_SEGMENTS ? HANDLE_EXTRA_WIDTH : 0);
    context.stroke();
  }
}

/** Direct React/canvas port of OpenWhip's MIT-licensed overlay renderer. */
export function WhipCanvas({ onCrack, onDismiss }: { onCrack: () => void; onDismiss: () => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stateRef = React.useRef<OpenWhipState | null>(null);
  const pointerRef = React.useRef<WhipPointer>({ x: 0, y: 0 });
  const onCrackRef = React.useRef(onCrack);
  onCrackRef.current = onCrack;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frame = 0;
    let width = 1;
    let height = 1;
    let previousFrameAt = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      if (!stateRef.current) {
        pointerRef.current = { x: width * 0.3, y: height * 0.68 };
        stateRef.current = createOpenWhipState(pointerRef.current, performance.now());
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const render = (now: number) => {
      const state = stateRef.current;
      if (state) {
        const steps = boundedWhipFrameSteps(now - previousFrameAt);
        for (let step = 0; step < steps; step += 1) {
          const stepNow = now - (steps - step - 1) * FRAME_MS;
          if (advanceOpenWhip(state, pointerRef.current, { width, height }, stepNow)) {
            onCrackRef.current();
          }
        }
        drawOpenWhip(context, state, width, height);
      }
      previousFrameAt = now;
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      stateRef.current = null;
    };
  }, []);

  const updatePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-transparent">
      <canvas
        ref={canvasRef}
        aria-label="OpenWhip Faster Agents whip area"
        className="h-full w-full touch-none cursor-none"
        onPointerEnter={updatePointer}
        onPointerMove={updatePointer}
        onPointerDown={(event) => {
          event.preventDefault();
          onDismiss();
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/70">
        Move quickly to crack the OpenWhip whip
      </div>
      <span className="sr-only">OpenWhip physics: {OPENWHIP_PHYSICS.segments} segments</span>
    </div>
  );
}
