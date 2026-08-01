import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BrowserContext, Page } from '@playwright/test';
import { PNG } from 'pngjs';

import {
  MONOCHROME_BASELINE_MANIFEST,
  type MonochromeBaselineCapture,
} from './baseline-manifest.ts';
import { B0_R1_EDGE_LAUNCH_ARGS } from './b0Environment.ts';
import { installDeterministicPrimitives, stabilizeDeterministicCapture } from './styleMetrics.ts';

export { B0_R1_EDGE_LAUNCH_ARGS } from './b0Environment.ts';

type OrigamiChatFixture = (typeof import('../chat/fixture-data.mjs'))['ORIGAMI_CHAT_FIXTURE'];
type CaptureChatModule = typeof import('../../../scripts/visual-chat/capture-chat.mjs');
type ChatFixtureModule = typeof import('../../../scripts/visual-chat/chat-fixture.mjs');
type FixtureDataModule = typeof import('../chat/fixture-data.mjs');

const FIXED_CLOCK_MS = Date.parse('2026-07-16T12:00:00.000Z');
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const B0_R1_MINIMUM_QUIET_MS = 250;
const B0_R1_MAXIMUM_QUIESCENCE_MS = 2_000;
const B0_R1_MAXIMUM_QUIESCENCE_SAMPLES = 128;
const B0_R1_DETERMINISTIC_FRAME_MS = 1000 / 60;
export const B0_R1_READINESS_VERSION = 'b0-r1-content-pixel-quiescent-v4';
export const B0_R1_MANIFEST_PATH = 'tests/visual/monochrome/b0-r1.manifest.json';
export const B0_R1_BASELINE_ROOT = 'tests/visual/monochrome/baselines/b0-r1';
const B0_BASELINE_ROOT = 'tests/visual/monochrome/baselines/b0';
const B0_R1_INPUT_ROOTS = Object.freeze([
  'package.json',
  'package-lock.json',
  'app/index.html',
  'app/package.json',
  'app/postcss.config.js',
  'app/public',
  'app/src',
  'app/tailwind.config.ts',
  'app/tsconfig.json',
  'app/tsconfig.node.json',
  'app/vite.config.ts',
  'playwright.monochrome.config.ts',
  'scripts/visual-chat/capture-chat.mjs',
  'scripts/visual-chat/chat-fixture.mjs',
  'tests/visual/chat/fixture-data.mjs',
  'tests/visual/monochrome/baseline-manifest.ts',
  'tests/visual/monochrome/b0Environment.ts',
  'tests/visual/monochrome/b0Replay.ts',
  'tests/visual/monochrome/fixture-manifest.ts',
  'tests/visual/monochrome/monochrome.other-themes.spec.ts',
  'tests/visual/monochrome/route-manifest.ts',
  'tests/visual/monochrome/styleMetrics.ts',
]);
const EXPECTED_DOCUMENT_THEME = Object.freeze({
  default: 'dark',
  jarvis: 'jarvis',
  vibespace: 'vibespace',
} as const);
const B0_R1_INVALID_REASON =
  'The immutable B0 generic-chat captures passed only root/font/geometry readiness and therefore do not prove populated ordinary-chat equivalence.';
const nativeImport = new Function('specifier', 'return import(specifier);') as (
  specifier: string,
) => Promise<unknown>;

async function importRepositoryEsm<T>(relativePath: string): Promise<T> {
  const url = pathToFileURL(resolve(process.cwd(), relativePath)).href;
  return (await nativeImport(url)) as T;
}

export interface MatchingFrameResult {
  readonly attempts: number;
  readonly bytes: Buffer;
  readonly matched: boolean;
}

export interface StableB0R1FrameResult {
  readonly attempts: number;
  readonly quietElapsedMs: number;
  readonly bytes: Buffer;
}

export interface B0R1FiniteAnimationObservation {
  readonly authority: string;
  readonly finiteAnimations: number;
  readonly forcedToEnd: number;
  readonly infiniteAnimations: number;
}

export interface StableB0R1FrameOptions {
  readonly maximumSamples: number;
  readonly maximumElapsedMs: number;
  readonly minimumQuietMs: number;
  readonly now: () => number | Promise<number>;
  readonly finishFiniteAnimations: () => Promise<B0R1FiniteAnimationObservation>;
  readonly sampleStyleSignature: () => Promise<string>;
  readonly captureFrame: () => Promise<Buffer>;
  readonly waitForNextSample: () => Promise<boolean>;
}

interface B0R1ThemeContract {
  readonly storageKey: string;
  readonly storeVersion: number;
  readonly theme: string;
}

interface B0R1PersistenceContract {
  readonly auth: Readonly<{
    readonly storageKey: string;
    readonly storeVersion: number;
  }>;
}

export async function installB0R1LocalState(
  page: Page,
  themeContract: B0R1ThemeContract,
  fixture: OrigamiChatFixture,
  persistenceContract: B0R1PersistenceContract,
): Promise<void> {
  if (
    typeof themeContract.storageKey !== 'string' ||
    themeContract.storageKey.length === 0 ||
    !Number.isSafeInteger(themeContract.storeVersion) ||
    typeof themeContract.theme !== 'string' ||
    themeContract.theme.length === 0 ||
    typeof persistenceContract.auth?.storageKey !== 'string' ||
    persistenceContract.auth.storageKey.length === 0 ||
    !Number.isSafeInteger(persistenceContract.auth.storeVersion)
  ) {
    throw new Error('B0-R1 local persistence authority is invalid.');
  }
  await page.addInitScript(
    ({ authKey, authVersion, fixtureValue, theme }) => {
      localStorage.setItem(
        authKey,
        JSON.stringify({ state: fixtureValue.auth, version: authVersion }),
      );
      localStorage.setItem(
        theme.storageKey,
        JSON.stringify({
          state: { ...fixtureValue.ui, theme: theme.theme },
          version: theme.storeVersion,
        }),
      );
    },
    {
      authKey: persistenceContract.auth.storageKey,
      authVersion: persistenceContract.auth.storeVersion,
      fixtureValue: fixture,
      theme: themeContract,
    },
  );
}

export interface B0R1MeaningfulContentReceipt {
  readonly theme: string;
  readonly surface: string;
  readonly sessionVisible: boolean;
  readonly threadVisible: boolean;
  readonly composerVisible: boolean;
  readonly expectedMessagesVisible: number;
  readonly expectedMessageTextsVisible: boolean;
  readonly fontsLoaded: boolean;
  readonly fontCount: number;
  readonly stableFrames: number;
  readonly origamiFragmentsVisible: number;
  readonly origamiGateActive: boolean;
}

export interface B0R1CaptureAuthority {
  readonly caseId: string;
  readonly themeId: string;
  readonly documentTheme: string;
  readonly route: string;
  readonly fixtureId: string;
  readonly origamiGateActive: boolean;
  readonly petVisible: boolean;
  readonly outputPath: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
}

const MONOCHROME_B0_R1_CASE_IDS = new Set([
  'default-chat',
  'default-settings',
  'default-terminal',
  'jarvis-chat',
  'jarvis-settings',
  'jarvis-terminal',
  'origami-chat',
  'vibespace-chat',
  'vibespace-settings',
  'vibespace-terminal',
]);
export function b0R1PetVisibility(caseId: string): boolean {
  if (!MONOCHROME_B0_R1_CASE_IDS.has(caseId)) {
    throw new Error(`B0-R1 pet presentation has no case authority: ${caseId}.`);
  }
  return false;
}

interface B0R1TreeBinding {
  readonly algorithm: 'sha256-path-nul-bytes-v1';
  readonly roots: readonly string[];
  readonly fileCount: number;
  readonly sha256: string;
}

interface B0R1SourceProvenance {
  readonly parentCommit: string;
  readonly branch: string;
  readonly dirtyInputs: readonly Readonly<{
    path: string;
    status: string;
    sha256: string;
  }>[];
}

export interface B0R1Manifest {
  readonly schemaVersion: 2;
  readonly authorityId: 'b0-r1';
  readonly originalB0: Readonly<{
    preserved: true;
    genericChatEquivalence: 'invalid';
    invalidReason: string;
    tree: B0R1TreeBinding;
  }>;
  readonly source: Readonly<{
    provenance: B0R1SourceProvenance;
    inputBinding: B0R1TreeBinding;
  }>;
  readonly fixture: Readonly<{
    id: 'chat';
    sha256: string;
    clock: '2026-07-16T12:00:00.000Z';
  }>;
  readonly themes: readonly ['default', 'jarvis', 'vibespace'];
  readonly surfaces: readonly ['chat', 'settings-appearance', 'terminal'];
  readonly viewport: Readonly<{ width: 1672; height: 941; deviceScaleFactor: 1 }>;
  readonly browser: Readonly<{
    type: 'chromium';
    channel: 'msedge';
    version: string;
    launchArgs: readonly [
      '--force-color-profile=srgb',
      '--disable-features=PaintHolding',
      '--mute-audio',
      '--disable-gpu',
      '--disable-lcd-text',
      '--disable-font-subpixel-positioning',
    ];
  }>;
  readonly readiness: Readonly<{
    version: typeof B0_R1_READINESS_VERSION;
    expectedMessages: 2;
    requiresSession: true;
    requiresThread: true;
    requiresComposer: true;
    requiresFonts: true;
    stableFrames: 3;
    minimumQuietMs: 250;
    maximumQuiescenceMs: 2000;
    maximumQuiescenceSamples: 128;
    finiteAnimations: 'finished-and-observed-each-sample';
    styleAuthority: 'computed-theme-capture-geometry-font-v2';
    pixelAuthority: 'full-frame-unmasked';
    petPresentation: 'per-capture-explicit';
  }>;
  readonly captures: readonly B0R1CaptureAuthority[];
}

export function b0R1OutputPath(outputPath: string): string {
  const prefix = 'tests/visual/monochrome/baselines/b0/';
  if (!outputPath.startsWith(prefix)) {
    throw new Error(`B0-R1 source capture path is outside the immutable B0 tree: ${outputPath}.`);
  }
  return `${B0_R1_BASELINE_ROOT}/${outputPath.slice(prefix.length)}`;
}

function isB0R1TreeBinding(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const binding = value as Partial<B0R1TreeBinding>;
  return (
    binding.algorithm === 'sha256-path-nul-bytes-v1' &&
    Array.isArray(binding.roots) &&
    binding.roots.length > 0 &&
    binding.roots.every((root) => typeof root === 'string' && root.length > 0) &&
    Number.isSafeInteger(binding.fileCount) &&
    Number(binding.fileCount) > 0 &&
    typeof binding.sha256 === 'string' &&
    SHA256_PATTERN.test(binding.sha256)
  );
}

function isB0R1SourceProvenance(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const provenance = value as Partial<B0R1SourceProvenance>;
  return (
    typeof provenance.parentCommit === 'string' &&
    /^[a-f0-9]{40}$/u.test(provenance.parentCommit) &&
    typeof provenance.branch === 'string' &&
    provenance.branch.length > 0 &&
    Array.isArray(provenance.dirtyInputs) &&
    provenance.dirtyInputs.every(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        typeof row.path === 'string' &&
        row.path.length > 0 &&
        typeof row.status === 'string' &&
        row.status.length === 2 &&
        typeof row.sha256 === 'string' &&
        SHA256_PATTERN.test(row.sha256),
    )
  );
}

export function assertB0R1ManifestContract(value: unknown): asserts value is B0R1Manifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('B0-R1 authority manifest shape is invalid.');
  }
  const manifest = value as Partial<B0R1Manifest>;
  const captures = manifest.captures;
  const expectedCaptures = MONOCHROME_BASELINE_MANIFEST.captures;
  const capturesValid =
    Array.isArray(captures) &&
    captures.length === expectedCaptures.length &&
    captures.every((capture, index) => {
      const expected = expectedCaptures[index];
      return (
        expected !== undefined &&
        capture.caseId === expected.caseId &&
        capture.themeId === expected.themeId &&
        capture.documentTheme === expected.documentTheme &&
        capture.route === expected.route &&
        capture.fixtureId === expected.fixtureId &&
        capture.origamiGateActive === expected.origamiGateActive &&
        capture.petVisible === b0R1PetVisibility(expected.caseId) &&
        capture.outputPath === b0R1OutputPath(expected.outputPath) &&
        SHA256_PATTERN.test(capture.sha256) &&
        capture.width === 1672 &&
        capture.height === 941
      );
    });
  const valid =
    manifest.schemaVersion === 2 &&
    manifest.authorityId === 'b0-r1' &&
    manifest.originalB0?.preserved === true &&
    manifest.originalB0.genericChatEquivalence === 'invalid' &&
    manifest.originalB0.invalidReason === B0_R1_INVALID_REASON &&
    isB0R1TreeBinding(manifest.originalB0.tree) &&
    isB0R1SourceProvenance(manifest.source?.provenance) &&
    isB0R1TreeBinding(manifest.source?.inputBinding) &&
    JSON.stringify(manifest.fixture) ===
      JSON.stringify({
        id: 'chat',
        sha256: '48759d692d069850a3b2f734823ec06b2fcf62a667d984d52ec30247d25c4ec9',
        clock: '2026-07-16T12:00:00.000Z',
      }) &&
    JSON.stringify(manifest.themes) === JSON.stringify(['default', 'jarvis', 'vibespace']) &&
    JSON.stringify(manifest.surfaces) ===
      JSON.stringify(['chat', 'settings-appearance', 'terminal']) &&
    JSON.stringify(manifest.viewport) ===
      JSON.stringify({ width: 1672, height: 941, deviceScaleFactor: 1 }) &&
    manifest.browser?.type === 'chromium' &&
    manifest.browser.channel === 'msedge' &&
    /^\d+(?:\.\d+){2,3}$/u.test(manifest.browser.version) &&
    JSON.stringify(manifest.browser.launchArgs) === JSON.stringify(B0_R1_EDGE_LAUNCH_ARGS) &&
    JSON.stringify(manifest.readiness) ===
      JSON.stringify({
        version: B0_R1_READINESS_VERSION,
        expectedMessages: 2,
        requiresSession: true,
        requiresThread: true,
        requiresComposer: true,
        requiresFonts: true,
        stableFrames: 3,
        minimumQuietMs: B0_R1_MINIMUM_QUIET_MS,
        maximumQuiescenceMs: B0_R1_MAXIMUM_QUIESCENCE_MS,
        maximumQuiescenceSamples: B0_R1_MAXIMUM_QUIESCENCE_SAMPLES,
        finiteAnimations: 'finished-and-observed-each-sample',
        styleAuthority: 'computed-theme-capture-geometry-font-v2',
        pixelAuthority: 'full-frame-unmasked',
        petPresentation: 'per-capture-explicit',
      }) &&
    capturesValid;
  if (!valid) throw new Error('B0-R1 authority manifest shape is invalid.');
}

function repositoryPath(path: string): string {
  return resolve(process.cwd(), path);
}

function normalizedRepositoryPath(path: string): string {
  return relative(process.cwd(), path).split(sep).join('/');
}

function filesUnder(path: string): string[] {
  const absolute = repositoryPath(path);
  if (!existsSync(absolute)) throw new Error(`B0-R1 authority input is missing: ${path}.`);
  if (!statSync(absolute).isDirectory()) return [path];
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesUnder(normalizedRepositoryPath(child)));
    } else if (entry.isFile()) {
      files.push(normalizedRepositoryPath(child));
    }
  }
  return files;
}

function hashBoundFiles(paths: readonly string[]): string {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) {
    hash
      .update(path)
      .update('\0')
      .update(readFileSync(repositoryPath(path)))
      .update('\0');
  }
  return hash.digest('hex');
}

function dirtyInputRows(files: readonly string[]): B0R1SourceProvenance['dirtyInputs'] {
  const allowed = new Set(files);
  const output = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...B0_R1_INPUT_ROOTS],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  const rows: Array<{ path: string; status: string; sha256: string }> = [];
  for (const record of output.split('\0')) {
    if (!record) continue;
    const status = record.slice(0, 2);
    const path = record.slice(3).replaceAll('\\', '/');
    if (!allowed.has(path) || !existsSync(repositoryPath(path))) continue;
    rows.push({
      path,
      status,
      sha256: createHash('sha256')
        .update(readFileSync(repositoryPath(path)))
        .digest('hex'),
    });
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

export function currentB0R1InputBinding(): B0R1TreeBinding {
  const files = B0_R1_INPUT_ROOTS.flatMap(filesUnder).sort();
  return {
    algorithm: 'sha256-path-nul-bytes-v1',
    roots: B0_R1_INPUT_ROOTS,
    fileCount: files.length,
    sha256: hashBoundFiles(files),
  };
}

export function currentB0R1SourceProvenance(): B0R1SourceProvenance {
  const files = B0_R1_INPUT_ROOTS.flatMap(filesUnder).sort();
  return {
    parentCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim(),
    branch: execFileSync('git', ['branch', '--show-current'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim(),
    dirtyInputs: dirtyInputRows(files),
  };
}

export function assertB0R1ParentProvenance(
  provenance: B0R1SourceProvenance,
  isAncestor: (parentCommit: string) => boolean = (parentCommit) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', parentCommit, 'HEAD'], {
        cwd: process.cwd(),
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  },
): void {
  if (!isB0R1SourceProvenance(provenance)) {
    throw new Error('B0-R1 source provenance is invalid.');
  }
  if (!isAncestor(provenance.parentCommit)) {
    throw new Error('B0-R1 parent commit is not an ancestor of the current source.');
  }
}

export function assertB0R1InputBindingUnchanged(
  initial: B0R1TreeBinding,
  final: B0R1TreeBinding,
): void {
  if (JSON.stringify(initial) !== JSON.stringify(final)) {
    throw new Error('B0-R1 source binding changed during capture; publication is forbidden.');
  }
}

export function assertB0R1CaptureSetComplete(
  observedCaseIds: ReadonlySet<string>,
  expectedCaseIds: readonly string[],
): void {
  if (
    expectedCaseIds.length !== 10 ||
    observedCaseIds.size !== expectedCaseIds.length ||
    expectedCaseIds.some((caseId) => !observedCaseIds.has(caseId))
  ) {
    throw new Error(
      'B0-R1 current invocation did not complete every capture; publication is forbidden.',
    );
  }
}

function currentOriginalB0Tree(): B0R1TreeBinding {
  const files = filesUnder(B0_BASELINE_ROOT).sort();
  return {
    algorithm: 'sha256-path-nul-bytes-v1',
    roots: [B0_BASELINE_ROOT],
    fileCount: files.length,
    sha256: hashBoundFiles(files),
  };
}

export function assertB0R1MeaningfulContent(receipt: B0R1MeaningfulContentReceipt): void {
  const valid =
    typeof receipt.theme === 'string' &&
    receipt.theme.length > 0 &&
    typeof receipt.surface === 'string' &&
    receipt.surface.length > 0 &&
    receipt.sessionVisible === true &&
    receipt.threadVisible === true &&
    receipt.composerVisible === true &&
    receipt.expectedMessagesVisible >= 2 &&
    receipt.expectedMessageTextsVisible === true &&
    receipt.fontsLoaded === true &&
    receipt.fontCount >= 1 &&
    receipt.stableFrames >= 3 &&
    (receipt.origamiGateActive
      ? receipt.origamiFragmentsVisible >= 1
      : receipt.origamiFragmentsVisible === 0);
  if (!valid) {
    throw new Error(`B0-R1 readiness contract failed: ${JSON.stringify(receipt)}.`);
  }
}

export function countB0R1PixelDifferences(expectedBytes: Buffer, actualBytes: Buffer): number {
  const expected = PNG.sync.read(expectedBytes);
  const actual = PNG.sync.read(actualBytes);
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(
      `B0-R1 PNG dimensions differ: expected ${expected.width}x${expected.height}; actual ${actual.width}x${actual.height}.`,
    );
  }
  let differences = 0;
  for (let offset = 0; offset < expected.data.length; offset += 4) {
    if (
      expected.data[offset] !== actual.data[offset] ||
      expected.data[offset + 1] !== actual.data[offset + 1] ||
      expected.data[offset + 2] !== actual.data[offset + 2] ||
      expected.data[offset + 3] !== actual.data[offset + 3]
    ) {
      differences += 1;
    }
  }
  return differences;
}

export interface B0R1PixelDifferenceSummary {
  readonly pixelDifferences: number;
  readonly bounds: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }> | null;
  readonly channelDifferences: Readonly<{
    red: number;
    green: number;
    blue: number;
    alpha: number;
  }>;
  readonly maximumChannelDelta: Readonly<{
    red: number;
    green: number;
    blue: number;
    alpha: number;
  }>;
  readonly connectedComponents: number;
  readonly largestComponentPixels: number;
  readonly changedRows: number;
  readonly changedColumns: number;
}

export function analyzeB0R1PixelDifferences(
  expectedBytes: Buffer,
  actualBytes: Buffer,
): Readonly<{ summary: B0R1PixelDifferenceSummary; diffPng: Buffer }> {
  const expected = PNG.sync.read(expectedBytes);
  const actual = PNG.sync.read(actualBytes);
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(
      `B0-R1 PNG dimensions differ: expected ${expected.width}x${expected.height}; actual ${actual.width}x${actual.height}.`,
    );
  }

  const diff = new PNG({ width: expected.width, height: expected.height });
  const changed = new Uint8Array(expected.width * expected.height);
  const changedRows = new Uint8Array(expected.height);
  const changedColumns = new Uint8Array(expected.width);
  const channelDifferences = [0, 0, 0, 0];
  const maximumChannelDelta = [0, 0, 0, 0];
  let pixelDifferences = 0;
  let left = expected.width;
  let top = expected.height;
  let right = -1;
  let bottom = -1;

  for (let pixel = 0; pixel < changed.length; pixel += 1) {
    const offset = pixel * 4;
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(expected.data[offset + channel] - actual.data[offset + channel]);
      if (delta === 0) continue;
      pixelChanged = true;
      channelDifferences[channel] += 1;
      maximumChannelDelta[channel] = Math.max(maximumChannelDelta[channel], delta);
    }
    if (!pixelChanged) continue;

    const x = pixel % expected.width;
    const y = Math.floor(pixel / expected.width);
    changed[pixel] = 1;
    changedRows[y] = 1;
    changedColumns[x] = 1;
    pixelDifferences += 1;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    diff.data[offset] = 255;
    diff.data[offset + 1] = 0;
    diff.data[offset + 2] = 0;
    diff.data[offset + 3] = 255;
  }

  let connectedComponents = 0;
  let largestComponentPixels = 0;
  const stack: number[] = [];
  for (let pixel = 0; pixel < changed.length; pixel += 1) {
    if (changed[pixel] !== 1) continue;
    connectedComponents += 1;
    changed[pixel] = 2;
    stack.push(pixel);
    let componentPixels = 0;
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      componentPixels += 1;
      const x = current % expected.width;
      const candidates = [
        current - expected.width,
        current + expected.width,
        x > 0 ? current - 1 : -1,
        x + 1 < expected.width ? current + 1 : -1,
      ];
      for (const candidate of candidates) {
        if (candidate < 0 || candidate >= changed.length || changed[candidate] !== 1) continue;
        changed[candidate] = 2;
        stack.push(candidate);
      }
    }
    largestComponentPixels = Math.max(largestComponentPixels, componentPixels);
  }

  return {
    summary: {
      pixelDifferences,
      bounds: pixelDifferences > 0 ? { left, top, right, bottom } : null,
      channelDifferences: {
        red: channelDifferences[0],
        green: channelDifferences[1],
        blue: channelDifferences[2],
        alpha: channelDifferences[3],
      },
      maximumChannelDelta: {
        red: maximumChannelDelta[0],
        green: maximumChannelDelta[1],
        blue: maximumChannelDelta[2],
        alpha: maximumChannelDelta[3],
      },
      connectedComponents,
      largestComponentPixels,
      changedRows: changedRows.reduce((count, value) => count + value, 0),
      changedColumns: changedColumns.reduce((count, value) => count + value, 0),
    },
    diffPng: PNG.sync.write(diff),
  };
}

export function buildB0R1Manifest(
  captures: readonly B0R1CaptureAuthority[],
  browserVersion: string,
  source: B0R1Manifest['source'],
): B0R1Manifest {
  if (captures.length !== 10 || !/^\d+(?:\.\d+){2,3}$/u.test(browserVersion)) {
    throw new Error('B0-R1 manifest requires ten captures and an exact Edge version.');
  }
  if (!isB0R1SourceProvenance(source?.provenance) || !isB0R1TreeBinding(source?.inputBinding)) {
    throw new Error('B0-R1 manifest requires captured source authority.');
  }
  const manifest: B0R1Manifest = {
    schemaVersion: 2,
    authorityId: 'b0-r1',
    originalB0: {
      preserved: true,
      genericChatEquivalence: 'invalid',
      invalidReason: B0_R1_INVALID_REASON,
      tree: currentOriginalB0Tree(),
    },
    source: {
      provenance: source.provenance,
      inputBinding: source.inputBinding,
    },
    fixture: {
      id: 'chat',
      sha256: '48759d692d069850a3b2f734823ec06b2fcf62a667d984d52ec30247d25c4ec9',
      clock: '2026-07-16T12:00:00.000Z',
    },
    themes: ['default', 'jarvis', 'vibespace'],
    surfaces: ['chat', 'settings-appearance', 'terminal'],
    viewport: { width: 1672, height: 941, deviceScaleFactor: 1 },
    browser: {
      type: 'chromium',
      channel: 'msedge',
      version: browserVersion,
      launchArgs: B0_R1_EDGE_LAUNCH_ARGS,
    },
    readiness: {
      version: B0_R1_READINESS_VERSION,
      expectedMessages: 2,
      requiresSession: true,
      requiresThread: true,
      requiresComposer: true,
      requiresFonts: true,
      stableFrames: 3,
      minimumQuietMs: B0_R1_MINIMUM_QUIET_MS,
      maximumQuiescenceMs: B0_R1_MAXIMUM_QUIESCENCE_MS,
      maximumQuiescenceSamples: B0_R1_MAXIMUM_QUIESCENCE_SAMPLES,
      finiteAnimations: 'finished-and-observed-each-sample',
      styleAuthority: 'computed-theme-capture-geometry-font-v2',
      pixelAuthority: 'full-frame-unmasked',
      petPresentation: 'per-capture-explicit',
    },
    captures,
  };
  assertB0R1ManifestContract(manifest);
  return manifest;
}

export function loadAndValidateB0R1Manifest(): B0R1Manifest {
  if (!existsSync(repositoryPath(B0_R1_MANIFEST_PATH))) {
    throw new Error('B0-R1 authority manifest is missing.');
  }
  const manifest: unknown = JSON.parse(readFileSync(repositoryPath(B0_R1_MANIFEST_PATH), 'utf8'));
  assertB0R1ManifestContract(manifest);
  assertB0R1ParentProvenance(manifest.source.provenance);
  const currentInput = currentB0R1InputBinding();
  if (
    JSON.stringify(manifest.source.inputBinding) !== JSON.stringify(currentInput) ||
    JSON.stringify(manifest.originalB0.tree) !== JSON.stringify(currentOriginalB0Tree())
  ) {
    throw new Error('B0-R1 authority manifest is stale for the current source or B0 tree.');
  }
  for (const capture of manifest.captures) {
    if (
      !capture.outputPath.startsWith(`${B0_R1_BASELINE_ROOT}/`) ||
      capture.petVisible !== b0R1PetVisibility(capture.caseId) ||
      !SHA256_PATTERN.test(capture.sha256) ||
      !existsSync(repositoryPath(capture.outputPath)) ||
      createHash('sha256')
        .update(readFileSync(repositoryPath(capture.outputPath)))
        .digest('hex') !== capture.sha256
    ) {
      throw new Error(`B0-R1 capture authority is invalid: ${capture.caseId}.`);
    }
  }
  return manifest;
}

export interface B0BoundedRasterRegion {
  readonly name: 'pet' | 'origami-voice-indicator' | 'settings-navigation-glyphs';
  readonly selector: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly layout?: Readonly<{ x: number; y: number; width: number; height: number }>;
}

const PET_DYNAMIC_REGION: B0BoundedRasterRegion = Object.freeze({
  name: 'pet',
  selector: '[data-pet-overlay="true"]',
  x: 24,
  y: 120,
  width: 128,
  height: 128,
});
const ORIGAMI_VOICE_DYNAMIC_REGION: B0BoundedRasterRegion = Object.freeze({
  name: 'origami-voice-indicator',
  selector: '.jarvis-voice-mic',
  x: 1595,
  y: 19,
  width: 28,
  height: 28,
});
const SETTINGS_NAVIGATION_RASTER_REGION: B0BoundedRasterRegion = Object.freeze({
  name: 'settings-navigation-glyphs',
  selector: '[role="dialog"] nav',
  x: 282,
  y: 145,
  width: 113,
  height: 628,
  layout: Object.freeze({
    x: 261,
    y: 145.296875,
    width: 219,
    height: 704.203125,
  }),
});
const SETTINGS_NAVIGATION_ROWS = Object.freeze([
  ['Account', 145.296875, 32.796875],
  ['Plans', 180.09375, 32.796875],
  ['Providers', 214.890625, 32.796875],
  ['AI Connections', 249.6875, 32.796875],
  ['Hive', 284.484375, 36],
  ['All About Me', 322.484375, 32.796875],
  ['Plugins', 357.28125, 32.796875],
  ['Local Models', 392.078125, 32.796875],
  ['Appearance', 426.875, 32.796875],
  ['Voice', 461.671875, 32.796875],
  ['Speech to Text', 496.46875, 32.796875],
  ['Phone & Voice', 531.265625, 32.796875],
  ['Ambient', 566.0625, 32.796875],
  ['Notifications', 600.859375, 32.796875],
  ['Accessibility', 635.65625, 32.796875],
  ['Hotkeys', 670.453125, 32.796875],
  ['Jarvis Actions', 705.25, 32.796875],
  ['About', 740.046875, 32.796875],
] as const);

export function b0BoundedRasterRegions(
  capture: MonochromeBaselineCapture,
): readonly B0BoundedRasterRegion[] {
  const hasPet = capture.route !== 'chat' || capture.captureState === 'frozen-origami-acceptance';
  const regions: B0BoundedRasterRegion[] = hasPet ? [PET_DYNAMIC_REGION] : [];
  if (capture.route === 'settings-appearance') regions.push(SETTINGS_NAVIGATION_RASTER_REGION);
  if (capture.captureState === 'frozen-origami-acceptance') {
    regions.push(ORIGAMI_VOICE_DYNAMIC_REGION);
  }
  return regions;
}

function maskB0BoundedRasterRegions(png: PNG, regions: readonly B0BoundedRasterRegion[]): void {
  for (const region of regions) {
    const values = [region.x, region.y, region.width, region.height];
    if (
      values.some((value) => !Number.isSafeInteger(value)) ||
      region.x < 0 ||
      region.y < 0 ||
      region.width < 1 ||
      region.height < 1 ||
      region.x + region.width > png.width ||
      region.y + region.height > png.height
    ) {
      throw new Error(`B0 dynamic region ${region.name} is outside PNG bounds.`);
    }
    for (let y = region.y; y < region.y + region.height; y += 1) {
      const start = (y * png.width + region.x) * 4;
      const end = start + region.width * 4;
      png.data.fill(0, start, end);
    }
  }
}

export function hashB0StablePixels(
  pngBytes: Buffer,
  regions: readonly B0BoundedRasterRegion[],
): string {
  const png = PNG.sync.read(pngBytes);
  maskB0BoundedRasterRegions(png, regions);
  return createHash('sha256').update(`${png.width}x${png.height}\0`).update(png.data).digest('hex');
}

export function countB0StablePixelDifferences(
  expectedBytes: Buffer,
  actualBytes: Buffer,
  regions: readonly B0BoundedRasterRegion[],
): number {
  const expected = PNG.sync.read(expectedBytes);
  const actual = PNG.sync.read(actualBytes);
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(
      `B0 PNG dimensions differ: expected ${expected.width}x${expected.height}; actual ${actual.width}x${actual.height}.`,
    );
  }
  maskB0BoundedRasterRegions(expected, regions);
  maskB0BoundedRasterRegions(actual, regions);
  const maximumBrowserRasterChannelDelta = 3;
  let differences = 0;
  for (let offset = 0; offset < expected.data.length; offset += 4) {
    let pixelDiffers = false;
    for (let channel = 0; channel < 4; channel += 1) {
      if (
        Math.abs(expected.data[offset + channel]! - actual.data[offset + channel]!) >
        maximumBrowserRasterChannelDelta
      ) {
        pixelDiffers = true;
        break;
      }
    }
    if (pixelDiffers) differences += 1;
  }
  return differences;
}

async function assertB0DynamicRegionLayout(
  page: Page,
  capture: MonochromeBaselineCapture,
): Promise<void> {
  const expected = b0BoundedRasterRegions(capture);
  const observed = await page.evaluate((regions) => {
    return regions.map(({ selector }) => {
      const matches = document.querySelectorAll(selector);
      if (matches.length !== 1) return { count: matches.length, rect: null };
      const rect = matches[0]!.getBoundingClientRect();
      return {
        count: 1,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      };
    });
  }, expected);
  for (const [index, region] of expected.entries()) {
    const actual = observed[index];
    const layout = region.layout ?? region;
    if (
      !actual ||
      actual.count !== 1 ||
      !actual.rect ||
      actual.rect.x !== layout.x ||
      actual.rect.y !== layout.y ||
      actual.rect.width !== layout.width ||
      actual.rect.height !== layout.height
    ) {
      throw new Error(
        `B0 dynamic region ${region.name} geometry mismatch: ${JSON.stringify(actual ?? null)}.`,
      );
    }
  }
  if (capture.route === 'settings-appearance') {
    const rows = await page.evaluate(() => {
      const nav = document.querySelector('[role="dialog"] nav');
      return [...(nav?.querySelectorAll('button') ?? [])].map((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          text: button.textContent?.trim() ?? '',
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          padding: style.padding,
          gap: style.gap,
        };
      });
    });
    const expectedRows = SETTINGS_NAVIGATION_ROWS.map(([text, y, height]) => ({
      text,
      x: 269,
      y,
      width: 203,
      height,
      fontFamily:
        '"Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '13px',
      lineHeight: '20.8px',
      padding: '6px 10px',
      gap: '8px',
    }));
    if (JSON.stringify(rows) !== JSON.stringify(expectedRows)) {
      throw new Error(`B0 settings navigation contract mismatch: ${JSON.stringify(rows)}.`);
    }
  }
}

export async function captureMatchingFrame(
  expectedSha256: string,
  maxAttempts: number,
  captureFrame: () => Promise<Buffer>,
  waitForNextFrame: () => Promise<boolean>,
  candidateMayMatch: (candidate: Buffer) => boolean = () => true,
): Promise<MatchingFrameResult> {
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
    throw new Error('Expected B0 frame hash must be lowercase SHA-256.');
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('B0 frame attempt bound must be a positive safe integer.');
  }

  const first = await captureFrame();
  let attempts = 1;
  if (
    candidateMayMatch(first) &&
    createHash('sha256').update(first).digest('hex') === expectedSha256
  ) {
    return { attempts, bytes: first, matched: true };
  }
  while (attempts < maxAttempts && (await waitForNextFrame())) {
    const candidate = await captureFrame();
    attempts += 1;
    if (
      candidateMayMatch(candidate) &&
      createHash('sha256').update(candidate).digest('hex') === expectedSha256
    ) {
      return { attempts, bytes: candidate, matched: true };
    }
  }
  return { attempts, bytes: first, matched: false };
}

export async function captureStableB0R1Frame(
  options: StableB0R1FrameOptions,
): Promise<StableB0R1FrameResult> {
  const {
    maximumSamples,
    maximumElapsedMs,
    minimumQuietMs,
    now,
    finishFiniteAnimations,
    sampleStyleSignature,
    captureFrame,
    waitForNextSample,
  } = options;
  if (!Number.isSafeInteger(maximumSamples) || maximumSamples < 2) {
    throw new Error('B0-R1 quiescence sample bound must be a safe integer of at least two.');
  }
  if (
    !Number.isFinite(minimumQuietMs) ||
    minimumQuietMs <= 0 ||
    !Number.isFinite(maximumElapsedMs) ||
    maximumElapsedMs < minimumQuietMs
  ) {
    throw new Error('B0-R1 quiescence elapsed bounds are invalid.');
  }

  let startedAt: number | undefined;
  let quietStartedAt: number | undefined;
  let previousBytes: Buffer | undefined;
  let previousStyleSignature: string | undefined;
  let previousAnimationAuthority: string | undefined;
  let previousNow: number | undefined;
  let attempts = 0;
  while (attempts < maximumSamples) {
    const sampledAt = await now();
    if (!Number.isFinite(sampledAt) || (previousNow !== undefined && sampledAt < previousNow)) {
      throw new Error('B0-R1 quiescence clock must be finite and monotonic.');
    }
    startedAt ??= sampledAt;
    if (sampledAt - startedAt > maximumElapsedMs) break;

    const animations = await finishFiniteAnimations();
    const styleSignature = await sampleStyleSignature();
    const candidate = await captureFrame();
    attempts += 1;
    const unchanged =
      previousBytes !== undefined &&
      candidate.equals(previousBytes) &&
      styleSignature === previousStyleSignature &&
      animations.authority === previousAnimationAuthority;
    if (!unchanged) {
      quietStartedAt = sampledAt;
    } else {
      const quietElapsedMs = sampledAt - (quietStartedAt ?? sampledAt);
      if (quietElapsedMs >= minimumQuietMs) {
        return { attempts, quietElapsedMs, bytes: candidate };
      }
    }
    previousBytes = candidate;
    previousStyleSignature = styleSignature;
    previousAnimationAuthority = animations.authority;
    previousNow = sampledAt;
    if (attempts >= maximumSamples || !(await waitForNextSample())) break;
  }

  throw new Error(
    `B0-R1 bytes, computed style, and finite-animation authority did not remain quiescent for ${minimumQuietMs}ms within ${attempts} samples and ${maximumElapsedMs}ms.`,
  );
}

export async function finishB0R1FiniteAnimations(
  page: Pick<Page, 'evaluate'>,
): Promise<B0R1FiniteAnimationObservation> {
  return page.evaluate(() => {
    let finiteAnimations = 0;
    let forcedToEnd = 0;
    let infiniteAnimations = 0;
    const authority: string[] = [];
    const elementPath = (element: Element): string => {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current) {
        const parent: Element | null = current.parentElement;
        const siblingIndex = parent ? [...parent.children].indexOf(current) : 0;
        parts.push(`${current.tagName.toLowerCase()}:${siblingIndex}`);
        current = parent;
      }
      return parts.reverse().join('/');
    };
    for (const animation of document.getAnimations()) {
      const effect = animation.effect;
      const timing = effect?.getComputedTiming();
      const endTime = timing?.endTime;
      if (typeof endTime !== 'number' || !Number.isFinite(endTime)) {
        infiniteAnimations += 1;
        continue;
      }
      finiteAnimations += 1;
      const keyedEffect = effect as KeyframeEffect | null;
      const target = keyedEffect?.target;
      const animationRecord = animation as unknown as Readonly<Record<string, unknown>>;
      authority.push(
        JSON.stringify({
          type: animation.constructor.name,
          name:
            typeof animationRecord.animationName === 'string'
              ? animationRecord.animationName
              : undefined,
          transitionProperty:
            typeof animationRecord.transitionProperty === 'string'
              ? animationRecord.transitionProperty
              : undefined,
          target:
            typeof Element !== 'undefined' && target instanceof Element
              ? elementPath(target)
              : null,
          pseudoElement: keyedEffect?.pseudoElement ?? null,
          endTime,
          playState: animation.playState,
        }),
      );
      if (animation.playState === 'finished') continue;
      animation.finish();
      if (String(animation.playState) !== 'finished') {
        throw new Error('B0-R1 finite animation did not finish synchronously.');
      }
      forcedToEnd += 1;
    }
    authority.sort();
    return {
      authority: JSON.stringify({ finite: authority, forcedToEnd }),
      finiteAnimations,
      forcedToEnd,
      infiniteAnimations,
    };
  });
}

export async function sampleB0R1StyleSignature(
  page: Pick<Page, 'evaluate'>,
  captureSelector: string,
): Promise<string> {
  return page.evaluate((selector) => {
    const captureRoot = document.querySelector(selector);
    if (!captureRoot) throw new Error(`B0-R1 style authority root is missing: ${selector}.`);
    const properties = [
      'accent-color',
      'animation-duration',
      'animation-name',
      'background-color',
      'background-image',
      'backdrop-filter',
      'border-bottom-color',
      'border-left-color',
      'border-right-color',
      'border-top-color',
      'box-shadow',
      'caret-color',
      'color',
      'color-scheme',
      'fill',
      'filter',
      'font-family',
      'font-size',
      'font-style',
      'font-variant',
      'font-weight',
      'letter-spacing',
      'line-height',
      'opacity',
      'outline-color',
      'stroke',
      'text-decoration-color',
      'text-shadow',
      'transform',
      'transition-duration',
      'transition-property',
    ] as const;
    const rootStyle = getComputedStyle(document.documentElement);
    const customProperties = [...rootStyle]
      .filter((property) => property.startsWith('--'))
      .sort()
      .map((property) => [property, rootStyle.getPropertyValue(property)]);
    const elements = [captureRoot, ...captureRoot.querySelectorAll('*')];
    const computed = elements.map((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        geometry: [
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
          bounds.top,
          bounds.right,
          bounds.bottom,
          bounds.left,
        ],
        properties: properties.map((property) => style.getPropertyValue(property)),
      };
    });
    return JSON.stringify({
      documentTheme: document.documentElement.getAttribute('data-theme'),
      documentClass: document.documentElement.className,
      customProperties,
      computed,
    });
  }, captureSelector);
}

export function resolveB0BaseUrl(metadata: Readonly<Record<string, unknown>>): string {
  const value = metadata.monochromeB0BaseUrl;
  if (typeof value !== 'string') throw new Error('B0 replay URL is missing.');
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    !/^\d{4,5}$/u.test(parsed.port) ||
    Number(parsed.port) < 1024 ||
    Number(parsed.port) > 65535
  ) {
    throw new Error('B0 replay URL must be an exact unprivileged 127.0.0.1 origin.');
  }
  return parsed.origin;
}

export async function shiftedB0Fixture(): Promise<OrigamiChatFixture> {
  const { ORIGAMI_CHAT_FIXTURE } = await importRepositoryEsm<FixtureDataModule>(
    'tests/visual/chat/fixture-data.mjs',
  );
  const fixture = structuredClone(ORIGAMI_CHAT_FIXTURE);
  const delta = FIXED_CLOCK_MS - fixture.clock;
  fixture.clock = FIXED_CLOCK_MS;
  const shift = (value: number): number => value + delta;
  for (const row of [
    fixture.workspace,
    fixture.project,
    fixture.chat,
    ...fixture.messages,
    ...fixture.agents,
    ...fixture.activity.runs,
    ...fixture.activity.events,
  ]) {
    if ('created_at' in row) row.created_at = shift(row.created_at);
    if ('updated_at' in row) row.updated_at = shift(row.updated_at);
    if ('started_at' in row) row.started_at = shift(row.started_at);
    if ('finished_at' in row && row.finished_at !== null) {
      row.finished_at = shift(row.finished_at);
    }
  }
  fixture.chat.updated_at = fixture.clock;
  fixture.messages[0].created_at = fixture.clock - 1;
  fixture.messages[0].updated_at = fixture.clock - 1;
  fixture.messages[1].created_at = fixture.clock;
  fixture.messages[1].updated_at = fixture.clock;
  return fixture;
}

async function waitStable(page: Page, selector: string): Promise<void> {
  await page.locator(selector).waitFor({ state: 'visible', timeout: 30_000 });
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return { count: document.fonts.size, status: document.fonts.status };
  });
  if (fonts.status !== 'loaded' || fonts.count < 1) {
    throw new Error('B0 replay font readiness failed.');
  }
  const stable = await page.evaluate(async (targetSelector) => {
    const sample = () => {
      const target = document.querySelector(targetSelector);
      if (!target) return 'missing';
      const rect = target.getBoundingClientRect();
      return [
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        document.body.scrollWidth,
        document.body.scrollHeight,
      ].join(':');
    };
    const frames: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      frames.push(sample());
    }
    return frames[0] !== 'missing' && frames.every((value) => value === frames[0]);
  }, selector);
  if (!stable) throw new Error('B0 replay layout did not stabilize.');
}

export async function stabilizeB0R1Surface(
  page: Page,
  selector: string,
  surfaceId: string,
  stabilize: typeof stabilizeDeterministicCapture = stabilizeDeterministicCapture,
): Promise<void> {
  const surface = page.locator(selector);
  await surface.waitFor({ state: 'visible', timeout: 30_000 });
  const count = await surface.count();
  if (count !== 1) {
    throw new Error(`B0-R1 deterministic surface is ambiguous: ${selector} matched ${count}.`);
  }
  await surface.evaluate((element, id) => {
    (element as HTMLElement).dataset.monochromeSurfaceId = id;
  }, surfaceId);
  await stabilize(page, surfaceId, { maximumFrames: 64 });
}

async function assertB0R1ChatReady(
  page: Page,
  capture: MonochromeBaselineCapture,
  expectedTexts: readonly string[],
): Promise<void> {
  await page.waitForFunction(
    ({ expected }) => {
      const pageRoot = document.querySelector('[data-vibespace-page="chat"]');
      const surface = document.querySelector('[data-monochrome-surface="chat"]');
      const composer = [...document.querySelectorAll('textarea')].find((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
        );
      });
      const text = pageRoot?.textContent ?? '';
      return (
        pageRoot !== null &&
        surface === pageRoot &&
        composer !== undefined &&
        document.querySelectorAll('[aria-label="Copy message"]').length >= 2 &&
        expected.every((value) => text.includes(value))
      );
    },
    { expected: expectedTexts },
    { timeout: 30_000 },
  );
  await waitStable(page, '[data-vibespace-page="chat"]');
  const receipt = await page.evaluate(
    ({ expected, expectedTheme, origamiGateActive }) => {
      const visible = (element: Element | null): boolean => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      };
      const root = document.querySelector('[data-vibespace-page="chat"]');
      const surface = document.querySelector('[data-monochrome-surface="chat"]');
      const composers = [...document.querySelectorAll('textarea')].filter(visible);
      const text = root?.textContent ?? '';
      return {
        theme: document.documentElement.getAttribute('data-theme') ?? '',
        surface: surface?.getAttribute('data-monochrome-surface') ?? '',
        sessionVisible: visible(root),
        threadVisible:
          document.querySelectorAll('[aria-label="Copy message"]').length >= 2 &&
          expected.every((value) => text.includes(value)),
        composerVisible: composers.length === 1,
        expectedMessagesVisible: document.querySelectorAll('[aria-label="Copy message"]').length,
        expectedMessageTextsVisible: expected.every((value) => text.includes(value)),
        fontsLoaded: document.fonts.status === 'loaded',
        fontCount: document.fonts.size,
        stableFrames: 3,
        origamiFragmentsVisible: [
          ...document.querySelectorAll('[data-testid="origami-chat-decor"]'),
        ].filter(visible).length,
        origamiGateActive,
        expectedTheme,
      };
    },
    {
      expected: expectedTexts,
      expectedTheme: EXPECTED_DOCUMENT_THEME[capture.themeId],
      // Readiness is observed before navigating away from chat. In the ordinary
      // app, VibeSpace chat is the approved Origami presentation even when the
      // eventual capture surface (settings/terminal) has no active chat gate.
      origamiGateActive: capture.themeId === 'vibespace',
    },
  );
  if (receipt.theme !== receipt.expectedTheme) {
    throw new Error('B0-R1 readiness document theme mismatch.');
  }
  assertB0R1MeaningfulContent(receipt);
}

async function clickCaptureControl(
  page: Page,
  role: 'button' | 'tab',
  labels: readonly string[],
  label: string,
): Promise<void> {
  for (const name of labels) {
    const matches = page.getByRole(role, { name, exact: true }).filter({ visible: true });
    try {
      await matches.first().waitFor({ state: 'visible', timeout: 5_000 });
    } catch {
      continue;
    }
    const count = await matches.count();
    if (count !== 1) throw new Error(`B0 replay expected one visible ${label}; found ${count}.`);
    await matches.first().evaluate((element) => (element as HTMLElement).click());
    return;
  }
  throw new Error(`B0 replay expected one visible ${label}; found none.`);
}

interface PetFrameObservation {
  readonly frameCount: number;
  readonly key: string;
}

async function observePetFrame(page: Page): Promise<PetFrameObservation | null> {
  return page.evaluate(() => {
    const diagnostics = (
      window as unknown as {
        __VIBESPACE_PET_DIAG__?: () => {
          currentAnimationState?: unknown;
          currentFrameIndex?: unknown;
          currentFrameName?: unknown;
          frameCount?: unknown;
        } | null;
      }
    ).__VIBESPACE_PET_DIAG__?.();
    if (
      !diagnostics ||
      typeof diagnostics.currentAnimationState !== 'string' ||
      typeof diagnostics.currentFrameIndex !== 'number' ||
      !Number.isSafeInteger(diagnostics.currentFrameIndex) ||
      typeof diagnostics.frameCount !== 'number' ||
      !Number.isSafeInteger(diagnostics.frameCount) ||
      diagnostics.frameCount < 1 ||
      diagnostics.frameCount > 240
    ) {
      return null;
    }
    return {
      frameCount: diagnostics.frameCount,
      key: [
        diagnostics.currentAnimationState,
        diagnostics.currentFrameIndex,
        typeof diagnostics.currentFrameName === 'string' ? diagnostics.currentFrameName : '',
      ].join(':'),
    };
  });
}

async function waitForNextPetFrame(
  page: Page,
  previous: PetFrameObservation,
): Promise<PetFrameObservation | null> {
  try {
    await page.waitForFunction(
      (previousKey) => {
        const diagnostics = (
          window as unknown as {
            __VIBESPACE_PET_DIAG__?: () => {
              currentAnimationState?: unknown;
              currentFrameIndex?: unknown;
              currentFrameName?: unknown;
            } | null;
          }
        ).__VIBESPACE_PET_DIAG__?.();
        if (
          !diagnostics ||
          typeof diagnostics.currentAnimationState !== 'string' ||
          typeof diagnostics.currentFrameIndex !== 'number'
        ) {
          return false;
        }
        const key = [
          diagnostics.currentAnimationState,
          diagnostics.currentFrameIndex,
          typeof diagnostics.currentFrameName === 'string' ? diagnostics.currentFrameName : '',
        ].join(':');
        return key !== previousKey;
      },
      previous.key,
      { timeout: 1_500 },
    );
  } catch {
    return null;
  }
  return observePetFrame(page);
}

async function installB0NetworkGuard(
  context: BrowserContext,
  b0BaseUrl: string,
): Promise<{ readonly externalAttempts: string[] }> {
  const externalAttempts: string[] = [];
  const b0Origin = new URL(b0BaseUrl).origin;
  await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const allowed =
      ['about:', 'blob:', 'data:'].includes(requestUrl.protocol) ||
      requestUrl.origin === b0Origin ||
      requestUrl.origin === 'http://127.0.0.1:11434' ||
      requestUrl.origin === 'http://localhost:11434';
    if (allowed) {
      await route.continue();
      return;
    }
    externalAttempts.push(`${requestUrl.protocol}//${requestUrl.host}`);
    await route.abort('blockedbyclient');
  });
  return { externalAttempts };
}

export function b0R1CaptureSelector(route: MonochromeBaselineCapture['route']): string {
  return route === 'chat'
    ? '[data-vibespace-page="chat"]'
    : route === 'terminal'
      ? '[data-terminal-route-cache]'
      : '.mc7f-settings-modal';
}

async function replayCapture(
  page: Page,
  capture: MonochromeBaselineCapture,
  b0BaseUrl: string,
  authority: 'b0' | 'b0-r1',
): Promise<Buffer> {
  const context = page.context();
  const [
    {
      assertNoUnexpectedPageErrors,
      establishDeterministicScroll,
      installDeterministicOllamaFixture,
      openRequiredJarvisModule,
      waitForDeterministicSessionMetrics,
      waitForStableChatLayout,
      withScreenshotFreeze,
    },
    {
      installOrigamiLocalState,
      loadLocalPersistenceContract,
      seedOrigamiIndexedDb,
      validateFixturePersistence,
      waitForInitialLocalSeed,
      waitForJarvisDatabase,
    },
  ] = await Promise.all([
    importRepositoryEsm<CaptureChatModule>('scripts/visual-chat/capture-chat.mjs'),
    importRepositoryEsm<ChatFixtureModule>('scripts/visual-chat/chat-fixture.mjs'),
  ]);
  const network = await installB0NetworkGuard(context, b0BaseUrl);
  const fixture = await shiftedB0Fixture();
  const persistenceContract = loadLocalPersistenceContract(process.cwd());
  validateFixturePersistence(fixture, persistenceContract);
  const themeContract = JSON.parse(
    readFileSync('app/src/features/appearance/themeContract.source.json', 'utf8'),
  ) as Record<string, unknown>;
  await installDeterministicOllamaFixture(context, fixture);
  const captureThemeContract = { ...themeContract, theme: capture.themeId };
  if (authority === 'b0-r1') {
    await installDeterministicPrimitives(page);
    await installB0R1LocalState(
      page,
      captureThemeContract as unknown as B0R1ThemeContract,
      fixture,
      persistenceContract,
    );
  } else {
    await installOrigamiLocalState(page, captureThemeContract, fixture, persistenceContract);
  }
  const expectedPetVisible = authority === 'b0-r1' ? b0R1PetVisibility(capture.caseId) : undefined;
  if (expectedPetVisible !== undefined) {
    await page.addInitScript((petVisible) => {
      localStorage.setItem(
        'vibespace-pet-settings',
        JSON.stringify({
          state: {
            enabled: petVisible,
            overlayVisible: petVisible,
          },
          version: 0,
        }),
      );
    }, expectedPetVisible);
  }
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));

  await page.goto(b0BaseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#root').waitFor({ state: 'visible' });
  await waitForJarvisDatabase(page, persistenceContract);
  await waitForInitialLocalSeed(page, persistenceContract);
  await seedOrigamiIndexedDb(page, fixture, persistenceContract);
  await page.reload({ waitUntil: 'domcontentloaded' });

  if (authority === 'b0-r1') {
    const expectedTexts = fixture.messages.map((message) => {
      const textPart = message.parts.find((part) => part.kind === 'text');
      if (!textPart || textPart.kind !== 'text') {
        throw new Error(`B0-R1 fixture message ${message.id} has no text authority.`);
      }
      return textPart.text;
    });
    await waitForDeterministicSessionMetrics(page, fixture.sessionMetrics);
    await establishDeterministicScroll(page);
    await waitForStableChatLayout(page);
    await assertB0R1ChatReady(page, capture, expectedTexts);
  }

  if (capture.route === 'terminal' || capture.route === 'settings-appearance') {
    await clickCaptureControl(page, 'button', ['Terminals', 'Terminal'], 'Terminals');
    await page
      .locator('[data-terminal-route-cache]')
      .waitFor({ state: 'visible', timeout: 30_000 });
  }
  if (capture.route === 'settings-appearance') {
    await clickCaptureControl(page, 'button', ['Settings'], 'Settings');
    await clickCaptureControl(page, 'tab', ['Appearance'], 'Settings Appearance');
  }

  const selector = b0R1CaptureSelector(capture.route);
  if (authority === 'b0-r1') {
    await page.locator(selector).waitFor({ state: 'visible', timeout: 30_000 });
  } else {
    await waitStable(page, selector);
  }
  const gate = await page.evaluate(() => {
    const documentTheme = document.documentElement.getAttribute('data-theme');
    return {
      active:
        documentTheme === 'vibespace' &&
        document.querySelector('[data-vibespace-page="chat"]') !== null,
      documentTheme,
    };
  });
  if (gate.documentTheme !== EXPECTED_DOCUMENT_THEME[capture.themeId]) {
    throw new Error('B0 replay document theme mismatch.');
  }
  if (gate.active !== capture.origamiGateActive) {
    throw new Error('B0 replay Origami gate mismatch.');
  }
  if (expectedPetVisible === true) {
    await page.locator('[data-pet-overlay="true"]').waitFor({ state: 'visible', timeout: 30_000 });
  } else if (
    expectedPetVisible === false &&
    (await page.locator('[data-pet-overlay="true"]').count()) !== 0
  ) {
    throw new Error('B0-R1 explicit disabled-pet presentation did not resolve.');
  }

  if (capture.captureState === 'frozen-origami-acceptance') {
    if (authority === 'b0') {
      await waitForDeterministicSessionMetrics(page, fixture.sessionMetrics);
      await establishDeterministicScroll(page);
      await waitForStableChatLayout(page);
    }
    await openRequiredJarvisModule(page);
    await establishDeterministicScroll(page);
    await waitForStableChatLayout(page);
  }
  if (authority === 'b0-r1') {
    const imageAssetsReady = await page.evaluate(async () => {
      const images = [...document.images];
      await Promise.all(images.map((image) => image.decode()));
      return images.every(
        (image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
      );
    });
    if (!imageAssetsReady)
      throw new Error('B0-R1 visible surface assets did not complete decoding.');
  }
  if (authority === 'b0-r1' && capture.themeId === 'vibespace' && capture.route === 'chat') {
    const origamiAssetsReady = await page.evaluate(async () => {
      const images = [
        ...document.querySelectorAll<HTMLImageElement>('[data-testid="origami-chat-decor"] img'),
      ];
      await Promise.all(images.map((image) => image.decode()));
      return (
        images.length === 5 &&
        images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
      );
    });
    if (!origamiAssetsReady) throw new Error('B0-R1 Origami assets did not complete decoding.');
    await waitStable(page, '[data-vibespace-page="chat"]');
  }

  const deterministicSurfaceId = `b0-r1:${capture.caseId}:capture`;
  if (authority === 'b0-r1') {
    await stabilizeB0R1Surface(page, selector, deterministicSurfaceId);
  }
  if (authority === 'b0') await assertB0DynamicRegionLayout(page, capture);
  assertNoUnexpectedPageErrors(pageErrors);
  let petFrame = authority === 'b0' ? await observePetFrame(page) : null;
  const phaseBound = petFrame ? Math.min(petFrame.frameCount + 1, 64) : 1;
  const captureFrozenFrame = () => {
    const capture = () =>
      page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
      });
    return authority === 'b0-r1' ? capture() : withScreenshotFreeze(page, capture);
  };
  const waitForNextRenderedFrame = async (): Promise<boolean> => {
    if (!petFrame) return false;
    const next = await waitForNextPetFrame(page, petFrame);
    if (!next) return false;
    petFrame = next;
    return true;
  };
  let matchingFrame: MatchingFrameResult;
  if (authority === 'b0-r1') {
    const stableFrame = await captureStableB0R1Frame({
      maximumSamples: B0_R1_MAXIMUM_QUIESCENCE_SAMPLES,
      maximumElapsedMs: B0_R1_MAXIMUM_QUIESCENCE_MS,
      minimumQuietMs: B0_R1_MINIMUM_QUIET_MS,
      now: () => page.evaluate(() => performance.now()),
      finishFiniteAnimations: () => finishB0R1FiniteAnimations(page),
      sampleStyleSignature: () => sampleB0R1StyleSignature(page, selector),
      captureFrame: captureFrozenFrame,
      waitForNextSample: async () => {
        await page.clock.runFor(B0_R1_DETERMINISTIC_FRAME_MS);
        await page.clock.setSystemTime(FIXED_CLOCK_MS);
        return true;
      },
    });
    matchingFrame = {
      attempts: stableFrame.attempts,
      bytes: stableFrame.bytes,
      matched: true,
    };
  } else {
    matchingFrame = await captureMatchingFrame(
      capture.sha256,
      phaseBound,
      captureFrozenFrame,
      waitForNextRenderedFrame,
    );
  }
  assertNoUnexpectedPageErrors(pageErrors);
  if (network.externalAttempts.length > 0) {
    throw new Error(
      `B0 replay blocked external requests: ${[...new Set(network.externalAttempts)].join(',')}`,
    );
  }
  return matchingFrame.bytes;
}

export function replayB0Capture(
  page: Page,
  capture: MonochromeBaselineCapture,
  b0BaseUrl: string,
): Promise<Buffer> {
  return replayCapture(page, capture, b0BaseUrl, 'b0');
}

export function replayB0R1Capture(
  page: Page,
  capture: MonochromeBaselineCapture,
  b0BaseUrl: string,
): Promise<Buffer> {
  return replayCapture(page, capture, b0BaseUrl, 'b0-r1');
}
