/**
 * Picker portrait alpha guards: no residual screenshot UI chrome in top band.
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
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  let offset = 8;
  let w = 0;
  let h = 0;
  let colorType = 0;
  const idats: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    offset += 12 + len;
  }
  expect(colorType).toBe(6);
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
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        pixels[row + x] = (v + pr) & 0xff;
      } else throw new Error(`filter ${filter}`);
    }
  }
  return { w, h, pixels };
}

function countTopBandFlatGray(png: { w: number; h: number; pixels: Buffer }, band = 32): number {
  let n = 0;
  const yMax = Math.min(band, png.h);
  for (let y = 0; y < yMax; y += 1) {
    for (let x = 0; x < png.w; x += 1) {
      const i = (y * png.w + x) * 4;
      const r = png.pixels[i];
      const g = png.pixels[i + 1];
      const b = png.pixels[i + 2];
      const a = png.pixels[i + 3];
      if (a <= 200) continue;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const mean = (r + g + b) / 3;
      // Flat mid-gray UI residual (screenshot chrome)
      if (mx - mn < 20 && mean > 70 && mean < 190) n += 1;
    }
  }
  return n;
}

describe('Pet picker portrait transparency', () => {
  it('Glitch portrait has transparent corners and no top-band gray UI residual', () => {
    const path = join(charactersRoot, 'vibespace-axolotl-glitch/previews/portrait.png');
    expect(existsSync(path)).toBe(true);
    const png = decodePng(path);
    // corners transparent
    for (const [x, y] of [
      [0, 0],
      [png.w - 1, 0],
      [0, png.h - 1],
      [png.w - 1, png.h - 1],
    ] as const) {
      const i = (y * png.w + x) * 4;
      expect(png.pixels[i + 3], `corner ${x},${y}`).toBe(0);
    }
    const residual = countTopBandFlatGray(png, 32);
    expect(residual, `top-band flat gray residual=${residual}`).toBeLessThan(50);
  });

  it('Axo portrait has transparent corners', () => {
    const path = join(charactersRoot, 'vibespace-axolotl/previews/portrait.png');
    expect(existsSync(path)).toBe(true);
    const png = decodePng(path);
    for (const [x, y] of [
      [0, 0],
      [png.w - 1, 0],
      [0, png.h - 1],
      [png.w - 1, png.h - 1],
    ] as const) {
      const i = (y * png.w + x) * 4;
      expect(png.pixels[i + 3], `corner ${x},${y}`).toBe(0);
    }
  });
});
