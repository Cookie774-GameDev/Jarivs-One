/**
 * Floating desktop Pet overlay — canvas atlas playback + velocity drag + sleep/welcome.
 * Does not use MP4 files. Click opens mini-panel via onOpenPanel (including wake-from-sleep).
 */
import * as React from 'react';
import { AtlasPlayer } from './atlasPlayer';
import {
  canEnterSleep,
  canScheduleIdleFun,
  createInitialPetState,
  reducePetEvent,
  type PetAnimId,
  type PetMachineState,
} from './petStateMachine';
import { createPetScheduler } from './petScheduler';
import {
  createDragVelocityState,
  sampleDragVelocity,
  type DragVelocityState,
} from './petDragVelocity';
import { disposeAll, mapReducedMotionAnim, reducedMotionFps } from './petLifecycle';
import { getAnimDef, getPetAnimationsManifest, resolveAtlasUrls } from './petManifest';
import { cn } from '@/lib/utils';

const DISPLAY = 128;

export interface PetOverlayProps {
  enabled?: boolean;
  reducedMotion?: boolean;
  className?: string;
  /** Controlled panel open state from host. */
  panelOpen?: boolean;
  onOpenPanel?: () => void;
  onPanelClose?: () => void;
  onAnimChange?: (anim: string) => void;
}

export function PetOverlay({
  enabled = true,
  reducedMotion = false,
  className,
  panelOpen = false,
  onOpenPanel,
  onPanelClose,
  onAnimChange,
}: PetOverlayProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const playerRef = React.useRef(new AtlasPlayer());
  const stateRef = React.useRef<PetMachineState>(createInitialPetState());
  const [animLabel, setAnimLabel] = React.useState<PetAnimId>('welcome');
  const [pos, setPos] = React.useState({ left: 24, top: 120 });
  const dragRef = React.useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    vel: DragVelocityState;
  } | null>(null);
  const animCache = React.useRef(new Map<PetAnimId, { jsonUrl: string; imageUrl: string }>());
  const currentAnim = React.useRef<PetAnimId | null>(null);
  const schedulerRef = React.useRef<ReturnType<typeof createPetScheduler> | null>(null);
  const rafRef = React.useRef(0);
  const man = React.useMemo(() => getPetAnimationsManifest(), []);

  const setState = React.useCallback(
    (next: PetMachineState) => {
      const prev = stateRef.current.anim;
      stateRef.current = next;
      if (next.anim !== prev) {
        setAnimLabel(next.anim);
        onAnimChange?.(next.anim);
      }
      if (next.panelOpen && !panelOpen) onOpenPanel?.();
    },
    [onAnimChange, onOpenPanel, panelOpen],
  );

  // Sync external panel close into machine
  React.useEffect(() => {
    if (!panelOpen && stateRef.current.panelOpen) {
      setState(reducePetEvent(stateRef.current, { type: 'panel_close' }));
    }
  }, [panelOpen, setState]);

  const playAnim = React.useCallback(
    async (id: PetAnimId) => {
      const resolved = reducedMotion ? mapReducedMotionAnim(id) : id;
      if (currentAnim.current === resolved && !reducedMotion) return;
      const def = getAnimDef(resolved);
      if (!def) return;
      let urls = animCache.current.get(resolved);
      if (!urls) {
        urls = resolveAtlasUrls(def);
        animCache.current.set(resolved, urls);
      }
      const player = playerRef.current;
      try {
        await player.load(urls.jsonUrl, urls.imageUrl);
        currentAnim.current = resolved;
        const fps = reducedMotion ? reducedMotionFps(resolved, def.fps) : def.fps;
        player.setAnimation(
          {
            frames: def.frames,
            fps,
            loop: def.loop,
            oneShot: def.oneShot,
          },
          () => {
            const s = stateRef.current;
            if (resolved === 'welcome' || id === 'welcome')
              setState(reducePetEvent(s, { type: 'welcome_done' }));
            else if (resolved === 'idleFun' || id === 'idleFun')
              setState(reducePetEvent(s, { type: 'idle_fun_done' }));
            else if (resolved === 'sleepTransition' || id === 'sleepTransition')
              setState(reducePetEvent(s, { type: 'sleep_transition_done' }));
            else if (resolved === 'wakeFromSleep' || id === 'wakeFromSleep')
              setState(reducePetEvent(s, { type: 'wake_done' }));
          },
        );
      } catch (err) {
        console.warn('[pets] atlas load failed', resolved, err);
      }
    },
    [reducedMotion, setState],
  );

  React.useEffect(() => {
    if (!enabled) return;
    const s0 = reducePetEvent(createInitialPetState(), { type: 'boot' });
    setState(s0);
    const sched = createPetScheduler({
      idleFunIntervalMs: man.scheduler.idleFunIntervalMs,
      sleepTimeoutMs: man.scheduler.sleepTimeoutMs,
    });
    schedulerRef.current = sched;
    void playAnim(s0.anim);
    return () => {
      disposeAll([sched, playerRef.current]);
      schedulerRef.current = null;
      currentAnim.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, man.scheduler.idleFunIntervalMs, man.scheduler.sleepTimeoutMs, playAnim, setState]);

  React.useEffect(() => {
    if (!enabled) return;
    void playAnim(animLabel);
    const s = stateRef.current;
    if (s.anim === 'idlePrimary' && s.welcomePlayed) {
      schedulerRef.current?.onActivity();
    } else if (s.anim !== 'idleFun') {
      schedulerRef.current?.onHighPriority();
    }
  }, [enabled, playAnim, animLabel]);

  React.useEffect(() => {
    if (!enabled) return;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      const player = playerRef.current;
      player.update(dt);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          player.draw(ctx, 0, 0, DISPLAY, DISPLAY);
        }
      }
      const s = stateRef.current;
      const fire = schedulerRef.current?.tick(canScheduleIdleFun(s), canEnterSleep(s));
      if (fire === 'idle_fun') setState(reducePetEvent(s, { type: 'idle_fun_tick' }));
      else if (fire === 'sleep') setState(reducePetEvent(s, { type: 'sleep_timeout' }));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [enabled, setState]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const t = performance.now();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: pos.left,
      originTop: pos.top,
      vel: createDragVelocityState(e.clientX, t),
    };
    setState(reducePetEvent(stateRef.current, { type: 'drag_start', walk: 'idlePrimary' }));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.active) return;
    const t = performance.now();
    const { state: vel, walkAnim } = sampleDragVelocity(d.vel, e.clientX, t);
    d.vel = vel;
    setPos({
      left: d.originLeft + (e.clientX - d.startX),
      top: d.originTop + (e.clientY - d.startY),
    });
    setState(reducePetEvent(stateRef.current, { type: 'drag_move', walk: walkAnim }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6;
    dragRef.current = null;
    setState(reducePetEvent(stateRef.current, { type: 'drag_end' }));
    if (!moved) {
      // Single click: open panel immediately (wakes if sleeping).
      setState(reducePetEvent(stateRef.current, { type: 'click' }));
      onOpenPanel?.();
      schedulerRef.current?.onActivity();
    }
  };

  if (!enabled) return null;

  return (
    <div
      className={cn(
        'fixed z-[70] select-none touch-none',
        'cursor-grab active:cursor-grabbing',
        className,
      )}
      style={{
        left: pos.left,
        top: pos.top,
        width: DISPLAY,
        height: DISPLAY,
        background: 'transparent',
      }}
      data-pet-overlay="true"
      data-pet-anim={animLabel}
      data-pet-panel-open={panelOpen ? 'true' : 'false'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="img"
      aria-label={`VibeSpace Pet — ${animLabel}`}
    >
      <canvas
        ref={canvasRef}
        width={DISPLAY}
        height={DISPLAY}
        className="block w-full h-full"
        style={{ imageRendering: 'pixelated', background: 'transparent' }}
      />
    </div>
  );
}
