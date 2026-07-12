/**
 * Load typed animation manifest for the selected pet character pack.
 * Atlas URLs are resolved via Vite glob so production bundles include every PNG/JSON.
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
 * AXO (default) → full-color cream pack (`vibespace-axolotl-glitch` folder — historical name).
 * GLITCH? → monochrome pipeline pack (`vibespace-axolotl-pixel`).
 */
const MANIFEST_BY_CHAR: Record<PetCharacterId, PetAnimationsManifest> = {
  axo: glitchAnimations as PetAnimationsManifest,
  glitch: axoAnimations as PetAnimationsManifest,
};

/**
 * Eager URL map for every runtime atlas. Dynamic `new URL(..., import.meta.url)`
 * with a variable folder can 404 in the packaged app; glob is reliable.
 */
const ATLAS_URL_MODULES = import.meta.glob(
  '../../assets/pets/characters/*/atlases/*',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
) as Record<string, string>;

function atlasAssetUrl(folder: string, fileName: string): string | null {
  const needle = `/characters/${folder}/atlases/${fileName}`;
  for (const [key, url] of Object.entries(ATLAS_URL_MODULES)) {
    const norm = key.replace(/\\/g, '/');
    if (norm.endsWith(needle) || norm.includes(`${folder}/atlases/${fileName}`)) {
      return url;
    }
  }
  return null;
}

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

/** Resolve atlas URL for a character folder (production-safe via glob). */
export function resolveAtlasUrls(
  def: PetAnimStateDef,
  characterId?: PetCharacterId,
  atlasPath?: string,
): { jsonUrl: string; imageUrl: string } {
  const id = characterId ?? getSelectedCharacterId();
  const folder = PET_CHARACTERS[id]?.assetFolder ?? 'vibespace-axolotl-glitch';
  const jsonFile = (atlasPath ?? def.atlas).replace(/^atlases\//, '');
  const imageFile = jsonFile.replace(/\.json$/, '.png');

  const jsonUrl = atlasAssetUrl(folder, jsonFile);
  const imageUrl = atlasAssetUrl(folder, imageFile);

  if (jsonUrl && imageUrl) {
    return { jsonUrl, imageUrl };
  }

  // Dev fallback if glob key shape differs
  const root = `../../assets/pets/characters/${folder}/atlases/`;
  return {
    jsonUrl: jsonUrl ?? new URL(`${root}${jsonFile}`, import.meta.url).href,
    imageUrl: imageUrl ?? new URL(`${root}${imageFile}`, import.meta.url).href,
  };
}

/** Exposed for tests — count of bundled atlas modules. */
export function getBundledAtlasModuleCount(): number {
  return Object.keys(ATLAS_URL_MODULES).length;
}
