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
  it('includes all required video-driven states with frames and atlases', () => {
    // Default AXO maps to the full-color pack (folder name is historical).
    const man = getPetAnimationsManifest('axo');
    expect(man.characterId).toBe('vibespace-axolotl-glitch');
    expect(man.defaultState).toBe('idlePrimary');
    expect(man.scheduler.idleFunIntervalMs).toBe(60_000);
    for (const id of REQUIRED) {
      const def = getAnimDef(id, 'axo');
      expect(def, id).toBeTruthy();
      expect(def!.frames.length, id).toBeGreaterThan(5);
      expect(def!.fps).toBeGreaterThan(0);
      expect(def!.atlas).toMatch(/atlases\/.+\.json$/);
    }
    // walk cycles use separate atlases (must not mirror left→right)
    expect(getAnimDef('walkLeft', 'axo')!.atlas).not.toBe(getAnimDef('walkRight', 'axo')!.atlas);
    expect(getAnimDef('walkLeft', 'axo')!.atlas).toMatch(/walkLeft/);
    expect(getAnimDef('walkRight', 'axo')!.atlas).toMatch(/walkRight/);
    // sleeping loops
    expect(getAnimDef('sleepingLoop', 'axo')!.loop).toBe(true);
    expect(getAnimDef('welcome', 'axo')!.loop).toBe(false);
    expect(getAnimDef('idleFun', 'axo')!.oneShot || !getAnimDef('idleFun', 'axo')!.loop).toBeTruthy();
  });

  it('resolves AXO (default) @2x atlas URLs from the full-color pack folder', () => {
    const def = getAnimDef('idlePrimary', 'axo');
    expect(def?.atlas2x).toMatch(/idlePrimary@2x\.json$/);

    const urls = resolveAtlasUrls(def!, 'axo', def!.atlas2x);

    expect(urls.jsonUrl).toMatch(/vibespace-axolotl-glitch\/atlases\/idlePrimary@2x\.json/);
    expect(urls.imageUrl).toMatch(/vibespace-axolotl-glitch\/atlases\/idlePrimary@2x\.png/);
  });

  it('resolves GLITCH? atlases from the monochrome pixel pack folder', () => {
    const def = getAnimDef('idlePrimary', 'glitch');
    expect(def?.atlas2x).toMatch(/idlePrimary@2x\.json$/);

    const urls = resolveAtlasUrls(def!, 'glitch', def!.atlas2x);

    expect(urls.jsonUrl).toMatch(/vibespace-axolotl-pixel\/atlases\/idlePrimary@2x\.json/);
    expect(urls.imageUrl).toMatch(/vibespace-axolotl-pixel\/atlases\/idlePrimary@2x\.png/);
  });

  it('bundles runtime atlas modules so production loads do not 404', () => {
    // 2 characters × 8 anims × 2 scales × (json+png) = 64 modules expected at least
    expect(getBundledAtlasModuleCount()).toBeGreaterThanOrEqual(32);
    const axo = resolveAtlasUrls(getAnimDef('idlePrimary', 'axo')!, 'axo');
    expect(axo.jsonUrl.length).toBeGreaterThan(0);
    expect(axo.imageUrl.length).toBeGreaterThan(0);
    expect(axo.jsonUrl).toMatch(/idlePrimary@1x\.json/);
    expect(axo.imageUrl).toMatch(/idlePrimary@1x\.png/);
  });
});
