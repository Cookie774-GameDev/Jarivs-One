/**
 * Assert displayed texture/frame identifiers change over time for each
 * animated Axo state — not only that the state *name* changes.
 */
import { describe, expect, it, vi } from 'vitest';

// Mock pixi.js Application for jsdom (same pattern as atlasPlayer.test.ts).
vi.mock('pixi.js', async () => {
  class FakeTicker {
    fns: Array<(t: { deltaMS: number }) => void> = [];
    add(fn: (t: { deltaMS: number }) => void) {
      this.fns.push(fn);
    }
    remove(fn: (t: { deltaMS: number }) => void) {
      this.fns = this.fns.filter((f) => f !== fn);
    }
  }
  class FakeRenderer {
    background = { alpha: 0, color: 0x000000 };
    resize() {}
  }
  class FakeApplication {
    canvas = document.createElement('canvas');
    stage = { addChild: vi.fn() };
    ticker = new FakeTicker();
    renderer = new FakeRenderer();
    async init() {}
    destroy() {}
  }
  class FakeSprite {
    texture: unknown = null;
    anchor = { set: vi.fn() };
    scale = { set: vi.fn() };
    x = 0;
    y = 0;
    roundPixels = false;
    destroy() {}
  }
  class FakeTexture {
    width = 128;
    height = 128;
    source = { scaleMode: 'nearest' };
    destroy() {}
  }
  return {
    Application: FakeApplication,
    Assets: {
      load: async () => new FakeTexture(),
      unload: async () => undefined,
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
    Texture: class extends FakeTexture {
      constructor(_opts?: unknown) {
        super();
      }
    },
    SCALE_MODES: { NEAREST: 'nearest', LINEAR: 'linear' },
  };
});

import { PixiAtlasPlayer } from './pixiAtlasPlayer';
import { getAnimDef, getPetAnimationsManifest } from './petManifest';
import type { PetAnimId } from './petStateMachine';

const ANIMATED: PetAnimId[] = [
  'welcome',
  'idlePrimary',
  'idleFun',
  'walkLeft',
  'walkRight',
  'sleepTransition',
  'sleepingLoop',
  'wakeFromSleep',
];

describe('Axo animation playback advances frames (texture identity)', () => {
  it('manifest lists all eight animated states with multi-frame lists', () => {
    const man = getPetAnimationsManifest('axo');
    expect(man.characterId).toBe('vibespace-axolotl');
    for (const id of ANIMATED) {
      const def = man.states[id];
      expect(def, id).toBeTruthy();
      expect(def.frames.length, id).toBeGreaterThanOrEqual(2);
      expect(new Set(def.frames).size, `${id} unique frame names`).toBeGreaterThanOrEqual(2);
      expect(def.atlas).toMatch(/atlases\//);
      expect(def.atlas).not.toMatch(/glitch/i);
    }
  });

  it('PixiAtlasPlayer renders at least two distinct frame ids per animated state', async () => {
    const host = document.createElement('div');
    const player = new PixiAtlasPlayer();
    await player.init(host, { displaySize: 128, backgroundAlpha: 0 });

    for (const id of ANIMATED) {
      const def = getAnimDef(id, 'axo');
      expect(def, id).toBeTruthy();
      if (!def) continue;

      // Inject stub textures for each frame name (no network).
      const map = (player as unknown as { frameTextures: Map<string, unknown> }).frameTextures;
      map.clear();
      for (const name of def.frames) {
        map.set(name, {
          width: 128,
          height: 128,
          source: { scaleMode: 'nearest' },
          destroy: () => {},
        });
      }
      (player as unknown as { atlas: unknown }).atlas = {
        frames: Object.fromEntries(
          def.frames.map((n, i) => [n, { frame: { x: i * 128, y: 0, w: 128, h: 128 } }]),
        ),
        meta: { image: `${id}.png`, size: { w: def.frames.length * 128, h: 128 } },
      };

      player.setAnimation({
        frames: def.frames,
        fps: Math.max(def.fps, 1),
        loop: def.loop,
        oneShot: def.oneShot,
      });

      const seen = new Set<string>();
      const first = player.currentFrameName;
      if (first) seen.add(first);

      // Advance enough for at least one full frame step at the state's fps.
      const frameMs = 1000 / Math.max(def.fps, 1);
      for (let step = 0; step < Math.min(def.frames.length, 12); step += 1) {
        player.update(frameMs + 1);
        const name = player.currentFrameName;
        if (name) seen.add(name);
      }

      expect(
        seen.size,
        `${id}: expected >=2 distinct frame ids during playback, got ${[...seen].join(',')}`,
      ).toBeGreaterThanOrEqual(2);

      const diag = player.getDiagnostics();
      expect(diag.frameCount).toBe(def.frames.length);
      expect(diag.tickerRunning).toBe(true);
    }

    player.dispose();
  });

  it('setPlaybackFps does not reset frame index (walk phase preserve)', async () => {
    const host = document.createElement('div');
    const player = new PixiAtlasPlayer();
    await player.init(host);
    const frames = ['frame_000', 'frame_001', 'frame_002', 'frame_003'];
    const map = (player as unknown as { frameTextures: Map<string, unknown> }).frameTextures;
    for (const n of frames) {
      map.set(n, { width: 1, height: 1, source: { scaleMode: 'nearest' }, destroy: () => {} });
    }
    player.setAnimation({ frames, fps: 10, loop: true });
    player.update(100); // → frame 1
    player.update(100); // → frame 2
    expect(player.currentFrameIndex).toBe(2);
    player.setPlaybackFps(18);
    expect(player.currentFrameIndex).toBe(2);
    expect(player.currentFrameName).toBe('frame_002');
    player.dispose();
  });
});
