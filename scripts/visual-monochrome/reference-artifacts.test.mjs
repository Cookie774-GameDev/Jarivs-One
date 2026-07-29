import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validateArtifacts } from './analyze-reference.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '../..');
const evidenceRoot = join(repositoryRoot, 'docs/appearance/monochrome');
const expectedSource = 'Screen Recording 2026-07-16 220632(1).mp4';
const evidenceCutoff = '2026-07-29T21:13:02.0844029Z';
const glyphFixture = 'AaBbGgQqRr 0O1Il []{}() <> /\\\\ :;,.!? +-=_ #@% & | -> <- 0123456789';
const expectedPalette = {
  'color.black': '#000000',
  'color.surface-1': '#050505',
  'color.surface-2': '#080808',
  'color.surface-3': '#0D0D0D',
  'color.active': '#171717',
  'color.border': '#1D1D1D',
  'color.border-strong': '#2A2A2A',
  'color.text': '#F5F5F5',
  'color.text-secondary': '#A3A3A3',
  'color.text-tertiary': '#686868',
  'color.purple': '#8B3DFF',
  'color.teal': '#0A777A',
  'color.amber': '#C88700',
  'color.green': '#5C8F6A',
  'color.red': '#C95757',
};
const expectedFiles = [
  'REFERENCE_ANALYSIS.md',
  'FRAME_MANIFEST.json',
  'DESIGN.md',
  'design-tokens.json',
  'reference-spec.json',
  'component-mapping.md',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const frontmatterStart = '<!-- MONOCHROME_JSON_FRONTMATTER\n';
const frontmatterEnd = '\nMONOCHROME_JSON_FRONTMATTER -->';

function readMarkdownFrontmatter(path) {
  const source = readFileSync(path, 'utf8');
  const end = source.indexOf(frontmatterEnd);
  return JSON.parse(source.slice(frontmatterStart.length, end));
}

function writeMarkdownFrontmatter(path, mutate) {
  const source = readFileSync(path, 'utf8');
  const end = source.indexOf(frontmatterEnd);
  const frontmatter = JSON.parse(source.slice(frontmatterStart.length, end));
  mutate(frontmatter);
  writeFileSync(
    path,
    `${frontmatterStart}${JSON.stringify(frontmatter, null, 2)}${source.slice(end)}`,
  );
}

function hashEvidence() {
  return Object.fromEntries(
    expectedFiles.map((name) => [
      name,
      createHash('sha256')
        .update(readFileSync(join(evidenceRoot, name)))
        .digest('hex'),
    ]),
  );
}

function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'monochrome-reference-'));
  cpSync(evidenceRoot, join(root, 'docs/appearance/monochrome'), {
    recursive: true,
  });
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function buildTypographyCandidates() {
  const families = ['JetBrains Mono', 'Inter', 'Plus Jakarta Sans'];
  const conditions = [
    { fontSizePx: 12, lineHeightPx: 16 },
    { fontSizePx: 13, lineHeightPx: 18 },
  ];
  const candidates = [];
  for (const family of families) {
    for (const weight of [400, 500, 600]) {
      for (const condition of conditions) {
        for (const tracking of ['normal', 'uppercase_label']) {
          for (const deviceScaleFactor of [1, 2]) {
            const id = [
              family.toLowerCase().replaceAll(' ', '-'),
              weight,
              `${condition.fontSizePx}-${condition.lineHeightPx}`,
              tracking,
              `${deviceScaleFactor}x`,
            ].join('.');
            candidates.push({
              id,
              bundledFile: `app/src/assets/fonts/${family.toLowerCase().replaceAll(' ', '-')}.woff2`,
              bundledSha256: 'a'.repeat(64),
              license: 'test-fixture-license',
              family,
              weight,
              glyphFixture,
              condition: {
                ...condition,
                tracking,
                deviceScaleFactor,
                fontsReady: true,
              },
              pixelBounds: { x: 0, y: 0, width: 640, height: 24 },
              averageGlyphWidth: 8,
              averageNumeralWidth: 8,
              observations: {
                zero: 'distinct',
                one: 'distinct',
                uppercase: 'stable',
                punctuation: 'stable',
              },
              lineHeightDistance: 0,
              letterSpacingDistance: 0,
              aggregateScore: 1,
              confidence: 0.9,
            });
          }
        }
      }
    }
  }
  return candidates;
}

function promoteFixtureToMeasured(root) {
  const docs = join(root, 'docs/appearance/monochrome');
  const sourceSha256 = 'b'.repeat(64);
  const frameId = 'frame.reference-0001';
  const roiId = 'roi.palette-0001';
  const manifestPath = join(docs, 'FRAME_MANIFEST.json');
  const tokensPath = join(docs, 'design-tokens.json');
  const specPath = join(docs, 'reference-spec.json');
  const manifest = readJson(manifestPath);
  const tokens = readJson(tokensPath);
  const spec = readJson(specPath);

  Object.assign(manifest, {
    status: 'measured',
    evidenceCutoff,
    sourceSha256,
    sampling: { method: 'all_frames_plus_scene_changes', sampleCount: 1 },
    frames: [
      {
        id: frameId,
        timestampMs: 0,
        frameNumber: 0,
        sceneTags: ['palette'],
        stateTags: ['default'],
        crop: { x: 0, y: 0, width: 1280, height: 720 },
        excludedRegions: [],
        purpose: 'schema-valid measured fixture',
        privacyDisposition: 'sanitized_no_private_source_data',
      },
    ],
  });
  Object.assign(manifest.source, {
    sha256: sourceSha256,
    durationMs: 1000,
    width: 1280,
    height: 720,
    frameRate: 30,
    codec: 'h264',
    colorMetadata: { colorSpace: 'srgb', range: 'full' },
    contentCrop: { x: 0, y: 0, width: 1280, height: 720 },
  });

  Object.assign(tokens, {
    status: 'measured',
    evidenceCutoff,
    sourceSha256,
    contrastPairs: [
      {
        foregroundTokenId: 'color.text',
        backgroundTokenId: 'color.black',
        ratio: 18,
        testedFrameIds: [frameId],
        passes: true,
      },
    ],
  });
  for (const token of tokens.tokens) {
    token.measuredValue = token.seedValue;
    token.finalValue = token.seedValue;
    token.provenance.measured = 'reference_measurement';
    token.provenance.final = 'reference_measurement';
    token.frameRoiSamples = [{ frameId, roiId, sampleValue: token.seedValue }];
    token.sampling = {
      samplingMethod: 'median_srgb_rectangular_roi',
      sampleCount: 64,
      dispersion: 0,
    };
  }

  Object.assign(spec, {
    status: 'measured',
    evidenceCutoff,
    sourceSha256,
    frameIds: [frameId],
    rois: [
      {
        id: roiId,
        frameId,
        x: 10,
        y: 20,
        width: 8,
        height: 8,
        purpose: 'palette sample',
      },
    ],
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    contentCrop: { x: 0, y: 0, width: 1280, height: 720 },
    typography: {
      glyphFixture,
      candidates: buildTypographyCandidates(),
      decision: {
        candidateId: 'inter.500.13-18.normal.1x',
        reason: 'schema-valid measured fixture',
        confidence: 0.9,
      },
    },
    geometry: {
      metrics: [
        {
          id: 'geometry.panel-padding',
          unit: 'px',
          frameIds: [frameId],
          rawSamples: [20, 20, 21],
          median: 20,
          range: { minimum: 20, maximum: 21 },
          confidence: 0.9,
        },
      ],
    },
    motionSamples: [
      {
        state: 'hover',
        startFrameId: frameId,
        endFrameId: frameId,
        durationMs: 0,
        easing: 'none',
        reducedMotionDecision: 'disable decorative motion',
        confidence: 0.9,
      },
    ],
    accentRatio: 0.02,
  });
  spec.motifs = spec.motifs.map((motif) => ({
    ...motif,
    tolerance: { metric: 'delta', maximum: 1 },
    status: 'measured',
  }));

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(tokensPath, `${JSON.stringify(tokens, null, 2)}\n`);
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  for (const name of ['REFERENCE_ANALYSIS.md', 'DESIGN.md', 'component-mapping.md']) {
    writeMarkdownFrontmatter(join(docs, name), (frontmatter) => {
      frontmatter.status = 'measured';
      frontmatter.evidenceCutoff = evidenceCutoff;
      frontmatter.sourceSha256 = sourceSha256;
      frontmatter.measurements = { fixture: 'schema-valid' };
      if (Object.hasOwn(frontmatter, 'frameIds')) frontmatter.frameIds = [frameId];
      if (Object.hasOwn(frontmatter, 'sampling')) {
        frontmatter.sampling = { method: 'fixture' };
        frontmatter.confidence = 0.9;
      }
    });
  }
}

test('the six committed reference artifacts satisfy their schemas and links', () => {
  const result = validateArtifacts(repositoryRoot);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.files, expectedFiles);
});

test('the blocked contract is truthful and contains no fabricated measurements', () => {
  const manifest = readJson(join(evidenceRoot, 'FRAME_MANIFEST.json'));
  const spec = readJson(join(evidenceRoot, 'reference-spec.json'));
  const tokens = readJson(join(evidenceRoot, 'design-tokens.json'));

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.status, 'blocked_missing_source');
  assert.equal(manifest.source.expectedFileName, expectedSource);
  assert.equal(manifest.source.sha256, null);
  assert.equal(manifest.source.durationMs, null);
  assert.equal(manifest.source.width, null);
  assert.equal(manifest.source.height, null);
  assert.equal(manifest.source.frameRate, null);
  assert.deepEqual(manifest.frames, []);
  assert.equal(spec.status, 'blocked_missing_source');
  assert.deepEqual(spec.frameIds, []);
  assert.equal(spec.expectedFileName, expectedSource);
  assert.equal(spec.accentRatio, null);
  assert.deepEqual(spec.motionSamples, []);
  assert.deepEqual(spec.rois, []);
  assert.deepEqual(
    Object.fromEntries(tokens.tokens.map((token) => [token.id, token.seedValue])),
    expectedPalette,
  );
  assert.ok(tokens.tokens.every((token) => token.category === 'color'));
  assert.ok(tokens.tokens.every((token) => token.provenance.seed === 'master_goal_seed'));
  assert.ok(tokens.tokens.every((token) => token.measuredValue === null));
  for (const name of expectedFiles) {
    const value = name.endsWith('.md')
      ? readMarkdownFrontmatter(join(evidenceRoot, name))
      : readJson(join(evidenceRoot, name));
    assert.equal(value.evidenceCutoff, evidenceCutoff);
  }
});

test('all Markdown frontmatter has deterministic common provenance, privacy, and links', () => {
  const names = ['REFERENCE_ANALYSIS.md', 'DESIGN.md', 'component-mapping.md'];
  const frontmatters = names.map((name) => readMarkdownFrontmatter(join(evidenceRoot, name)));
  const ids = new Set(frontmatters.map((frontmatter) => frontmatter.artifactId));

  for (const frontmatter of frontmatters) {
    assert.equal(frontmatter.schemaVersion, 1);
    assert.equal(frontmatter.status, 'blocked_missing_source');
    assert.equal(frontmatter.evidenceCutoff, evidenceCutoff);
    assert.equal(frontmatter.expectedFileName, expectedSource);
    assert.equal(frontmatter.sourceSha256, null);
    assert.equal(frontmatter.privacyDisposition, 'sanitized_no_private_source_data');
    assert.deepEqual(frontmatter.linkedArtifactIds, [...frontmatter.linkedArtifactIds].sort());
    assert.ok(frontmatter.linkedArtifactIds.length >= 5);
  }
  assert.equal(ids.size, 3);
});

test('future measured JSON schemas declare and enforce the complete evidence fields', () => {
  const expectations = {
    'frame-manifest.schema.json': [
      'measured',
      'codec',
      'colorMetadata',
      'contentCrop',
      'timestampMs',
      'frameNumber',
      'sceneTags',
      'stateTags',
      'excludedRegions',
      'purpose',
      'privacyDisposition',
    ],
    'design-tokens.schema.json': [
      'measured',
      'seedValue',
      'measuredValue',
      'finalValue',
      'frameRoiSamples',
      'samplingMethod',
      'sampleCount',
      'dispersion',
      'contrastPairs',
    ],
    'reference-spec.schema.json': [
      'measured',
      'viewport',
      'contentCrop',
      'typography',
      'candidates',
      'decision',
      'geometry',
      'range',
      'confidence',
      'motionSamples',
      'accentRatio',
      'motifs',
      'tolerance',
      'rois',
      'glyphFixture',
      'bundledFile',
      'bundledSha256',
      'license',
      'fontSizePx',
      'lineHeightPx',
      'tracking',
      'deviceScaleFactor',
      'fontsReady',
      'averageGlyphWidth',
      'averageNumeralWidth',
      'observations',
      'lineHeightDistance',
      'letterSpacingDistance',
      'aggregateScore',
      'rawSamples',
      'median',
    ],
  };
  for (const [name, fields] of Object.entries(expectations)) {
    const schema = readFileSync(join(evidenceRoot, 'schemas', name), 'utf8');
    for (const field of fields) {
      assert.ok(schema.includes(`"${field}"`), `${name} must define ${field}`);
    }
  }

  withFixture((root) => {
    const docs = join(root, 'docs/appearance/monochrome');
    const manifestPath = join(docs, 'FRAME_MANIFEST.json');
    const tokenPath = join(docs, 'design-tokens.json');
    const specPath = join(docs, 'reference-spec.json');
    const manifest = readJson(manifestPath);
    const tokens = readJson(tokenPath);
    const spec = readJson(specPath);
    manifest.status = 'measured';
    tokens.status = 'measured';
    spec.status = 'measured';
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(tokenPath, `${JSON.stringify(tokens, null, 2)}\n`);
    writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
    const result = validateArtifacts(root);
    assert.ok(result.errors.some((error) => error.includes('codec')));
    assert.ok(result.errors.some((error) => error.includes('contentCrop')));
    assert.ok(result.errors.some((error) => error.includes('measuredValue')));
    assert.ok(result.errors.some((error) => error.includes('frameRoiSamples')));
    assert.ok(result.errors.some((error) => error.includes('viewport')));
    assert.ok(result.errors.some((error) => error.includes('accentRatio')));
  });
});

test('a complete closed measured fixture satisfies every artifact schema and semantic link', () => {
  withFixture((root) => {
    promoteFixtureToMeasured(root);
    assert.deepEqual(validateArtifacts(root).errors, []);
  });
});

test('measured motion endpoints must reference manifest frames', () => {
  for (const endpoint of ['startFrameId', 'endFrameId']) {
    withFixture((root) => {
      promoteFixtureToMeasured(root);
      const path = join(root, 'docs/appearance/monochrome/reference-spec.json');
      const spec = readJson(path);
      spec.motionSamples[0][endpoint] = 'frame.missing';
      writeFileSync(path, `${JSON.stringify(spec, null, 2)}\n`);

      assert.ok(
        validateArtifacts(root).errors.some(
          (error) => error.includes(endpoint) && error.includes('orphan'),
        ),
        `expected orphan ${endpoint} rejection`,
      );
    });
  }
});

test('measured artifacts must share one source SHA with manifest source metadata', () => {
  const mutations = [
    {
      label: 'non-manifest artifact',
      apply: (docs) => {
        const path = join(docs, 'design-tokens.json');
        const tokens = readJson(path);
        tokens.sourceSha256 = 'c'.repeat(64);
        writeFileSync(path, `${JSON.stringify(tokens, null, 2)}\n`);
      },
    },
    {
      label: 'manifest nested source',
      apply: (docs) => {
        const path = join(docs, 'FRAME_MANIFEST.json');
        const manifest = readJson(path);
        manifest.source.sha256 = 'c'.repeat(64);
        writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      },
    },
  ];

  for (const mutation of mutations) {
    withFixture((root) => {
      promoteFixtureToMeasured(root);
      mutation.apply(join(root, 'docs/appearance/monochrome'));

      assert.ok(
        validateArtifacts(root).errors.some((error) => error.includes('source SHA')),
        `expected ${mutation.label} source SHA divergence rejection`,
      );
    });
  }
});

test('measured typography candidate IDs are unique and the decision ID is closed', () => {
  withFixture((root) => {
    promoteFixtureToMeasured(root);
    const path = join(root, 'docs/appearance/monochrome/reference-spec.json');
    const spec = readJson(path);
    spec.typography.candidates[1].id = spec.typography.candidates[0].id;
    writeFileSync(path, `${JSON.stringify(spec, null, 2)}\n`);

    assert.ok(
      validateArtifacts(root).errors.some(
        (error) => error.includes('typography candidates') && error.includes('duplicate ID'),
      ),
    );
  });

  withFixture((root) => {
    promoteFixtureToMeasured(root);
    const path = join(root, 'docs/appearance/monochrome/reference-spec.json');
    const spec = readJson(path);
    spec.typography.decision.candidateId = 'candidate.missing';
    writeFileSync(path, `${JSON.stringify(spec, null, 2)}\n`);

    assert.ok(
      validateArtifacts(root).errors.some(
        (error) => error.includes('typography decision') && error.includes('orphan candidateId'),
      ),
    );
  });
});

test('measured ROI, typography, and per-metric geometry defects are rejected', () => {
  const mutations = [
    {
      expected: 'width',
      apply: (spec) => {
        delete spec.rois[0].width;
      },
    },
    {
      expected: 'bundledSha256',
      apply: (spec) => {
        delete spec.typography.candidates[0].bundledSha256;
      },
    },
    {
      expected: 'typography matrix',
      apply: (spec) => {
        spec.typography.candidates.pop();
      },
    },
    {
      expected: 'median',
      apply: (spec) => {
        spec.geometry.metrics[0].median = 999;
      },
    },
    {
      expected: 'rawSamples',
      apply: (spec) => {
        delete spec.geometry.metrics[0].rawSamples;
      },
    },
  ];
  for (const mutation of mutations) {
    withFixture((root) => {
      promoteFixtureToMeasured(root);
      const path = join(root, 'docs/appearance/monochrome/reference-spec.json');
      const spec = readJson(path);
      mutation.apply(spec);
      writeFileSync(path, `${JSON.stringify(spec, null, 2)}\n`);
      assert.ok(
        validateArtifacts(root).errors.some((error) => error.includes(mutation.expected)),
        `expected ${mutation.expected} rejection`,
      );
    });
  }
});

test('duplicate IDs and orphan references are rejected', () => {
  withFixture((root) => {
    const path = join(root, 'docs/appearance/monochrome/reference-spec.json');
    const spec = readJson(path);
    spec.tokenIds = [spec.tokenIds[0], spec.tokenIds[0], 'token.missing'];
    writeFileSync(path, `${JSON.stringify(spec, null, 2)}\n`);

    const result = validateArtifacts(root);
    assert.ok(result.errors.some((error) => error.includes('duplicate')));
    assert.ok(result.errors.some((error) => error.includes('orphan')));
  });
});

test('reverse-orphan definitions and non-bidirectional artifact links are rejected', () => {
  withFixture((root) => {
    const docs = join(root, 'docs/appearance/monochrome');
    const specPath = join(docs, 'reference-spec.json');
    const spec = readJson(specPath);
    spec.tokenIds = spec.tokenIds.filter((id) => id !== 'color.border');
    writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
    for (const name of ['REFERENCE_ANALYSIS.md', 'DESIGN.md']) {
      writeMarkdownFrontmatter(join(docs, name), (frontmatter) => {
        frontmatter.tokenIds = frontmatter.tokenIds.filter((id) => id !== 'color.border');
      });
    }
    writeMarkdownFrontmatter(join(docs, 'DESIGN.md'), (frontmatter) => {
      frontmatter.linkedArtifactIds = frontmatter.linkedArtifactIds.filter(
        (id) => id !== 'frame-manifest',
      );
    });

    const result = validateArtifacts(root);
    assert.ok(result.errors.some((error) => error.includes('reverse-orphan')));
    assert.ok(result.errors.some((error) => error.includes('bidirectional')));
  });
});

test('component mappings use literal paths and round-trip one exact eight-column table', () => {
  const path = join(evidenceRoot, 'component-mapping.md');
  const source = readFileSync(path, 'utf8');
  const frontmatter = readMarkdownFrontmatter(path);
  assert.ok(
    frontmatter.mappings.every((mapping) =>
      /^app\/src\/.+\.tsx$/.test(mapping.vibeSpaceRouteComponentPath),
    ),
  );
  assert.ok(
    frontmatter.mappings.every((mapping) =>
      existsSync(join(repositoryRoot, mapping.vibeSpaceRouteComponentPath)),
    ),
  );
  assert.ok(frontmatter.mappings.every((mapping) => mapping.referenceMotifFrameIds.length > 0));
  assert.equal(
    source.match(/^\| Mapping ID\s*\|/gm)?.length,
    1,
    'exactly one mapping table is required',
  );

  withFixture((root) => {
    const fixturePath = join(root, 'docs/appearance/monochrome/component-mapping.md');
    const fixture = readFileSync(fixturePath, 'utf8').replace(
      /\| color\.black\s*\|/,
      '| color.surface-1 |',
    );
    writeFileSync(fixturePath, fixture);
    const result = validateArtifacts(root);
    assert.ok(result.errors.some((error) => error.includes('table projection')));
  });
});

test('extra mapping tables, malformed cells, and stale rows are rejected', () => {
  withFixture((root) => {
    const path = join(root, 'docs/appearance/monochrome/component-mapping.md');
    const source = readFileSync(path, 'utf8');
    writeFileSync(
      path,
      `${source}\n| Mapping ID | Reference motif/frame IDs | VibeSpace route/component path | Semantic token | Allowed scoped exception | State coverage | Test owner | Status |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| mapping.stale | motif.stale | app/src/pages/Stale.tsx::Stale | color.canvas | none | default | nobody | stale |\n`,
    );
    const result = validateArtifacts(root);
    assert.ok(result.errors.some((error) => error.includes('exactly one table')));
    assert.ok(result.errors.some((error) => error.includes('stale')));
  });
});

test('a differently headed second contiguous pipe table is rejected', () => {
  withFixture((root) => {
    const path = join(root, 'docs/appearance/monochrome/component-mapping.md');
    writeFileSync(
      path,
      `${readFileSync(path, 'utf8')}\n\n| Other | Values |\n| --- | --- |\n| harmless | row |\n`,
    );
    assert.ok(
      validateArtifacts(root).errors.some((error) => error.includes('exactly one pipe table')),
    );
  });
});

test('duplicate, missing, and extra-cell mapping rows are rejected', () => {
  const transforms = [
    {
      expected: 'duplicate',
      apply: (source) => {
        const row = source.split(/\r?\n/).find((line) => line.startsWith('| mapping.plans-page'));
        return source.replace(row, `${row}\n${row}`);
      },
    },
    {
      expected: 'table projection',
      apply: (source) =>
        source
          .split(/\r?\n/)
          .filter((line) => !line.startsWith('| mapping.hive-page'))
          .join('\n'),
    },
    {
      expected: 'malformed',
      apply: (source) =>
        source.replace(/^(\| mapping\.plugins-page .*)\|$/m, '$1| unexpected extra cell |'),
    },
  ];
  for (const transform of transforms) {
    withFixture((root) => {
      const path = join(root, 'docs/appearance/monochrome/component-mapping.md');
      writeFileSync(path, transform.apply(readFileSync(path, 'utf8')));
      const result = validateArtifacts(root);
      assert.ok(
        result.errors.some((error) => error.includes(transform.expected)),
        `expected ${transform.expected} rejection`,
      );
    });
  }
});

test('blocked status rejects populated measured fields', () => {
  withFixture((root) => {
    const path = join(root, 'docs/appearance/monochrome/FRAME_MANIFEST.json');
    const manifest = readJson(path);
    manifest.source.durationMs = 1000;
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = validateArtifacts(root);
    assert.ok(
      result.errors.some(
        (error) => error.includes('durationMs') && error.includes('blocked_missing_source'),
      ),
    );
  });
});

test('exact analyzer CLI fails closed, sanitizes errors, and never mutates evidence', () => {
  const before = hashEvidence();
  const analyzer = join(scriptDir, 'analyze-reference.mjs');
  const docs = 'docs/appearance/monochrome';
  const artifacts = '.artifacts/monochrome/test/reference';
  const unset = spawnSync(process.execPath, [analyzer]);
  const sensitiveMissingPath = join(repositoryRoot, 'private-user', 'Downloads', expectedSource);
  const missing = spawnSync(process.execPath, [
    analyzer,
    '--video',
    sensitiveMissingPath,
    '--artifacts',
    artifacts,
    '--docs',
    docs,
  ]);
  const unknown = spawnSync(process.execPath, [analyzer, '--unknown']);
  const duplicate = spawnSync(process.execPath, [
    analyzer,
    '--video',
    expectedSource,
    '--video',
    expectedSource,
    '--artifacts',
    artifacts,
    '--docs',
    docs,
  ]);
  const missingValue = spawnSync(process.execPath, [analyzer, '--video']);
  const wrongDocs = spawnSync(process.execPath, [
    analyzer,
    '--video',
    expectedSource,
    '--artifacts',
    artifacts,
    '--docs',
    'docs/other',
  ]);

  assert.equal(unset.status, 64);
  assert.equal(missing.status, 2);
  assert.equal(unknown.status, 64);
  assert.equal(duplicate.status, 64);
  assert.equal(missingValue.status, 64);
  assert.equal(wrongDocs.status, 64);
  assert.ok(!missing.stderr.toString().includes(sensitiveMissingPath));
  assert.deepEqual(hashEvidence(), before);
});

test('present video takes the safe MC8A exit with exact CLI and no writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'monochrome-video-'));
  const video = join(root, expectedSource);
  writeFileSync(video, 'non-reference test placeholder');
  const before = hashEvidence();
  try {
    const present = spawnSync(process.execPath, [
      join(scriptDir, 'analyze-reference.mjs'),
      '--video',
      video,
      '--artifacts',
      '.artifacts/monochrome/test/reference',
      '--docs',
      'docs/appearance/monochrome',
    ]);
    assert.equal(present.status, 3);
    assert.ok(!present.stderr.toString().includes(video));
    assert.deepEqual(hashEvidence(), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('directories, symlinks, and invalid paths fail the regular-file policy without writes', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'monochrome-input-policy-'));
  const analyzer = join(scriptDir, 'analyze-reference.mjs');
  const before = hashEvidence();
  const run = (video) =>
    spawnSync(process.execPath, [
      analyzer,
      '--video',
      video,
      '--artifacts',
      '.artifacts/monochrome/test/reference',
      '--docs',
      'docs/appearance/monochrome',
    ]);
  try {
    const directory = join(root, expectedSource);
    mkdirSync(directory);
    const directoryResult = run(directory);
    assert.equal(directoryResult.status, 2);
    assert.ok(!directoryResult.stderr.toString().includes(directory));

    const invalidPath = `Z:/definitely-inaccessible/${expectedSource}`;
    const invalidResult = run(invalidPath);
    assert.equal(invalidResult.status, 2);
    assert.ok(!invalidResult.stderr.toString().includes(invalidPath));

    const realDirectory = join(root, 'real');
    const linkDirectory = join(root, 'link');
    mkdirSync(realDirectory);
    mkdirSync(linkDirectory);
    const target = join(realDirectory, expectedSource);
    const link = join(linkDirectory, expectedSource);
    writeFileSync(target, 'regular target');
    try {
      symlinkSync(target, link, 'file');
      const linkResult = run(link);
      assert.equal(linkResult.status, 2);
      assert.ok(!linkResult.stderr.toString().includes(link));
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        t.diagnostic('symlink creation unavailable; fail-closed policy covered where supported');
      } else {
        throw error;
      }
    }
    assert.deepEqual(hashEvidence(), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('committed-artifact privacy rejects paths, URLs, identities, secrets, and copied content', () => {
  const probes = [
    'C:\\Users\\private-user\\Downloads\\recording.mp4',
    'C:/Downloads/recording.mp4',
    'D:/private-frames/frame.png',
    '\\\\private-server\\private-share\\frame.png',
    'file:///private/reference.mp4',
    'https://private.example/reference',
    'private.user@example.test',
    'sk-proj-1234567890abcdefghijklmnop',
    'copied source content: private account name',
  ];
  for (const probe of probes) {
    withFixture((root) => {
      const path = join(root, 'docs/appearance/monochrome/REFERENCE_ANALYSIS.md');
      writeFileSync(path, `${readFileSync(path, 'utf8')}\n${probe}\n`);
      const result = validateArtifacts(root);
      assert.ok(
        result.errors.some((error) => error.includes('privacy')),
        `privacy validator must reject ${probe}`,
      );
    });
  }
});

test('privacy validation does not reject harmless artifact and schema identifiers', () => {
  withFixture((root) => {
    const path = join(root, 'docs/appearance/monochrome/REFERENCE_ANALYSIS.md');
    writeFileSync(
      path,
      `${readFileSync(path, 'utf8')}\nschema.identifier frame.reference-0001 C:token\n`,
    );
    assert.deepEqual(validateArtifacts(root).errors, []);
  });
});

test('the validator CLI succeeds for the committed contract', () => {
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, [join(scriptDir, 'analyze-reference.mjs'), '--validate']),
  );
});
