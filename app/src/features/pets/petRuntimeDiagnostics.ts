/**
 * Safe pet runtime diagnostics for the registry→manifest→atlas→ticker chain.
 * No console spam — pure snapshot builder; callers may expose on window in DEV only.
 */
import type { PetCharacterId, PetCharacterInput } from './petCharacters';
import { PET_CHARACTERS, resolvePetCharacterId } from './petCharacters';
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
  animationPaused: boolean;
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
    animationPaused: playerDiag?.animationPaused ?? true,
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
  };
}

/** Install DEV-only global snapshot (no logging). */
export function installPetRuntimeDiagGlobal(getSnap: () => PetRuntimeDiagnostics | null): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const isDev =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  if (!isDev) return () => undefined;
  const w = window as unknown as { __VIBESPACE_PET_DIAG__?: () => PetRuntimeDiagnostics | null };
  w.__VIBESPACE_PET_DIAG__ = getSnap;
  return () => {
    delete w.__VIBESPACE_PET_DIAG__;
  };
}
