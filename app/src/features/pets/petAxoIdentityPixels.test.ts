/**
 * Pixel-level Axo identity: cream helmet, dark visor, no neon green glitch.
 * Decodes the actual runtime atlas PNG shipped under vibespace-axolotl.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

function rgba(png: { w: number; pixels: Buffer }, x: number, y: number): [number, number, number, number] {
  const i = (y * png.w + x) * 4;
  return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], png.pixels[i + 3]];
}

const ANIMS = [
  'welcome',
  'idlePrimary',
  'idleFun',
  'walkLeft',
  'walkRight',
  'sleepTransition',
  'sleepingLoop',
  'wakeFromSleep',
] as const;

describe('Axo runtime atlas identity pixels', () => {
  it(
    'every @1x atlas frame_000 has cream helmet band, dark visor, transparent corners, no neon green',
    () => {
      for (const anim of ANIMS) {
        const jsonPath = join(charactersRoot, 'vibespace-axolotl/atlases', `${anim}@1x.json`);
        const pngPath = join(charactersRoot, 'vibespace-axolotl/atlases', `${anim}@1x.png`);
        expect(existsSync(jsonPath), jsonPath).toBe(true);
        expect(existsSync(pngPath), pngPath).toBe(true);
        const atlas = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
          frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
        };
        const fr = atlas.frames['frame_000']?.frame;
        expect(fr, anim).toBeTruthy();
        const png = decodePng(pngPath);
        // corners of sheet transparent
        for (const [x, y] of [
          [0, 0],
          [png.w - 1, 0],
          [0, png.h - 1],
          [png.w - 1, png.h - 1],
        ] as const) {
          expect(rgba(png, x, y)[3], `${anim} sheet corner`).toBe(0);
        }
        // Sample helmet (upper third of frame) and visor (center of frame)
        const samplesH: number[][] = [];
        const samplesV: number[][] = [];
        let greenCorrupt = 0;
        for (let dy = 0; dy < fr!.h; dy += 2) {
          for (let dx = 0; dx < fr!.w; dx += 2) {
            const px = fr!.x + dx;
            const py = fr!.y + dy;
            const [r, g, b, a] = rgba(png, px, py);
            if (a < 180) continue;
            // neon green corruption
            if (g > 140 && r < 90 && g > b + 30) greenCorrupt += 1;
            // helmet band: upper 30% of frame
            if (dy < fr!.h * 0.3 && dx > fr!.w * 0.3 && dx < fr!.w * 0.7) samplesH.push([r, g, b]);
            // visor band: mid 35-55% height, center x
            if (dy > fr!.h * 0.35 && dy < fr!.h * 0.55 && dx > fr!.w * 0.35 && dx < fr!.w * 0.65) {
              samplesV.push([r, g, b]);
            }
          }
        }
        expect(samplesH.length, `${anim} helmet samples`).toBeGreaterThan(5);
        expect(samplesV.length, `${anim} visor samples`).toBeGreaterThan(5);
        const mean = (arr: number[][], i: number) => arr.reduce((s, p) => s + p[i], 0) / arr.length;
        const hR = mean(samplesH, 0);
        const hG = mean(samplesH, 1);
        const vMean = (mean(samplesV, 0) + mean(samplesV, 1) + mean(samplesV, 2)) / 3;
        // Cream helmet: warm high-R mid-G
        expect(hR, `${anim} helmet R`).toBeGreaterThan(140);
        expect(hG, `${anim} helmet G`).toBeGreaterThan(100);
        // Dark visor
        expect(vMean, `${anim} visor luminance`).toBeLessThan(120);
        expect(greenCorrupt, `${anim} neon green`).toBeLessThan(40);
        // Path must not be glitch
        expect(pngPath.replace(/\\/g, '/')).toContain('/vibespace-axolotl/');
        expect(pngPath.toLowerCase()).not.toContain('glitch');
      }
    },
    60_000,
  );

  it('axo contact sheets exist for all eight animations', () => {
    const dir = join(process.cwd(), 'src/../docs/pets/contact-sheets');
    // docs is sibling of app when cwd is app
    const docsCandidates = [
      join(process.cwd(), '../docs/pets/contact-sheets'),
      join(process.cwd(), 'docs/pets/contact-sheets'),
      join(charactersRoot, '../../../../../docs/pets/contact-sheets'),
    ];
    let found = false;
    for (const d of docsCandidates) {
      if (!existsSync(d)) continue;
      const names = readdirSync(d).filter((n) => n.startsWith('axo-') && n.endsWith('-contact-sheet.png'));
      if (names.length >= 8) {
        found = true;
        for (const anim of ANIMS) {
          expect(names.some((n) => n.includes(anim)), anim).toBe(true);
        }
        break;
      }
    }
    // Also accept previews inside axo pack
    if (!found) {
      const prev = join(charactersRoot, 'vibespace-axolotl/previews');
      const names = readdirSync(prev).filter((n) => n.endsWith('-contact-sheet.png'));
      expect(names.length).toBeGreaterThanOrEqual(8);
    }
  });
});
