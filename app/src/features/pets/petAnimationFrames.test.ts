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
});
