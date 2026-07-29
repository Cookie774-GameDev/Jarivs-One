import { closeSync, fstatSync, lstatSync, openSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_SOURCE = 'Screen Recording 2026-07-16 220632(1).mp4';
const EVIDENCE_CUTOFF = '2026-07-29T21:13:02.0844029Z';
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
  if (!source.startsWith(FRONTMATTER_START)) {
    throw new Error(`${filename} must begin with delimited JSON frontmatter`);
  }
  const endIndex = source.indexOf(FRONTMATTER_END, FRONTMATTER_START.length);
  if (endIndex < 0) {
    throw new Error(`${filename} has unterminated JSON frontmatter`);
  }
  const json = source.slice(FRONTMATTER_START.length, endIndex);
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
    for (const heading of headings) {
      if (!source.includes(`\n## ${heading}\n`)) {
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

  console.error(
    'Source exists, but measured extraction belongs to MC8B; committed evidence was not changed.',
  );
  return 3;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
