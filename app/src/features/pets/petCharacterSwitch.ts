/**
 * Pure helpers for Axo↔Glitch skin switching.
 * Extracted so tests can drive the real cache-eviction plan without mocking
 * away the unit under test.
 */
import type { PetCharacterId } from './petCharacters';
import { getAnimDef, resolveAtlasUrls } from './petManifest';
import type { PetAnimId } from './petStateMachine';

export interface CharacterSwitchPlan {
  previousCharacterId: PetCharacterId;
  nextCharacterId: PetCharacterId;
  /** Atlas image URLs that must be unloaded from Pixi Assets. */
  imageUrlsToUnload: string[];
  /** Atlas pair for the next skin's current animation. */
  nextAtlas: { jsonUrl: string; imageUrl: string };
}

/**
 * Plan a character switch for a given anim. Used by PetOverlay on characterId
 * change: unload prior skin atlas image(s), then load next skin atlas.
 */
export function planCharacterSwitch(
  previousCharacterId: PetCharacterId,
  nextCharacterId: PetCharacterId,
  anim: PetAnimId,
  previousImageUrls: string[] = [],
  devicePixelRatio = 1,
): CharacterSwitchPlan {
  const def = getAnimDef(anim, nextCharacterId);
  if (!def) {
    throw new Error(`planCharacterSwitch: missing anim ${anim} for ${nextCharacterId}`);
  }
  const prefer2x = devicePixelRatio >= 1.5 && !!def.atlas2x;
  const atlasPath = prefer2x ? def.atlas2x! : def.atlas;
  const nextAtlas = resolveAtlasUrls(def, nextCharacterId, atlasPath);

  // Collect previous skin atlas images for every known anim (cache may hold more
  // than the current frame). Callers may pass exact loaded URLs; we always add
  // idlePrimary of the previous skin as a minimum eviction set.
  const toUnload = new Set<string>(previousImageUrls.filter(Boolean));
  if (previousCharacterId !== nextCharacterId) {
    const prevIdle = getAnimDef('idlePrimary', previousCharacterId);
    if (prevIdle) {
      const prev = resolveAtlasUrls(prevIdle, previousCharacterId, prevIdle.atlas);
      toUnload.add(prev.imageUrl);
      if (prevIdle.atlas2x) {
        toUnload.add(resolveAtlasUrls(prevIdle, previousCharacterId, prevIdle.atlas2x).imageUrl);
      }
    }
  }

  // Hard guard: next Axo atlas must never be a glitch path
  if (nextCharacterId === 'axo') {
    if (nextAtlas.imageUrl.toLowerCase().includes('glitch') || nextAtlas.jsonUrl.toLowerCase().includes('glitch')) {
      throw new Error('planCharacterSwitch: Axo next atlas must not contain glitch');
    }
  }

  return {
    previousCharacterId,
    nextCharacterId,
    imageUrlsToUnload: [...toUnload],
    nextAtlas,
  };
}
