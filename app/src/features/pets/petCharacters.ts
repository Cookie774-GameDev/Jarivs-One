/**
 * Selectable pet skins / characters.
 * AXO = cream helmeted spacesuit (vibespace-axolotl) — never shares Glitch assets.
 * GLITCH? = intentional glitch pack (vibespace-axolotl-glitch) — left intact.
 */
import axoPreview from '@/assets/pets/characters/vibespace-axolotl/previews/portrait.png';
import glitchPreview from '@/assets/pets/characters/vibespace-axolotl-glitch/previews/portrait.png';

export type PetCharacterId = 'axo' | 'glitch';

export interface PetCharacterDef {
  id: PetCharacterId;
  name: string;
  title: string;
  blurb: string;
  /** Asset folder under assets/pets/characters/ */
  assetFolder: string;
  /** Manifest characterId — must not contain "glitch" for axo */
  manifestCharacterId: string;
  preview: string;
  accent: string;
  badge: string;
}

export const PET_CHARACTERS: Record<PetCharacterId, PetCharacterDef> = {
  axo: {
    id: 'axo',
    name: 'AXO',
    title: 'AXO — Classic',
    blurb: 'Bright cream spacesuit companion with black visor and V logos. Warm and on-brand.',
    assetFolder: 'vibespace-axolotl',
    manifestCharacterId: 'vibespace-axolotl',
    preview: typeof axoPreview === 'string' ? axoPreview : String(axoPreview),
    accent: 'text-accent-copper',
    badge: 'Default',
  },
  glitch: {
    id: 'glitch',
    name: 'GLITCH?',
    title: 'GLITCH? — Signal noise',
    blurb: 'Intentional glitch aesthetic — separate character pack. Same moves, different vibe.',
    assetFolder: 'vibespace-axolotl-glitch',
    manifestCharacterId: 'vibespace-axolotl-glitch',
    preview: typeof glitchPreview === 'string' ? glitchPreview : String(glitchPreview),
    accent: 'text-sky-400',
    badge: 'Alt',
  },
};

export const PET_CHARACTER_LIST: PetCharacterDef[] = [PET_CHARACTERS.axo, PET_CHARACTERS.glitch];

export function isPetCharacterId(v: string | null | undefined): v is PetCharacterId {
  return v === 'axo' || v === 'glitch';
}

export function resolvePetCharacterId(v: string | null | undefined): PetCharacterId {
  return isPetCharacterId(v) ? v : 'axo';
}

/** Guard: normal Axo must never resolve to a glitch folder or id. */
export function assertAxoNotGlitch(def: PetCharacterDef): void {
  if (def.id !== 'axo') return;
  if (def.assetFolder.toLowerCase().includes('glitch')) {
    throw new Error('AXO assetFolder must not contain glitch');
  }
  if (def.manifestCharacterId.toLowerCase().includes('glitch')) {
    throw new Error('AXO manifestCharacterId must not contain glitch');
  }
}

assertAxoNotGlitch(PET_CHARACTERS.axo);
