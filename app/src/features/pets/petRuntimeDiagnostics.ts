/**
 * Safe pet runtime diagnostics for the registry→manifest→atlas→ticker chain.
 * No console spam — pure snapshot builder; callers may expose on window in DEV only.
 */
import type { PetCharacterId, PetCharacterInput } from './petCharacters';
import { PET_CHARACTERS, resolvePetCharacterId } from './petCharacters';
import { getPetRuntimeBuildInfo, type PetRuntimeBuildInfo } from './petRuntimeBuildInfo';
import type { PetAnimId } from './petStateMachine';
import type { PixiAtlasPlayer } from './pixiAtlasPlayer';

export interface PetRuntimeDiagnostics {
  selectedPetId: PetCharacterId;
  resolvedCharacterId: string;
  assetFolder: string;
  resolvedManifestUrl: string;
  resolvedAssetRoot: string;
  requestedState: PetAnimId | string;
  activeState: PetAnimId | string;
  atlasJsonUrl: string | null;
  atlasPngUrl: string | null;
  selectedScale: '1x' | '2x' | 'unknown';
  /** Logical path of the character animations manifest (not a network URL). */
  loadedManifestPath: string;
  loadedAtlasUrl: string | null;
  currentAnimationState: PetAnimId | string;
  currentFrameIndex: number;
  frameCount: number;
  currentFrameName: string | null;
  elapsedAnimationMs: number;
  tickerRunning: boolean;
  tickerStarted: boolean;
  tickerListenerCount: number | null;
  animationPaused: boolean;
  currentTextureSourceUid: string | null;
  currentTextureFrameRect: string | null;
  lastTextureChanged: boolean;
  textureAssignmentCount: number;
  setAnimationCallCount: number;
  ignoredDuplicateAnimationRequests: number;
  animationResetCount: number;
  reducedMotion: boolean;
  hiddenDueToPanel: boolean;
  activeTextureCacheKey: string | null;
  livePixiApplications: number;
  canvasCount: number;
  tickerFPS: number | null;
  currentTextureUid: string | number | null;
  backgroundAlpha: number;
  scaleMode: 'nearest' | 'linear' | null;
  documentVisibility: DocumentVisibilityState | 'unknown';
  windowLabel: string;
  buildInfo: PetRuntimeBuildInfo;
}

export function buildPetRuntimeDiagnostics(input: {
  characterId: PetCharacterInput;
  anim: PetAnimId | string;
  reducedMotion: boolean;
  panelOpen: boolean;
  player: Pick<
    PixiAtlasPlayer,
    | 'getDiagnostics'
    | 'loadedAtlasJsonUrl'
    | 'loadedImageUrl'
    | 'currentFrameIndex'
    | 'frameCount'
    | 'currentFrameName'
  > | null;
}): PetRuntimeDiagnostics {
  const selectedPetId = resolvePetCharacterId(input.characterId);
  const def = PET_CHARACTERS[selectedPetId] ?? PET_CHARACTERS.axo;
  const playerDiag = input.player?.getDiagnostics?.() ?? null;
  const atlasPngUrl = input.player?.loadedImageUrl ?? playerDiag?.textureCacheKey ?? null;
  const atlasJsonUrl =
    input.player?.loadedAtlasJsonUrl ??
    playerDiag?.loadedAtlasJsonUrl ??
    (atlasPngUrl ? atlasPngUrl.replace(/\.png($|\?)/, '.json$1') : null);
  const selectedScale = atlasPngUrl?.includes('@2x')
    ? '2x'
    : atlasPngUrl?.includes('@1x')
      ? '1x'
      : 'unknown';
  const manifestUrl = `assets/pets/characters/${def.assetFolder}/animations.json`;
  const assetRoot = `assets/pets/characters/${def.assetFolder}/`;
  const manifestAssetVersion = `${def.manifestCharacterId}@1`;

  return {
    selectedPetId,
    resolvedCharacterId: def.manifestCharacterId,
    assetFolder: def.assetFolder,
    resolvedManifestUrl: manifestUrl,
    resolvedAssetRoot: assetRoot,
    requestedState: input.anim,
    activeState: input.anim,
    atlasJsonUrl,
    atlasPngUrl,
    selectedScale,
    loadedManifestPath: manifestUrl,
    loadedAtlasUrl: atlasPngUrl,
    currentAnimationState: input.anim,
    currentFrameIndex: playerDiag?.currentFrameIndex ?? input.player?.currentFrameIndex ?? 0,
    frameCount: playerDiag?.frameCount ?? input.player?.frameCount ?? 0,
    currentFrameName: playerDiag?.currentFrameName ?? input.player?.currentFrameName ?? null,
    elapsedAnimationMs: playerDiag?.elapsedAnimationMs ?? 0,
    tickerRunning: playerDiag?.tickerRunning ?? false,
    tickerStarted: playerDiag?.tickerStarted ?? false,
    tickerListenerCount: playerDiag?.tickerListenerCount ?? null,
    animationPaused: playerDiag?.animationPaused ?? true,
    currentTextureSourceUid: playerDiag?.currentTextureSourceUid ?? null,
    currentTextureFrameRect: playerDiag?.currentTextureFrameRect ?? null,
    lastTextureChanged: playerDiag?.lastTextureChanged ?? false,
    textureAssignmentCount: playerDiag?.textureAssignmentCount ?? 0,
    setAnimationCallCount: playerDiag?.setAnimationCallCount ?? 0,
    ignoredDuplicateAnimationRequests: playerDiag?.ignoredDuplicateAnimationRequests ?? 0,
    animationResetCount: playerDiag?.animationResetCount ?? 0,
    reducedMotion: input.reducedMotion,
    hiddenDueToPanel: input.panelOpen,
    activeTextureCacheKey: playerDiag?.textureCacheKey ?? input.player?.loadedImageUrl ?? null,
    livePixiApplications: playerDiag?.liveApplicationCount ?? 0,
    canvasCount: playerDiag?.liveApplicationCount ?? 0,
    tickerFPS: playerDiag?.fps ?? null,
    currentTextureUid: playerDiag?.currentTextureUid ?? null,
    backgroundAlpha: playerDiag?.backgroundAlpha ?? 0,
    scaleMode: playerDiag?.scaleMode ?? null,
    documentVisibility:
      typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    windowLabel:
      typeof window !== 'undefined'
        ? ((window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
            .__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? 'browser')
        : 'unknown',
    buildInfo: getPetRuntimeBuildInfo(undefined, {
      selectedPetId,
      manifestAssetVersion,
    }),
  };
}

/** Install DEV-only global snapshot (no logging). */
export function installPetRuntimeDiagGlobal(getSnap: () => PetRuntimeDiagnostics | null): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const isDev =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  if (!isDev) return () => undefined;
  const w = window as unknown as {
    __VIBESPACE_PET_DIAG__?: () => PetRuntimeDiagnostics | null;
    __VIBESPACE_PET_TRACE__?: PetRuntimeDiagnostics[];
  };
  w.__VIBESPACE_PET_DIAG__ = getSnap;
  w.__VIBESPACE_PET_TRACE__ = [];
  const sample = () => {
    const snap = getSnap();
    if (!snap) return;
    const trace = w.__VIBESPACE_PET_TRACE__ ?? [];
    trace.push(snap);
    while (trace.length > 24) trace.shift();
    w.__VIBESPACE_PET_TRACE__ = trace;
  };
  sample();
  const interval = window.setInterval(sample, 250);
  return () => {
    window.clearInterval(interval);
    delete w.__VIBESPACE_PET_DIAG__;
    delete w.__VIBESPACE_PET_TRACE__;
  };
}
