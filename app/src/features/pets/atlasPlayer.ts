/**
 * Canvas 2D sprite-atlas player (PixiJS-compatible atlas JSON format).
 * Nearest-neighbor sampling for crisp pixel art.
 */

export interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
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

export class AtlasPlayer {
  private img: HTMLImageElement | null = null;
  private atlas: AtlasJson | null = null;
  private frameNames: string[] = [];
  private fps = 12;
  private loop = true;
  private index = 0;
  private accum = 0;
  private done = false;
  private onComplete: (() => void) | null = null;

  async load(atlasUrl: string, imageUrl: string): Promise<void> {
    const res = await fetch(atlasUrl);
    if (!res.ok) throw new Error(`atlas fetch failed: ${atlasUrl}`);
    this.atlas = (await res.json()) as AtlasJson;
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.img = img;
        resolve();
      };
      img.onerror = () => reject(new Error(`image load failed: ${imageUrl}`));
      img.src = imageUrl;
    });
  }

  setAnimation(meta: AnimPlaybackMeta, onComplete?: () => void): void {
    this.frameNames = meta.frames.slice();
    this.fps = meta.fps > 0 ? meta.fps : 12;
    this.loop = meta.loop && !meta.oneShot;
    this.index = 0;
    this.accum = 0;
    this.done = false;
    this.onComplete = onComplete ?? null;
  }

  /**
   * Advance clock by dtMs. Returns true if animation completed (one-shot).
   */
  update(dtMs: number): boolean {
    if (this.done || this.frameNames.length === 0) return this.done;
    const frameMs = 1000 / this.fps;
    this.accum += dtMs;
    while (this.accum >= frameMs) {
      this.accum -= frameMs;
      if (this.index + 1 >= this.frameNames.length) {
        if (this.loop) {
          this.index = 0;
        } else {
          this.done = true;
          this.onComplete?.();
          return true;
        }
      } else {
        this.index += 1;
      }
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    if (!this.img || !this.atlas || this.frameNames.length === 0) return;
    const name = this.frameNames[Math.min(this.index, this.frameNames.length - 1)];
    const entry = this.atlas.frames[name];
    if (!entry) return;
    const { x, y, w, h } = entry.frame;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(dx, dy, dw, dh);
    ctx.drawImage(this.img, x, y, w, h, dx, dy, dw, dh);
  }

  get currentFrameName(): string | null {
    return this.frameNames[this.index] ?? null;
  }

  dispose(): void {
    this.img = null;
    this.atlas = null;
    this.frameNames = [];
    this.onComplete = null;
  }
}
