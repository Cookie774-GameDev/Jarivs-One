/**
 * Selectable pet skins / characters.
 * AXO = full-color companion (the former "glitch" pack — correct live art).
 * GLITCH? = monochrome pipeline alternate (former muddy AXO pack).
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
 * AXO uses the full-color `vibespace-axolotl-glitch` runtime atlases.
 * GLITCH? uses the monochrome `vibespace-axolotl-pixel` pack as the alt skin.
 * (Folder names are historical; do not rename folders without updating
 * resolveAtlasUrls and shipped asset paths.)
 */
export const PET_CHARACTERS: Record<PetCharacterId, PetCharacterDef> = {
  axo: {
    id: 'axo',
    name: 'AXO',
    title: 'AXO — Classic',
    blurb: 'Bright cream hoodie companion. Warm, friendly, and on-brand VibeSpace pixel art.',
    assetFolder: 'vibespace-axolotl-glitch',
    preview: typeof axoPreview === 'string' ? axoPreview : String(axoPreview),
    accent: 'text-accent-copper',
    badge: 'Default',
  },
  glitch: {
    id: 'glitch',
    name: 'GLITCH?',
    title: 'GLITCH? — Signal noise',
    blurb: 'Darker monochrome pipeline aesthetic — desaturated edges and channel noise. Same moves, different vibe.',
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
