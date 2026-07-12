import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
}

interface AtlasJson {
  frames: Record<string, AtlasFrame>;
  meta: { image: string; format?: string; size: { w: number; h: number } };
}

interface DecodedPng {
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  pixels: Buffer;
}

/**
 * Resolve runtime character assets from the app package root.
 * Avoid import.meta.url → fileURLToPath (Vitest may not use a file: scheme).
 */
function resolveCharactersRoot(): string {
  const candidates = [
    // vitest cwd is usually app/
    resolve(process.cwd(), 'src/assets/pets/characters'),
    // monorepo root cwd
    resolve(process.cwd(), 'app/src/assets/pets/characters'),
    // relative to this test file (features/pets → assets)
    resolve(__dirname, '../../assets/pets/characters'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    `petAtlasAlpha: could not find characters root. Tried:\n${candidates.join('\n')}`,
  );
}

const charactersRoot = resolveCharactersRoot();

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(path: string): DecodedPng {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats: Buffer[] = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      expect(data[10]).toBe(0); // zlib compression
      expect(data[11]).toBe(0); // adaptive filtering
      expect(data[12]).toBe(0); // no interlace
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  expect(bitDepth).toBe(8);
  expect(colorType).toBe(6); // RGBA

  const bpp = 4;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idats));
  const pixels = Buffer.alloc(width * height * bpp);
  let src = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[src++];
    const rowStart = y * stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? pixels[rowStart + x - bpp] : 0;
      const up = y > 0 ? pixels[prevStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? pixels[prevStart + x - bpp] : 0;
      const value = raw[src++];
      if (filter === 0) pixels[rowStart + x] = value;
      else if (filter === 1) pixels[rowStart + x] = (value + left) & 0xff;
      else if (filter === 2) pixels[rowStart + x] = (value + up) & 0xff;
      else if (filter === 3) pixels[rowStart + x] = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) pixels[rowStart + x] = (value + paeth(left, up, upLeft)) & 0xff;
      else throw new Error(`Unsupported PNG filter ${filter} in ${path}`);
    }
  }

  return { width, height, colorType, bitDepth, pixels };
}

function pixelAt(png: DecodedPng, x: number, y: number): [number, number, number, number] {
  const i = (y * png.width + x) * 4;
  return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], png.pixels[i + 3]];
}

function runtimeAtlases(): Array<{ jsonPath: string; pngPath: string }> {
  const pairs: Array<{ jsonPath: string; pngPath: string }> = [];
  for (const character of readdirSync(charactersRoot, { withFileTypes: true })) {
    if (!character.isDirectory()) continue;
    const atlasDir = join(charactersRoot, character.name, 'atlases');
    let names: string[];
    try {
      names = readdirSync(atlasDir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const jsonPath = join(atlasDir, name);
      const pngPath = join(atlasDir, `${name.slice(0, -'.json'.length)}.png`);
      pairs.push({ jsonPath, pngPath });
    }
  }
  return pairs.sort((a, b) => a.jsonPath.localeCompare(b.jsonPath));
}

describe('runtime pet atlas alpha', () => {
  it('keeps runtime atlas PNGs RGBA with transparent sheet and frame corners', () => {
    const atlases = runtimeAtlases();
    expect(atlases.length).toBeGreaterThan(0);

    for (const { jsonPath, pngPath } of atlases) {
      const atlas = JSON.parse(readFileSync(jsonPath, 'utf8')) as AtlasJson;
      const png = decodePng(pngPath);
      expect(png.colorType, basename(pngPath)).toBe(6);
      expect(png.bitDepth, basename(pngPath)).toBe(8);
      expect(atlas.meta.format, basename(jsonPath)).toBe('RGBA8888');
      expect(atlas.meta.image, basename(jsonPath)).toBe(basename(pngPath));
      expect(atlas.meta.size, basename(jsonPath)).toEqual({ w: png.width, h: png.height });

      for (const [x, y] of [
        [0, 0],
        [png.width - 1, 0],
        [0, png.height - 1],
        [png.width - 1, png.height - 1],
      ] as const) {
        expect(pixelAt(png, x, y)[3], `${basename(pngPath)} sheet corner ${x},${y}`).toBe(0);
      }

      for (const [frameName, entry] of Object.entries(atlas.frames)) {
        const { x, y, w, h } = entry.frame;
        expect(x, `${basename(jsonPath)} ${frameName} x`).toBeGreaterThanOrEqual(0);
        expect(y, `${basename(jsonPath)} ${frameName} y`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${basename(jsonPath)} ${frameName} width`).toBeLessThanOrEqual(png.width);
        expect(y + h, `${basename(jsonPath)} ${frameName} height`).toBeLessThanOrEqual(png.height);

        for (const [px, py] of [
          [x, y],
          [x + w - 1, y],
          [x, y + h - 1],
          [x + w - 1, y + h - 1],
        ] as const) {
          const rgba = pixelAt(png, px, py);
          expect(rgba[3], `${dirname(jsonPath)} ${frameName} corner ${px},${py} rgba=${rgba.join(',')}`).toBe(0);
          expect(rgba, `${frameName} corner must not be opaque black`).not.toEqual([0, 0, 0, 255]);
        }
      }
    }
  });
});
