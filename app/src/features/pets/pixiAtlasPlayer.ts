/**
 * Real PixiJS Application-based atlas animation player.
 * Loads Pixi-compatible JSON atlases + PNG sheets. Never decodes MP4.
 * Nearest-neighbor sampling, hard-alpha transparent canvas, bottom-center anchors.
 */

import {
  Application,
  Assets,
  Rectangle,
  Sprite,
  Texture,
  SCALE_MODES,
  type TextureSource,
} from 'pixi.js';

export interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize?: { x: number; y: number; w: number; h: number };
  sourceSize?: { w: number; h: number };
  trimmed?: boolean;
  rotated?: boolean;
}

export interface AtlasJson {
  frames: Record<string, AtlasFrame>;
  animations?: Record<string, string[]>;
  meta: { image: string; size: { w: number; h: number }; scale?: string };
}

export interface AnimPlaybackMeta {
  frames: string[];
  fps: number;
  loop: boolean;
  oneShot?: boolean;
}

export interface PixiAtlasPlayerOptions {
  /** Logical display size (CSS pixels). */
  displaySize?: number;
  /** Device pixel ratio for @1x vs @2x selection (caller may pass). */
  resolution?: number;
  /** Prefer @2x atlas assets when resolution >= 1.5. */
  prefer2x?: boolean;
  /** Background alpha for the renderer (0 = fully transparent). */
  backgroundAlpha?: number;
}

/** Track live applications so tests can assert single-instance discipline. */
const liveApplications = new WeakSet<Application>();
let liveApplicationCount = 0;

export function getLivePixiApplicationCount(): number {
  return liveApplicationCount;
}

/**
 * PixiJS atlas player: one Application, one Sprite, texture frames from atlas JSON.
 * Destroy fully on dispose (app, textures, ticker listeners).
 */
export class PixiAtlasPlayer {
  private app: Application | null = null;
  private sprite: Sprite | null = null;
  private atlas: AtlasJson | null = null;
  private baseTexture: Texture | null = null;
  private frameTextures = new Map<string, Texture>();
  private frameNames: string[] = [];
  private fps = 12;
  private loop = true;
  private index = 0;
  private accum = 0;
  private done = false;
  private onComplete: (() => void) | null = null;
  private displaySize = 128;
  private destroyed = false;
  private tickerFn: ((ticker: { deltaMS: number }) => void) | null = null;
  private mountEl: HTMLElement | null = null;
  private lastFilter: 'nearest' | 'linear' | null = null;
  private loadGeneration = 0;

  get application(): Application | null {
    return this.app;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  get currentFrameName(): string | null {
    return this.frameNames[this.index] ?? null;
  }

  get textureScaleMode(): 'nearest' | 'linear' | null {
    return this.lastFilter;
  }

  /**
   * Initialize (or re-bind) a single Pixi Application into `host`.
   * Safe to call again with the same host — does not create a second app.
   */
  async init(host: HTMLElement, opts: PixiAtlasPlayerOptions = {}): Promise<void> {
    if (this.destroyed) {
      throw new Error('PixiAtlasPlayer: cannot init after dispose');
    }
    this.displaySize = opts.displaySize ?? 128;
    this.mountEl = host;

    if (this.app) {
      // Already have an application — ensure canvas is in the host once.
      if (this.app.canvas.parentElement !== host) {
        host.replaceChildren(this.app.canvas as HTMLCanvasElement);
      }
      this.resizeToDisplay();
      return;
    }

    const app = new Application();
    await app.init({
      width: this.displaySize,
      height: this.displaySize,
      backgroundAlpha: opts.backgroundAlpha ?? 0,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(2, Math.max(1, opts.resolution ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1))),
      preference: 'webgl',
      // Preserve crisp pixels
      roundPixels: true,
    });

    // Nearest-neighbor default for all textures on this renderer.
    // Pixi v8: set on TextureSource when creating frame textures.
    app.canvas.style.width = `${this.displaySize}px`;
    app.canvas.style.height = `${this.displaySize}px`;
    app.canvas.style.imageRendering = 'pixelated';
    app.canvas.style.display = 'block';
    app.canvas.style.background = 'transparent';
    host.replaceChildren(app.canvas as HTMLCanvasElement);

    const sprite = new Sprite();
    sprite.roundPixels = true;
    sprite.anchor.set(0.5, 1); // bottom-center
    sprite.x = Math.round(this.displaySize / 2);
    sprite.y = Math.round(this.displaySize);
    app.stage.addChild(sprite);

    this.tickerFn = (ticker) => {
      this.update(ticker.deltaMS);
    };
    app.ticker.add(this.tickerFn);

    this.app = app;
    this.sprite = sprite;
    liveApplications.add(app);
    liveApplicationCount += 1;
  }

  private resizeToDisplay(): void {
    if (!this.app) return;
    this.app.renderer.resize(this.displaySize, this.displaySize);
    if (this.sprite) {
      this.sprite.x = Math.round(this.displaySize / 2);
      this.sprite.y = Math.round(this.displaySize);
    }
  }

  /**
   * Load atlas JSON + image. Replaces prior atlas textures.
   */
  async load(atlasUrl: string, imageUrl: string): Promise<void> {
    if (this.destroyed) throw new Error('PixiAtlasPlayer disposed');
    if (!this.app) throw new Error('PixiAtlasPlayer.init() required before load');

    const gen = ++this.loadGeneration;
    const res = await fetch(atlasUrl);
    if (!res.ok) throw new Error(`atlas fetch failed: ${atlasUrl}`);
    const atlas = (await res.json()) as AtlasJson;
    if (gen !== this.loadGeneration) return;

    // Load full sheet via Assets (or ImageBitmap fallback path)
    const base = (await Assets.load({
      src: imageUrl,
      data: { scaleMode: SCALE_MODES.NEAREST },
    })) as Texture;
    if (gen !== this.loadGeneration) {
      base.destroy(true);
      return;
    }

    this.clearFrameTextures();
    this.baseTexture = base;
    this.atlas = atlas;
    this.applyNearestFilter(base);

    for (const [name, entry] of Object.entries(atlas.frames)) {
      const { x, y, w, h } = entry.frame;
      const frame = new Texture({
        source: base.source,
        frame: new Rectangle(x, y, w, h),
      });
      this.applyNearestFilter(frame);
      this.frameTextures.set(name, frame);
    }
  }

  private applyNearestFilter(tex: Texture): void {
    const source = tex.source as TextureSource & { scaleMode?: string };
    if (source && 'scaleMode' in source) {
      source.scaleMode = SCALE_MODES.NEAREST;
    }
    this.lastFilter = 'nearest';
  }

  private clearFrameTextures(): void {
    for (const t of this.frameTextures.values()) {
      try {
        t.destroy(false);
      } catch {
        /* ignore */
      }
    }
    this.frameTextures.clear();
    if (this.baseTexture) {
      try {
        this.baseTexture.destroy(true);
      } catch {
        /* ignore */
      }
      this.baseTexture = null;
    }
  }

  setAnimation(meta: AnimPlaybackMeta, onComplete?: () => void): void {
    this.frameNames = meta.frames.slice();
    this.fps = meta.fps > 0 ? meta.fps : 12;
    this.loop = meta.loop && !meta.oneShot;
    this.index = 0;
    this.accum = 0;
    this.done = false;
    this.onComplete = onComplete ?? null;
    this.applyCurrentFrame();
  }

  /**
   * Advance animation clock. Also invoked by Pixi ticker.
   * Returns true if a one-shot completed.
   */
  update(dtMs: number): boolean {
    if (this.done || this.frameNames.length === 0 || this.destroyed) return this.done;
    const frameMs = 1000 / this.fps;
    this.accum += dtMs;
    let advanced = false;
    while (this.accum >= frameMs) {
      this.accum -= frameMs;
      advanced = true;
      if (this.index + 1 >= this.frameNames.length) {
        if (this.loop) {
          this.index = 0;
        } else {
          this.done = true;
          this.onComplete?.();
          this.applyCurrentFrame();
          return true;
        }
      } else {
        this.index += 1;
      }
    }
    if (advanced) this.applyCurrentFrame();
    return this.done;
  }

  private applyCurrentFrame(): void {
    if (!this.sprite || this.frameNames.length === 0) return;
    const name = this.frameNames[Math.min(this.index, this.frameNames.length - 1)];
    const tex = this.frameTextures.get(name);
    if (!tex) return;
    this.sprite.texture = tex;

    // Fit frame into display with integer scale; preserve bottom-center anchor.
    const tw = tex.width || 1;
    const th = tex.height || 1;
    const scale = Math.max(1, Math.floor(this.displaySize / Math.max(tw, th)));
    // If frame already matches display (128), scale=1; otherwise upscale by integers only.
    const fit = Math.min(this.displaySize / tw, this.displaySize / th);
    const s = Number.isFinite(fit) && fit > 0 ? fit : 1;
    // Prefer crisp integer scale when close; else exact fit without subpixel drift via round.
    const use = Math.abs(s - Math.round(s)) < 0.01 ? Math.round(s) : s;
    this.sprite.scale.set(use);
    this.sprite.x = Math.round(this.displaySize / 2);
    this.sprite.y = Math.round(this.displaySize);

    // Trimmed-frame offset: spriteSourceSize x/y shifts the draw origin within sourceSize.
    const entry = this.atlas?.frames[name];
    if (entry?.trimmed && entry.spriteSourceSize && entry.sourceSize) {
      const ox = entry.spriteSourceSize.x;
      const oy = entry.spriteSourceSize.y;
      // With bottom-center anchor on the texture itself, apply trim offset in texture space.
      this.sprite.x = Math.round(this.displaySize / 2 + (ox + entry.frame.w / 2 - entry.sourceSize.w / 2) * use);
      this.sprite.y = Math.round(this.displaySize + (oy + entry.frame.h - entry.sourceSize.h) * use);
    }
  }

  /** Select atlas path by DPR: prefer2x when resolution >= 1.5. */
  static selectAtlasScale(
    def: { atlas: string; atlas2x?: string },
    devicePixelRatio: number,
  ): { atlasPath: string; scale: '1x' | '2x' } {
    if (def.atlas2x && devicePixelRatio >= 1.5) {
      return { atlasPath: def.atlas2x, scale: '2x' };
    }
    return { atlasPath: def.atlas, scale: '1x' };
  }

  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.onComplete = null;
    this.frameNames = [];
    this.atlas = null;

    if (this.app && this.tickerFn) {
      try {
        this.app.ticker.remove(this.tickerFn);
      } catch {
        /* ignore */
      }
    }
    this.tickerFn = null;
    this.clearFrameTextures();

    if (this.sprite) {
      try {
        this.sprite.destroy();
      } catch {
        /* ignore */
      }
      this.sprite = null;
    }

    if (this.app) {
      liveApplications.delete(this.app);
      liveApplicationCount = Math.max(0, liveApplicationCount - 1);
      try {
        this.app.destroy(true, { children: true, texture: true });
      } catch {
        /* ignore */
      }
      this.app = null;
    }

    if (this.mountEl) {
      this.mountEl.replaceChildren();
      this.mountEl = null;
    }
  }
}

/** Back-compat alias used by older imports / tests that still say AtlasPlayer. */
export { PixiAtlasPlayer as AtlasPlayer };
