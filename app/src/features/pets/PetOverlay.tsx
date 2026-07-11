/**
 * Floating Pet interaction surface — PixiJS atlas playback + velocity drag.
 * Used inside the pet-overlay Tauri window (transparent, always-on-top).
 * Does not decode MP4. Click opens/focuses mini-panel (including wake-from-sleep).
 */
import * as React from 'react';
import { PixiAtlasPlayer } from './pixiAtlasPlayer';
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
import { openOrFocusPetPanel, setPetOverlayPosition } from './petTauriBridge';
import { cn } from '@/lib/utils';

const DISPLAY = 128;

export interface PetOverlayProps {
  enabled?: boolean;
  reducedMotion?: boolean;
  className?: string;
  /** Controlled panel open state from host (browser fallback). */
  panelOpen?: boolean;
  onOpenPanel?: () => void;
  onPanelClose?: () => void;
  onAnimChange?: (anim: string) => void;
  /** When true, position is driven by the Tauri window (no CSS fixed offset). */
  tauriWindowMode?: boolean;
}

export function PetOverlay({
  enabled = true,
  reducedMotion = false,
  className,
  panelOpen = false,
  onOpenPanel,
  onPanelClose: _onPanelClose,
  onAnimChange,
  tauriWindowMode = false,
}: PetOverlayProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const playerRef = React.useRef(new PixiAtlasPlayer());
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
    windowOriginX: number;
    windowOriginY: number;
  } | null>(null);
  const animCache = React.useRef(new Map<PetAnimId, { jsonUrl: string; imageUrl: string }>());
  const currentAnim = React.useRef<PetAnimId | null>(null);
  const schedulerRef = React.useRef<ReturnType<typeof createPetScheduler> | null>(null);
  const initOnce = React.useRef(false);
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

      const player = playerRef.current;
      const host = hostRef.current;
      if (!host) return;

      if (!initOnce.current) {
        await player.init(host, {
          displaySize: DISPLAY,
          resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
          backgroundAlpha: 0,
        });
        initOnce.current = true;
      }

      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const scaleSel = PixiAtlasPlayer.selectAtlasScale(def, dpr);
      // resolveAtlasUrls uses @1x by default; map 2x path when selected
      let urls = animCache.current.get(resolved);
      if (!urls) {
        const base = resolveAtlasUrls(def);
        if (scaleSel.scale === '2x' && def.atlas2x) {
          const jsonFile = def.atlas2x.replace(/^atlases\//, '');
          const imageFile = jsonFile.replace(/\.json$/, '.png');
          const root = '../../assets/pets/characters/vibespace-axolotl-pixel/atlases/';
          urls = {
            jsonUrl: new URL(`${root}${jsonFile}`, import.meta.url).href,
            imageUrl: new URL(`${root}${imageFile}`, import.meta.url).href,
          };
        } else {
          urls = base;
        }
        animCache.current.set(resolved, urls);
      }

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
        console.warn('[pets] pixi atlas load failed', resolved, err);
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
      initOnce.current = false;
      // Fresh player after dispose so remount works.
      playerRef.current = new PixiAtlasPlayer();
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

  // Scheduler tick (Pixi ticker advances frames; we only poll sleep/idleFun here).
  React.useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      const s = stateRef.current;
      const fire = schedulerRef.current?.tick(canScheduleIdleFun(s), canEnterSleep(s));
      if (fire === 'idle_fun') setState(reducePetEvent(s, { type: 'idle_fun_tick' }));
      else if (fire === 'sleep') setState(reducePetEvent(s, { type: 'sleep_timeout' }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, setState]);

  const openPanelNow = React.useCallback(() => {
    setState(reducePetEvent(stateRef.current, { type: 'click' }));
    onOpenPanel?.();
    schedulerRef.current?.onActivity();
    // Tauri: single-instance open/focus of pet-mini-panel
    const left = tauriWindowMode ? 0 : pos.left;
    const top = tauriWindowMode ? 0 : pos.top;
    void openOrFocusPetPanel(left, top);
  }, [onOpenPanel, pos.left, pos.top, setState, tauriWindowMode]);

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
      windowOriginX: e.screenX - e.clientX + pos.left,
      windowOriginY: e.screenY - e.clientY + pos.top,
    };
    setState(reducePetEvent(stateRef.current, { type: 'drag_start', walk: 'idlePrimary' }));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.active) return;
    const t = performance.now();
    const { state: vel, walkAnim } = sampleDragVelocity(d.vel, e.clientX, t);
    d.vel = vel;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (tauriWindowMode) {
      void setPetOverlayPosition(d.windowOriginX + dx, d.windowOriginY + dy);
    } else {
      setPos({
        left: d.originLeft + dx,
        top: d.originTop + dy,
      });
    }
    setState(reducePetEvent(stateRef.current, { type: 'drag_move', walk: walkAnim }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6;
    dragRef.current = null;
    setState(reducePetEvent(stateRef.current, { type: 'drag_end' }));
    if (!moved) {
      // Single click: open panel immediately (wakes if sleeping). No second click.
      openPanelNow();
    }
  };

  if (!enabled) return null;

  return (
    <div
      className={cn(
        tauriWindowMode
          ? 'relative select-none touch-none w-full h-full'
          : 'fixed z-[70] select-none touch-none',
        'cursor-grab active:cursor-grabbing',
        className,
      )}
      style={
        tauriWindowMode
          ? {
              width: DISPLAY,
              height: DISPLAY,
              background: 'transparent',
              margin: 'auto',
            }
          : {
              left: pos.left,
              top: pos.top,
              width: DISPLAY,
              height: DISPLAY,
              background: 'transparent',
            }
      }
      data-pet-overlay="true"
      data-pet-anim={animLabel}
      data-pet-panel-open={panelOpen ? 'true' : 'false'}
      data-pet-renderer="pixi"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="img"
      aria-label={`VibeSpace Pet — ${animLabel}`}
    >
      <div
        ref={hostRef}
        className="block w-full h-full"
        style={{ width: DISPLAY, height: DISPLAY, background: 'transparent' }}
      />
    </div>
  );
}
