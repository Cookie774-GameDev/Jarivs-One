import { describe, expect, it } from 'vitest';
import {
  getAnimDef,
  getBundledAtlasModuleCount,
  getPetAnimationsManifest,
  resolveAtlasUrls,
} from './petManifest';
import { NORMAL_AXO_RUNTIME_ID, GLITCH_RUNTIME_ID } from './petCharacters';

const REQUIRED = [
  'walkLeft',
  'walkRight',
  'idlePrimary',
  'idleFun',
  'welcome',
  'sleepTransition',
  'sleepingLoop',
  'wakeFromSleep',
] as const;

describe('pet animations manifest (shipped assets)', () => {
  it('uses canonical runtime character IDs for selectable manifests', () => {
    expect(getPetAnimationsManifest(NORMAL_AXO_RUNTIME_ID).characterId).toBe(NORMAL_AXO_RUNTIME_ID);
    expect(getPetAnimationsManifest('axo').characterId).toBe(NORMAL_AXO_RUNTIME_ID);
    expect(getPetAnimationsManifest('vibespace-axolotl-pixel').characterId).toBe(NORMAL_AXO_RUNTIME_ID);
    expect(getPetAnimationsManifest('vibespace-axolotl-light').characterId).toBe(NORMAL_AXO_RUNTIME_ID);
    expect(getPetAnimationsManifest(GLITCH_RUNTIME_ID).characterId).toBe(GLITCH_RUNTIME_ID);
    expect(getPetAnimationsManifest('glitch').characterId).toBe(GLITCH_RUNTIME_ID);
  });

  it('includes all required video-driven states with frames and atlases for Axo', () => {
    const man = getPetAnimationsManifest(NORMAL_AXO_RUNTIME_ID);
    expect(man.characterId).toBe('vibespace-axolotl');
    expect(man.characterId.toLowerCase()).not.toContain('glitch');
    expect(man.defaultState).toBe('idlePrimary');
    for (const id of REQUIRED) {
      const def = getAnimDef(id, 'axo');
      expect(def, id).toBeTruthy();
      expect(def!.frames.length, id).toBeGreaterThan(5);
      expect(def!.fps).toBeGreaterThan(0);
      expect(def!.atlas).toMatch(/atlases\/.+\.json$/);
    }
    expect(getAnimDef('walkLeft', 'axo')!.atlas).not.toBe(getAnimDef('walkRight', 'axo')!.atlas);
  });

  it('resolves Axo @2x atlas URLs from vibespace-axolotl only', () => {
    const def = getAnimDef('idlePrimary', NORMAL_AXO_RUNTIME_ID);
    const urls = resolveAtlasUrls(def!, NORMAL_AXO_RUNTIME_ID, def!.atlas2x);
    expect(urls.jsonUrl).toMatch(/vibespace-axolotl\/atlases\/idlePrimary@2x\.json/);
    expect(urls.imageUrl).toMatch(/vibespace-axolotl\/atlases\/idlePrimary@2x\.png/);
    expect(urls.jsonUrl.toLowerCase()).not.toContain('glitch');
  });

  it('resolves Glitch atlases from vibespace-axolotl-glitch folder', () => {
    const def = getAnimDef('idlePrimary', GLITCH_RUNTIME_ID);
    const urls = resolveAtlasUrls(def!, GLITCH_RUNTIME_ID, def!.atlas2x);
    expect(urls.jsonUrl).toMatch(/vibespace-axolotl-glitch\/atlases\/idlePrimary@2x\.json/);
  });

  it('bundles runtime atlas modules so production loads do not 404', () => {
    expect(getBundledAtlasModuleCount()).toBeGreaterThanOrEqual(32);
    const axo = resolveAtlasUrls(getAnimDef('idlePrimary', 'axo')!, 'axo');
    expect(axo.jsonUrl).toMatch(/idlePrimary@1x\.json/);
  });
});
