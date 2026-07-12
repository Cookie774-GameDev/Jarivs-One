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
  const buf = readFileSync(join(GLITCH_ROOT, rel));
  return createHash('sha256').update(buf).digest('hex').toUpperCase();
}

/** Frozen before this session's Axo/panel work — regenerating Glitch must fail tests. */
const GLITCH_SHA256_FREEZE: Record<string, string> = {
  'animations.json': 'F6C8F3F897825D70E48A70FDCCC7C10FF6C9C3D49700BC99622212A90BD7D9C5',
  'atlases/welcome@1x.png': '65AAB58D7E35A64CB56A7B9887AFDEB576A609648BD61F8C1F84507973DC9738',
  'atlases/welcome@2x.png': '81C291971E306843786D72783EE176B872267617A7C4BF0747326C17FE380CF3',
  'atlases/welcome@1x.json': 'F41EB7428D3FE573078A3FE0FFD579046EC7290E5CD930675B2641A1E8AB0A13',
  'atlases/welcome@2x.json': 'C7448A502C76419B9C2E9F5270D2432D5F74371B4562D431689E739E1E7E1173',
  'atlases/idlePrimary@1x.png': '5AE19F1081E0B3010AC15C8437AD41EA99D47F9E14C92531ABFDBEFAAE2E1CA6',
  'atlases/idlePrimary@2x.png': '305CFEEF5F54E5F93B14C95F866778C631BB22736F45CC94190B756D41DA2E7C',
  'atlases/idlePrimary@1x.json': '626EDCAC0D8ABC2C2480FBE894B88C369282B8C2B6AAE88DFA6E31977500D919',
  'atlases/idlePrimary@2x.json': 'E6F5A75D6B3663491B95F5428865498A8B7ABACFF0FF87315628B1B6C1DECACC',
  'atlases/idleFun@1x.png': '3EC5D05054FE5F008AFE3440E67A40BB90AE9F2B95842EF0A901E7989FD492C9',
  'atlases/idleFun@2x.png': '77C4940E3C2EDFDF3DF615BFF42AEC5646F143F4D0EFC259A57FDF78B20075AF',
  'atlases/idleFun@1x.json': '468B233400671F0A979DAD691D7FED735D03744604C587707D7A79295A684D12',
  'atlases/idleFun@2x.json': 'B8E44EBD8E3E6BBFC6DA0B4B0ECD785239ED7F84AB7776E5986E581FE907B685',
  'atlases/walkLeft@1x.png': '9716C3B7EC2D53B38B158C5BDA058071AE7618786B9F71277D4D5BCD80C1D9DF',
  'atlases/walkLeft@2x.png': 'A64CFD2A2B7E258ECE51CA674F8356C7F2567399E6307B0CB973381645D1DEB5',
  'atlases/walkLeft@1x.json': '7BEA9D57DC8A29047770822B408DBAF747B7D09784436BF86CA93562329C6748',
  'atlases/walkLeft@2x.json': '41E5F72A03A845DA8404D94D2E0DF4CAE84396559EBF356E797BE94B6C7CE709',
  'atlases/walkRight@1x.png': '9D16FFEC0DE1AB611370594ED889ABD6BC8715006BD5DCDAB433CDD0A8324861',
  'atlases/walkRight@2x.png': 'DA8E42A9E5713BAFE8A09FE1E40169B02D48DD0CDAFAE2C03316405D0EFB5C52',
  'atlases/walkRight@1x.json': 'EAD193590AA5E6CB7145353D321773941A0B755AA26377FFF6CC1C28C0860C09',
  'atlases/walkRight@2x.json': '215D8C3E788583315FE596DA2DAABF029FBC034AA01BED805391A301DA29A3BF',
  'atlases/sleepTransition@1x.png': '152489E76B446D4D1BDBBA020B6B2DB02073E38D7C7582EAFBB72460C2782E6D',
  'atlases/sleepTransition@2x.png': 'E716EFAAFD0ED288BCE332DAA113BE16692484A16F02FFC96AF2803B6CED1357',
  'atlases/sleepTransition@1x.json': 'F29E7046706A7C937DBC13F5B40AC82CF06EA90220475733E1B26F0C322AF525',
  'atlases/sleepTransition@2x.json': 'F1EBFCDA0E88B0410DDD85EE6ED6BC725F24CA18E043DAB6505E142776CBC6A1',
  'atlases/sleepingLoop@1x.png': 'B2ABB48D68991D2E6F51D8278167C5BDFCBB40406FDB39076331C5E8DA219500',
  'atlases/sleepingLoop@2x.png': '24634F88E477164194E77EC8F0FB4355C0812052E615F7A8E6B93B00C33EF92E',
  'atlases/sleepingLoop@1x.json': '755AD3B05CE7510DF5D8A15A1753EF8A37E299265460E69EB35595AED735ACE1',
  'atlases/sleepingLoop@2x.json': '515CE6422549412AF0FCD0C34360A66C61A5FCE25CA531C32ED2D881F8684493',
  'atlases/wakeFromSleep@1x.png': 'CA69347A06C0E111B1ACAB011B89CBC72497260D5323BCC147FA4C274A6B95C9',
  'atlases/wakeFromSleep@2x.png': 'DB03C9DAAFC9CF4E3C0D1A09553520EE4734BD6608E81BA53BD8CA8D6D3E9380',
  'atlases/wakeFromSleep@1x.json': 'D44ACC131F52391255ABAA02F0196105B11A432DA4C756DF1391C1A0EFAA8FAF',
  'atlases/wakeFromSleep@2x.json': 'F1287203767BC445D7EFC50004BF38DB057AE8F4CE7AB6B6899FF90A4E08B0A3',
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
