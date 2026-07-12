/**
 * Structural Axo identity fingerprint for shipped atlas frames.
 * Fails on exposed-eye white ovals, neon green, non-cream helmet, bright visor,
 * or large divergence from the cream reference master.
 */

export interface RgbaFrame {
  width: number;
  height: number;
  /** RGBA packed buffer, length width*height*4 */
  pixels: Uint8Array | Buffer;
}

function at(frame: RgbaFrame, x: number, y: number): [number, number, number, number] {
  const i = (y * frame.width + x) * 4;
  return [frame.pixels[i], frame.pixels[i + 1], frame.pixels[i + 2], frame.pixels[i + 3]];
}

export interface AxoIdentityResult {
  ok: boolean;
  errors: string[];
  stats: {
    madVsReference: number | null;
    helmetMeanR: number | null;
    visorMean: number | null;
    brightWhiteVisor: number;
    neonGreen: number;
  };
}

/**
 * Assert frame matches canonical cream Axo (helmet + dark visor + cream body).
 * `reference` should be the recomposed cream master at the same cell size.
 */
export function checkAxoCanonicalIdentity(
  frame: RgbaFrame,
  reference: RgbaFrame | null,
  label = 'frame',
): AxoIdentityResult {
  const errors: string[] = [];
  const w = frame.width;
  const h = frame.height;
  // corners transparent
  for (const [x, y] of [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ] as const) {
    if (at(frame, x, y)[3] !== 0) errors.push(`${label}: opaque corner ${x},${y}`);
  }

  let neonGreen = 0;
  const opaque: Array<[number, number]> = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b, a] = at(frame, x, y);
      if (a <= 180) continue;
      opaque.push([x, y]);
      if (g > 140 && r < 90 && g > b + 30) neonGreen += 1;
    }
  }
  if (opaque.length < 50) errors.push(`${label}: no character content`);
  if (neonGreen > 40) errors.push(`${label}: neon green ${neonGreen}`);

  let mad: number | null = null;
  if (reference && reference.width === w && reference.height === h && opaque.length >= 50) {
    let sum = 0;
    let n = 0;
    for (const [x, y] of opaque) {
      const [r, g, b, a] = at(frame, x, y);
      const [rr, gg, bb, ra] = at(reference, x, y);
      if (ra <= 180) continue;
      sum += Math.abs(r - rr) + Math.abs(g - gg) + Math.abs(b - bb);
      n += 1;
    }
    if (n > 100) {
      mad = sum / (n * 3);
      // Pose-shifted frames (wake/walk) can diverge more while staying cream identity.
      if (mad > 95) errors.push(`${label}: MAD vs cream master ${mad.toFixed(1)}`);
    }
  }

  // content bbox
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (const [x, y] of opaque) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);

  const sampleBand = (ry0: number, ry1: number, rx0: number, rx1: number) => {
    const pts: number[][] = [];
    for (let y = ry0; y < ry1; y += 1) {
      for (let x = rx0; x < rx1; x += 1) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const [r, g, b, a] = at(frame, x, y);
        if (a > 180) pts.push([r, g, b]);
      }
    }
    return pts;
  };

  const helmet = sampleBand(
    y0,
    y0 + Math.floor(bh * 0.28),
    x0 + Math.floor(bw * 0.2),
    x0 + Math.floor(bw * 0.8),
  );
  let helmetMeanR: number | null = null;
  if (helmet.length < 15) errors.push(`${label}: helmet samples missing`);
  else {
    helmetMeanR = helmet.reduce((s, p) => s + p[0], 0) / helmet.length;
    const hG = helmet.reduce((s, p) => s + p[1], 0) / helmet.length;
    if (helmetMeanR < 140 || hG < 100) {
      errors.push(`${label}: helmet not cream (R=${helmetMeanR.toFixed(0)} G=${hG.toFixed(0)})`);
    }
  }

  const visor = sampleBand(
    y0 + Math.floor(bh * 0.28),
    y0 + Math.floor(bh * 0.52),
    x0 + Math.floor(bw * 0.28),
    x0 + Math.floor(bw * 0.72),
  );
  let visorMean: number | null = null;
  let brightWhiteVisor = 0;
  if (visor.length < 15) errors.push(`${label}: visor samples missing`);
  else {
    visorMean =
      visor.reduce((s, p) => s + (p[0] + p[1] + p[2]) / 3, 0) / visor.length;
    if (visorMean > 110) errors.push(`${label}: visor not dark enough (${visorMean.toFixed(1)})`);
    brightWhiteVisor = visor.filter((p) => p[0] > 230 && p[1] > 230 && p[2] > 220).length;
    if (brightWhiteVisor > Math.max(25, visor.length * 0.1)) {
      errors.push(
        `${label}: bright-white visor ovals (exposed-eye signature) ${brightWhiteVisor}/${visor.length}`,
      );
    }
  }

  const chest = sampleBand(
    y0 + Math.floor(bh * 0.55),
    y0 + Math.floor(bh * 0.78),
    x0 + Math.floor(bw * 0.3),
    x0 + Math.floor(bw * 0.7),
  );
  if (chest.length > 10) {
    const creamish = chest.filter((p) => p[0] > 150 && p[1] > 110 && p[2] > 85).length;
    if (creamish < 5) errors.push(`${label}: chest missing cream body`);
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      madVsReference: mad,
      helmetMeanR,
      visorMean,
      brightWhiteVisor,
      neonGreen,
    },
  };
}
