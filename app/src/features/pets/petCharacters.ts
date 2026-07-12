/**
 * Selectable pet skins / characters.
 * AXO = cream spacesuit companion (full-color animated pack + reference portrait).
 * GLITCH? = monochrome pipeline alternate.
 */
import axoPreview from '@/assets/pets/characters/vibespace-axolotl-glitch/previews/portrait.png';
import glitchPreview from '@/assets/pets/characters/vibespace-axolotl-pixel/previews/idlePrimary-contact-sheet.png';

export type PetCharacterId = 'axo' | 'glitch';

export interface PetCharacterDef {
  id: PetCharacterId;
  /** Short label shown in UI */
  name: string;
  /** Longer title */
  title: string;
  blurb: string;
  /** Asset folder under assets/pets/characters/ */
  assetFolder: string;
  preview: string;
  accent: string;
  badge: string;
}

/**
 * Folder names on disk are historical; character mapping is authoritative.
 * AXO → full-color cream pack. GLITCH? → monochrome pack.
 */
export const PET_CHARACTERS: Record<PetCharacterId, PetCharacterDef> = {
  axo: {
    id: 'axo',
    name: 'AXO',
    title: 'AXO — Classic',
    blurb: 'Bright cream spacesuit companion with the V logo. Warm, friendly, and on-brand.',
    assetFolder: 'vibespace-axolotl-glitch',
    preview: typeof axoPreview === 'string' ? axoPreview : String(axoPreview),
    accent: 'text-accent-copper',
    badge: 'Default',
  },
  glitch: {
    id: 'glitch',
    name: 'GLITCH?',
    title: 'GLITCH? — Signal noise',
    blurb: 'Monochrome pipeline aesthetic — desaturated edges and channel noise. Same moves, different vibe.',
    assetFolder: 'vibespace-axolotl-pixel',
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
