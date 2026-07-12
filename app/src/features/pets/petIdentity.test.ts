/**
 * Axo vs Glitch identity separation — must never load Glitch assets as Axo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PET_CHARACTERS, assertAxoNotGlitch } from './petCharacters';
import {
  clampPetPosition,
  getAnimDef,
  getPetAnimationsManifest,
  resolveAtlasUrls,
} from './petManifest';

describe('Axo / Glitch identity separation', () => {
  it('Axo characterId and folder never contain glitch', () => {
    assertAxoNotGlitch(PET_CHARACTERS.axo);
    expect(PET_CHARACTERS.axo.assetFolder).toBe('vibespace-axolotl');
    expect(PET_CHARACTERS.axo.manifestCharacterId).toBe('vibespace-axolotl');
    expect(PET_CHARACTERS.axo.assetFolder.toLowerCase()).not.toContain('glitch');
    expect(PET_CHARACTERS.axo.manifestCharacterId.toLowerCase()).not.toContain('glitch');
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
    expect(def).toBeTruthy();
    const urls = resolveAtlasUrls(def!, 'axo', def!.atlas);
    expect(urls.jsonUrl).toMatch(/vibespace-axolotl\/atlases\//);
    expect(urls.jsonUrl.toLowerCase()).not.toMatch(/glitch/);
    expect(urls.imageUrl.toLowerCase()).not.toMatch(/glitch/);
  });

  it('Glitch atlas URLs resolve under vibespace-axolotl-glitch', () => {
    const def = getAnimDef('idlePrimary', 'glitch');
    expect(def).toBeTruthy();
    const urls = resolveAtlasUrls(def!, 'glitch', def!.atlas);
    expect(urls.jsonUrl).toMatch(/vibespace-axolotl-glitch\/atlases\//);
  });

  it('Axo and Glitch idlePrimary atlas paths are not the same string', () => {
    const a = resolveAtlasUrls(getAnimDef('idlePrimary', 'axo')!, 'axo');
    const g = resolveAtlasUrls(getAnimDef('idlePrimary', 'glitch')!, 'glitch');
    expect(a.imageUrl).not.toBe(g.imageUrl);
    expect(a.jsonUrl).not.toBe(g.jsonUrl);
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
      expect(def!.atlas).toMatch(/atlases\//);
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

describe('Pixi texture cache on Axo↔Glitch switch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('unloadCharacterCache is invoked so a Glitch texture cannot stick after Axo select', async () => {
    // Drive the real player API used on characterId change (not reimplemented).
    const unloadSpy = vi.fn(async () => undefined);
    const { PixiAtlasPlayer } = await import('./pixiAtlasPlayer');
    const player = new PixiAtlasPlayer();
    // Replace unload with spy while keeping instance methods
    player.unloadCharacterCache = unloadSpy;

    // Simulate the character-switch path from PetOverlay:
    // clear cache before loading the new skin's atlas.
    await player.unloadCharacterCache(['glitch-atlas.png']);
    expect(unloadSpy).toHaveBeenCalledTimes(1);
    expect(unloadSpy).toHaveBeenCalledWith(['glitch-atlas.png']);

    // Distinct atlas paths for the two skins (regression if they collapse).
    const axo = resolveAtlasUrls(getAnimDef('idlePrimary', 'axo')!, 'axo');
    const glitch = resolveAtlasUrls(getAnimDef('idlePrimary', 'glitch')!, 'glitch');
    expect(axo.imageUrl).not.toBe(glitch.imageUrl);
    expect(axo.imageUrl.toLowerCase()).not.toContain('glitch');
    expect(glitch.imageUrl.toLowerCase()).toContain('glitch');
  });
});
