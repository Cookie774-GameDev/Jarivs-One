/**
 * Load typed animation manifest for the selected pet character pack.
 * Axo and Glitch use independent roots — never share atlas paths.
 */
import type { PetAnimId } from './petStateMachine';
import axoAnimations from '@/assets/pets/characters/vibespace-axolotl/animations.json';
import glitchAnimations from '@/assets/pets/characters/vibespace-axolotl-glitch/animations.json';
import {
  NORMAL_AXO_RUNTIME_ID,
  GLITCH_RUNTIME_ID,
  resolvePetCharacterId,
  type PetCharacterId,
  type PetCharacterInput,
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

const MANIFEST_BY_CHAR: Record<PetCharacterId, PetAnimationsManifest> = {
  [NORMAL_AXO_RUNTIME_ID]: axoAnimations as PetAnimationsManifest,
  [GLITCH_RUNTIME_ID]: glitchAnimations as PetAnimationsManifest,
};

const ATLAS_URL_MODULES = import.meta.glob(
  '../../assets/pets/characters/*/atlases/*',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
) as Record<string, string>;

function atlasAssetUrl(folder: string, fileName: string): string | null {
  for (const [key, url] of Object.entries(ATLAS_URL_MODULES)) {
    const norm = key.replace(/\\/g, '/');
    if (norm.includes(`${folder}/atlases/${fileName}`)) {
      return url;
    }
  }
  return null;
}

export function getSelectedCharacterId(): PetCharacterId {
  try {
    return resolvePetCharacterId(usePetSettingsStore.getState().characterId);
  } catch {
    return NORMAL_AXO_RUNTIME_ID;
  }
}

export function getPetAnimationsManifest(
  characterId?: PetCharacterInput,
): PetAnimationsManifest {
  const id = characterId == null ? getSelectedCharacterId() : resolvePetCharacterId(characterId);
  return MANIFEST_BY_CHAR[id] ?? MANIFEST_BY_CHAR[NORMAL_AXO_RUNTIME_ID];
}

export function getAnimDef(
  id: PetAnimId,
  characterId?: PetCharacterInput,
): PetAnimStateDef | undefined {
  return getPetAnimationsManifest(characterId).states[id];
}

/** Resolve atlas URL for a character folder (production-safe via glob). */
export function resolveAtlasUrls(
  def: PetAnimStateDef,
  characterId?: PetCharacterInput,
  atlasPath?: string,
): { jsonUrl: string; imageUrl: string } {
  const id = characterId == null ? getSelectedCharacterId() : resolvePetCharacterId(characterId);
  const folder = PET_CHARACTERS[id]?.assetFolder ?? 'vibespace-axolotl';
  const jsonFile = (atlasPath ?? def.atlas).replace(/^atlases\//, '');
  const imageFile = jsonFile.replace(/\.json$/, '.png');

  // Hard guard: Axo must never resolve under a glitch folder.
  if (id === NORMAL_AXO_RUNTIME_ID && folder.toLowerCase().includes('glitch')) {
    throw new Error('Axo cannot load glitch asset folder');
  }

  const jsonUrl = atlasAssetUrl(folder, jsonFile);
  const imageUrl = atlasAssetUrl(folder, imageFile);

  if (jsonUrl && imageUrl) {
    if (id === NORMAL_AXO_RUNTIME_ID && (jsonUrl.includes('glitch') || imageUrl.includes('glitch'))) {
      throw new Error('Axo atlas URL unexpectedly contains glitch');
    }
    return { jsonUrl, imageUrl };
  }

  const root = `../../assets/pets/characters/${folder}/atlases/`;
  return {
    jsonUrl: jsonUrl ?? new URL(`${root}${jsonFile}`, import.meta.url).href,
    imageUrl: imageUrl ?? new URL(`${root}${imageFile}`, import.meta.url).href,
  };
}

export function getBundledAtlasModuleCount(): number {
  return Object.keys(ATLAS_URL_MODULES).length;
}

/** Pure helper: clamp overlay position into screen work area (logical px). */
export function clampPetPosition(
  x: number,
  y: number,
  size: number,
  screenW: number,
  screenH: number,
  margin = 0,
): { x: number; y: number } {
  const maxX = Math.max(margin, screenW - size - margin);
  const maxY = Math.max(margin, screenH - size - margin);
  return {
    x: Math.min(maxX, Math.max(margin, x)),
    y: Math.min(maxY, Math.max(margin, y)),
  };
}
