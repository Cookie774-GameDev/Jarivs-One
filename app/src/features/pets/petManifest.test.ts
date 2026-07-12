import { describe, expect, it } from 'vitest';
import {
  getAnimDef,
  getBundledAtlasModuleCount,
  getPetAnimationsManifest,
  resolveAtlasUrls,
} from './petManifest';

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
  it('includes all required video-driven states with frames and atlases for Axo', () => {
    const man = getPetAnimationsManifest('axo');
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
    const def = getAnimDef('idlePrimary', 'axo');
    const urls = resolveAtlasUrls(def!, 'axo', def!.atlas2x);
    expect(urls.jsonUrl).toMatch(/vibespace-axolotl\/atlases\/idlePrimary@2x\.json/);
    expect(urls.imageUrl).toMatch(/vibespace-axolotl\/atlases\/idlePrimary@2x\.png/);
    expect(urls.jsonUrl.toLowerCase()).not.toContain('glitch');
  });

  it('resolves Glitch atlases from vibespace-axolotl-glitch folder', () => {
    const def = getAnimDef('idlePrimary', 'glitch');
    const urls = resolveAtlasUrls(def!, 'glitch', def!.atlas2x);
    expect(urls.jsonUrl).toMatch(/vibespace-axolotl-glitch\/atlases\/idlePrimary@2x\.json/);
  });

  it('bundles runtime atlas modules so production loads do not 404', () => {
    expect(getBundledAtlasModuleCount()).toBeGreaterThanOrEqual(32);
    const axo = resolveAtlasUrls(getAnimDef('idlePrimary', 'axo')!, 'axo');
    expect(axo.jsonUrl).toMatch(/idlePrimary@1x\.json/);
  });
});
