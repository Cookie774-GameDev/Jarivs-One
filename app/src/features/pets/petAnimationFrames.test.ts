/**
 * Assert Axo (and Glitch) atlases have multiple unique frames for animated states.
 * Frozen Axo was caused by near-identical stamped frames.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

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

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(path: string): { w: number; h: number; pixels: Buffer } {
  const buf = readFileSync(path);
  let offset = 8;
  let w = 0;
  let h = 0;
  const idats: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    offset += 12 + len;
  }
  const bpp = 4;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idats));
  const pixels = Buffer.alloc(w * h * bpp);
  let src = 0;
  for (let y = 0; y < h; y += 1) {
    const filter = raw[src++];
    const row = y * stride;
    const prev = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? pixels[row + x - bpp] : 0;
      const up = y > 0 ? pixels[prev + x] : 0;
      const upLeft = y > 0 && x >= bpp ? pixels[prev + x - bpp] : 0;
      const v = raw[src++];
      if (filter === 0) pixels[row + x] = v;
      else if (filter === 1) pixels[row + x] = (v + left) & 0xff;
      else if (filter === 2) pixels[row + x] = (v + up) & 0xff;
      else if (filter === 3) pixels[row + x] = (v + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) pixels[row + x] = (v + paeth(left, up, upLeft)) & 0xff;
      else throw new Error(`filter ${filter}`);
    }
  }
  return { w, h, pixels };
}

function frameHash(
  png: { w: number; pixels: Buffer },
  fr: { x: number; y: number; w: number; h: number },
): string {
  // Sample every 4th pixel in cell for stable uniqueness
  const parts: number[] = [];
  for (let dy = 0; dy < fr.h; dy += 4) {
    for (let dx = 0; dx < fr.w; dx += 4) {
      const i = ((fr.y + dy) * png.w + (fr.x + dx)) * 4;
      parts.push(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], png.pixels[i + 3]);
    }
  }
  // FNV-1a-ish
  let h = 2166136261;
  for (const b of parts) {
    h ^= b;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function cropFrame(
  png: { w: number; h: number; pixels: Buffer },
  fr: { x: number; y: number; w: number; h: number },
): { w: number; h: number; pixels: Buffer } {
  const pixels = Buffer.alloc(fr.w * fr.h * 4);
  for (let y = 0; y < fr.h; y += 1) {
    const srcStart = ((fr.y + y) * png.w + fr.x) * 4;
    const dstStart = y * fr.w * 4;
    png.pixels.copy(pixels, dstStart, srcStart, srcStart + fr.w * 4);
  }
  return { w: fr.w, h: fr.h, pixels };
}

/**
 * Translation/scale-invariant alpha silhouette. A static master shifted or
 * uniformly scaled between cells produces almost the same signature, while
 * real leg/tail/face/sleep pose changes do not.
 */
function normalizedAlpha(frame: { w: number; h: number; pixels: Buffer }): Uint8Array {
  let minX = frame.w;
  let minY = frame.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < frame.h; y += 1) {
    for (let x = 0; x < frame.w; x += 1) {
      if (frame.pixels[(y * frame.w + x) * 4 + 3] < 128) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  expect(maxX, 'opaque silhouette').toBeGreaterThanOrEqual(minX);
  expect(maxY, 'opaque silhouette').toBeGreaterThanOrEqual(minY);
  const out = new Uint8Array(32 * 32);
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const sx = Math.min(maxX, minX + Math.floor(((x + 0.5) * width) / 32));
      const sy = Math.min(maxY, minY + Math.floor(((y + 0.5) * height) / 32));
      out[y * 32 + x] = frame.pixels[(sy * frame.w + sx) * 4 + 3] >= 128 ? 255 : 0;
    }
  }
  return out;
}

function silhouetteDistance(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let changed = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) changed += 1;
  }
  return changed / a.length;
}

function seamMetrics(
  first: { w: number; h: number; pixels: Buffer },
  last: { w: number; h: number; pixels: Buffer },
): { meanRgbDifference: number; alphaMismatchRatio: number } {
  expect(first.w).toBe(last.w);
  expect(first.h).toBe(last.h);
  let rgbDifference = 0;
  let rgbSamples = 0;
  let alphaMismatches = 0;
  const pixelCount = first.w * first.h;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const firstOpaque = first.pixels[offset + 3] >= 128;
    const lastOpaque = last.pixels[offset + 3] >= 128;
    if (firstOpaque !== lastOpaque) alphaMismatches += 1;
    if (!firstOpaque && !lastOpaque) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      rgbDifference += Math.abs(first.pixels[offset + channel] - last.pixels[offset + channel]);
      rgbSamples += 1;
    }
  }
  return {
    meanRgbDifference: rgbSamples > 0 ? rgbDifference / rgbSamples : 0,
    alphaMismatchRatio: alphaMismatches / pixelCount,
  };
}

const ANIMATED = [
  'welcome',
  'idlePrimary',
  'idleFun',
  'walkLeft',
  'walkRight',
  'sleepTransition',
  'sleepingLoop',
  'wakeFromSleep',
] as const;

describe('Axo atlas visual uniqueness (frozen-sprite regression)', () => {
  it('each animated state has multiple unique texture cells', () => {
    for (const anim of ANIMATED) {
      const jsonPath = join(charactersRoot, 'vibespace-axolotl/atlases', `${anim}@1x.json`);
      const pngPath = join(charactersRoot, 'vibespace-axolotl/atlases', `${anim}@1x.png`);
      expect(existsSync(jsonPath), jsonPath).toBe(true);
      const atlas = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
      };
      const png = decodePng(pngPath);
      const hashes = new Set<string>();
      const names = Object.keys(atlas.frames);
      for (const name of names) {
        hashes.add(frameHash(png, atlas.frames[name].frame));
      }
      // Require real motion: at least 8 unique cells, or half of frames for short clips
      const minUnique = Math.min(8, Math.max(2, Math.floor(names.length / 2)));
      expect(
        hashes.size,
        `${anim}: unique=${hashes.size} of ${names.length} (need >= ${minUnique})`,
      ).toBeGreaterThanOrEqual(minUnique);
    }
  });

  it('preserves articulated source-video poses instead of shifting one static master', () => {
    const master = decodePng(
      join(charactersRoot, 'vibespace-axolotl/previews/canonical-master-128.png'),
    );
    const masterSilhouette = normalizedAlpha(master);
    const minimumPoseDistance: Record<(typeof ANIMATED)[number], number> = {
      welcome: 0.18,
      // Breathing is intentionally restrained, but still exceeds the old
      // translation-only master (0.049 on this normalized metric).
      idlePrimary: 0.055,
      idleFun: 0.12,
      walkLeft: 0.15,
      walkRight: 0.15,
      sleepTransition: 0.12,
      sleepingLoop: 0.1,
      wakeFromSleep: 0.1,
    };

    for (const anim of ANIMATED) {
      const jsonPath = join(charactersRoot, 'vibespace-axolotl/atlases', `${anim}@1x.json`);
      const pngPath = join(charactersRoot, 'vibespace-axolotl/atlases', `${anim}@1x.png`);
      const atlas = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
      };
      const sheet = decodePng(pngPath);
      const distances = Object.values(atlas.frames).map(({ frame }) =>
        silhouetteDistance(normalizedAlpha(cropFrame(sheet, frame)), masterSilhouette),
      );
      const maxDistance = Math.max(...distances);
      expect(
        maxDistance,
        `${anim}: max normalized pose distance=${maxDistance.toFixed(3)}; static-master rebuild detected`,
      ).toBeGreaterThanOrEqual(minimumPoseDistance[anim]);
    }
  });

  it('closes the stable seated sleeping loop without a visible seam spike', () => {
    const atlas = JSON.parse(
      readFileSync(
        join(charactersRoot, 'vibespace-axolotl/atlases/sleepingLoop@1x.json'),
        'utf8',
      ),
    ) as {
      frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    };
    const sheet = decodePng(
      join(charactersRoot, 'vibespace-axolotl/atlases/sleepingLoop@1x.png'),
    );
    const entries = Object.values(atlas.frames);
    const first = cropFrame(sheet, entries[0].frame);
    const last = cropFrame(sheet, entries[entries.length - 1].frame);
    const seam = seamMetrics(first, last);
    expect(seam.meanRgbDifference, 'sleepingLoop RGB seam').toBeLessThanOrEqual(15);
    expect(seam.alphaMismatchRatio, 'sleepingLoop alpha seam').toBeLessThanOrEqual(0.012);
  });
});
