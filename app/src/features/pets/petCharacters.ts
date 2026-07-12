/**
 * Selectable pet skins / characters.
 * Runtime IDs are canonical asset-package IDs. Short names and source package
 * names are accepted only as migration aliases and are never persisted.
 */
import axoPreview from '@/assets/pets/characters/vibespace-axolotl/previews/portrait.png';
import glitchPreview from '@/assets/pets/characters/vibespace-axolotl-glitch/previews/portrait.png';

export const NORMAL_AXO_RUNTIME_ID = 'vibespace-axolotl' as const;
export const GLITCH_RUNTIME_ID = 'vibespace-axolotl-glitch' as const;

export type PetCharacterId = typeof NORMAL_AXO_RUNTIME_ID | typeof GLITCH_RUNTIME_ID;
export type PetCharacterInput =
  | PetCharacterId
  | 'axo'
  | 'glitch'
  | 'vibespace-axolotl-pixel'
  | 'vibespace-axolotl-light'
  | string
  | null
  | undefined;

export interface PetCharacterDef {
  id: PetCharacterId;
  name: string;
  title: string;
  blurb: string;
  /** Asset folder under assets/pets/characters/ */
  assetFolder: string;
  /** Manifest characterId. */
  manifestCharacterId: string;
  preview: string;
  accent: string;
  badge: string;
}

const AXO_CHARACTER: PetCharacterDef = {
  id: NORMAL_AXO_RUNTIME_ID,
  name: 'AXO',
  title: 'AXO — Classic',
  blurb: 'Bright cream spacesuit companion with black visor and V logos. Warm and on-brand.',
  assetFolder: 'vibespace-axolotl',
  manifestCharacterId: NORMAL_AXO_RUNTIME_ID,
  preview: typeof axoPreview === 'string' ? axoPreview : String(axoPreview),
  accent: 'text-accent-copper',
  badge: 'Default',
};

const GLITCH_CHARACTER: PetCharacterDef = {
  id: GLITCH_RUNTIME_ID,
  name: 'GLITCH?',
  title: 'GLITCH? — Signal noise',
  blurb: 'Intentional glitch aesthetic — separate character pack. Same moves, different vibe.',
  assetFolder: 'vibespace-axolotl-glitch',
  manifestCharacterId: GLITCH_RUNTIME_ID,
  preview: typeof glitchPreview === 'string' ? glitchPreview : String(glitchPreview),
  accent: 'text-sky-400',
  badge: 'Alt',
};

export const PET_CHARACTERS: Record<PetCharacterId, PetCharacterDef> & {
  /** Legacy convenience aliases for older call-sites/tests; never persisted. */
  axo: PetCharacterDef;
  glitch: PetCharacterDef;
} = {
  [NORMAL_AXO_RUNTIME_ID]: AXO_CHARACTER,
  [GLITCH_RUNTIME_ID]: GLITCH_CHARACTER,
  axo: AXO_CHARACTER,
  glitch: GLITCH_CHARACTER,
};

export const PET_CHARACTER_LIST: PetCharacterDef[] = [AXO_CHARACTER, GLITCH_CHARACTER];

const PET_CHARACTER_ALIASES: Record<string, PetCharacterId> = {
  [NORMAL_AXO_RUNTIME_ID]: NORMAL_AXO_RUNTIME_ID,
  axo: NORMAL_AXO_RUNTIME_ID,
  'vibespace-axolotl-pixel': NORMAL_AXO_RUNTIME_ID,
  'vibespace-axolotl-light': NORMAL_AXO_RUNTIME_ID,
  [GLITCH_RUNTIME_ID]: GLITCH_RUNTIME_ID,
  glitch: GLITCH_RUNTIME_ID,
};

export function isPetCharacterId(v: string | null | undefined): v is PetCharacterId {
  return v === NORMAL_AXO_RUNTIME_ID || v === GLITCH_RUNTIME_ID;
}

export function resolvePetCharacterId(v: PetCharacterInput): PetCharacterId {
  const key = String(v ?? '').trim();
  return PET_CHARACTER_ALIASES[key] ?? NORMAL_AXO_RUNTIME_ID;
}

/** Guard: normal Axo must never resolve to a glitch folder or id. */
export function assertAxoNotGlitch(def: PetCharacterDef): void {
  if (def.id !== NORMAL_AXO_RUNTIME_ID) return;
  if (def.assetFolder.toLowerCase().includes('glitch')) {
    throw new Error('AXO assetFolder must not contain glitch');
  }
  if (def.manifestCharacterId.toLowerCase().includes('glitch')) {
    throw new Error('AXO manifestCharacterId must not contain glitch');
  }
}

assertAxoNotGlitch(PET_CHARACTERS[NORMAL_AXO_RUNTIME_ID]);
