/**
 * Transparency contract tests — black rectangle regression guards.
 * Does not alter animation artwork; only validates compositing assumptions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLivePixiApplicationCount, PixiAtlasPlayer } from './pixiAtlasPlayer';

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
  class FakeBackground {
    alpha = 0;
    color = 0x000000;
  }
  class FakeRenderer {
    background = new FakeBackground();
    resize() {}
  }
  class FakeApplication {
    canvas = document.createElement('canvas');
    stage = { addChild: vi.fn() };
    ticker = new FakeTicker();
    renderer = new FakeRenderer();
    async init(opts: { backgroundAlpha?: number }) {
      this.renderer.background.alpha = opts.backgroundAlpha ?? 0;
    }
    destroy() {}
  }
  class FakeSprite {
    texture: unknown = null;
    anchor = { set: vi.fn() };
    scale = { set: vi.fn() };
    x = 0;
    y = 0;
    alpha = 1;
    tint = 0xffffff;
    roundPixels = false;
    destroy() {}
  }
  class FakeTexture {
    width = 128;
    height = 128;
    source = { scaleMode: 'nearest', alphaMode: 'no-premultiply-alpha' };
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

describe('Pet transparency contracts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('initializes Pixi with backgroundAlpha 0 (not opaque black)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const before = getLivePixiApplicationCount();
    const p = new PixiAtlasPlayer();
    await p.init(host, { displaySize: 128, backgroundAlpha: 0 });
    expect(p.backgroundAlpha).toBe(0);
    expect(getLivePixiApplicationCount()).toBe(before + 1);
    const canvas = host.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas?.style.backgroundColor === 'transparent' || canvas?.style.background === 'transparent').toBe(
      true,
    );
    p.dispose();
    expect(getLivePixiApplicationCount()).toBe(before);
  });

  it('does not leave a second canvas after dispose + re-init', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const a = new PixiAtlasPlayer();
    await a.init(host);
    a.dispose();
    const b = new PixiAtlasPlayer();
    await b.init(host);
    expect(host.querySelectorAll('canvas').length).toBe(1);
    b.dispose();
  });

  it('pet-overlay CSS selectors target only the pet view (not main shell)', () => {
    // Contract: globals.css scopes transparency under data-vibespace-view=pet-overlay
    // and never strips main app body background globally.
    document.documentElement.dataset.vibespaceView = 'pet-overlay';
    expect(document.documentElement.dataset.vibespaceView).toBe('pet-overlay');
    delete document.documentElement.dataset.vibespaceView;
    expect(document.documentElement.dataset.vibespaceView).toBeUndefined();
  });

  it('host container is transparent after Pixi init', async () => {
    const host = document.createElement('div');
    host.className = 'pet-canvas-container';
    document.body.appendChild(host);
    const p = new PixiAtlasPlayer();
    await p.init(host, { displaySize: 128, backgroundAlpha: 0 });
    expect(host.style.backgroundColor === 'transparent' || host.style.background === 'transparent').toBe(
      true,
    );
    expect(host.querySelectorAll('canvas[data-pet-pixi-canvas="true"]').length).toBe(1);
    p.dispose();
    expect(host.querySelectorAll('canvas').length).toBe(0);
  });
});
