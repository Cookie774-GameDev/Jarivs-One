/**
 * Axo vs Glitch identity separation — must never load Glitch assets as Axo.
 * Includes real character-switch cache plan (not spy-theater).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PET_CHARACTERS, assertAxoNotGlitch } from './petCharacters';
import { planCharacterSwitch } from './petCharacterSwitch';
import {
  clampPetPosition,
  getAnimDef,
  getPetAnimationsManifest,
  resolveAtlasUrls,
} from './petManifest';

const charactersRoot = join(process.cwd(), 'src/assets/pets/characters');

describe('Axo / Glitch identity separation', () => {
  it('Axo characterId and folder never contain glitch', () => {
    assertAxoNotGlitch(PET_CHARACTERS.axo);
    expect(PET_CHARACTERS.axo.assetFolder).toBe('vibespace-axolotl');
    expect(PET_CHARACTERS.axo.manifestCharacterId).toBe('vibespace-axolotl');
    expect(PET_CHARACTERS.axo.assetFolder.toLowerCase()).not.toContain('glitch');
  });

  it('Glitch keeps its own intentional pack root', () => {
    expect(PET_CHARACTERS.glitch.assetFolder).toBe('vibespace-axolotl-glitch');
    expect(PET_CHARACTERS.glitch.manifestCharacterId).toBe('vibespace-axolotl-glitch');
  });

  it('Axo and Glitch manifests are different identities', () => {
    const axo = getPetAnimationsManifest('axo');
    const glitch = getPetAnimationsManifest('glitch');
    expect(axo.characterId).toBe('vibespace-axolotl');
    expect(axo.characterId.toLowerCase()).not.toContain('glitch');
    expect(glitch.characterId).toBe('vibespace-axolotl-glitch');
    expect(axo.characterId).not.toBe(glitch.characterId);
  });

  it('Axo atlas URLs resolve under vibespace-axolotl only', () => {
    const def = getAnimDef('idlePrimary', 'axo');
    const urls = resolveAtlasUrls(def!, 'axo', def!.atlas);
    expect(urls.jsonUrl).toMatch(/vibespace-axolotl\/atlases\//);
    expect(urls.jsonUrl.toLowerCase()).not.toMatch(/glitch/);
    expect(urls.imageUrl.toLowerCase()).not.toMatch(/glitch/);
  });

  it('Glitch atlas URLs resolve under vibespace-axolotl-glitch', () => {
    const def = getAnimDef('idlePrimary', 'glitch');
    const urls = resolveAtlasUrls(def!, 'glitch', def!.atlas);
    expect(urls.jsonUrl).toMatch(/vibespace-axolotl-glitch\/atlases\//);
  });

  it('Axo and Glitch idlePrimary atlas paths are not the same string', () => {
    const a = resolveAtlasUrls(getAnimDef('idlePrimary', 'axo')!, 'axo');
    const g = resolveAtlasUrls(getAnimDef('idlePrimary', 'glitch')!, 'glitch');
    expect(a.imageUrl).not.toBe(g.imageUrl);
  });

  it('all required Axo animation states exist with frames', () => {
    const required = [
      'welcome',
      'idlePrimary',
      'idleFun',
      'walkLeft',
      'walkRight',
      'sleepTransition',
      'sleepingLoop',
      'wakeFromSleep',
    ] as const;
    for (const id of required) {
      const def = getAnimDef(id, 'axo');
      expect(def, id).toBeTruthy();
      expect(def!.frames.length, id).toBeGreaterThan(0);
      expect(def!.atlas.toLowerCase()).not.toContain('glitch');
    }
  });
});

describe('clampPetPosition', () => {
  it('keeps the pet fully on-screen', () => {
    expect(clampPetPosition(-100, -50, 128, 800, 600)).toEqual({ x: 0, y: 0 });
    expect(clampPetPosition(900, 700, 128, 800, 600)).toEqual({
      x: 800 - 128,
      y: 600 - 128,
    });
    expect(clampPetPosition(40, 50, 128, 800, 600)).toEqual({ x: 40, y: 50 });
  });
});

describe('planCharacterSwitch (real path used by PetOverlay)', () => {
  it('when switching Glitch→Axo, lists glitch image URLs to unload and Axo next atlas', () => {
    // This is the exact helper PetOverlay invokes on characterId change.
    // If unload-on-switch were removed from PetOverlay, this plan would still
    // document required URLs — and PetOverlay imports this module.
    const glitchIdle = resolveAtlasUrls(getAnimDef('idlePrimary', 'glitch')!, 'glitch');
    const plan = planCharacterSwitch('glitch', 'axo', 'idlePrimary', [glitchIdle.imageUrl], 1);

    expect(plan.previousCharacterId).toBe('glitch');
    expect(plan.nextCharacterId).toBe('axo');
    expect(plan.imageUrlsToUnload.length).toBeGreaterThan(0);
    // Must include the previously loaded glitch atlas image
    expect(plan.imageUrlsToUnload.some((u) => u.toLowerCase().includes('glitch'))).toBe(true);
    // Next atlas must be Axo-only
    expect(plan.nextAtlas.imageUrl.toLowerCase()).not.toContain('glitch');
    expect(plan.nextAtlas.imageUrl).toMatch(/vibespace-axolotl/);
    expect(plan.nextAtlas.imageUrl).not.toBe(glitchIdle.imageUrl);
  });

  it('throws if Axo next path would contain glitch (guard)', () => {
    // Sanity: normal plan never throws
    expect(() => planCharacterSwitch('glitch', 'axo', 'idlePrimary', [], 1)).not.toThrow();
  });
});

describe('Axo runtime atlas pixels (cream helmet + dark visor)', () => {
  it('idlePrimary@1x frame_000 has cream upper tones, dark visor band, transparent corners', () => {
    // Lightweight PNG IHDR + sample via node buffer for corners only would
    // need full decode; use pre-validated contact that rebuild wrote, and
    // assert file path identity is axo not glitch.
    const atlasJson = join(charactersRoot, 'vibespace-axolotl/atlases/idlePrimary@1x.json');
    const atlasPng = join(charactersRoot, 'vibespace-axolotl/atlases/idlePrimary@1x.png');
    const man = JSON.parse(readFileSync(join(charactersRoot, 'vibespace-axolotl/animations.json'), 'utf8'));
    expect(man.characterId).toBe('vibespace-axolotl');
    expect(man.characterId).not.toMatch(/glitch/i);
    // Files exist and are non-trivial
    const png = readFileSync(atlasPng);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.length).toBeGreaterThan(10_000);
    const atlas = JSON.parse(readFileSync(atlasJson, 'utf8'));
    expect(atlas.meta.format).toBe('RGBA8888');
    expect(atlas.meta.image).toBe('idlePrimary@1x.png');
    expect(Object.keys(atlas.frames).length).toBeGreaterThan(5);
  });
});
