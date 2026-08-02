import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';
import { compareImages } from './image-compare.mjs';
import { loadOrigamiReferenceContract } from './reference-contract.mjs';

function createWorkspace() {
  return mkdtempSync(join(tmpdir(), 'vibespace-origami-compare-'));
}

function writePng(path, width, height, changedPixels = []) {
  const png = new PNG({ width, height });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = 32;
    png.data[offset + 1] = 48;
    png.data[offset + 2] = 64;
    png.data[offset + 3] = 255;
  }
  for (const { x, y, color = [255, 255, 255, 255] } of changedPixels) {
    const offset = (y * width + x) * 4;
    png.data.set(color, offset);
  }
  writeFileSync(path, PNG.sync.write(png));
}

function writeContract(
  root,
  {
    width = 4,
    height = 4,
    targetFile = 'references/target-chat.png',
    regions = {
      full_page: { x: 0, y: 0, width, height, weight: 1 },
      alpha: { x: 0, y: 0, width: 2, height: 2, weight: 0.25 },
      beta: { x: 2, y: 0, width: 2, height: 2, weight: 0.75 },
    },
  } = {},
) {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'reference-spec.json'),
    `${JSON.stringify(
      {
        schema_version: '1.0',
        page_id: 'synthetic-origami',
        target_file: targetFile,
        viewport: {
          width,
          height,
          device_scale_factor: 1,
          browser_zoom_percent: 100,
        },
        regions,
        acceptance: {
          minimum_required: {
            full_page_diff_ratio: 0.16,
            layout_region_diff_ratio: 0.1,
            major_region_diff_ratio: 0.18,
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(root, 'design-tokens.json'),
    `${JSON.stringify({ schema_version: '1.0', colors: {} }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, 'asset-manifest.json'),
    `${JSON.stringify(
      {
        schema_version: '1.0',
        source_policy: {
          full_target_as_page_background: false,
          preserve_live_text_and_controls_as_dom: true,
        },
        assets: {},
      },
      null,
      2,
    )}\n`,
  );
}

function fixedMetadata() {
  return {
    passId: 'pass-001',
    revision: 'working-tree:test',
    route: 'http://127.0.0.1:4173/',
    now: () => new Date('2026-07-28T12:00:00.000Z'),
  };
}

test('the CLI rejects every attempt to substitute the locked reference root', () => {
  const cliPath = fileURLToPath(new URL('./compare-chat.mjs', import.meta.url));
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      '--current',
      'unused.png',
      '--output',
      'unused-output',
      '--pass',
      'unused-pass',
      '--revision',
      'unused-revision',
      '--route',
      'unused-route',
      '--reference',
      'attacker-controlled-reference',
    ],
    {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown comparison argument: --reference/);
});

test('loads a bounded, sorted reference contract', () => {
  const workspace = createWorkspace();
  const referenceRoot = join(workspace, 'reference');
  writeContract(referenceRoot, {
    regions: {
      full_page: { x: 0, y: 0, width: 4, height: 4, weight: 1 },
      zeta: { x: 2, y: 0, width: 2, height: 2, weight: 0.5 },
      alpha: { x: 0, y: 0, width: 2, height: 2, weight: 0.5 },
    },
  });
  writePng(join(referenceRoot, 'target-chat.png'), 4, 4);

  const contract = loadOrigamiReferenceContract(referenceRoot);

  assert.equal(contract.targetPath, join(referenceRoot, 'target-chat.png'));
  assert.deepEqual(
    contract.regions.map((region) => region.name),
    ['alpha', 'zeta'],
  );
});

test('maps the prefixed target deterministically to the canonical root file', () => {
  const workspace = createWorkspace();
  const referenceRoot = join(workspace, 'reference');
  writeContract(referenceRoot);
  writePng(join(referenceRoot, 'target-chat.png'), 4, 4);
  mkdirSync(join(referenceRoot, 'references'), { recursive: true });
  writePng(join(referenceRoot, 'references', 'target-chat.png'), 4, 4, [{ x: 0, y: 0 }]);

  const contract = loadOrigamiReferenceContract(referenceRoot);

  assert.equal(contract.targetPath, join(referenceRoot, 'target-chat.png'));
});

test('rejects absolute, traversal, and unsafe Windows target paths', () => {
  const workspace = createWorkspace();
  const outsideTarget = join(workspace, 'outside.png');
  writePng(outsideTarget, 4, 4);
  const unsafeTargets = [
    ['absolute drive path', outsideTarget.replaceAll('\\', '/')],
    ['absolute native path', outsideTarget],
    ['rooted path', '/outside.png'],
    ['parent traversal', '../outside.png'],
    ['Windows separator path', 'references\\target-chat.png'],
    ['Windows separator traversal', '..\\outside.png'],
    ['UNC path', '\\\\server\\share\\target.png'],
  ];

  for (const [label, targetFile] of unsafeTargets) {
    const referenceRoot = join(workspace, label.replaceAll(' ', '-'));
    writeContract(referenceRoot, { targetFile });
    assert.throws(
      () => loadOrigamiReferenceContract(referenceRoot),
      /unsafe reference target path/i,
      label,
    );
  }
});

test('rejects out-of-bounds and unsafe region declarations', () => {
  const workspace = createWorkspace();
  const outsideRoot = join(workspace, 'outside');
  writeContract(outsideRoot, {
    regions: {
      full_page: { x: 0, y: 0, width: 4, height: 4, weight: 1 },
      outside: { x: 3, y: 0, width: 2, height: 2, weight: 1 },
    },
  });
  assert.throws(() => loadOrigamiReferenceContract(outsideRoot), /outside.*viewport/i);

  const unsafeRoot = join(workspace, 'unsafe');
  writeContract(unsafeRoot, {
    regions: {
      full_page: { x: 0, y: 0, width: 4, height: 4, weight: 1 },
      '../escape': { x: 0, y: 0, width: 2, height: 2, weight: 1 },
    },
  });
  assert.throws(() => loadOrigamiReferenceContract(unsafeRoot), /unsafe region name/i);
});

test('identical images score zero and write complete stable evidence', async () => {
  const workspace = createWorkspace();
  const referenceRoot = join(workspace, 'reference');
  const currentPath = join(workspace, 'current.png');
  const outputDirectory = join(workspace, 'artifacts', 'pass-001');
  writeContract(referenceRoot);
  writePng(join(referenceRoot, 'target-chat.png'), 4, 4);
  writePng(currentPath, 4, 4);

  const report = await compareImages({
    targetPath: join(referenceRoot, 'target-chat.png'),
    currentPath,
    contract: loadOrigamiReferenceContract(referenceRoot),
    outputDirectory,
    ...fixedMetadata(),
  });

  assert.equal(report.full.diffRatio, 0);
  assert.equal(report.weightedRegionDiffRatio, 0);
  assert.deepEqual(Object.keys(report.regions), ['alpha', 'beta']);
  assert.equal(report.generatedAt, '2026-07-28T12:00:00.000Z');
  for (const path of [
    report.outputs.diff,
    report.outputs.overlay,
    report.outputs.report,
    report.regions.alpha.outputs.target,
    report.regions.alpha.outputs.current,
    report.regions.alpha.outputs.diff,
  ]) {
    assert.equal(path.includes(workspace), false);
    assert.ok(readFileSync(join(outputDirectory, path)).length > 0);
  }
  assert.deepEqual(
    JSON.parse(readFileSync(join(outputDirectory, report.outputs.report), 'utf8')),
    report,
  );
});

test('one changed pixel produces exact full and weighted ratios', async () => {
  const workspace = createWorkspace();
  const referenceRoot = join(workspace, 'reference');
  const currentPath = join(workspace, 'current.png');
  writeContract(referenceRoot);
  writePng(join(referenceRoot, 'target-chat.png'), 4, 4);
  writePng(currentPath, 4, 4, [{ x: 0, y: 0 }]);

  const report = await compareImages({
    targetPath: join(referenceRoot, 'target-chat.png'),
    currentPath,
    contract: loadOrigamiReferenceContract(referenceRoot),
    outputDirectory: join(workspace, 'artifacts'),
    ...fixedMetadata(),
  });

  assert.equal(report.full.mismatchedPixels, 1);
  assert.equal(report.full.diffRatio, 1 / 16);
  assert.equal(report.regions.alpha.diffRatio, 1 / 4);
  assert.equal(report.regions.beta.diffRatio, 0);
  assert.equal(report.weightedRegionDiffRatio, 1 / 16);
});

test('dimension mismatch fails before evidence is reported', async () => {
  const workspace = createWorkspace();
  const referenceRoot = join(workspace, 'reference');
  const currentPath = join(workspace, 'current.png');
  writeContract(referenceRoot);
  writePng(join(referenceRoot, 'target-chat.png'), 4, 4);
  writePng(currentPath, 3, 4);

  await assert.rejects(
    compareImages({
      targetPath: join(referenceRoot, 'target-chat.png'),
      currentPath,
      contract: loadOrigamiReferenceContract(referenceRoot),
      outputDirectory: join(workspace, 'artifacts'),
      ...fixedMetadata(),
    }),
    /dimension mismatch/i,
  );
});

test('rejects a reused output directory without mutating prior evidence', async () => {
  const workspace = createWorkspace();
  const referenceRoot = join(workspace, 'reference');
  const currentPath = join(workspace, 'current.png');
  const outputDirectory = join(workspace, 'artifacts', 'pass-001');
  const priorReport = '{"passId":"prior-pass","passes":{"fullPage":true}}\n';
  const priorDiff = 'prior-diff-evidence';
  writeContract(referenceRoot);
  writePng(join(referenceRoot, 'target-chat.png'), 4, 4);
  writePng(currentPath, 4, 4);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, 'report.json'), priorReport);
  writeFileSync(join(outputDirectory, 'diff-full.png'), priorDiff);

  await assert.rejects(
    compareImages({
      targetPath: join(referenceRoot, 'target-chat.png'),
      currentPath,
      contract: loadOrigamiReferenceContract(referenceRoot),
      outputDirectory,
      ...fixedMetadata(),
    }),
    /output directory must not already exist/i,
  );

  assert.deepEqual(readdirSync(outputDirectory).sort(), ['diff-full.png', 'report.json']);
  assert.equal(readFileSync(join(outputDirectory, 'report.json'), 'utf8'), priorReport);
  assert.equal(readFileSync(join(outputDirectory, 'diff-full.png'), 'utf8'), priorDiff);
});

test('50 percent overlay is the exact average of target and current', async () => {
  const workspace = createWorkspace();
  const referenceRoot = join(workspace, 'reference');
  const currentPath = join(workspace, 'current.png');
  writeContract(referenceRoot);
  writePng(join(referenceRoot, 'target-chat.png'), 4, 4, [{ x: 0, y: 0, color: [0, 20, 40, 255] }]);
  writePng(currentPath, 4, 4, [{ x: 0, y: 0, color: [100, 120, 140, 255] }]);

  const report = await compareImages({
    targetPath: join(referenceRoot, 'target-chat.png'),
    currentPath,
    contract: loadOrigamiReferenceContract(referenceRoot),
    outputDirectory: join(workspace, 'artifacts'),
    ...fixedMetadata(),
  });
  const overlay = PNG.sync.read(readFileSync(join(workspace, 'artifacts', report.outputs.overlay)));

  assert.deepEqual([...overlay.data.subarray(0, 4)], [50, 70, 90, 255]);
});
