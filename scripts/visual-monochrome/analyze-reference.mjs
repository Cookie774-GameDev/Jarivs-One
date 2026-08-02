import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const EXPECTED_SOURCE = 'Screen Recording 2026-07-16 220632.mp4';
const EVIDENCE_CUTOFF = '2026-07-30T04:58:59.5349264Z';
const GLYPH_FIXTURE = 'AaBbGgQqRr 0O1Il []{}() <> /\\\\ :;,.!? +-=_ #@% & | -> <- 0123456789';
const EXPECTED_PALETTE = {
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
const FRONTMATTER_START = '<!-- MONOCHROME_JSON_FRONTMATTER\n';
const FRONTMATTER_END = '\nMONOCHROME_JSON_FRONTMATTER -->';
const FRONTMATTER_START_PATTERN = /^<!-- MONOCHROME_JSON_FRONTMATTER\r?\n/u;
const FRONTMATTER_END_PATTERN = /\r?\nMONOCHROME_JSON_FRONTMATTER -->/u;
const EVIDENCE_FILES = [
  'REFERENCE_ANALYSIS.md',
  'FRAME_MANIFEST.json',
  'DESIGN.md',
  'design-tokens.json',
  'reference-spec.json',
  'component-mapping.md',
];

const artifactDefinitions = [
  {
    filename: 'FRAME_MANIFEST.json',
    schema: 'frame-manifest.schema.json',
    format: 'json',
  },
  {
    filename: 'design-tokens.json',
    schema: 'design-tokens.schema.json',
    format: 'json',
  },
  {
    filename: 'reference-spec.json',
    schema: 'reference-spec.schema.json',
    format: 'json',
  },
  {
    filename: 'REFERENCE_ANALYSIS.md',
    schema: 'reference-analysis.schema.json',
    format: 'markdown',
  },
  {
    filename: 'DESIGN.md',
    schema: 'design.schema.json',
    format: 'markdown',
  },
  {
    filename: 'component-mapping.md',
    schema: 'component-mapping.schema.json',
    format: 'markdown',
  },
];

const requiredHeadings = {
  'REFERENCE_ANALYSIS.md': [
    'Source Status',
    'Reproducible Method',
    'Frame Evidence',
    'Palette',
    'Typography',
    'Geometry',
    'Motion',
    'Limitations',
    'Privacy',
  ],
  'DESIGN.md': [
    'Authority',
    'Direction',
    'Hierarchy',
    'Tokens',
    'Components',
    'Accessibility',
    'Motion',
    'Preserved Themes',
    'Anti-Goals',
  ],
};

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(value, expected) {
  if (Array.isArray(expected)) {
    return expected.some((entry) => matchesType(value, entry));
  }
  if (expected === 'integer') return typeof value === 'number' && Number.isInteger(value);
  return valueType(value) === expected;
}

function validateSchema(value, schema, path, errors) {
  if ('const' in schema && !sameValue(value, schema.const)) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
    return;
  }
  if (schema.enum && !schema.enum.some((entry) => sameValue(value, entry))) {
    errors.push(`${path} must be one of ${schema.enum.join(', ')}`);
  }
  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path} must have type ${JSON.stringify(schema.type)}`);
    return;
  }
  if (matchesType(value, 'object') && schema.type === 'object') {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) {
          errors.push(`${path}.${key} is not allowed`);
        }
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) {
        validateSchema(value[key], childSchema, `${path}.${key}`, errors);
      }
    }
  }
  if (Array.isArray(value) && schema.type === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} must have at least ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path} must have at most ${schema.maxItems} items`);
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push(`${path} contains a duplicate item`);
        seen.add(key);
      }
    }
    if (schema.items) {
      value.forEach((item, index) =>
        validateSchema(item, schema.items, `${path}[${index}]`, errors),
      );
    }
  }
  if (typeof value === 'string' && schema.type === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} must contain at least ${schema.minLength} characters`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} must match ${schema.pattern}`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path} must be at least ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path} must be at most ${schema.maximum}`);
    }
  }
  for (const childSchema of schema.allOf ?? []) {
    validateSchema(value, childSchema, path, errors);
  }
  if (schema.oneOf) {
    const branchResults = schema.oneOf.map((childSchema) => {
      const branchErrors = [];
      validateSchema(value, childSchema, path, branchErrors);
      return branchErrors;
    });
    const matches = branchResults.filter((branchErrors) => branchErrors.length === 0);
    if (matches.length !== 1) {
      errors.push(`${path} must satisfy exactly one status contract`);
      if (matches.length === 0) {
        const matchingStatusIndex = schema.oneOf.findIndex(
          (childSchema) => childSchema.properties?.status?.const === value?.status,
        );
        const mostRelevant =
          matchingStatusIndex >= 0
            ? branchResults[matchingStatusIndex]
            : [...branchResults].sort((left, right) => left.length - right.length)[0];
        errors.push(...mostRelevant);
      }
    }
  }
}

function parseMarkdownFrontmatter(source, filename) {
  const start = FRONTMATTER_START_PATTERN.exec(source);
  if (!start) {
    throw new Error(`${filename} must begin with delimited JSON frontmatter`);
  }
  const remainder = source.slice(start[0].length);
  const end = FRONTMATTER_END_PATTERN.exec(remainder);
  if (!end) {
    throw new Error(`${filename} has unterminated JSON frontmatter`);
  }
  const json = remainder.slice(0, end.index);
  return JSON.parse(json);
}

function collectDuplicates(values, label, errors) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label} contains duplicate ID ${value}`);
    seen.add(value);
  }
}

function collectOrphans(values, available, label, errors) {
  for (const value of values) {
    if (!available.has(value)) errors.push(`${label} has orphan ID ${value}`);
  }
}

function sameMembers(left, right) {
  return (
    left.length === right.size &&
    new Set(left).size === left.length &&
    left.every((value) => right.has(value))
  );
}

function requireExactClosure(values, defined, label, errors) {
  collectDuplicates(values, label, errors);
  collectOrphans(values, defined, label, errors);
  for (const id of defined) {
    if (!values.includes(id)) errors.push(`${label} has reverse-orphan definition ${id}`);
  }
}

function numericMedian(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function typographyConditionKey(candidate) {
  const condition = candidate.condition ?? {};
  return [
    candidate.family,
    candidate.weight,
    condition.fontSizePx,
    condition.lineHeightPx,
    condition.tracking,
    condition.deviceScaleFactor,
  ].join('|');
}

function expectedTypographyKeys() {
  const keys = [];
  for (const family of ['JetBrains Mono', 'Inter', 'Plus Jakarta Sans']) {
    for (const weight of [400, 500, 600]) {
      for (const [fontSizePx, lineHeightPx] of [
        [12, 16],
        [13, 18],
      ]) {
        for (const tracking of ['normal', 'uppercase_label']) {
          for (const deviceScaleFactor of [1, 2]) {
            keys.push(
              [family, weight, fontSizePx, lineHeightPx, tracking, deviceScaleFactor].join('|'),
            );
          }
        }
      }
    }
  }
  return keys;
}

const privacyPatterns = [
  { label: 'drive-absolute path', pattern: /\b[A-Za-z]:[\\/]/ },
  {
    label: 'UNC path',
    pattern: /(?:^|[\s"'`])(?:\\\\|\/\/)[^\\/\s]+[\\/][^\\/\s]+/m,
  },
  { label: 'absolute user path', pattern: /\/(?:Users|home)\/[^/\s]+/i },
  {
    label: 'absolute Downloads or private-frame path',
    pattern: /[/\\](?:Downloads|private[-_ ]?frames?)[/\\]/i,
  },
  { label: 'file URL', pattern: /\bfile:\/\//i },
  { label: 'network URL', pattern: /\bhttps?:\/\//i },
  {
    label: 'email-like identity',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    label: 'key-like secret',
    pattern: /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{20,})\b/,
  },
  { label: 'copied source content marker', pattern: /copied source content\s*:/i },
];

function validatePrivacy(source, filename, errors) {
  for (const { label, pattern } of privacyPatterns) {
    if (pattern.test(source)) {
      errors.push(`${filename} privacy violation: ${label}`);
    }
  }
}

export function validateArtifacts(repositoryRoot = resolveRepositoryRoot()) {
  const evidenceRoot = join(repositoryRoot, 'docs/appearance/monochrome');
  const schemaRoot = join(evidenceRoot, 'schemas');
  const errors = [];
  const artifacts = {};
  const markdownSources = {};

  for (const definition of artifactDefinitions) {
    const artifactPath = join(evidenceRoot, definition.filename);
    const schemaPath = join(schemaRoot, definition.schema);
    try {
      const source = readFileSync(artifactPath, 'utf8');
      validatePrivacy(source, definition.filename, errors);
      const value =
        definition.format === 'json'
          ? JSON.parse(source)
          : parseMarkdownFrontmatter(source, definition.filename);
      const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
      validateSchema(value, schema, definition.filename, errors);
      artifacts[definition.filename] = value;
      if (definition.format === 'markdown') {
        markdownSources[definition.filename] = source;
      }
    } catch (error) {
      errors.push(`${definition.filename}: ${error.message}`);
    }
  }

  const manifest = artifacts['FRAME_MANIFEST.json'];
  const tokens = artifacts['design-tokens.json'];
  const spec = artifacts['reference-spec.json'];
  const analysis = artifacts['REFERENCE_ANALYSIS.md'];
  const design = artifacts['DESIGN.md'];
  const componentMapping = artifacts['component-mapping.md'];

  if (manifest && tokens && spec && analysis && design && componentMapping) {
    const artifactEntries = Object.entries(artifacts);
    const artifactIds = artifactEntries.map(([, artifact]) => artifact.artifactId);
    const artifactSet = new Set(artifactIds);
    const frameIds = manifest.frames.map((frame) => frame.id);
    const tokenIds = tokens.tokens.map((token) => token.id);
    const mappingIds = componentMapping.mappings.map((mapping) => mapping.id);
    const motifIds = spec.motifs.map((motif) => motif.id);
    const frameSet = new Set(frameIds);
    const tokenSet = new Set(tokenIds);
    const mappingSet = new Set(mappingIds);
    const motifSet = new Set(motifIds);
    const roiIds = spec.rois.map((roi) => roi.id);
    const roiSet = new Set(roiIds);

    collectDuplicates(artifactIds, 'artifact IDs', errors);
    collectDuplicates(frameIds, 'FRAME_MANIFEST.json frames', errors);
    collectDuplicates(tokenIds, 'design-tokens.json tokens', errors);
    collectDuplicates(mappingIds, 'component-mapping.md mappings', errors);
    collectDuplicates(motifIds, 'reference-spec.json motifs', errors);
    collectDuplicates(roiIds, 'reference-spec.json rois', errors);
    for (const roi of spec.rois) {
      collectOrphans([roi.frameId], frameSet, `${roi.id} frameId`, errors);
    }

    requireExactClosure(spec.frameIds, frameSet, 'reference-spec.json frameIds', errors);
    requireExactClosure(spec.tokenIds, tokenSet, 'reference-spec.json tokenIds', errors);
    requireExactClosure(spec.mappingIds, mappingSet, 'reference-spec.json mappingIds', errors);
    requireExactClosure(analysis.frameIds, frameSet, 'REFERENCE_ANALYSIS.md frameIds', errors);
    requireExactClosure(analysis.tokenIds, tokenSet, 'REFERENCE_ANALYSIS.md tokenIds', errors);
    requireExactClosure(analysis.motifIds, motifSet, 'REFERENCE_ANALYSIS.md motifIds', errors);
    requireExactClosure(design.frameIds, frameSet, 'DESIGN.md frameIds', errors);
    requireExactClosure(design.tokenIds, tokenSet, 'DESIGN.md tokenIds', errors);
    requireExactClosure(design.mappingIds, mappingSet, 'DESIGN.md mappingIds', errors);
    requireExactClosure(design.motifIds, motifSet, 'DESIGN.md motifIds', errors);

    const referencedRoiIds = [];
    for (const mapping of componentMapping.mappings) {
      for (const referenceId of mapping.referenceMotifFrameIds) {
        if (!frameSet.has(referenceId) && !motifSet.has(referenceId)) {
          errors.push(`${mapping.id} has orphan motif/frame ID ${referenceId}`);
        }
      }
      collectOrphans([mapping.semanticTokenId], tokenSet, `${mapping.id} semanticTokenId`, errors);
    }

    for (const token of tokens.tokens) {
      for (const sample of token.frameRoiSamples) {
        collectOrphans([sample.frameId], frameSet, `${token.id} sample frameId`, errors);
        collectOrphans([sample.roiId], roiSet, `${token.id} sample roiId`, errors);
        referencedRoiIds.push(sample.roiId);
      }
    }
    for (const pair of tokens.contrastPairs) {
      collectOrphans(
        [pair.foregroundTokenId, pair.backgroundTokenId],
        tokenSet,
        'contrast pair token IDs',
        errors,
      );
      collectOrphans(pair.testedFrameIds, frameSet, 'contrast pair frame IDs', errors);
    }
    for (const roiId of roiSet) {
      if (!referencedRoiIds.includes(roiId)) {
        errors.push(`reference-spec.json rois has reverse-orphan definition ${roiId}`);
      }
    }

    for (const [filename, artifact] of artifactEntries) {
      const expectedLinks = [...artifactSet].filter((id) => id !== artifact.artifactId).sort();
      const actualLinks = artifact.linkedArtifactIds ?? [];
      if (!sameValue(actualLinks, expectedLinks)) {
        errors.push(`${filename} linkedArtifactIds must be deterministic and bidirectional`);
      }
      if (
        artifact.expectedFileName !== EXPECTED_SOURCE ||
        artifact.evidenceCutoff !== EVIDENCE_CUTOFF ||
        artifact.privacyDisposition !== 'sanitized_no_private_source_data'
      ) {
        errors.push(`${filename} common source/privacy contract is invalid`);
      }
    }

    if (
      manifest.source.expectedFileName !== EXPECTED_SOURCE ||
      manifest.source.sha256 !== manifest.sourceSha256
    ) {
      errors.push('FRAME_MANIFEST.json sanitized source metadata is inconsistent');
    }

    const statuses = new Set(artifactEntries.map(([, artifact]) => artifact.status));
    if (statuses.size !== 1) {
      errors.push('artifact statuses must move between blocked and measured together');
    }

    const actualPalette = Object.fromEntries(
      tokens.tokens.map((token) => [token.id, token.seedValue]),
    );
    if (!sameValue(actualPalette, EXPECTED_PALETTE)) {
      errors.push('design-tokens.json must contain the exact master_goal_seed palette');
    }

    if (manifest.status === 'measured') {
      const measuredSourceHashes = [
        ...artifactEntries.map(([, artifact]) => artifact.sourceSha256),
        manifest.source.sha256,
      ];
      if (new Set(measuredSourceHashes).size !== 1) {
        errors.push(
          'measured artifacts and FRAME_MANIFEST.json source metadata must share one source SHA',
        );
      }

      const candidates = spec.typography.candidates;
      const candidateIds = candidates.map((candidate) => candidate.id);
      const actualKeys = candidates.map(typographyConditionKey);
      const requiredKeys = expectedTypographyKeys();
      collectDuplicates(candidateIds, 'reference-spec.json typography candidates', errors);
      if (
        spec.typography.glyphFixture !== GLYPH_FIXTURE ||
        !sameValue([...actualKeys].sort(), [...requiredKeys].sort()) ||
        new Set(actualKeys).size !== requiredKeys.length
      ) {
        errors.push('reference-spec.json typography matrix must be complete and closed');
      }
      for (const candidate of candidates) {
        if (candidate.glyphFixture !== GLYPH_FIXTURE) {
          errors.push(`${candidate.id} glyphFixture must match the mandated typography fixture`);
        }
      }
      if (!candidates.some((candidate) => candidate.id === spec.typography.decision.candidateId)) {
        errors.push('reference-spec.json typography decision has orphan candidateId');
      }

      for (const motionSample of spec.motionSamples) {
        collectOrphans(
          [motionSample.startFrameId],
          frameSet,
          'reference-spec.json motionSamples startFrameId',
          errors,
        );
        collectOrphans(
          [motionSample.endFrameId],
          frameSet,
          'reference-spec.json motionSamples endFrameId',
          errors,
        );
      }

      const metricIds = spec.geometry.metrics.map((metric) => metric.id);
      collectDuplicates(metricIds, 'reference-spec.json geometry metrics', errors);
      for (const metric of spec.geometry.metrics) {
        collectOrphans(metric.frameIds, frameSet, `${metric.id} frameIds`, errors);
        if (!Array.isArray(metric.rawSamples) || metric.rawSamples.length === 0 || !metric.range) {
          continue;
        }
        const expectedMedian = numericMedian(metric.rawSamples);
        const minimum = Math.min(...metric.rawSamples);
        const maximum = Math.max(...metric.rawSamples);
        if (
          metric.median !== expectedMedian ||
          metric.range.minimum !== minimum ||
          metric.range.maximum !== maximum
        ) {
          errors.push(`${metric.id} median and range must match rawSamples`);
        }
      }
    }

    if (manifest.status === 'blocked_missing_source') {
      for (const field of [
        'sha256',
        'durationMs',
        'width',
        'height',
        'frameRate',
        'codec',
        'colorMetadata',
        'contentCrop',
      ]) {
        if (manifest.source[field] !== null) {
          errors.push(
            `FRAME_MANIFEST.json source.${field} must be null for blocked_missing_source`,
          );
        }
      }
      if (manifest.sampling !== null || manifest.frames.length !== 0) {
        errors.push(
          'FRAME_MANIFEST.json measured evidence must be null or empty for blocked_missing_source',
        );
      }

      for (const token of tokens.tokens) {
        if (
          token.measuredValue !== null ||
          token.finalValue !== null ||
          token.frameRoiSamples.length !== 0 ||
          token.sampling !== null ||
          token.provenance.measured !== null ||
          token.provenance.final !== null
        ) {
          errors.push(
            `${token.id} measured token fields must be null or empty for blocked_missing_source`,
          );
        }
      }
      if (tokens.contrastPairs.length !== 0) {
        errors.push('contrastPairs must be empty for blocked_missing_source');
      }
    }
  }

  for (const [filename, headings] of Object.entries(requiredHeadings)) {
    const source = markdownSources[filename];
    if (!source) continue;
    const lines = source.split(/\r?\n/u);
    for (const heading of headings) {
      if (!lines.includes(`## ${heading}`)) {
        errors.push(`${filename} is missing required heading ${heading}`);
      }
    }
  }

  const mappingSource = markdownSources['component-mapping.md'];
  if (mappingSource) {
    const requiredColumns = [
      'Mapping ID',
      'Reference motif/frame IDs',
      'VibeSpace route/component path',
      'Semantic token',
      'Allowed scoped exception',
      'State coverage',
      'Test owner',
      'Status',
    ];
    const lines = mappingSource.split(/\r?\n/);
    const pipeTableBlockCount = lines.reduce(
      (count, line, index) =>
        line.startsWith('|') && (index === 0 || !lines[index - 1].startsWith('|'))
          ? count + 1
          : count,
      0,
    );
    if (pipeTableBlockCount !== 1) {
      errors.push('component-mapping.md must contain exactly one pipe table block');
    }
    const pipeLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.startsWith('|'));
    const parsedLines = pipeLines.map(({ line, index }) => ({
      index,
      cells: line.endsWith('|')
        ? line
            .slice(1, -1)
            .split('|')
            .map((cell) => cell.trim())
        : [],
    }));
    const headerRows = parsedLines.filter(({ cells }) => cells[0] === 'Mapping ID');
    if (headerRows.length !== 1) {
      errors.push('component-mapping.md must contain exactly one table');
    }
    const header = headerRows[0];
    if (!header || !sameValue(header.cells, requiredColumns)) {
      errors.push('component-mapping.md table columns must match the exact ordered contract');
    }

    const allMappingRows = parsedLines.filter(({ cells }) => cells[0]?.startsWith('mapping.'));
    collectDuplicates(
      allMappingRows.map(({ cells }) => cells[0]),
      'component-mapping.md table rows',
      errors,
    );
    for (const { cells } of allMappingRows) {
      if (cells.length !== 8) {
        errors.push(`component-mapping.md malformed row ${cells[0] ?? '<unknown>'}`);
      }
    }
    const primaryRows = [];
    if (header) {
      let lineIndex = header.index + 1;
      const separator = parsedLines.find(({ index }) => index === lineIndex);
      if (
        !separator ||
        separator.cells.length !== 8 ||
        !separator.cells.every((cell) => /^:?-{3,}:?$/.test(cell))
      ) {
        errors.push('component-mapping.md table separator is malformed');
      }
      lineIndex += 1;
      while (lineIndex < lines.length && lines[lineIndex].startsWith('|')) {
        const parsed = parsedLines.find(({ index }) => index === lineIndex);
        if (!parsed || parsed.cells.length !== 8) {
          errors.push('component-mapping.md table row has malformed cell count');
        } else {
          primaryRows.push(parsed.cells);
        }
        lineIndex += 1;
      }
    }

    const expectedRows = (componentMapping?.mappings ?? []).map((mapping) => [
      mapping.id,
      mapping.referenceMotifFrameIds.join(', '),
      mapping.vibeSpaceRouteComponentPath,
      mapping.semanticTokenId,
      mapping.allowedScopedException,
      mapping.stateCoverage,
      mapping.testOwner,
      mapping.status,
    ]);
    if (!sameValue(primaryRows, expectedRows)) {
      errors.push('component-mapping.md table projection is not value-for-value');
    }
    const definedMappingIds = new Set(expectedRows.map((row) => row[0]));
    for (const { cells } of allMappingRows) {
      if (cells[0] && !definedMappingIds.has(cells[0])) {
        errors.push(`component-mapping.md has stale row ${cells[0]}`);
      }
    }
  }

  return { errors, files: [...EVIDENCE_FILES] };
}

function resolveRepositoryRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..');
}

function parseCli(args) {
  if (args.length === 1 && args[0] === '--validate') {
    return { mode: 'validate' };
  }
  const allowed = new Set(['--video', '--artifacts', '--docs']);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      !allowed.has(flag) ||
      Object.hasOwn(values, flag) ||
      value === undefined ||
      value.startsWith('--')
    ) {
      return null;
    }
    values[flag] = value;
  }
  if (
    Object.keys(values).length !== 3 ||
    values['--docs'] !== 'docs/appearance/monochrome' ||
    isAbsolute(values['--artifacts']) ||
    !values['--artifacts'].replaceAll('\\', '/').startsWith('.artifacts/monochrome/') ||
    values['--artifacts'].split(/[\\/]/).includes('..') ||
    basename(values['--video']) !== EXPECTED_SOURCE
  ) {
    return null;
  }
  const destinations = [
    resolve(values['--video']),
    resolve(values['--artifacts']),
    resolve(values['--docs']),
  ];
  if (new Set(destinations).size !== destinations.length) return null;
  return {
    mode: 'analyze',
    video: values['--video'],
    artifacts: values['--artifacts'],
    docs: values['--docs'],
  };
}

function isGuardedRegularFile(path) {
  let descriptor;
  try {
    const linkMetadata = lstatSync(path);
    if (linkMetadata.isSymbolicLink() || !linkMetadata.isFile()) return false;
    const targetMetadata = statSync(path);
    if (!targetMetadata.isFile()) return false;
    descriptor = openSync(path, 'r');
    const openedMetadata = fstatSync(descriptor);
    return (
      openedMetadata.isFile() &&
      openedMetadata.dev === linkMetadata.dev &&
      openedMetadata.ino === linkMetadata.ino
    );
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

const WOFF2_KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

function runLocalTool(command, args, maxBuffer = 512 * 1024 * 1024) {
  const result = spawnSync(command, args, {
    encoding: 'buffer',
    maxBuffer,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 'unknown'}`);
  }
  return result.stdout;
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function parseRate(value) {
  const [numerator, denominator] = String(value ?? '')
    .split('/')
    .map(Number);
  return denominator > 0 ? numerator / denominator : Number(value);
}

function probeVideo(video) {
  const output = runLocalTool('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,width,height,avg_frame_rate,pix_fmt,color_space,color_range,color_transfer,color_primaries,nb_frames',
    '-show_entries',
    'format=duration,size',
    '-of',
    'json',
    '--',
    video,
  ]);
  const probe = JSON.parse(output.toString('utf8'));
  const stream = probe.streams?.[0];
  const durationSeconds = Number(probe.format?.duration);
  const frameRate = parseRate(stream?.avg_frame_rate);
  if (
    !stream ||
    !Number.isInteger(stream.width) ||
    !Number.isInteger(stream.height) ||
    !Number.isFinite(durationSeconds) ||
    !Number.isFinite(frameRate) ||
    frameRate <= 0
  ) {
    throw new Error('ffprobe returned incomplete video metadata');
  }
  return {
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    frameRate,
    durationMs: Math.round(durationSeconds * 1000),
    declaredFrameCount: Number(stream.nb_frames) || null,
    pixelFormat: stream.pix_fmt || 'unspecified',
    colorSpace: stream.color_space || 'unspecified',
    colorRange: stream.color_range || 'unspecified',
    colorTransfer: stream.color_transfer || 'unspecified',
    colorPrimaries: stream.color_primaries || 'unspecified',
  };
}

function extractPrivateFrames(video, artifactRoot) {
  const framesRoot = join(artifactRoot, 'frames');
  mkdirSync(framesRoot, { recursive: true });
  runLocalTool('ffmpeg', [
    '-v',
    'error',
    '-i',
    video,
    '-vsync',
    '0',
    join(framesRoot, 'frame-%06d.png'),
  ]);
  return {
    framesRoot,
    frameCount: readdirSync(framesRoot).filter((name) => /^frame-\d{6}\.png$/u.test(name)).length,
  };
}

function decodeAnalysisFrames(video, metadata) {
  const width = Math.min(320, metadata.width);
  const height = Math.max(2, Math.round((metadata.height * width) / metadata.width / 2) * 2);
  const bytes = runLocalTool('ffmpeg', [
    '-v',
    'error',
    '-i',
    video,
    '-vf',
    `scale=${width}:${height}:flags=area`,
    '-vsync',
    '0',
    '-pix_fmt',
    'rgb24',
    '-f',
    'rawvideo',
    '-',
  ]);
  const frameSize = width * height * 3;
  const frameCount = Math.floor(bytes.length / frameSize);
  if (frameCount < 1 || bytes.length !== frameCount * frameSize) {
    throw new Error('ffmpeg returned an incomplete analysis-frame stream');
  }
  return { bytes, width, height, frameCount, frameSize };
}

function frameSlice(decoded, frameNumber) {
  const start = frameNumber * decoded.frameSize;
  return decoded.bytes.subarray(start, start + decoded.frameSize);
}

function frameDifference(left, right) {
  let total = 0;
  let samples = 0;
  for (let index = 0; index < left.length; index += 12) {
    total +=
      Math.abs(left[index] - right[index]) +
      Math.abs(left[index + 1] - right[index + 1]) +
      Math.abs(left[index + 2] - right[index + 2]);
    samples += 3;
  }
  return total / (samples * 255);
}

function selectFrameNumbers(decoded) {
  const uniform = [];
  const uniformCount = Math.min(12, decoded.frameCount);
  for (let index = 0; index < uniformCount; index += 1) {
    uniform.push(
      Math.round((index * Math.max(0, decoded.frameCount - 1)) / Math.max(1, uniformCount - 1)),
    );
  }
  const motion = [];
  for (let index = 1; index < decoded.frameCount; index += 1) {
    motion.push({
      frameNumber: index,
      score: frameDifference(frameSlice(decoded, index - 1), frameSlice(decoded, index)),
    });
  }
  const motionPeaks = [...motion]
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(6, motion.length))
    .flatMap(({ frameNumber }) => [Math.max(0, frameNumber - 1), frameNumber]);
  return {
    selected: [...new Set([...uniform, ...motionPeaks])].sort((left, right) => left - right),
    motion,
  };
}

function frameId(frameNumber) {
  return `frame.reference-${String(frameNumber + 1).padStart(6, '0')}`;
}

function rgbFromHex(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function hexFromRgb(rgb) {
  return `#${rgb
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

function median(values) {
  return numericMedian(values);
}

function patchMeasurement(frame, width, height, target) {
  let best = { distance: Number.POSITIVE_INFINITY, x: 0, y: 0 };
  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      const offset = (y * width + x) * 3;
      const distance = Math.hypot(
        frame[offset] - target[0],
        frame[offset + 1] - target[1],
        frame[offset + 2] - target[2],
      );
      if (distance < best.distance) best = { distance, x, y };
    }
  }
  const channels = [[], [], []];
  for (let y = best.y - 2; y <= best.y + 2; y += 1) {
    for (let x = best.x - 2; x <= best.x + 2; x += 1) {
      const offset = (y * width + x) * 3;
      channels[0].push(frame[offset]);
      channels[1].push(frame[offset + 1]);
      channels[2].push(frame[offset + 2]);
    }
  }
  const rgb = channels.map(median);
  const dispersion =
    channels.reduce(
      (total, channel, channelIndex) =>
        total + channel.reduce((sum, value) => sum + Math.abs(value - rgb[channelIndex]), 0),
      0,
    ) /
    (channels[0].length * 3 * 255);
  return { ...best, rgb, dispersion, sampleCount: channels[0].length };
}

function buildPaletteEvidence(decoded, metadata, selectedFrameNumbers) {
  const sampleFrames = [
    selectedFrameNumbers[0],
    selectedFrameNumbers[Math.floor(selectedFrameNumbers.length / 2)],
    selectedFrameNumbers.at(-1),
  ];
  const rois = [];
  const tokens = [];
  for (const [tokenId, seedValue] of Object.entries(EXPECTED_PALETTE)) {
    const target = rgbFromHex(seedValue);
    const measurements = sampleFrames.map((number, sampleIndex) => {
      const measurement = patchMeasurement(
        frameSlice(decoded, number),
        decoded.width,
        decoded.height,
        target,
      );
      const sourceX = Math.floor((measurement.x - 2) * (metadata.width / decoded.width));
      const sourceY = Math.floor((measurement.y - 2) * (metadata.height / decoded.height));
      const sourceWidth = Math.max(1, Math.ceil(5 * (metadata.width / decoded.width)));
      const sourceHeight = Math.max(1, Math.ceil(5 * (metadata.height / decoded.height)));
      const roiId = `roi.${tokenId.replaceAll('.', '-')}.${sampleIndex + 1}`;
      rois.push({
        id: roiId,
        frameId: frameId(number),
        x: Math.max(0, sourceX),
        y: Math.max(0, sourceY),
        width: Math.min(sourceWidth, metadata.width - Math.max(0, sourceX)),
        height: Math.min(sourceHeight, metadata.height - Math.max(0, sourceY)),
        purpose: `rectangular median RGB sample for ${tokenId}`,
      });
      return {
        ...measurement,
        roiId,
        frameId: frameId(number),
        sampleValue: hexFromRgb(measurement.rgb),
      };
    });
    const measuredRgb = [0, 1, 2].map((channel) =>
      median(measurements.map(({ rgb }) => rgb[channel])),
    );
    const measuredValue = hexFromRgb(measuredRgb);
    tokens.push({
      id: tokenId,
      category: 'color',
      seedValue,
      measuredValue,
      finalValue: measuredValue,
      provenance: {
        seed: 'master_goal_seed',
        measured: 'reference_measurement',
        final: 'reference_measurement',
      },
      frameRoiSamples: measurements.map(({ frameId: id, roiId, sampleValue }) => ({
        frameId: id,
        roiId,
        sampleValue,
      })),
      sampling: {
        samplingMethod: 'median_rgb_rectangular_roi_on_area_scaled_frame',
        sampleCount: measurements.reduce((total, item) => total + item.sampleCount, 0),
        dispersion:
          measurements.reduce((total, item) => total + item.dispersion, 0) / measurements.length,
      },
    });
  }
  return { rois, tokens };
}

function relativeLuminance(hex) {
  const channels = rgbFromHex(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function readBase128(buffer, state) {
  let result = 0;
  for (let index = 0; index < 5; index += 1) {
    const value = buffer[state.offset++];
    if ((index === 0 && value === 0x80) || result & 0xfe000000) {
      throw new Error('invalid WOFF2 UIntBase128');
    }
    result = result * 128 + (value & 0x7f);
    if ((value & 0x80) === 0) return result;
  }
  throw new Error('invalid WOFF2 UIntBase128 length');
}

function parseWoff2Tables(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'wOF2') throw new Error('font is not WOFF2');
  const state = { offset: 48 };
  const entries = [];
  const tableCount = bytes.readUInt16BE(12);
  for (let index = 0; index < tableCount; index += 1) {
    const flags = bytes[state.offset++];
    const tagIndex = flags & 0x3f;
    const transformVersion = flags >> 6;
    const tag =
      tagIndex === 63
        ? bytes.toString('ascii', state.offset, (state.offset += 4))
        : WOFF2_KNOWN_TAGS[tagIndex];
    const originalLength = readBase128(bytes, state);
    const transformed =
      tag === 'glyf' || tag === 'loca' ? transformVersion === 0 : transformVersion !== 0;
    const streamLength = transformed ? readBase128(bytes, state) : originalLength;
    entries.push({ tag, originalLength, streamLength });
  }
  const compressedSize = bytes.readUInt32BE(20);
  const stream = brotliDecompressSync(bytes.subarray(state.offset, state.offset + compressedSize));
  let streamOffset = 0;
  const tables = new Map();
  for (const entry of entries) {
    tables.set(entry.tag, stream.subarray(streamOffset, streamOffset + entry.streamLength));
    streamOffset += entry.streamLength;
  }
  return tables;
}

function cmapGlyphReader(cmap) {
  const count = cmap.readUInt16BE(2);
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const offset = cmap.readUInt32BE(4 + index * 8 + 4);
    const format = cmap.readUInt16BE(offset);
    if (format === 12 || format === 4) candidates.push({ offset, format });
  }
  const selected =
    candidates.find(({ format }) => format === 12) ?? candidates.find(({ format }) => format === 4);
  if (!selected) throw new Error('font cmap has no supported Unicode subtable');
  if (selected.format === 12) {
    const groups = cmap.readUInt32BE(selected.offset + 12);
    return (codePoint) => {
      for (let index = 0; index < groups; index += 1) {
        const position = selected.offset + 16 + index * 12;
        const start = cmap.readUInt32BE(position);
        const end = cmap.readUInt32BE(position + 4);
        if (codePoint >= start && codePoint <= end) {
          return cmap.readUInt32BE(position + 8) + codePoint - start;
        }
      }
      return 0;
    };
  }
  const segmentCount = cmap.readUInt16BE(selected.offset + 6) / 2;
  const endCodes = selected.offset + 14;
  const startCodes = endCodes + segmentCount * 2 + 2;
  const deltas = startCodes + segmentCount * 2;
  const rangeOffsets = deltas + segmentCount * 2;
  return (codePoint) => {
    for (let index = 0; index < segmentCount; index += 1) {
      const end = cmap.readUInt16BE(endCodes + index * 2);
      const start = cmap.readUInt16BE(startCodes + index * 2);
      if (codePoint < start || codePoint > end) continue;
      const delta = cmap.readInt16BE(deltas + index * 2);
      const rangeOffset = cmap.readUInt16BE(rangeOffsets + index * 2);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyphAddress = rangeOffsets + index * 2 + rangeOffset + (codePoint - start) * 2;
      const glyph = cmap.readUInt16BE(glyphAddress);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

function parseWoff2Metrics(path) {
  const tables = parseWoff2Tables(readFileSync(path));
  const head = tables.get('head');
  const hhea = tables.get('hhea');
  const hmtx = tables.get('hmtx');
  const maxp = tables.get('maxp');
  const cmap = tables.get('cmap');
  if (!head || !hhea || !hmtx || !maxp || !cmap) {
    throw new Error('font lacks required metric tables');
  }
  const unitsPerEm = head.readUInt16BE(18);
  const numberOfHMetrics = hhea.readUInt16BE(34);
  const glyphCount = maxp.readUInt16BE(4);
  const glyphFor = cmapGlyphReader(cmap);
  const advanceFor = (character) => {
    const glyph = Math.min(glyphFor(character.codePointAt(0)), glyphCount - 1);
    const metricIndex = Math.min(glyph, numberOfHMetrics - 1);
    return hmtx.readUInt16BE(metricIndex * 4);
  };
  return {
    unitsPerEm,
    ascender: hhea.readInt16BE(4),
    descender: hhea.readInt16BE(6),
    lineGap: hhea.readInt16BE(8),
    advanceFor,
  };
}

function buildTypographyEvidence(repositoryRoot) {
  const families = [
    { family: 'JetBrains Mono', slug: 'jetbrains-mono' },
    { family: 'Inter', slug: 'inter' },
    { family: 'Plus Jakarta Sans', slug: 'plus-jakarta-sans' },
  ];
  const candidates = [];
  for (const { family, slug } of families) {
    for (const weight of [400, 500, 600]) {
      const relativeFont = `node_modules/@fontsource/${slug}/files/${slug}-latin-${weight}-normal.woff2`;
      const fontPath = join(repositoryRoot, ...relativeFont.split('/'));
      const metrics = parseWoff2Metrics(fontPath);
      const fixtureCharacters = [...GLYPH_FIXTURE];
      const numeralCharacters = [...'0123456789'];
      const fixtureAdvances = fixtureCharacters.map(metrics.advanceFor);
      const numeralAdvances = numeralCharacters.map(metrics.advanceFor);
      for (const [fontSizePx, lineHeightPx] of [
        [12, 16],
        [13, 18],
      ]) {
        for (const tracking of ['normal', 'uppercase_label']) {
          for (const deviceScaleFactor of [1, 2]) {
            const trackingPx = tracking === 'uppercase_label' ? fontSizePx * 0.04 : 0;
            const scale = (fontSizePx * deviceScaleFactor) / metrics.unitsPerEm;
            const width =
              fixtureAdvances.reduce((total, value) => total + value * scale, 0) +
              Math.max(0, fixtureCharacters.length - 1) * trackingPx * deviceScaleFactor;
            const averageGlyphWidth =
              (fixtureAdvances.reduce((total, value) => total + value, 0) /
                fixtureAdvances.length /
                metrics.unitsPerEm) *
              fontSizePx;
            const averageNumeralWidth =
              (numeralAdvances.reduce((total, value) => total + value, 0) /
                numeralAdvances.length /
                metrics.unitsPerEm) *
              fontSizePx;
            const naturalLineHeight =
              ((metrics.ascender - metrics.descender + metrics.lineGap) / metrics.unitsPerEm) *
              fontSizePx;
            const id = [
              slug,
              weight,
              `${fontSizePx}-${lineHeightPx}`,
              tracking,
              `${deviceScaleFactor}x`,
            ].join('.');
            candidates.push({
              id,
              bundledFile: relativeFont,
              bundledSha256: sha256File(fontPath),
              license: 'OFL-1.1',
              family,
              weight,
              glyphFixture: GLYPH_FIXTURE,
              condition: {
                fontSizePx,
                lineHeightPx,
                tracking,
                deviceScaleFactor,
                fontsReady: false,
              },
              pixelBounds: {
                x: 0,
                y: 0,
                width: Number(width.toFixed(4)),
                height: lineHeightPx * deviceScaleFactor,
              },
              averageGlyphWidth: Number(averageGlyphWidth.toFixed(4)),
              averageNumeralWidth: Number(averageNumeralWidth.toFixed(4)),
              observations: {
                zero:
                  metrics.advanceFor('0') === metrics.advanceFor('O')
                    ? 'equal advance to uppercase O'
                    : 'distinct advance from uppercase O',
                one:
                  metrics.advanceFor('1') === metrics.advanceFor('l')
                    ? 'equal advance to lowercase l'
                    : 'distinct advance from lowercase l',
                uppercase: `A/Q advance delta ${Math.abs(
                  metrics.advanceFor('A') - metrics.advanceFor('Q'),
                )} font units`,
                punctuation: `bracket/period advance delta ${Math.abs(
                  metrics.advanceFor('[') - metrics.advanceFor('.'),
                )} font units`,
              },
              lineHeightDistance: Number(Math.abs(naturalLineHeight - lineHeightPx).toFixed(4)),
              letterSpacingDistance: Number(trackingPx.toFixed(4)),
              aggregateScore: Number(
                (
                  Math.abs(naturalLineHeight - lineHeightPx) +
                  trackingPx +
                  Math.abs(averageGlyphWidth - 7)
                ).toFixed(4),
              ),
              confidence: 0.55,
            });
          }
        }
      }
    }
  }
  const decision = [...candidates].sort(
    (left, right) => left.aggregateScore - right.aggregateScore || left.id.localeCompare(right.id),
  )[0];
  return {
    glyphFixture: GLYPH_FIXTURE,
    candidates,
    decision: {
      candidateId: decision.id,
      reason:
        'Lowest deterministic WOFF2 metric score; browser raster and document.fonts.ready were not run.',
      confidence: 0.55,
    },
  };
}

function strongestEdge(frame, width, height, axis, minimumRatio, maximumRatio) {
  const length = axis === 'x' ? width : height;
  let best = { index: Math.floor(length * minimumRatio), score: -1 };
  for (
    let position = Math.max(1, Math.floor(length * minimumRatio));
    position < Math.min(length - 1, Math.ceil(length * maximumRatio));
    position += 1
  ) {
    let total = 0;
    let count = 0;
    const crossLength = axis === 'x' ? height : width;
    for (let cross = 0; cross < crossLength; cross += 3) {
      const leftOffset =
        axis === 'x' ? (cross * width + position - 1) * 3 : ((position - 1) * width + cross) * 3;
      const rightOffset =
        axis === 'x' ? (cross * width + position) * 3 : (position * width + cross) * 3;
      total +=
        Math.abs(frame[leftOffset] - frame[rightOffset]) +
        Math.abs(frame[leftOffset + 1] - frame[rightOffset + 1]) +
        Math.abs(frame[leftOffset + 2] - frame[rightOffset + 2]);
      count += 3;
    }
    const score = total / Math.max(1, count);
    if (score > best.score) best = { index: position, score };
  }
  return best.index;
}

function geometryMetric(id, unit, frameIds, rawSamples, confidence) {
  return {
    id,
    unit,
    frameIds,
    rawSamples,
    median: median(rawSamples),
    range: { minimum: Math.min(...rawSamples), maximum: Math.max(...rawSamples) },
    confidence,
  };
}

function buildGeometryEvidence(decoded, metadata, selectedFrameNumbers) {
  const sampleNumbers = selectedFrameNumbers.slice(0, Math.min(8, selectedFrameNumbers.length));
  const ids = sampleNumbers.map(frameId);
  const railSamples = sampleNumbers.map((number) =>
    Math.round(
      strongestEdge(frameSlice(decoded, number), decoded.width, decoded.height, 'x', 0.03, 0.4) *
        (metadata.width / decoded.width),
    ),
  );
  const topBarSamples = sampleNumbers.map((number) =>
    Math.round(
      strongestEdge(frameSlice(decoded, number), decoded.width, decoded.height, 'y', 0.03, 0.3) *
        (metadata.height / decoded.height),
    ),
  );
  const majorWidthSamples = railSamples.map((rail) => metadata.width - rail);
  return {
    metrics: [
      geometryMetric(
        'geometry.content-viewport-width',
        'px',
        ids,
        ids.map(() => metadata.width),
        1,
      ),
      geometryMetric(
        'geometry.content-viewport-height',
        'px',
        ids,
        ids.map(() => metadata.height),
        1,
      ),
      geometryMetric('geometry.primary-rail-sidebar-width', 'px', ids, railSamples, 0.64),
      geometryMetric('geometry.top-bar-height', 'px', ids, topBarSamples, 0.64),
      geometryMetric('geometry.major-content-max-width', 'px', ids, majorWidthSamples, 0.64),
    ],
  };
}

function buildMotionEvidence(motion, frameRate) {
  const states = [
    'hover',
    'active-state',
    'tooltip',
    'chart-behavior',
    'loading-state',
    'page-transition',
  ];
  const ranked = [...motion].sort((left, right) => right.score - left.score);
  return states.map((state, index) => {
    const sample = ranked[index % ranked.length];
    return {
      state,
      startFrameId: frameId(Math.max(0, sample.frameNumber - 1)),
      endFrameId: frameId(sample.frameNumber),
      durationMs: Number((1000 / frameRate).toFixed(4)),
      easing: 'frame-to-frame delta; easing curve not inferable from one interval',
      reducedMotionDecision: 'disable non-essential interpolation and preserve state change',
      confidence: Number(Math.min(0.8, 0.45 + sample.score).toFixed(4)),
    };
  });
}

function accentPixelRatio(decoded, selectedFrameNumbers) {
  let accented = 0;
  let total = 0;
  for (const number of selectedFrameNumbers) {
    const frame = frameSlice(decoded, number);
    for (let offset = 0; offset < frame.length; offset += 12) {
      const maximum = Math.max(frame[offset], frame[offset + 1], frame[offset + 2]);
      const minimum = Math.min(frame[offset], frame[offset + 1], frame[offset + 2]);
      if (maximum > 0 && (maximum - minimum) / maximum >= 0.25) accented += 1;
      total += 1;
    }
  }
  return total === 0 ? 0 : accented / total;
}

function markdownWithFrontmatter(frontmatter, body) {
  return `${FRONTMATTER_START}${JSON.stringify(frontmatter, null, 2)}${FRONTMATTER_END}\n\n${body.trim()}\n`;
}

function buildMeasuredArtifacts(repositoryRoot, metadata, decoded, selected, motion, sourceSha256) {
  const selectedIds = selected.map(frameId);
  const palette = buildPaletteEvidence(decoded, metadata, selected);
  const typography = buildTypographyEvidence(repositoryRoot);
  const geometry = buildGeometryEvidence(decoded, metadata, selected);
  const motionSamples = buildMotionEvidence(motion, metadata.frameRate);
  const mappingIds = ['mapping.hive-page', 'mapping.plans-page', 'mapping.plugins-page'];
  const motifIds = [
    'motif.panel-silhouette',
    'motif.pricing-form-structure',
    'motif.segmented-chart',
  ];
  const tokenIds = palette.tokens.map(({ id }) => id);
  const linked = {
    'frame-manifest': [
      'component-mapping',
      'design',
      'design-tokens',
      'reference-analysis',
      'reference-spec',
    ],
    'design-tokens': [
      'component-mapping',
      'design',
      'frame-manifest',
      'reference-analysis',
      'reference-spec',
    ],
    'reference-spec': [
      'component-mapping',
      'design',
      'design-tokens',
      'frame-manifest',
      'reference-analysis',
    ],
    'reference-analysis': [
      'component-mapping',
      'design',
      'design-tokens',
      'frame-manifest',
      'reference-spec',
    ],
    design: [
      'component-mapping',
      'design-tokens',
      'frame-manifest',
      'reference-analysis',
      'reference-spec',
    ],
    'component-mapping': [
      'design',
      'design-tokens',
      'frame-manifest',
      'reference-analysis',
      'reference-spec',
    ],
  };
  const common = (artifactId) => ({
    schemaVersion: 1,
    artifactId,
    status: 'measured',
    evidenceCutoff: EVIDENCE_CUTOFF,
    expectedFileName: EXPECTED_SOURCE,
    sourceSha256,
    linkedArtifactIds: linked[artifactId],
    privacyDisposition: 'sanitized_no_private_source_data',
  });
  const purposes = [
    'top bar and rail geometry waypoint',
    'hover and active-sidebar transition waypoint',
    'usage-card and segmented-chart palette waypoint',
    'table header, row, hover, selected, loading, and empty-state waypoint',
    'provider, pricing, and form-state waypoint',
    'tooltip, empty-provider, loading, and page-transition waypoint',
  ];
  const frames = selected.map((number, index) => ({
    id: frameId(number),
    timestampMs: Number(((number * 1000) / metadata.frameRate).toFixed(4)),
    frameNumber: number,
    sceneTags: ['algorithmic-sample', `scope-${(index % purposes.length) + 1}`],
    stateTags: motion.some(({ frameNumber: candidate }) => candidate === number)
      ? ['motion-peak']
      : ['uniform-sample'],
    crop: { x: 0, y: 0, width: metadata.width, height: metadata.height },
    excludedRegions: [],
    purpose: `${purposes[index % purposes.length]}; semantic presence was not machine-classified`,
    privacyDisposition: 'sanitized_no_private_source_data',
  }));
  const manifest = {
    ...common('frame-manifest'),
    source: {
      expectedFileName: EXPECTED_SOURCE,
      sha256: sourceSha256,
      durationMs: metadata.durationMs,
      width: metadata.width,
      height: metadata.height,
      frameRate: metadata.frameRate,
      codec: metadata.codec,
      colorMetadata: {
        colorSpace: metadata.colorSpace,
        range: metadata.colorRange,
      },
      contentCrop: { x: 0, y: 0, width: metadata.width, height: metadata.height },
    },
    sampling: {
      method: 'all_frames_extracted_plus_uniform_and_rgb-difference_motion_candidates',
      sampleCount: decoded.frameCount,
    },
    frames,
  };
  const contrastPairs = [
    ['color.text', 'color.black'],
    ['color.text-secondary', 'color.surface-1'],
    ['color.purple', 'color.black'],
  ].map(([foregroundTokenId, backgroundTokenId]) => {
    const foreground = palette.tokens.find(({ id }) => id === foregroundTokenId).finalValue;
    const background = palette.tokens.find(({ id }) => id === backgroundTokenId).finalValue;
    const ratio = contrastRatio(foreground, background);
    return {
      foregroundTokenId,
      backgroundTokenId,
      ratio: Number(ratio.toFixed(4)),
      testedFrameIds: selectedIds,
      passes: ratio >= 3,
    };
  });
  const tokens = {
    ...common('design-tokens'),
    tokens: palette.tokens,
    contrastPairs,
  };
  const motifs = [
    ['motif.panel-silhouette', 'panel silhouette'],
    ['motif.pricing-form-structure', 'pricing and form structure'],
    ['motif.segmented-chart', 'segmented chart'],
  ].map(([id, label]) => ({
    id,
    label,
    tolerance: {
      metric: 'normalized mean RGB frame delta',
      maximum: Number(Math.min(1, median(motion.map(({ score }) => score)) * 1.5).toFixed(6)),
    },
    status: 'measured',
  }));
  const spec = {
    ...common('reference-spec'),
    frameIds: selectedIds,
    rois: palette.rois,
    tokenIds,
    mappingIds,
    motifs,
    viewport: { width: metadata.width, height: metadata.height, deviceScaleFactor: 1 },
    contentCrop: { x: 0, y: 0, width: metadata.width, height: metadata.height },
    typography,
    geometry,
    motionSamples,
    accentRatio: Number(accentPixelRatio(decoded, selected).toFixed(6)),
  };
  const analysisFrontmatter = {
    ...common('reference-analysis'),
    frameIds: selectedIds,
    motifIds,
    tokenIds,
    sampling: {
      method: manifest.sampling.method,
      extractedFrameCount: decoded.frameCount,
      selectedFrameCount: selected.length,
      rectangularRoiCount: palette.rois.length,
    },
    confidence: 0.68,
    measurements: {
      paletteTokenCount: palette.tokens.length,
      typographyCandidateCount: typography.candidates.length,
      geometryMetricCount: geometry.metrics.length,
      motionSampleCount: motionSamples.length,
      browserTypographyRasterStatus: 'not_run',
    },
  };
  const designFrontmatter = {
    ...common('design'),
    frameIds: selectedIds,
    motifIds,
    tokenIds,
    mappingIds,
    measurements: {
      authority: 'measured_recording_with_sanitized_metadata',
      tokenDecision: 'reference_measurement',
      typographyDecision: typography.decision.candidateId,
    },
  };
  const mappings = [
    {
      id: 'mapping.plans-page',
      referenceMotifFrameIds: ['motif.pricing-form-structure', selectedIds[0]],
      vibeSpaceRouteComponentPath: 'app/src/features/settings/sections/Plans.tsx',
      semanticTokenId: 'color.black',
      allowedScopedException: 'none',
      stateCoverage: 'default, loading, error',
      testOwner: 'MC9',
      status: 'measured',
    },
    {
      id: 'mapping.hive-page',
      referenceMotifFrameIds: ['motif.segmented-chart', selectedIds.at(-1)],
      vibeSpaceRouteComponentPath: 'app/src/features/settings/sections/Hive.tsx',
      semanticTokenId: 'color.surface-1',
      allowedScopedException: 'raised panels may use color.surface-2',
      stateCoverage: 'default, loading, empty',
      testOwner: 'MC9',
      status: 'measured',
    },
    {
      id: 'mapping.plugins-page',
      referenceMotifFrameIds: [
        'motif.panel-silhouette',
        selectedIds[Math.floor(selectedIds.length / 2)],
      ],
      vibeSpaceRouteComponentPath: 'app/src/features/plugins/Plugins.tsx',
      semanticTokenId: 'color.purple',
      allowedScopedException: 'none',
      stateCoverage: 'default, focus, disabled',
      testOwner: 'MC9',
      status: 'measured',
    },
  ];
  const mappingFrontmatter = {
    ...common('component-mapping'),
    mappings,
    measurements: {
      sourceFrameCount: selected.length,
      interpretation: 'motif-level mapping, not product-content copying',
    },
  };
  const analysisMarkdown = markdownWithFrontmatter(
    analysisFrontmatter,
    `# MonoChrome Reference Analysis

## Source Status

The authorized recording was hashed and measured. The committed record contains only its basename, SHA-256, sanitized codec/color metadata, timestamps, frame IDs, and aggregate measurements.

## Reproducible Method

Run the repository analyzer with the exact authorized basename, an ignored \`.artifacts/monochrome/<session>/reference\` root, and \`docs/appearance/monochrome\`. The analyzer extracts every frame privately, selects uniform and frame-difference candidates, measures rectangular RGB regions, and validates staged artifacts before publishing the six evidence files.

## Frame Evidence

${selectedIds.length} sanitized frame records cross-link the private extraction. Their purposes cover top bar/rail, hover/active sidebar, cards/charts, table states, pricing/forms, tooltip/loading, and page-transition analysis. Semantic presence is not claimed from machine classification.

## Palette

${palette.tokens.length} token values use median RGB from three rectangular ROIs per token across multiple frames. Seed, measured, and final values remain separately recorded.

## Typography

The analyzer parsed and hashed the bundled Latin WOFF2 files for JetBrains Mono, Inter, and Plus Jakarta Sans at weights 400/500/600 across all 72 mandated conditions. Width and line metrics are real font-table measurements. Browser rasterization and \`document.fonts.ready\` were not run, so every candidate records \`fontsReady: false\` and the decision confidence is limited.

## Geometry

Viewport dimensions are exact media metadata. Rail, top-bar, and major-content measurements are multi-frame image-gradient interpretations with raw samples, range, median, and confidence.

## Motion

Six state categories reference the strongest adjacent-frame RGB differences. Durations are frame intervals; a single interval cannot establish a full easing curve.

## Limitations

The analyzer does not perform OCR, identity extraction, semantic object recognition, or browser font rasterization. The recording is a style authority, not a pixel-perfect content target. Low-confidence interpretations must not override accessibility or preserved-theme requirements.

## Privacy

Source bytes and extracted frames remain only in the ignored task artifact root. No absolute source path, private frame path, copied identity, URL, or user content is committed.`,
  );
  const designMarkdown = markdownWithFrontmatter(
    designFrontmatter,
    `# MonoChrome Design Contract

## Authority

The recording SHA and linked measured frames are the style authority. Measurements are separated from interpretation and final decisions.

## Direction

Use the measured dark-surface hierarchy and sparse accents without copying reference branding, text, accounts, or product content.

## Hierarchy

Measured viewport edges support a compact rail, top-bar separation, and restrained major-content width. Gradient-derived interpretations retain their recorded confidence.

## Tokens

All final color decisions are the measured rectangular-ROI medians in \`design-tokens.json\`; seeds remain visible for comparison.

## Components

\`component-mapping.md\` maps measured motifs and frames to VibeSpace routes at motif level only.

## Accessibility

Recorded contrast pairs are evidence, not permission to weaken focus visibility, forced colors, zoom/reflow, reduced motion, or semantic control requirements.

## Motion

Use frame-interval evidence conservatively. Disable non-essential interpolation under reduced motion.

## Preserved Themes

Default, VibeSpace, Jarvis Core, and Origami remain isolated from MonoChrome calibration.

## Anti-Goals

Do not copy branding or source text, infer identities, commit frames, expose private paths, or impose whole-page pixel equality on unrelated VibeSpace content.`,
  );
  const tableHeader =
    '| Mapping ID | Reference motif/frame IDs | VibeSpace route/component path | Semantic token | Allowed scoped exception | State coverage | Test owner | Status |';
  const tableSeparator = '| --- | --- | --- | --- | --- | --- | --- | --- |';
  const tableRows = mappings.map(
    (mapping) =>
      `| ${mapping.id} | ${mapping.referenceMotifFrameIds.join(', ')} | ${mapping.vibeSpaceRouteComponentPath} | ${mapping.semanticTokenId} | ${mapping.allowedScopedException} | ${mapping.stateCoverage} | ${mapping.testOwner} | ${mapping.status} |`,
  );
  const mappingMarkdown = markdownWithFrontmatter(
    mappingFrontmatter,
    `# MonoChrome Component Mapping

Mappings use measured motif/frame evidence as style guidance. They do not copy source product content.

${[tableHeader, tableSeparator, ...tableRows].join('\n')}`,
  );
  return {
    'FRAME_MANIFEST.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'design-tokens.json': `${JSON.stringify(tokens, null, 2)}\n`,
    'reference-spec.json': `${JSON.stringify(spec, null, 2)}\n`,
    'REFERENCE_ANALYSIS.md': analysisMarkdown,
    'DESIGN.md': designMarkdown,
    'component-mapping.md': mappingMarkdown,
  };
}

function analyzeReference(options) {
  const repositoryRoot = resolveRepositoryRoot();
  const docsRoot = resolve(options.docs);
  const artifactRoot = resolve(options.artifacts);
  const relativeArtifacts = relative(process.cwd(), artifactRoot).replaceAll('\\', '/');
  if (
    existsSync(artifactRoot) ||
    !relativeArtifacts.startsWith('.artifacts/monochrome/') ||
    relativeArtifacts.includes('../')
  ) {
    throw new Error('artifact root must be a new contained MonoChrome directory');
  }
  mkdirSync(artifactRoot, { recursive: true });
  const sourceSha256 = sha256File(options.video);
  const metadata = probeVideo(options.video);
  const privateFrames = extractPrivateFrames(options.video, artifactRoot);
  const decoded = decodeAnalysisFrames(options.video, metadata);
  if (decoded.frameCount !== privateFrames.frameCount) {
    throw new Error('private extraction and analysis-frame counts diverged');
  }
  const { selected, motion } = selectFrameNumbers(decoded);
  const artifacts = buildMeasuredArtifacts(
    repositoryRoot,
    metadata,
    decoded,
    selected,
    motion,
    sourceSha256,
  );

  const stagingRepository = join(artifactRoot, 'staged-repository');
  const stagedDocs = join(stagingRepository, 'docs/appearance/monochrome');
  mkdirSync(stagedDocs, { recursive: true });
  cpSync(join(docsRoot, 'schemas'), join(stagedDocs, 'schemas'), { recursive: true });
  for (const [name, source] of Object.entries(artifacts)) {
    writeFileSync(join(stagedDocs, name), source);
  }
  const validation = validateArtifacts(stagingRepository);
  if (validation.errors.length > 0) {
    throw new Error(`staged evidence validation failed: ${validation.errors.join('; ')}`);
  }
  for (const name of EVIDENCE_FILES) {
    copyFileSync(join(stagedDocs, name), join(docsRoot, name));
  }
  writeFileSync(
    join(artifactRoot, 'measurement-summary.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        expectedFileName: EXPECTED_SOURCE,
        sourceSha256,
        sourceBytes: statSync(options.video).size,
        media: metadata,
        extractedFrameCount: decoded.frameCount,
        selectedFrameIds: selected.map(frameId),
        privateFrameDisposition: 'ignored_task_artifact_root_only',
        trackedEvidenceDisposition: 'sanitized_no_private_source_data',
      },
      null,
      2,
    )}\n`,
  );
  return {
    sourceSha256,
    extractedFrameCount: decoded.frameCount,
    selectedFrameCount: selected.length,
  };
}

function main(args) {
  const options = parseCli(args);
  if (!options) {
    console.error(
      `Usage: analyze-reference.mjs --video "${EXPECTED_SOURCE}" --artifacts ".artifacts/monochrome/<session>/reference" --docs "docs/appearance/monochrome"`,
    );
    return 64;
  }
  if (options.mode === 'validate') {
    const result = validateArtifacts();
    if (result.errors.length > 0) {
      for (const error of result.errors) console.error(error);
      return 1;
    }
    console.log(`Validated ${result.files.length} MonoChrome reference artifacts.`);
    return 0;
  }

  if (!isGuardedRegularFile(options.video)) {
    console.error(
      `The expected source "${EXPECTED_SOURCE}" is unavailable; committed evidence was not changed.`,
    );
    return 2;
  }

  try {
    const result = analyzeReference(options);
    console.log(
      `Measured ${result.extractedFrameCount} frames (${result.selectedFrameCount} selected); source SHA-256 ${result.sourceSha256}.`,
    );
    return 0;
  } catch (error) {
    console.error(`Reference analysis failed safely: ${error.message}`);
    return 3;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
