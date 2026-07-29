import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as primitiveAuthority from './monochromePrimitiveManifest';

const SOURCE_COMMIT = '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae';

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  const candidates = [cwd, path.resolve(cwd, '..')];
  const root = candidates.find(
    (candidate) =>
      existsSync(path.join(candidate, '.git')) &&
      existsSync(
        path.join(candidate, 'app/src/features/appearance/monochromePrimitiveManifest.ts'),
      ),
  );
  if (!root) {
    throw new Error(`Unable to resolve repository root from validator cwd: ${cwd}`);
  }
  return root;
}

const REPO_ROOT = resolveRepoRoot();
const EXPECTED_SHARED_IDS = [
  'Avatar',
  'Badge',
  'Button',
  'Card',
  'Checkbox',
  'Dialog',
  'Input',
  'Label',
  'Popover',
  'Separator',
  'Skeleton',
  'Switch',
  'Tabs',
  'Textarea',
  'Toast',
  'Tooltip',
];
const EXPECTED_FEATURE_CATEGORIES = [
  'AlertDialog',
  'Command',
  'ContextMenu',
  'Dropdown',
  'Progress',
  'Radio',
  'Resizable',
  'ScrollArea',
  'Select',
  'Slider',
  'Table',
];
const EXPECTED_OWNED_PATHS = [
  'app/src/features/appearance/monochromePrimitiveManifest.test.ts',
  'app/src/features/appearance/monochromePrimitiveManifest.ts',
];
const EXPECTED_FIXTURE_IDS = ['chat', 'settings-appearance', 'terminal-workbench'];
const EXPECTED_FIXTURE_HASHES = {
  chat: 'fd8950bf1a41f18797c3e4ea97ad25f1eac86ffda0862cc61e361bdea2a158c9',
  'settings-appearance': '1531421802e9d827e011047c410dd29c6d7c459c03f2bdb9ad91154f8c5ab875',
  'terminal-workbench': 'd27d7b59bed7386b11335a93d8827deb13d251d6de216c3b5bb84bee9ba8bc2b',
};
const EXPECTED_CONSUMER_TASKS = ['MC4', 'MC6'];
const EXPECTED_VALIDATOR_COMMAND =
  'npm --prefix app test -- src/features/appearance/monochromePrimitiveManifest.test.ts';

const FEATURE_DISCOVERY_PREDICATES = {
  AlertDialog: {
    description: 'TSX source contains an explicit role="alertdialog" control',
    gitPatterns: ['role=["\']alertdialog["\']'],
    pathSuffixes: [],
  },
  Command: {
    description:
      'non-test TSX source imports cmdk or is the custom TerminalCommandPalette implementation',
    gitPatterns: ["from 'cmdk'"],
    pathSuffixes: ['/TerminalCommandPalette.tsx'],
  },
  ContextMenu: {
    description:
      'non-test TSX source basename ends with ContextMenu.tsx or declares an explicit role="menu" surface',
    gitPatterns: ['role=["\']menu["\']'],
    pathSuffixes: ['ContextMenu.tsx'],
  },
  Dropdown: {
    description:
      'non-test TSX source implements the AgentPicker popover dropdown or jarvis-slash-dropdown',
    gitPatterns: ['jarvis-slash-dropdown'],
    pathSuffixes: ['/AgentPicker.tsx'],
  },
  Progress: {
    description: 'TSX source contains an explicit role="progressbar" control',
    gitPatterns: ['role=["\']progressbar["\']'],
    pathSuffixes: [],
  },
  Radio: {
    description: 'TSX source contains an input with type="radio"',
    gitPatterns: ['type=["\']radio["\']'],
    pathSuffixes: [],
  },
  Resizable: {
    description:
      'non-test TSX source exposes a resize separator, selected-object handles, or Resize control',
    gitPatterns: [
      'role="separator"',
      'aria-label="Selected object resize and rotation handles"',
      'aria-label="Resize"',
    ],
    pathSuffixes: [],
  },
  ScrollArea: {
    description:
      'non-test TSX source contains an overflow-auto or overflow-scroll utility on a rendered surface',
    gitPatterns: ['overflow-((x|y)-)?(auto|scroll)'],
    pathSuffixes: [],
  },
  Select: {
    description: 'TSX source contains a native select element',
    gitPatterns: ['<select($|[[:space:]>])'],
    pathSuffixes: [],
  },
  Slider: {
    description: 'TSX source contains a range input or explicit slider role',
    gitPatterns: ['type=["\']range["\']|role=["\']slider["\']'],
    pathSuffixes: [],
  },
  Table: {
    description: 'TSX source contains a native table element',
    gitPatterns: ['<table($|[[:space:]>])'],
    pathSuffixes: [],
  },
} as const;

let historicalTsxPathCache: string[] | undefined;

function frozenPaths(): Set<string> {
  return new Set(
    execFileSync('git', ['ls-tree', '-r', '--name-only', SOURCE_COMMIT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split(/\r?\n/u)
      .filter(Boolean),
  );
}

function historicalTsxPaths(): readonly string[] {
  if (historicalTsxPathCache) return historicalTsxPathCache;
  historicalTsxPathCache = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', SOURCE_COMMIT, 'app/src/components', 'app/src/features'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
    .split(/\r?\n/u)
    .filter((sourcePath) => sourcePath.endsWith('.tsx') && !sourcePath.endsWith('.test.tsx'))
    .sort();
  return historicalTsxPathCache;
}

function historicalGrepPaths(pattern: string): string[] {
  return execFileSync(
    'git',
    ['grep', '-l', '-E', pattern, SOURCE_COMMIT, '--', 'app/src/components', 'app/src/features'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
    .split(/\r?\n/u)
    .map((sourcePath) => sourcePath.replace(`${SOURCE_COMMIT}:`, ''))
    .filter((sourcePath) => sourcePath.endsWith('.tsx') && !sourcePath.endsWith('.test.tsx'));
}

function historicalControlPaths(category: keyof typeof FEATURE_DISCOVERY_PREDICATES): string[] {
  const predicate = FEATURE_DISCOVERY_PREDICATES[category];
  const paths = new Set<string>();
  for (const pattern of predicate.gitPatterns) {
    for (const sourcePath of historicalGrepPaths(pattern)) paths.add(sourcePath);
  }
  for (const sourcePath of historicalTsxPaths()) {
    if (predicate.pathSuffixes.some((suffix) => sourcePath.endsWith(suffix))) {
      paths.add(sourcePath);
    }
  }
  return [...paths].sort();
}

function sharedPrimitives(): readonly primitiveAuthority.MonochromeSharedPrimitive[] {
  const entries = primitiveAuthority.MONOCHROME_PRIMITIVE_MANIFEST.sharedPrimitives;
  expect(Array.isArray(entries), 'missing shared primitive entries').toBe(true);
  return Array.isArray(entries) ? entries : [];
}

function featureLocalControls(): readonly primitiveAuthority.MonochromeFeatureControlGroup[] {
  const groups = primitiveAuthority.MONOCHROME_PRIMITIVE_MANIFEST.featureLocalControls;
  expect(Array.isArray(groups), 'missing feature-local control groups').toBe(true);
  return Array.isArray(groups) ? groups : [];
}

describe('MonoChrome primitive authority', () => {
  it('exists before MC4 writes primitive state tests or implementation', () => {
    const manifestPath = path.join(
      REPO_ROOT,
      'app/src/features/appearance/monochromePrimitiveManifest.ts',
    );
    expect(existsSync(manifestPath), 'missing primitive manifest').toBe(true);
  });

  it('freezes all 16 barrel primitives with explicit state and ownership metadata', () => {
    const manifest = primitiveAuthority.MONOCHROME_PRIMITIVE_MANIFEST;
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sourceCommit).toBe(SOURCE_COMMIT);
    expect(manifest.captureMode).toBe('retroactive-source-freeze');
    expect(manifest.sharedPrimitives.map((entry) => entry.id)).toEqual(EXPECTED_SHARED_IDS);

    const shared = sharedPrimitives();
    for (const entry of shared) {
      expect(entry.owner).toBe('shared-ui:MC4');
      expect(entry.states.length).toBeGreaterThan(0);
      expect(typeof entry.semanticTokens).toBe('boolean');
      expect(typeof entry.hardCodedUtilityDebt).toBe('boolean');
      expect(entry.intendedFix.length).toBeGreaterThan(8);
      expect(entry.testPaths).toEqual([
        'app/src/features/appearance/monochromePrimitiveManifest.test.ts',
      ]);
    }
  });

  it('freezes the exact common manifest metadata required by Step 7', () => {
    const manifest = primitiveAuthority.MONOCHROME_PRIMITIVE_MANIFEST;
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sourceCommit).toBe(SOURCE_COMMIT);
    expect(manifest.captureMode).toBe('retroactive-source-freeze');
    expect(manifest.ownedPaths).toEqual(EXPECTED_OWNED_PATHS);
    expect(manifest.fixtureIds).toEqual(EXPECTED_FIXTURE_IDS);
    expect(manifest.fixtureHashes).toEqual(EXPECTED_FIXTURE_HASHES);
    expect(manifest.consumerTasks).toEqual(EXPECTED_CONSUMER_TASKS);
    expect(manifest.validatorCommand).toBe(EXPECTED_VALIDATOR_COMMAND);
  });

  it('closes over every shared ui source at the frozen commit', () => {
    const expectedSources = historicalTsxPaths()
      .filter((sourcePath) => sourcePath.startsWith('app/src/components/ui/'))
      .sort();
    const manifestSources = sharedPrimitives()
      .map((entry) => entry.sourcePath)
      .sort();

    expect(manifestSources).toEqual(expectedSources);
    const atCommit = frozenPaths();
    for (const sourcePath of manifestSources) expect(atCommit.has(sourcePath)).toBe(true);
  });

  it('represents every required feature-local/native category without assigning MC4 writes', () => {
    const groups = featureLocalControls();
    expect(groups.map((group) => group.category)).toEqual(EXPECTED_FEATURE_CATEGORIES);
    const atCommit = frozenPaths();

    for (const group of groups) {
      expect(group.sources.length).toBeGreaterThan(0);
      expect(group.writeDisposition).toBe('review-amend-before-edit');
      for (const source of group.sources) {
        expect(source.owner).toMatch(/^feature:/u);
        expect(atCommit.has(source.path), source.path).toBe(true);
      }
    }
  });

  it('closes every feature-local category over documented predicates at the source commit', () => {
    const groups = new Map(featureLocalControls().map((group) => [group.category, group]));
    for (const category of EXPECTED_FEATURE_CATEGORIES) {
      const typedCategory = category as keyof typeof FEATURE_DISCOVERY_PREDICATES;
      const group = groups.get(category);
      expect(group, category).toBeDefined();
      if (!group) continue;
      const sourcePaths = group.sources.map((source) => source.path);
      expect(sourcePaths, `${category} stable ordering`).toEqual([...sourcePaths].sort());
      expect(group.discoveryPredicate, `${category} documented predicate`).toBe(
        FEATURE_DISCOVERY_PREDICATES[typedCategory].description,
      );
      expect(sourcePaths, `${category} historical closure`).toEqual(
        historicalControlPaths(typedCategory),
      );
    }
  });

  it('includes Inspector and PetOverlay semantic menu seams in ContextMenu closure', () => {
    const expectedContextMenus = historicalControlPaths('ContextMenu');
    expect(expectedContextMenus).toContain('app/src/components/layout/Inspector.tsx');
    expect(expectedContextMenus).toContain('app/src/features/pets/PetOverlay.tsx');
    const contextMenuGroup = featureLocalControls().find(
      (group) => group.category === 'ContextMenu',
    );
    expect(contextMenuGroup).toBeDefined();
    expect(contextMenuGroup?.sources.map((source) => source.path)).toEqual(expectedContextMenus);
  });

  it('covers the complete MC4 state vocabulary across the frozen matrix', () => {
    const states = new Set(sharedPrimitives().flatMap((entry) => entry.states));
    const statesToCover: readonly primitiveAuthority.MonochromePrimitiveState[] = [
      'default',
      'hover',
      'active',
      'focus-visible',
      'disabled',
      'validation-error',
      'checked',
      'selected',
      'open',
      'loading',
      'destructive',
      'keyboard',
      'screen-reader',
    ];
    for (const state of statesToCover) {
      expect(states.has(state), state).toBe(true);
    }
  });

  it('rejects duplicate owners, overlapping lanes, absent paths, and missing categories', () => {
    const validate = primitiveAuthority.validateMonochromePrimitiveManifest;
    expect(typeof validate, 'missing primitive manifest validator').toBe('function');
    if (typeof validate !== 'function') return;

    const manifest = primitiveAuthority.MONOCHROME_PRIMITIVE_MANIFEST;
    expect(validate(manifest, frozenPaths())).toEqual([]);
    const metadataMutations: Array<[string, primitiveAuthority.MonochromePrimitiveManifest]> = [
      ['schema version', { ...manifest, schemaVersion: 2 as never }],
      ['source commit', { ...manifest, sourceCommit: '0'.repeat(40) }],
      ['capture mode', { ...manifest, captureMode: 'drift' as never }],
      ['owned paths', { ...manifest, ownedPaths: [...manifest.ownedPaths, 'overlap.ts'] }],
      ['fixture ids', { ...manifest, fixtureIds: manifest.fixtureIds.slice(1) }],
      [
        'fixture hashes',
        {
          ...manifest,
          fixtureHashes: { ...manifest.fixtureHashes, chat: '0'.repeat(64) },
        },
      ],
      ['consumer tasks', { ...manifest, consumerTasks: ['MC4'] }],
      ['validator command', { ...manifest, validatorCommand: 'drift' }],
    ];
    for (const [field, mutatedManifest] of metadataMutations) {
      expect(validate(mutatedManifest, frozenPaths()).join('\n'), `${field} mutation`).toMatch(
        /metadata|schema|source commit|capture|owned path|fixture|consumer|validator/iu,
      );
    }
    const firstSharedPrimitive = manifest.sharedPrimitives[0];
    expect(firstSharedPrimitive).toBeDefined();
    if (!firstSharedPrimitive) return;
    expect(
      validate(
        {
          ...manifest,
          sharedPrimitives: [...manifest.sharedPrimitives, firstSharedPrimitive],
        },
        frozenPaths(),
      ).join('\n'),
    ).toMatch(/duplicate|owner|lane/iu);
    expect(
      validate(
        {
          ...manifest,
          featureLocalControls: manifest.featureLocalControls.slice(1),
        },
        frozenPaths(),
      ).join('\n'),
    ).toMatch(/category/iu);
    expect(
      validate(
        {
          ...manifest,
          sharedPrimitives: [
            { ...manifest.sharedPrimitives[0], sourcePath: 'app/src/components/ui/missing.tsx' },
            ...manifest.sharedPrimitives.slice(1),
          ],
        },
        frozenPaths(),
      ).join('\n'),
    ).toMatch(/absent|path/iu);
  });
});
