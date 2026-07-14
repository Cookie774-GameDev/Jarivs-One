/**
 * Glitch Sprite asset freeze — artwork must not change under Axo work.
 * Records SHA-256 of every Glitch runtime file and asserts stability.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAnimDef, getPetAnimationsManifest } from './petManifest';
import { DEFAULT_DRAG_VELOCITY_CONFIG } from './petDragVelocity';
import type { PetAnimId } from './petStateMachine';

const charactersRoot = (() => {
  const candidates = [
    join(process.cwd(), 'src/assets/pets/characters'),
    join(process.cwd(), 'app/src/assets/pets/characters'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error('characters root not found');
})();

const GLITCH_ROOT = join(charactersRoot, 'vibespace-axolotl-glitch');

const GLITCH_FILES = [
  'animations.json',
  'atlases/welcome@1x.png',
  'atlases/welcome@2x.png',
  'atlases/welcome@1x.json',
  'atlases/welcome@2x.json',
  'atlases/idlePrimary@1x.png',
  'atlases/idlePrimary@2x.png',
  'atlases/idlePrimary@1x.json',
  'atlases/idlePrimary@2x.json',
  'atlases/idleFun@1x.png',
  'atlases/idleFun@2x.png',
  'atlases/idleFun@1x.json',
  'atlases/idleFun@2x.json',
  'atlases/walkLeft@1x.png',
  'atlases/walkLeft@2x.png',
  'atlases/walkLeft@1x.json',
  'atlases/walkLeft@2x.json',
  'atlases/walkRight@1x.png',
  'atlases/walkRight@2x.png',
  'atlases/walkRight@1x.json',
  'atlases/walkRight@2x.json',
  'atlases/sleepTransition@1x.png',
  'atlases/sleepTransition@2x.png',
  'atlases/sleepTransition@1x.json',
  'atlases/sleepTransition@2x.json',
  'atlases/sleepingLoop@1x.png',
  'atlases/sleepingLoop@2x.png',
  'atlases/sleepingLoop@1x.json',
  'atlases/sleepingLoop@2x.json',
  'atlases/wakeFromSleep@1x.png',
  'atlases/wakeFromSleep@2x.png',
  'atlases/wakeFromSleep@1x.json',
  'atlases/wakeFromSleep@2x.json',
] as const;

function sha256File(rel: string): string {
  const raw = readFileSync(join(GLITCH_ROOT, rel));
  const buf = rel.endsWith('.json')
    ? Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'))
    : raw;
  return createHash('sha256').update(buf).digest('hex').toUpperCase();
}

/** Frozen before this session's Axo/panel work — regenerating Glitch must fail tests. */
const GLITCH_SHA256_FREEZE: Record<string, string> = {
  'animations.json': '1158F631519295C14CB70837F0F6145E8AAF59E500BD53BE53D07D77DC074994',
  'atlases/welcome@1x.png': '65AAB58D7E35A64CB56A7B9887AFDEB576A609648BD61F8C1F84507973DC9738',
  'atlases/welcome@2x.png': '81C291971E306843786D72783EE176B872267617A7C4BF0747326C17FE380CF3',
  'atlases/welcome@1x.json': 'A3D817E3F7A2DE33C72C93F6447B794FE63DB05621AE4DFD0A970507EEA8F874',
  'atlases/welcome@2x.json': 'C12A849F48E66847FF72FF0F44F91F862A9FC0677C7ADDE5E703339258819D03',
  'atlases/idlePrimary@1x.png': '5AE19F1081E0B3010AC15C8437AD41EA99D47F9E14C92531ABFDBEFAAE2E1CA6',
  'atlases/idlePrimary@2x.png': '305CFEEF5F54E5F93B14C95F866778C631BB22736F45CC94190B756D41DA2E7C',
  'atlases/idlePrimary@1x.json': '61E782189D3E75C40DD0501CCC0B833F9B5E7ADFF525D6FA009430704B2A573E',
  'atlases/idlePrimary@2x.json': '33179A6A027E9AF82C8787811C82AF7EF90F9ADB424FF2CE044610AFEB3EB96D',
  'atlases/idleFun@1x.png': '3EC5D05054FE5F008AFE3440E67A40BB90AE9F2B95842EF0A901E7989FD492C9',
  'atlases/idleFun@2x.png': '77C4940E3C2EDFDF3DF615BFF42AEC5646F143F4D0EFC259A57FDF78B20075AF',
  'atlases/idleFun@1x.json': 'EC956CA205FBC8F7FC1A89149F6C52DA2637A3C569955CCE99B72742E187E212',
  'atlases/idleFun@2x.json': 'E68DD856360718A83F62D18AB4D5A6700ED168E9DFA5564A939857F0A53E9FB9',
  'atlases/walkLeft@1x.png': '9716C3B7EC2D53B38B158C5BDA058071AE7618786B9F71277D4D5BCD80C1D9DF',
  'atlases/walkLeft@2x.png': 'A64CFD2A2B7E258ECE51CA674F8356C7F2567399E6307B0CB973381645D1DEB5',
  'atlases/walkLeft@1x.json': 'A5B124E3D320FE66ED90EBB107103B40D7CF513FF89B2AD49AE8E21AA393ADE6',
  'atlases/walkLeft@2x.json': '44D1A61F8A6C9F87479C23B1286B550292D85B3D17F2E3AEEAD7947158C40D49',
  'atlases/walkRight@1x.png': '9D16FFEC0DE1AB611370594ED889ABD6BC8715006BD5DCDAB433CDD0A8324861',
  'atlases/walkRight@2x.png': 'DA8E42A9E5713BAFE8A09FE1E40169B02D48DD0CDAFAE2C03316405D0EFB5C52',
  'atlases/walkRight@1x.json': 'CDC6D367FE57BD796ADB57B5AADA00BD56D7D8F2A82E99FEADA0328B7C0CB355',
  'atlases/walkRight@2x.json': '674F04E916144B3FE313FE01EDFF53A4D2131F4A010C8682851B7F2C1DA507FF',
  'atlases/sleepTransition@1x.png': '152489E76B446D4D1BDBBA020B6B2DB02073E38D7C7582EAFBB72460C2782E6D',
  'atlases/sleepTransition@2x.png': 'E716EFAAFD0ED288BCE332DAA113BE16692484A16F02FFC96AF2803B6CED1357',
  'atlases/sleepTransition@1x.json': 'D67DC3998F5C8C6ED5C5E18F972C9A4A694E79C939627712615CB871689C56DE',
  'atlases/sleepTransition@2x.json': '979904C14FFB60354117468A41113136C6BFD57DDFCDC2787D3ED3AEA42C8F75',
  'atlases/sleepingLoop@1x.png': 'B2ABB48D68991D2E6F51D8278167C5BDFCBB40406FDB39076331C5E8DA219500',
  'atlases/sleepingLoop@2x.png': '24634F88E477164194E77EC8F0FB4355C0812052E615F7A8E6B93B00C33EF92E',
  'atlases/sleepingLoop@1x.json': '8612688F78E50600F70992117540A331FE58D0388FD8AF9D997E48F63C531F7E',
  'atlases/sleepingLoop@2x.json': 'DB3C538CC127382AC83731C385FFC68D029D9A3021F343CCAAE9B9FCEEC57500',
  'atlases/wakeFromSleep@1x.png': 'CA69347A06C0E111B1ACAB011B89CBC72497260D5323BCC147FA4C274A6B95C9',
  'atlases/wakeFromSleep@2x.png': 'DB03C9DAAFC9CF4E3C0D1A09553520EE4734BD6608E81BA53BD8CA8D6D3E9380',
  'atlases/wakeFromSleep@1x.json': '5366AC5857FE7BECC5B312BD0E44611C1AEB642953BD67E3C7E5F220EBF4FE42',
  'atlases/wakeFromSleep@2x.json': '19E5CF8CBE353C3F18C6600A17B78AD699F8751DC149C0D65B5B439C2B3474A6',
};

describe('Glitch asset freeze (do not regenerate / recolor)', () => {
  it('every Glitch runtime file exists and matches frozen SHA-256', () => {
    for (const f of GLITCH_FILES) {
      const path = join(GLITCH_ROOT, f);
      expect(existsSync(path), f).toBe(true);
      const hash = sha256File(f);
      expect(hash, f).toBe(GLITCH_SHA256_FREEZE[f]);
    }
  });

  it('characterId remains vibespace-axolotl-glitch', () => {
    const man = getPetAnimationsManifest('glitch');
    expect(man.characterId).toBe('vibespace-axolotl-glitch');
  });

  it('all eight Glitch states resolve with expected frame counts and fps', () => {
    const expected: Record<string, { frames: number; fps: number }> = {
      welcome: { frames: 60, fps: 7.5 },
      idlePrimary: { frames: 48, fps: 5.9 },
      idleFun: { frames: 60, fps: 7.5 },
      walkLeft: { frames: 20, fps: 7.2 },
      walkRight: { frames: 20, fps: 7.2 },
      sleepTransition: { frames: 120, fps: 7.0 },
      sleepingLoop: { frames: 40, fps: 4.5 },
      wakeFromSleep: { frames: 8, fps: 12 },
    };
    for (const [id, exp] of Object.entries(expected)) {
      const def = getAnimDef(id as PetAnimId, 'glitch');
      expect(def, id).toBeTruthy();
      expect(def!.frames.length, id).toBe(exp.frames);
      expect(def!.fps, id).toBeCloseTo(exp.fps, 5);
      expect(def!.atlas).toMatch(/^atlases\//);
      expect(def!.atlas).toMatch(/glitch|@1x\.json|atlases\//);
      expect(def!.atlas.toLowerCase()).not.toContain('vibespace-axolotl/');
    }
  });

  it('Glitch atlas paths stay under vibespace-axolotl-glitch', () => {
    const def = getAnimDef('idlePrimary', 'glitch')!;
    expect(def.atlas).toBe('atlases/idlePrimary@1x.json');
    expect(def.atlas2x).toBe('atlases/idlePrimary@2x.json');
  });

  it('shared drag defaults used by Glitch remain unchanged', () => {
    // Do not alter Glitch movement thresholds while fixing click-to-panel.
    expect(DEFAULT_DRAG_VELOCITY_CONFIG.walkEntryPxPerSec).toBe(14);
    expect(DEFAULT_DRAG_VELOCITY_CONFIG.walkExitPxPerSec).toBe(5);
    expect(DEFAULT_DRAG_VELOCITY_CONFIG.hysteresisMs).toBe(100);
    expect(DEFAULT_DRAG_VELOCITY_CONFIG.minWalkHoldMs).toBe(180);
    expect(DEFAULT_DRAG_VELOCITY_CONFIG.stopDelayMs).toBe(160);
    expect(DEFAULT_DRAG_VELOCITY_CONFIG.smoothing).toBe(0.32);
  });

  it('Axo and Glitch texture cache keys cannot collide', async () => {
    const { buildPetTextureCacheKey } = await import('./petTextureCache');
    const axoKey = buildPetTextureCacheKey({
      characterId: 'vibespace-axolotl',
      animationState: 'idlePrimary',
      scale: '1x',
      imageUrl: 'idlePrimary@1x.png',
    });
    const glitchKey = buildPetTextureCacheKey({
      characterId: 'vibespace-axolotl-glitch',
      animationState: 'idlePrimary',
      scale: '1x',
      imageUrl: 'idlePrimary@1x.png',
    });
    expect(axoKey).not.toBe(glitchKey);
    expect(axoKey).toContain('vibespace-axolotl|');
    expect(glitchKey).toContain('vibespace-axolotl-glitch|');
  });
});
