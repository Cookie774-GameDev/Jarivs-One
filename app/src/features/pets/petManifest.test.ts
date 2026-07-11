import { describe, expect, it } from 'vitest';
import { getAnimDef, getPetAnimationsManifest } from './petManifest';

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
    const man = getPetAnimationsManifest();
    expect(man.characterId).toBe('vibespace-axolotl-pixel');
    expect(man.defaultState).toBe('idlePrimary');
    expect(man.scheduler.idleFunIntervalMs).toBe(60_000);
    for (const id of REQUIRED) {
      const def = getAnimDef(id);
      expect(def, id).toBeTruthy();
      expect(def!.frames.length, id).toBeGreaterThan(5);
      expect(def!.fps).toBeGreaterThan(0);
      expect(def!.atlas).toMatch(/atlases\/.+\.json$/);
    }
    // walk cycles use separate atlases (must not mirror left→right)
    expect(getAnimDef('walkLeft')!.atlas).not.toBe(getAnimDef('walkRight')!.atlas);
    expect(getAnimDef('walkLeft')!.atlas).toMatch(/walkLeft/);
    expect(getAnimDef('walkRight')!.atlas).toMatch(/walkRight/);
    // sleeping loops
    expect(getAnimDef('sleepingLoop')!.loop).toBe(true);
    expect(getAnimDef('welcome')!.loop).toBe(false);
    expect(getAnimDef('idleFun')!.oneShot || !getAnimDef('idleFun')!.loop).toBeTruthy();
  });
});
