/**
 * Floating desktop Pet overlay — canvas atlas playback + drag/sleep/welcome.
 * Renders inside the main shell (transparent host). Does not use MP4 files.
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
import { getAnimDef, getPetAnimationsManifest, resolveAtlasUrls } from './petManifest';
import { cn } from '@/lib/utils';

const DISPLAY = 128;

export interface PetOverlayProps {
  /** Master visibility (settings). */
  enabled?: boolean;
  /** Reduced motion: snap to idlePrimary still. */
  reducedMotion?: boolean;
  className?: string;
  onOpenPanel?: () => void;
}

export function PetOverlay({
  enabled = true,
  reducedMotion = false,
  className,
  onOpenPanel,
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
    lastX: number;
  } | null>(null);
  const animCache = React.useRef(new Map<PetAnimId, { jsonUrl: string; imageUrl: string }>());
  const currentAnim = React.useRef<PetAnimId | null>(null);
  const schedulerRef = React.useRef<ReturnType<typeof createPetScheduler> | null>(null);
  const man = React.useMemo(() => getPetAnimationsManifest(), []);

  const setState = React.useCallback((next: PetMachineState) => {
    const prev = stateRef.current.anim;
    stateRef.current = next;
    if (next.anim !== prev) setAnimLabel(next.anim);
  }, []);

  const playAnim = React.useCallback(async (id: PetAnimId) => {
    if (currentAnim.current === id) return;
    const def = getAnimDef(id);
    if (!def) return;
    let urls = animCache.current.get(id);
    if (!urls) {
      urls = resolveAtlasUrls(def);
      animCache.current.set(id, urls);
    }
    const player = playerRef.current;
    try {
      await player.load(urls.jsonUrl, urls.imageUrl);
      currentAnim.current = id;
      player.setAnimation(
        {
          frames: def.frames,
          fps: reducedMotion ? 1 : def.fps,
          loop: def.loop,
          oneShot: def.oneShot,
        },
        () => {
          const s = stateRef.current;
          if (id === 'welcome') setState(reducePetEvent(s, { type: 'welcome_done' }));
          else if (id === 'idleFun') setState(reducePetEvent(s, { type: 'idle_fun_done' }));
          else if (id === 'sleepTransition')
            setState(reducePetEvent(s, { type: 'sleep_transition_done' }));
          else if (id === 'wakeFromSleep') setState(reducePetEvent(s, { type: 'wake_done' }));
        },
      );
    } catch (err) {
      console.warn('[pets] atlas load failed', id, err);
    }
  }, [reducedMotion, setState]);

  // Boot + sync anim
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
      sched.dispose();
      schedulerRef.current = null;
      playerRef.current.dispose();
      currentAnim.current = null;
    };
  }, [enabled, man.scheduler.idleFunIntervalMs, man.scheduler.sleepTimeoutMs, playAnim, setState]);

  // When machine anim changes, load playback
  React.useEffect(() => {
    if (!enabled) return;
    const id = animLabel;
    if (reducedMotion && id !== 'idlePrimary' && id !== 'welcome') {
      void playAnim('idlePrimary');
      return;
    }
    void playAnim(id);
    const s = stateRef.current;
    if (s.anim === 'idlePrimary' && s.welcomePlayed) {
      schedulerRef.current?.onActivity();
    } else if (s.anim !== 'idleFun') {
      schedulerRef.current?.onHighPriority();
    }
  }, [enabled, reducedMotion, playAnim, animLabel]);

  // rAF loop
  React.useEffect(() => {
    if (!enabled) return;
    let raf = 0;
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
      // schedulers
      const s = stateRef.current;
      const fire = schedulerRef.current?.tick(canScheduleIdleFun(s), canEnterSleep(s));
      if (fire === 'idle_fun') {
        setState(reducePetEvent(s, { type: 'idle_fun_tick' }));
      } else if (fire === 'sleep') {
        setState(reducePetEvent(s, { type: 'sleep_timeout' }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, setState]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: pos.left,
      originTop: pos.top,
      lastX: e.clientX,
    };
    setState(
      reducePetEvent(stateRef.current, {
        type: 'drag_start',
        dx: 0,
        dy: 0,
      }),
    );
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.active) return;
    const dx = e.clientX - d.lastX;
    d.lastX = e.clientX;
    setPos({
      left: d.originLeft + (e.clientX - d.startX),
      top: d.originTop + (e.clientY - d.startY),
    });
    setState(
      reducePetEvent(stateRef.current, {
        type: 'drag_move',
        dx,
        dy: e.clientY - d.startY,
      }),
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const moved =
      Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4;
    dragRef.current = null;
    setState(reducePetEvent(stateRef.current, { type: 'drag_end' }));
    if (!moved) {
      // Click: wake + open panel immediately
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
