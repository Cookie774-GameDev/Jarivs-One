/**
 * Structural Axo identity against shipped atlases + cream master.
 * Decodes real PNG pixels (not self-written checklist markdown).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { checkAxoCanonicalIdentity, type RgbaFrame } from './axoCanonicalIdentity';

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

function decodePng(path: string): RgbaFrame {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idats: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    offset += 12 + len;
  }
  expect(colorType).toBe(6);
  const bpp = 4;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idats));
  const pixels = Buffer.alloc(width * height * bpp);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
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
  return { width, height, pixels };
}

function cropFrame(
  sheet: RgbaFrame,
  fr: { x: number; y: number; w: number; h: number },
): RgbaFrame {
  const pixels = Buffer.alloc(fr.w * fr.h * 4);
  for (let y = 0; y < fr.h; y += 1) {
    for (let x = 0; x < fr.w; x += 1) {
      const si = ((fr.y + y) * sheet.width + (fr.x + x)) * 4;
      const di = (y * fr.w + x) * 4;
      pixels[di] = sheet.pixels[si];
      pixels[di + 1] = sheet.pixels[si + 1];
      pixels[di + 2] = sheet.pixels[si + 2];
      pixels[di + 3] = sheet.pixels[si + 3];
    }
  }
  return { width: fr.w, height: fr.h, pixels };
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

describe('Axo structural identity (shipped atlases)', () => {
  const masterPath = join(charactersRoot, 'vibespace-axolotl/previews/canonical-master-128.png');
  const master = existsSync(masterPath)
    ? decodePng(masterPath)
    : decodePng(join(charactersRoot, 'vibespace-axolotl/previews/reference-cream.png'));

  it(
    'frame_000 of every @1x anim matches cream master fingerprint',
    () => {
      for (const anim of ANIMS) {
        const jsonPath = join(charactersRoot, 'vibespace-axolotl/atlases', `${anim}@1x.json`);
        const pngPath = join(charactersRoot, 'vibespace-axolotl/atlases', `${anim}@1x.png`);
        expect(pngPath.replace(/\\/g, '/')).toContain('/vibespace-axolotl/');
        expect(pngPath.toLowerCase()).not.toContain('glitch');
        const atlas = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
          frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
          meta: { image: string; format: string };
        };
        expect(atlas.meta.format).toBe('RGBA8888');
        const fr = atlas.frames['frame_000']?.frame;
        expect(fr, anim).toBeTruthy();
        const sheet = decodePng(pngPath);
        const cell = cropFrame(sheet, fr!);
        const result = checkAxoCanonicalIdentity(cell, master, anim);
        expect(result.errors, `${anim}: ${result.errors.join('; ')}`).toEqual([]);
        expect(result.ok).toBe(true);
      }
    },
    90_000,
  );

  it('manifest characterId is vibespace-axolotl (not glitch)', () => {
    const man = JSON.parse(
      readFileSync(join(charactersRoot, 'vibespace-axolotl/animations.json'), 'utf8'),
    );
    expect(man.characterId).toBe('vibespace-axolotl');
    expect(String(man.characterId).toLowerCase()).not.toContain('glitch');
  });

  it('axo contact sheets exist for all eight animations', () => {
    const candidates = [
      join(process.cwd(), '../docs/pets/contact-sheets'),
      join(process.cwd(), 'docs/pets/contact-sheets'),
      join(charactersRoot, 'vibespace-axolotl/previews'),
    ];
    let ok = false;
    for (const d of candidates) {
      if (!existsSync(d)) continue;
      const names = readdirSync(d);
      const hits = ANIMS.filter((a) =>
        names.some((n) => n.includes(a) && n.includes('contact-sheet') && n.includes('axo') || (n === `${a}-contact-sheet.png`)),
      );
      // previews use anim-contact-sheet.png without axo- prefix
      const hits2 = ANIMS.filter((a) =>
        names.some((n) => n === `${a}-contact-sheet.png` || n === `axo-${a}-contact-sheet.png`),
      );
      if (hits2.length >= 8 || hits.length >= 8) {
        ok = true;
        break;
      }
    }
    expect(ok).toBe(true);
  });
});
