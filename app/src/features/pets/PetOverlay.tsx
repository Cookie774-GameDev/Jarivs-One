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
  dragWalkFpsFromVelocity,
  sampleDragVelocity,
  sampleStationaryDragVelocity,
  type DragVelocityState,
} from './petDragVelocity';
import { disposeAll, mapReducedMotionAnim, reducedMotionFps } from './petLifecycle';
import { clampPetPosition, getAnimDef, getPetAnimationsManifest, resolveAtlasUrls } from './petManifest';
import { openOrFocusPetPanel, setPetOverlayPosition } from './petTauriBridge';
import {
  PET_FORCE_ANIM_EVENT,
  type PetForceAnimDetail,
  usePetSettingsStore,
} from './petSettingsStore';
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
  /** Hide the pet (right-click → Close). */
  onRequestClose?: () => void;
  onAnimChange?: (anim: string) => void;
  /** When true, position is driven by the Tauri window (no CSS fixed offset). */
  tauriWindowMode?: boolean;
  sleepTimeoutMs?: number;
  idleFunIntervalMs?: number;
}

export function PetOverlay({
  enabled = true,
  reducedMotion = false,
  className,
  panelOpen = false,
  onOpenPanel,
  onPanelClose: _onPanelClose,
  onRequestClose,
  onAnimChange,
  tauriWindowMode = false,
  sleepTimeoutMs,
  idleFunIntervalMs,
}: PetOverlayProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const playerRef = React.useRef(new PixiAtlasPlayer());
  const stateRef = React.useRef<PetMachineState>(createInitialPetState());
  const characterId = usePetSettingsStore((s) => s.characterId);
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
  const animCache = React.useRef(new Map<string, { jsonUrl: string; imageUrl: string }>());
  const currentAnim = React.useRef<string | null>(null);
  const schedulerRef = React.useRef<ReturnType<typeof createPetScheduler> | null>(null);
  const initOnce = React.useRef(false);
  const man = React.useMemo(() => getPetAnimationsManifest(characterId), [characterId]);

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
      const animKey = `${characterId}:${resolved}`;
      if (currentAnim.current === animKey && !reducedMotion) return;
      const def = getAnimDef(resolved, characterId);
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
      let urls = animCache.current.get(animKey);
      if (!urls) {
        urls = resolveAtlasUrls(def, characterId, scaleSel.atlasPath);
        animCache.current.set(animKey, urls);
      }

      try {
        await player.load(urls.jsonUrl, urls.imageUrl);
        currentAnim.current = animKey;
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
    [characterId, reducedMotion, setState],
  );

  React.useEffect(() => {
    if (!enabled) return;
    const s0 = reducePetEvent(createInitialPetState(), { type: 'boot' });
    setState(s0);
    const sched = createPetScheduler({
      idleFunIntervalMs: idleFunIntervalMs ?? man.scheduler.idleFunIntervalMs,
      sleepTimeoutMs: sleepTimeoutMs ?? man.scheduler.sleepTimeoutMs,
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
  }, [
    enabled,
    idleFunIntervalMs,
    sleepTimeoutMs,
    man.scheduler.idleFunIntervalMs,
    man.scheduler.sleepTimeoutMs,
    playAnim,
    setState,
  ]);

  // Diagnostics: force animation from Settings → Pets
  React.useEffect(() => {
    if (!enabled) return;
    const onForce = (e: Event) => {
      const detail = (e as CustomEvent<PetForceAnimDetail>).detail;
      if (!detail?.anim) return;
      const anim = detail.anim as PetAnimId;
      if (anim === 'sleepTransition') {
        setState(reducePetEvent(stateRef.current, { type: 'sleep_timeout' }));
      } else if (anim === 'wakeFromSleep') {
        setState(reducePetEvent(stateRef.current, { type: 'click' }));
      } else if (anim === 'idleFun') {
        setState(reducePetEvent({ ...stateRef.current, anim: 'idlePrimary' }, { type: 'idle_fun_tick' }));
      } else if (anim === 'walkLeft' || anim === 'walkRight') {
        setState({
          ...stateRef.current,
          dragging: true,
          anim,
          lastWalk: anim,
          sleeping: false,
        });
      } else if (anim === 'welcome') {
        setState({ ...createInitialPetState(), welcomePlayed: false, anim: 'welcome' });
      } else {
        setState({ ...stateRef.current, anim, sleeping: anim === 'sleepingLoop' });
      }
    };
    window.addEventListener(PET_FORCE_ANIM_EVENT, onForce);
    return () => window.removeEventListener(PET_FORCE_ANIM_EVENT, onForce);
  }, [enabled, setState]);

  React.useEffect(() => {
    if (!enabled) return;
    // Force atlas reload when skin changes; clear Pixi cache so Glitch frames
    // cannot stick after selecting Axo (and vice versa).
    currentAnim.current = null;
    animCache.current.clear();
    void playerRef.current.unloadCharacterCache().then(() => playAnim(animLabel));
    const s = stateRef.current;
    if (s.anim === 'idlePrimary' && s.welcomePlayed) {
      schedulerRef.current?.onActivity();
    } else if (s.anim !== 'idleFun') {
      schedulerRef.current?.onHighPriority();
    }
  }, [enabled, playAnim, animLabel, characterId]);

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

  const [ctxMenu, setCtxMenu] = React.useState<{ x: number; y: number } | null>(null);

  const openPanelNow = React.useCallback(() => {
    setState(reducePetEvent(stateRef.current, { type: 'click' }));
    schedulerRef.current?.onActivity();
    if (onOpenPanel) {
      // Host owns panel + sprite hide/show (prevents disappear-with-no-panel).
      onOpenPanel();
      return;
    }
    // Overlay-only window path (no host): open Tauri mini panel directly.
    const left = tauriWindowMode ? 0 : pos.left;
    const top = tauriWindowMode ? 0 : pos.top;
    void openOrFocusPetPanel(left, top).catch(() => undefined);
  }, [onOpenPanel, pos.left, pos.top, setState, tauriWindowMode]);

  const applyWalkFromVelocity = React.useCallback(
    (walkAnim: 'walkLeft' | 'walkRight' | 'idlePrimary', vx: number) => {
      setState(reducePetEvent(stateRef.current, { type: 'drag_move', walk: walkAnim }));
      // Cursor speed → walk playback rate (still / slow / fast).
      const def = getAnimDef(walkAnim === 'idlePrimary' ? 'idlePrimary' : walkAnim, characterId);
      const baseFps = def?.fps ?? 12;
      const fps = reducedMotion
        ? reducedMotionFps(walkAnim === 'idlePrimary' ? 'idlePrimary' : walkAnim, baseFps)
        : dragWalkFpsFromVelocity(vx, baseFps);
      playerRef.current.setPlaybackFps(fps);
    },
    [characterId, reducedMotion, setState],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return; // right-click → context menu only
    setCtxMenu(null);
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

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = null;
    setCtxMenu({ x: e.clientX, y: e.clientY });
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
      const rawX = d.windowOriginX + dx;
      const rawY = d.windowOriginY + dy;
      const sw = typeof window !== 'undefined' ? window.screen.availWidth || window.innerWidth : 1920;
      const sh = typeof window !== 'undefined' ? window.screen.availHeight || window.innerHeight : 1080;
      const clamped = clampPetPosition(rawX, rawY, DISPLAY, sw, sh, 0);
      void setPetOverlayPosition(clamped.x, clamped.y);
    } else {
      const sw = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const sh = typeof window !== 'undefined' ? window.innerHeight : 1080;
      const clamped = clampPetPosition(d.originLeft + dx, d.originTop + dy, DISPLAY, sw, sh, 0);
      setPos({ left: clamped.x, top: clamped.y });
    }
    applyWalkFromVelocity(walkAnim, vel.vx);
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

  // While the button is held still, pointermove stops firing — sample stationary
  // velocity only after a short gap so live moves are not zeroed every frame.
  React.useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = (now: number) => {
      const d = dragRef.current;
      if (d?.active && now - d.vel.lastT >= 40) {
        const { state: vel, walkAnim } = sampleStationaryDragVelocity(d.vel, now);
        d.vel = vel;
        applyWalkFromVelocity(walkAnim, vel.vx);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, applyWalkFromVelocity]);

  if (!enabled) return null;

  return (
    <>
      <div
        className={cn(
          tauriWindowMode
            ? 'relative select-none touch-none w-full h-full'
            : 'fixed z-[80] select-none touch-none pointer-events-auto',
          'cursor-grab active:cursor-grabbing',
          className,
        )}
        style={
          tauriWindowMode
            ? {
                width: DISPLAY,
                height: DISPLAY,
                background: 'transparent',
                backgroundColor: 'transparent',
                margin: 'auto',
              }
            : {
                left: pos.left,
                top: pos.top,
                width: DISPLAY,
                height: DISPLAY,
                background: 'transparent',
                backgroundColor: 'transparent',
                // No card/plate behind the sprite
                boxShadow: 'none',
                border: 'none',
                outline: 'none',
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
        onContextMenu={onContextMenu}
        role="img"
        aria-label={`VibeSpace Pet — ${animLabel}. Drag to move, click to open panel, right-click to close.`}
      >
        <div
          ref={hostRef}
          className="pet-canvas-container block w-full h-full"
          style={{
            width: DISPLAY,
            height: DISPLAY,
            background: 'transparent',
            backgroundColor: 'transparent',
            backgroundImage: 'none',
            border: 'none',
            boxShadow: 'none',
          }}
        />
      </div>
      {ctxMenu && (
        <div
          className="fixed z-[90] min-w-[120px] rounded-lg border border-border bg-panel shadow-lg p-1"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          data-pet-context-menu="true"
          role="menu"
        >
          <button
            type="button"
            className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
            role="menuitem"
            onClick={() => {
              setCtxMenu(null);
              onRequestClose?.();
            }}
          >
            Close
          </button>
          <button
            type="button"
            className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
            role="menuitem"
            onClick={() => {
              setCtxMenu(null);
              openPanelNow();
            }}
          >
            Open panel
          </button>
        </div>
      )}
      {ctxMenu && (
        <button
          type="button"
          className="fixed inset-0 z-[85] cursor-default bg-transparent"
          aria-label="Dismiss pet menu"
          onClick={() => setCtxMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtxMenu(null);
          }}
        />
      )}
    </>
  );
}
