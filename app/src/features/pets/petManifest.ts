/**
 * Load typed animation manifest shipped with the character pack.
 */
import type { PetAnimId } from './petStateMachine';
import animationsJson from '@/assets/pets/characters/vibespace-axolotl-pixel/animations.json';

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

export function getPetAnimationsManifest(): PetAnimationsManifest {
  return animationsJson as PetAnimationsManifest;
}

export function getAnimDef(id: PetAnimId): PetAnimStateDef | undefined {
  return getPetAnimationsManifest().states[id];
}

/** Resolve atlas URL relative to character root for Vite. */
export function resolveAtlasUrls(def: PetAnimStateDef): { jsonUrl: string; imageUrl: string } {
  // def.atlas like "atlases/walkRight@1x.json"
  const jsonFile = def.atlas.replace(/^atlases\//, '');
  const imageFile = jsonFile.replace(/\.json$/, '.png');
  const root = '../../assets/pets/characters/vibespace-axolotl-pixel/atlases/';
  return {
    jsonUrl: new URL(`${root}${jsonFile}`, import.meta.url).href,
    imageUrl: new URL(`${root}${imageFile}`, import.meta.url).href,
  };
}
