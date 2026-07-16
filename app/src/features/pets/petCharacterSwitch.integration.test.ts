/**
 * Integration: planCharacterSwitch unload list is fed into real PixiAtlasPlayer
 * unloadCharacterCache, which must call Assets.unload for each prior glitch URL.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const unloadSpy = vi.fn(async () => undefined);
const loadSpy = vi.fn(async () => ({
  width: 128,
  height: 128,
  source: { scaleMode: 'nearest' },
  destroy() {},
}));

vi.mock('pixi.js', () => {
  class FakeTicker {
    add() {}
    remove() {}
  }
  class FakeApplication {
    canvas = document.createElement('canvas');
    stage = { addChild: vi.fn() };
    ticker = new FakeTicker();
    renderer = { background: { alpha: 0 }, resize() {} };
    async init() {}
    destroy() {}
  }
  class FakeSprite {
    texture: unknown = null;
    anchor = { set: vi.fn() };
    scale = { set: vi.fn() };
    x = 0;
    y = 0;
    destroy() {}
  }
  return {
    Application: FakeApplication,
    Assets: {
      load: loadSpy,
      unload: unloadSpy,
    },
    Rectangle: class {
      constructor(
        public x: number,
        public y: number,
        public w: number,
        public h: number,
      ) {}
    },
    Sprite: FakeSprite,
    Texture: class {
      width = 128;
      height = 128;
      source = { scaleMode: 'nearest' };
      destroy() {}
    },
    SCALE_MODES: { NEAREST: 'nearest', LINEAR: 'linear' },
  };
});

describe('character switch cache eviction (shipped path)', () => {
  afterEach(() => {
    unloadSpy.mockClear();
    loadSpy.mockClear();
    document.body.innerHTML = '';
  });

  it(
    'unloadCharacterCache receives glitch imageUrls from planCharacterSwitch',
    async () => {
      const { planCharacterSwitch } = await import('./petCharacterSwitch');
      const { PixiAtlasPlayer } = await import('./pixiAtlasPlayer');
      const { resolveAtlasUrls, getAnimDef } = await import('./petManifest');

      const glitchUrl = resolveAtlasUrls(getAnimDef('idlePrimary', 'glitch')!, 'glitch').imageUrl;
      expect(glitchUrl.toLowerCase()).toContain('glitch');

      // Simulate prior load of glitch skin
      const player = new PixiAtlasPlayer();
      const host = document.createElement('div');
      document.body.appendChild(host);
      await player.init(host, { displaySize: 128, backgroundAlpha: 0 });

      // Manually set last loaded URL as if glitch atlas was loaded
      // (load() needs fetch; we seed via unloadCharacterCache tracking by loading axo after plan)
      const plan = planCharacterSwitch('glitch', 'axo', 'idlePrimary', [glitchUrl], 1);
      expect(plan.imageUrlsToUnload.some((u) => u.toLowerCase().includes('glitch'))).toBe(true);
      expect(plan.nextAtlas.imageUrl.toLowerCase()).not.toContain('glitch');

      // This is the exact call PetOverlay makes on characterId change.
      await player.unloadCharacterCache(plan.imageUrlsToUnload);

      const unloaded = unloadSpy.mock.calls.map((c) => String((c as unknown[])[0] ?? ''));
      expect(unloaded.length).toBeGreaterThan(0);
      expect(unloaded.some((u) => u.toLowerCase().includes('glitch'))).toBe(true);

      player.dispose();
    },
    20_000,
  );
});
