import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';

import { comparePngFiles } from './pr31-authoritative-image-diff.mjs';

function png(width, height, pixels) {
  const image = new PNG({ width, height });
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const [red, green, blue, alpha = 255] = pixels[index];
    image.data[offset] = red;
    image.data[offset + 1] = green;
    image.data[offset + 2] = blue;
    image.data[offset + 3] = alpha;
  }
  return PNG.sync.write(image);
}

test('records exact mismatch metrics and emits deterministic artifacts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pr31-image-diff-'));
  try {
    const referencePath = path.join(directory, 'reference.png');
    const actualPath = path.join(directory, 'actual.png');
    const diffPath = path.join(directory, 'diff.png');
    const reportPath = path.join(directory, 'report.json');
    await writeFile(
      referencePath,
      png(2, 1, [
        [0, 0, 0],
        [255, 255, 255],
      ]),
    );
    await writeFile(
      actualPath,
      png(2, 1, [
        [0, 0, 0],
        [255, 0, 0],
      ]),
    );

    const report = await comparePngFiles({
      referencePath,
      actualPath,
      diffPath,
      reportPath,
      pixelThreshold: 0.1,
      maxMismatchRatio: 0.49,
    });

    assert.equal(report.status, 'failed');
    assert.equal(report.width, 2);
    assert.equal(report.height, 1);
    assert.equal(report.totalPixels, 2);
    assert.equal(report.mismatchedPixels, 1);
    assert.equal(report.mismatchRatio, 0.5);
    assert.equal(report.pixelThreshold, 0.1);
    assert.equal(report.maxMismatchRatio, 0.49);
    assert.equal((await readFile(diffPath)).length > 0, true);
    assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), report);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('passes identical images and fails closed on dimension mismatch', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pr31-image-diff-'));
  try {
    const referencePath = path.join(directory, 'reference.png');
    const actualPath = path.join(directory, 'actual.png');
    const otherPath = path.join(directory, 'other.png');
    const source = png(1, 1, [[12, 34, 56]]);
    await writeFile(referencePath, source);
    await writeFile(actualPath, source);
    await writeFile(
      otherPath,
      png(2, 1, [
        [12, 34, 56],
        [12, 34, 56],
      ]),
    );

    const report = await comparePngFiles({ referencePath, actualPath });
    assert.equal(report.status, 'passed');
    assert.equal(report.mismatchedPixels, 0);
    assert.equal(report.mismatchRatio, 0);

    await assert.rejects(
      comparePngFiles({ referencePath, actualPath: otherPath }),
      /dimensions differ: reference=1x1 actual=2x1/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
