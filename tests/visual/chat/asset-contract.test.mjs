import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const MANIFEST_PATH = resolve(HERE, 'asset-manifest.json');
const ASSET_ROOT = resolve(ROOT, 'app/public/assets/origami-chat');
const VIEWPORT = Object.freeze({ width: 1672, height: 941 });
const LOCKED_TARGET_SHA256 = '1f61e223d6db54d9f32de4c3de8c98ff3028556b579b1f6a69b5317d35e8fe27';
const EXPECTED_FILES = Object.freeze([
  'bottom-mountains.svg',
  'crane.webp',
  'jarvis-frame-9slice.webp',
  'left-foliage.webp',
  'panel-9slice.webp',
  'paper-base.webp',
  'paper-grain.webp',
  'right-flower.webp',
  'sidebar-active-row-9slice.webp',
  'sidebar-row-9slice.webp',
  'top-ribbon.svg',
]);
const DECORATIVE_RASTERS = new Set(['crane.webp', 'left-foliage.webp', 'right-flower.webp']);
const SAFE_SOURCE_PREFIX = 'tests/visual/chat/reference/';
const PAPER_SWATCHES = Object.freeze([
  [244, 216, 190],
  [247, 221, 198],
  [249, 225, 203],
  [255, 241, 223],
  [211, 178, 150],
  [157, 121, 112],
]);
const CUTOUT_CONTRACTS = Object.freeze({
  'crane.webp': {
    source: 'tests/visual/chat/reference/crops/upper_left_crane.png',
    sourceX: 14,
    sourceY: 24,
    coverage: [0.03, 0.18],
  },
  'left-foliage.webp': {
    source: 'tests/visual/chat/reference/target-chat.png',
    sourceX: 0,
    sourceY: 230,
    coverage: [0.1, 0.45],
  },
  'right-flower.webp': {
    source: 'tests/visual/chat/reference/crops/lower_right_flower.png',
    sourceX: 38,
    sourceY: 54,
    coverage: [0.15, 0.55],
    forbiddenAlphaRegions: [{ x: 4, y: 170, width: 32, height: 34, label: 'send-arrow fragment' }],
  },
});
const SOURCE_DERIVED_SVG_CONTRACTS = Object.freeze({
  'top-ribbon.svg': {
    source: 'tests/visual/chat/reference/crops/top_ribbon.png',
    sourceYForOutputY: (y) => y,
    minimumRects: 700,
    minimumUniqueFills: 90,
    allowedOutput: (x) => x >= 448,
  },
  'bottom-mountains.svg': {
    source: 'tests/visual/chat/reference/target-chat.png',
    sourceYForOutputY: (y) => y + 861,
    minimumRects: 500,
    minimumUniqueFills: 90,
    allowedOutput: (x, y) => x >= 120 && x < 1336 && y >= 63,
  },
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function colorDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function alphaFractionInRegion(data, info, region, minimumAlpha = 17) {
  let visible = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] >= minimumAlpha) {
        visible += 1;
      }
    }
  }
  return visible / (region.width * region.height);
}

function parseSourcePixelRects(source, label) {
  const matches = [
    ...source.matchAll(
      /<rect\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"\s+fill="#([a-f0-9]{6})"\s*\/>/giu,
    ),
  ];
  assert.ok(matches.length > 0, `${label} must contain source-pixel rectangles`);
  return matches.map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
    fill: [
      Number.parseInt(match[5].slice(0, 2), 16),
      Number.parseInt(match[5].slice(2, 4), 16),
      Number.parseInt(match[5].slice(4, 6), 16),
    ],
  }));
}

function isContained(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function requireSafeLocalPath(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.ok(value.length > 0, `${label} must not be empty`);
  assert.equal(value, value.replaceAll('\\', '/'), `${label} must use POSIX separators`);
  assert.equal(isAbsolute(value), false, `${label} must be relative`);
  assert.doesNotMatch(value, /^(?:[a-z]+:)?\/\//iu, `${label} must not be remote`);
  assert.equal(value.split('/').includes('..'), false, `${label} must not traverse`);
  return value;
}

function validateManifestShape(manifest) {
  assert.equal(manifest.schema_version, '1.0');
  assert.equal(manifest.source?.target_sha256, LOCKED_TARGET_SHA256);
  assert.equal(manifest.source?.viewport?.width, VIEWPORT.width);
  assert.equal(manifest.source?.viewport?.height, VIEWPORT.height);
  assert.equal(manifest.policy?.full_target_as_asset, false);
  assert.equal(manifest.policy?.live_text_and_icons_in_assets, false);
  assert.deepEqual(Object.keys(manifest.assets ?? {}).sort(), EXPECTED_FILES);

  const hashes = new Set();
  for (const [fileName, asset] of Object.entries(manifest.assets)) {
    requireSafeLocalPath(asset.file, `${fileName}.file`);
    assert.equal(asset.file, `app/public/assets/origami-chat/${fileName}`);
    assert.match(asset.role, /\S/u, `${fileName}.role`);
    assert.equal(asset.contains_text, false, `${fileName} must not contain live text`);
    assert.equal(asset.contains_live_icon, false, `${fileName} must not contain live icons`);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/u, `${fileName}.sha256`);
    assert.equal(hashes.has(asset.sha256), false, `${fileName} duplicates another asset hash`);
    hashes.add(asset.sha256);

    assert.ok(Number.isInteger(asset.dimensions?.width) && asset.dimensions.width > 0);
    assert.ok(Number.isInteger(asset.dimensions?.height) && asset.dimensions.height > 0);
    assert.notDeepEqual(asset.dimensions, VIEWPORT, `${fileName} must not be a full-target asset`);
    assert.ok(
      asset.dimensions.width < VIEWPORT.width || asset.dimensions.height < VIEWPORT.height,
      `${fileName} must remain bounded below the full target`,
    );

    requireSafeLocalPath(asset.source?.file, `${fileName}.source.file`);
    assert.ok(
      asset.source.file.startsWith(SAFE_SOURCE_PREFIX),
      `${fileName} must derive from a locked reference file`,
    );
    const region = asset.source?.region;
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Number.isInteger(region?.[key]), `${fileName}.source.region.${key}`);
    }
    assert.ok(region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0);
    assert.match(asset.source.method, /\S/u, `${fileName}.source.method`);

    if (asset.kind === 'raster') {
      assert.equal(extname(fileName), '.webp');
      assert.ok(['required', 'forbidden'].includes(asset.alpha));
      if (DECORATIVE_RASTERS.has(fileName)) {
        assert.equal(asset.alpha, 'required', `${fileName} must carry a cutout alpha channel`);
        assert.equal(
          asset.transparent_edge_required,
          true,
          `${fileName} must not retain opaque rectangular padding`,
        );
      }
    } else {
      assert.equal(asset.kind, 'svg');
      assert.equal(extname(fileName), '.svg');
      assert.equal(asset.alpha, 'native');
    }
  }
}

function validateSvgSafety(source, label) {
  assert.match(source, /^<svg[\s>]/u, `${label} must start with an svg element`);
  assert.doesNotMatch(source, /<script|<foreignObject|<text[\s>]/iu, `${label} unsafe element`);
  assert.doesNotMatch(source, /\son[a-z]+\s*=/iu, `${label} unsafe event handler`);
  assert.doesNotMatch(source, /(?:href|src)\s*=|url\s*\(|@import/iu, `${label} external reference`);
  assert.doesNotMatch(
    source.replace('xmlns="http://www.w3.org/2000/svg"', ''),
    /https?:|(?:^|["'])\/\//iu,
    `${label} remote URL`,
  );
}

async function readManifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
}

test('the tracked asset contract declares the exact bounded local material set', async () => {
  assert.equal(existsSync(MANIFEST_PATH), true, 'tracked Task 5 asset manifest must exist');
  validateManifestShape(await readManifest());
});

test('every declared output exists with recomputed dimensions, alpha semantics, and unique hash', async () => {
  const manifest = await readManifest();
  const actualFiles = (await readdir(ASSET_ROOT)).sort();
  assert.deepEqual(actualFiles, EXPECTED_FILES, 'undeclared files are forbidden');

  for (const [fileName, asset] of Object.entries(manifest.assets)) {
    const outputPath = resolve(ROOT, asset.file);
    assert.ok(isContained(ASSET_ROOT, outputPath), `${fileName} escapes the asset root`);
    const bytes = await readFile(outputPath);
    assert.equal(sha256(bytes), asset.sha256, `${fileName} output hash`);

    if (asset.kind === 'svg') {
      validateSvgSafety(bytes.toString('utf8'), fileName);
      continue;
    }

    const image = sharp(bytes);
    const metadata = await image.metadata();
    assert.equal(metadata.width, asset.dimensions.width, `${fileName} width`);
    assert.equal(metadata.height, asset.dimensions.height, `${fileName} height`);
    assert.equal(metadata.format, 'webp', `${fileName} format`);
    assert.equal(metadata.hasAlpha, asset.alpha === 'required', `${fileName} alpha requirement`);
    if (asset.transparent_edge_required) {
      const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
      const corners = [
        alphaAt(0, 0),
        alphaAt(info.width - 1, 0),
        alphaAt(0, info.height - 1),
        alphaAt(info.width - 1, info.height - 1),
      ];
      assert.deepEqual(corners, [0, 0, 0, 0], `${fileName} transparent corners`);
      assert.ok(
        data.some((value, index) => index % info.channels === 3 && value === 0),
        `${fileName} must have transparent padding`,
      );
      assert.ok(
        data.some((value, index) => index % info.channels === 3 && value === 255),
        `${fileName} must retain opaque decoration pixels`,
      );
    }
  }
});

for (const [fileName, contract] of Object.entries(CUTOUT_CONTRACTS)) {
  test(`${fileName} alpha mask excludes paper islands and reviewed live-icon regions`, async () => {
    const image = sharp(resolve(ASSET_ROOT, fileName)).ensureAlpha();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    let visible = 0;
    let paperLike = 0;
    const pixelCount = info.width * info.height;

    for (let index = 0; index < data.length; index += info.channels) {
      if (data[index + 3] < 17) {
        continue;
      }
      visible += 1;
      const rgb = [data[index], data[index + 1], data[index + 2]];
      if (PAPER_SWATCHES.some((swatch) => colorDistance(rgb, swatch) < 40)) {
        paperLike += 1;
      }
    }

    const coverage = visible / pixelCount;
    assert.ok(
      coverage >= contract.coverage[0] && coverage <= contract.coverage[1],
      `${fileName} visible silhouette coverage ${coverage.toFixed(4)}`,
    );
    assert.ok(
      paperLike / visible < 0.08,
      `${fileName} retains a paper/sidebar background island (${paperLike}/${visible})`,
    );

    for (const region of contract.forbiddenAlphaRegions ?? []) {
      assert.ok(
        alphaFractionInRegion(data, info, region) < 0.005,
        `${fileName} retains ${region.label}`,
      );
    }
  });
}

test('every visible cutout pixel corresponds to its locked source pixel', async () => {
  for (const [fileName, contract] of Object.entries(CUTOUT_CONTRACTS)) {
    const output = await sharp(resolve(ASSET_ROOT, fileName))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const source = await sharp(resolve(ROOT, contract.source))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const errors = [];

    for (let y = 2; y < output.info.height - 2; y += 1) {
      for (let x = 2; x < output.info.width - 2; x += 1) {
        const outputIndex = (y * output.info.width + x) * output.info.channels;
        if (output.data[outputIndex + 3] < 128) {
          continue;
        }
        const sourceX = contract.sourceX + x - 2;
        const sourceY = contract.sourceY + y - 2;
        const sourceIndex = (sourceY * source.info.width + sourceX) * source.info.channels;
        errors.push(
          colorDistance(
            [output.data[outputIndex], output.data[outputIndex + 1], output.data[outputIndex + 2]],
            [source.data[sourceIndex], source.data[sourceIndex + 1], source.data[sourceIndex + 2]],
          ),
        );
      }
    }

    assert.ok(errors.length > 100, `${fileName} must retain a substantial locked-pixel cutout`);
    errors.sort((left, right) => left - right);
    const percentile95 = errors[Math.floor(errors.length * 0.95)];
    assert.ok(percentile95 <= 12, `${fileName} source-pixel p95 error ${percentile95.toFixed(2)}`);
  }
});

for (const [fileName, contract] of Object.entries(SOURCE_DERIVED_SVG_CONTRACTS)) {
  test(`${fileName} is a dense source-pixel mosaic with no live-UI source region`, async () => {
    const svg = await readFile(resolve(ASSET_ROOT, fileName), 'utf8');
    const rectangles = parseSourcePixelRects(svg, fileName);
    const source = await sharp(resolve(ROOT, contract.source))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    assert.ok(
      rectangles.length >= contract.minimumRects,
      `${fileName} has only ${rectangles.length} source samples`,
    );
    assert.ok(
      new Set(rectangles.map((rectangle) => rectangle.fill.join(','))).size >=
        contract.minimumUniqueFills,
      `${fileName} lacks locked fiber/facet variation`,
    );

    for (const rectangle of rectangles) {
      const centerX = rectangle.x + Math.floor(rectangle.width / 2);
      const centerY = rectangle.y + Math.floor(rectangle.height / 2);
      assert.equal(
        contract.allowedOutput(centerX, centerY),
        true,
        `${fileName} samples a forbidden live-UI region at ${centerX},${centerY}`,
      );
      const sourceY = contract.sourceYForOutputY(centerY);
      const sourceIndex = (sourceY * source.info.width + centerX) * source.info.channels;
      assert.ok(
        colorDistance(rectangle.fill, [
          source.data[sourceIndex],
          source.data[sourceIndex + 1],
          source.data[sourceIndex + 2],
        ]) <= 1,
        `${fileName} fill at ${centerX},${centerY} is not a locked source pixel`,
      );
    }
  });
}

test('Jarvis frame paper contains no residual ink pixel from live module content', async () => {
  const { data, info } = await sharp(resolve(ASSET_ROOT, 'jarvis-frame-9slice.webp'))
    .raw()
    .toBuffer({ resolveWithObject: true });
  let inkPixels = 0;
  let residualSpeckPixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * info.channels;
      if (data[index] < 95 && data[index + 1] < 85 && data[index + 2] < 75) {
        inkPixels += 1;
      }
      if (
        x >= 80 &&
        x <= 82 &&
        y >= 84 &&
        y <= 85 &&
        data[index] < 220 &&
        data[index + 1] < 195 &&
        data[index + 2] < 175
      ) {
        residualSpeckPixels += 1;
      }
    }
  }
  assert.equal(inkPixels, 0, 'Jarvis frame retains a dark live-content speck');
  assert.equal(residualSpeckPixels, 0, 'Jarvis frame retains the reviewed 3 × 2 ink cluster');
});

test('every source region resolves inside a locked reference image', async () => {
  const manifest = await readManifest();
  for (const [fileName, asset] of Object.entries(manifest.assets)) {
    const sourcePath = resolve(ROOT, asset.source.file);
    assert.ok(
      isContained(resolve(ROOT, SAFE_SOURCE_PREFIX), sourcePath),
      `${fileName} source escapes locked references`,
    );
    const metadata = await sharp(sourcePath).metadata();
    const { x, y, width, height } = asset.source.region;
    assert.ok(x + width <= metadata.width, `${fileName} source region exceeds width`);
    assert.ok(y + height <= metadata.height, `${fileName} source region exceeds height`);
  }
});

test('contract validation rejects remote, duplicate, text-bearing, and full-target declarations', async () => {
  const manifest = await readManifest();
  const mutate = (callback) => {
    const value = structuredClone(manifest);
    callback(value);
    return value;
  };

  assert.throws(
    () =>
      validateManifestShape(
        mutate((value) => {
          value.assets['crane.webp'].file = 'https://example.test/crane.webp';
        }),
      ),
    /must be relative|must not be remote/u,
  );
  assert.throws(
    () =>
      validateManifestShape(
        mutate((value) => {
          value.assets['crane.webp'].sha256 = value.assets['right-flower.webp'].sha256;
        }),
      ),
    /duplicates another asset hash/u,
  );
  assert.throws(
    () =>
      validateManifestShape(
        mutate((value) => {
          value.assets['crane.webp'].contains_text = true;
        }),
      ),
    /must not contain live text/u,
  );
  assert.throws(
    () =>
      validateManifestShape(
        mutate((value) => {
          value.assets['paper-base.webp'].dimensions = { ...VIEWPORT };
        }),
      ),
    /must not be a full-target asset/u,
  );
});

test('SVG validation rejects scripts, event handlers, text, and external references', () => {
  const unsafeSources = [
    '<svg><script>alert(1)</script></svg>',
    '<svg><path onload="alert(1)"/></svg>',
    '<svg><text>Workspace</text></svg>',
    '<svg><image href="https://example.test/asset.png"/></svg>',
    '<svg><path fill="url(//example.test/pattern)"/></svg>',
  ];
  for (const source of unsafeSources) {
    assert.throws(() => validateSvgSafety(source, 'unsafe.svg'), /unsafe|external|remote/u);
  }
});

test('the workbench remains test-only and declares every material primitive once', async () => {
  const manifest = await readManifest();
  const workbenchPath = resolve(HERE, 'workbench/index.html');
  const workbenchCssPath = resolve(HERE, 'workbench/workbench.css');
  assert.equal(existsSync(workbenchPath), true);
  assert.equal(existsSync(workbenchCssPath), true);
  const html = readFileSync(workbenchPath, 'utf8');
  const declared = [...html.matchAll(/data-asset="([^"]+)"/gu)].map((match) => match[1]).sort();
  assert.deepEqual(declared, Object.keys(manifest.assets).sort());
  assert.doesNotMatch(html, /href=["'][^"']*app\/(?:src|dist)|data-vibespace-page/iu);
  assert.match(html, /data-workbench-ready="true"/u);

  for (const [fileName, asset] of Object.entries(manifest.assets)) {
    const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const specimen = html.match(
      new RegExp(
        `<[^>]+data-asset="${escapedFileName}"[^>]+data-intended-width="(\\d+)"[^>]+data-intended-height="(\\d+)"[^>]*>`,
        'u',
      ),
    );
    assert.ok(specimen, `${fileName} must declare an exact-scale comparison specimen`);
    assert.equal(Number(specimen[1]), asset.intended_scale.width, `${fileName} intended width`);
    assert.equal(Number(specimen[2]), asset.intended_scale.height, `${fileName} intended height`);
  }
  for (const figure of html.matchAll(/<figure(?:\s[^>]*)?>([\s\S]*?)<\/figure>/giu)) {
    const body = figure[1];
    const captionOffset = body.indexOf('<figcaption');
    const specimenOffset = body.indexOf('data-specimen="true"');
    assert.ok(captionOffset >= 0, 'every comparison figure needs an external label');
    assert.ok(specimenOffset >= 0, 'every comparison figure needs a specimen');
    assert.ok(captionOffset < specimenOffset, 'labels must remain outside comparison specimens');
  }
});
