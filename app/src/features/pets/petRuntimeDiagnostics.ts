/**
 * Safe pet runtime diagnostics for the registry→manifest→atlas→ticker chain.
 * No console spam — pure snapshot builder; callers may expose on window in DEV only.
 */
import type { PetCharacterId } from './petCharacters';
import { PET_CHARACTERS } from './petCharacters';
import type { PetAnimId } from './petStateMachine';
import type { PixiAtlasPlayer } from './pixiAtlasPlayer';

export interface PetRuntimeDiagnostics {
  selectedPetId: PetCharacterId;
  resolvedCharacterId: string;
  assetFolder: string;
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
  backgroundAlpha: number;
  scaleMode: 'nearest' | 'linear' | null;
}

export function buildPetRuntimeDiagnostics(input: {
  characterId: PetCharacterId;
  anim: PetAnimId | string;
  reducedMotion: boolean;
  panelOpen: boolean;
  player: Pick<
    PixiAtlasPlayer,
    | 'getDiagnostics'
    | 'loadedImageUrl'
    | 'currentFrameIndex'
    | 'frameCount'
    | 'currentFrameName'
  > | null;
}): PetRuntimeDiagnostics {
  const def = PET_CHARACTERS[input.characterId] ?? PET_CHARACTERS.axo;
  const playerDiag = input.player?.getDiagnostics?.() ?? null;
  return {
    selectedPetId: input.characterId,
    resolvedCharacterId: def.manifestCharacterId,
    assetFolder: def.assetFolder,
    loadedManifestPath: `assets/pets/characters/${def.assetFolder}/animations.json`,
    loadedAtlasUrl: input.player?.loadedImageUrl ?? playerDiag?.textureCacheKey ?? null,
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
    backgroundAlpha: playerDiag?.backgroundAlpha ?? 0,
    scaleMode: playerDiag?.scaleMode ?? null,
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
