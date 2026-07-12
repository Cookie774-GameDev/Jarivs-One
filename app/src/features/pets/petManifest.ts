/**
 * Load typed animation manifest for the selected pet character pack.
 */
import type { PetAnimId } from './petStateMachine';
import axoAnimations from '@/assets/pets/characters/vibespace-axolotl-pixel/animations.json';
import glitchAnimations from '@/assets/pets/characters/vibespace-axolotl-glitch/animations.json';
import {
  resolvePetCharacterId,
  type PetCharacterId,
  PET_CHARACTERS,
} from './petCharacters';
import { usePetSettingsStore } from './petSettingsStore';

export interface PetAnimStateDef {
  frames: string[];
  fps: number;
  frameDurationMs?: number;
  loop: boolean;
  interruptible: boolean;
  priority: number;
  fallbackState?: string;
  reducedMotionState?: string;
  atlas: string;
  atlas2x?: string;
  oneShot?: boolean;
}

export interface PetAnimationsManifest {
  schemaVersion: number;
  characterId: string;
  defaultState: string;
  states: Record<string, PetAnimStateDef>;
  scheduler: {
    idleFunIntervalMs: number;
    sleepTimeoutMs: number;
  };
  drag: {
    directionThresholdPx: number;
    stopThresholdPx: number;
  };
}

/**
 * AXO (default) → full-color glitch pack atlases.
 * GLITCH? → monochrome pixel pack atlases.
 * Folder names on disk are historical; character mapping is authoritative.
 */
const MANIFEST_BY_CHAR: Record<PetCharacterId, PetAnimationsManifest> = {
  axo: glitchAnimations as PetAnimationsManifest,
  glitch: axoAnimations as PetAnimationsManifest,
};

export function getSelectedCharacterId(): PetCharacterId {
  try {
    return resolvePetCharacterId(usePetSettingsStore.getState().characterId);
  } catch {
    return 'axo';
  }
}

export function getPetAnimationsManifest(
  characterId?: PetCharacterId,
): PetAnimationsManifest {
  const id = characterId ?? getSelectedCharacterId();
  return MANIFEST_BY_CHAR[id] ?? MANIFEST_BY_CHAR.axo;
}

export function getAnimDef(
  id: PetAnimId,
  characterId?: PetCharacterId,
): PetAnimStateDef | undefined {
  return getPetAnimationsManifest(characterId).states[id];
}

/** Resolve atlas URL for a character folder. */
export function resolveAtlasUrls(
  def: PetAnimStateDef,
  characterId?: PetCharacterId,
  atlasPath?: string,
): { jsonUrl: string; imageUrl: string } {
  const id = characterId ?? getSelectedCharacterId();
  const folder = PET_CHARACTERS[id]?.assetFolder ?? 'vibespace-axolotl-glitch';
  const jsonFile = (atlasPath ?? def.atlas).replace(/^atlases\//, '');
  const imageFile = jsonFile.replace(/\.json$/, '.png');
  const root = `../../assets/pets/characters/${folder}/atlases/`;
  return {
    jsonUrl: new URL(`${root}${jsonFile}`, import.meta.url).href,
    imageUrl: new URL(`${root}${imageFile}`, import.meta.url).href,
  };
}
