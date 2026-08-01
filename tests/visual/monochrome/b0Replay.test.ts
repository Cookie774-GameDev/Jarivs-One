import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PNG } from 'pngjs';

import monochromeConfig from '../../../playwright.monochrome.config.ts';
import * as b0Replay from './b0Replay.ts';
import {
  b0BoundedRasterRegions,
  captureMatchingFrame,
  countB0StablePixelDifferences,
  hashB0StablePixels,
  resolveB0BaseUrl,
  shiftedB0Fixture,
} from './b0Replay.ts';
import { MONOCHROME_BASELINE_MANIFEST } from './baseline-manifest.ts';

test('B0-R1 effective Playwright project launches with the declared Edge authority', () => {
  const project = monochromeConfig.projects?.find(
    (candidate) => candidate.name === 'monochrome-other-themes',
  );
  assert.ok(project);
  assert.deepEqual(project.use?.launchOptions?.args, [
    '--force-color-profile=srgb',
    '--disable-features=PaintHolding',
    '--mute-audio',
    '--disable-gpu',
    '--disable-lcd-text',
    '--disable-font-subpixel-positioning',
  ]);
});

function buildCurrentManifestFixture() {
  const captures = MONOCHROME_BASELINE_MANIFEST.captures.map((capture) => {
    const outputPath = b0Replay.b0R1OutputPath(capture.outputPath);
    const bytes = readFileSync(outputPath);
    const png = PNG.sync.read(bytes);
    return {
      caseId: capture.caseId,
      themeId: capture.themeId,
      documentTheme: capture.documentTheme,
      route: capture.route,
      fixtureId: capture.fixtureId,
      origamiGateActive: capture.origamiGateActive,
      petVisible: b0Replay.b0R1PetVisibility(capture.caseId),
      outputPath,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: png.width,
      height: png.height,
    };
  });
  return b0Replay.buildB0R1Manifest(captures, '150.0.4078.105', {
    provenance: b0Replay.currentB0R1SourceProvenance(),
    inputBinding: b0Replay.currentB0R1InputBinding(),
  });
}

test('B0 replay reconstructs the exact frozen shifted fixture', async () => {
  const fixture = await shiftedB0Fixture();
  assert.equal(fixture.clock, Date.parse('2026-07-16T12:00:00.000Z'));
  assert.equal(
    createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),
    '48759d692d069850a3b2f734823ec06b2fcf62a667d984d52ec30247d25c4ec9',
  );
});

test('B0-R1 local state preserves the shared deterministic Date authority', async () => {
  const installLocalState = Reflect.get(b0Replay, 'installB0R1LocalState');
  assert.equal(typeof installLocalState, 'function');
  const fixture = await shiftedB0Fixture();
  const storage = new Map<string, string>();
  const originalDate = globalThis.Date;
  const previousLocalStorage = Reflect.get(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
  });
  try {
    const page = {
      async addInitScript(script: (argument: unknown) => void, argument: unknown): Promise<void> {
        script(argument);
      },
    };
    await installLocalState(
      page,
      { storageKey: 'theme-state', storeVersion: 3, theme: 'jarvis' },
      fixture,
      { auth: { storageKey: 'auth-state', storeVersion: 2 } },
    );
    assert.equal(globalThis.Date, originalDate);
    assert.deepEqual(JSON.parse(storage.get('auth-state') ?? ''), {
      state: fixture.auth,
      version: 2,
    });
    assert.deepEqual(JSON.parse(storage.get('theme-state') ?? ''), {
      state: { ...fixture.ui, theme: 'jarvis' },
      version: 3,
    });
  } finally {
    if (previousLocalStorage === undefined) {
      Reflect.deleteProperty(globalThis, 'localStorage');
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: previousLocalStorage,
      });
    }
  }
});

test('B0-R1 capture stability delegates to the bounded shared three-transition primitive', async () => {
  const stabilizeSurface = Reflect.get(b0Replay, 'stabilizeB0R1Surface');
  assert.equal(typeof stabilizeSurface, 'function');
  const element = { dataset: {} as Record<string, string> };
  const calls: unknown[][] = [];
  const page = {
    locator(selector: string) {
      assert.equal(selector, '[data-capture-root]');
      return {
        async waitFor(options: unknown) {
          assert.deepEqual(options, { state: 'visible', timeout: 30_000 });
        },
        async count() {
          return 1;
        },
        async evaluate(callback: (target: typeof element, id: string) => void, id: string) {
          callback(element, id);
        },
      };
    },
  };
  await stabilizeSurface(
    page,
    '[data-capture-root]',
    'b0-r1:jarvis-settings:capture',
    async (...argumentsList: unknown[]) => {
      calls.push(argumentsList);
    },
  );

  assert.equal(element.dataset.monochromeSurfaceId, 'b0-r1:jarvis-settings:capture');
  assert.deepEqual(calls, [[page, 'b0-r1:jarvis-settings:capture', { maximumFrames: 64 }]]);
});

test('B0-R1 elapsed quiescence rejects three early stable frames before a delayed theme endpoint', async () => {
  const captureStableFrame = Reflect.get(b0Replay, 'captureStableB0R1Frame');
  assert.equal(typeof captureStableFrame, 'function');

  const observations = [
    { now: 0, bytes: 'early', style: 'accent:early', animations: 'none' },
    { now: 16, bytes: 'early', style: 'accent:early', animations: 'none' },
    { now: 32, bytes: 'early', style: 'accent:early', animations: 'none' },
    { now: 48, bytes: 'early', style: 'accent:early', animations: 'none' },
    { now: 100, bytes: 'endpoint', style: 'accent:endpoint', animations: 'theme-accent' },
    { now: 116, bytes: 'settled', style: 'accent:settled', animations: 'theme-accent' },
    { now: 216, bytes: 'settled', style: 'accent:settled', animations: 'theme-accent' },
    { now: 366, bytes: 'settled', style: 'accent:settled', animations: 'theme-accent' },
  ];
  let index = 0;
  const result = await captureStableFrame({
    maximumSamples: observations.length,
    maximumElapsedMs: 500,
    minimumQuietMs: 250,
    now: () => observations[index]!.now,
    finishFiniteAnimations: async () => ({
      authority: observations[index]!.animations,
      finiteAnimations: observations[index]!.animations === 'none' ? 0 : 1,
      forcedToEnd: observations[index]!.now === 100 ? 1 : 0,
      infiniteAnimations: 0,
    }),
    sampleStyleSignature: async () => observations[index]!.style,
    captureFrame: async () => Buffer.from(observations[index]!.bytes),
    waitForNextSample: async () => {
      index += 1;
      return index < observations.length;
    },
  });

  assert.equal(result.bytes.toString(), 'settled');
  assert.equal(result.attempts, 8);
  assert.equal(result.quietElapsedMs, 250);
  assert.equal(index, 7);
});

test('B0-R1 readiness finishes finite document animations before pixel sampling', async () => {
  const finishAnimations = Reflect.get(b0Replay, 'finishB0R1FiniteAnimations');
  assert.equal(typeof finishAnimations, 'function');
  let finiteFinishes = 0;
  let infiniteFinishes = 0;
  const animations = [
    {
      playState: 'running',
      effect: { getComputedTiming: () => ({ endTime: 200 }) },
      finish() {
        finiteFinishes += 1;
        this.playState = 'finished';
      },
    },
    {
      playState: 'running',
      effect: { getComputedTiming: () => ({ endTime: Number.POSITIVE_INFINITY }) },
      finish() {
        infiniteFinishes += 1;
      },
    },
    {
      playState: 'finished',
      effect: { getComputedTiming: () => ({ endTime: 120 }) },
      finish() {
        finiteFinishes += 1;
      },
    },
  ];
  const previousDocument = Reflect.get(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      getAnimations() {
        return animations;
      },
    },
  });
  try {
    const observation = await finishAnimations({
      async evaluate(callback: () => unknown) {
        return callback();
      },
    });
    assert.equal(observation.finiteAnimations, 2);
    assert.equal(observation.forcedToEnd, 1);
    assert.equal(observation.infiniteAnimations, 1);
    assert.match(observation.authority, /"forcedToEnd":1/u);
    assert.equal(finiteFinishes, 1);
    assert.equal(infiniteFinishes, 0);
  } finally {
    if (previousDocument === undefined) {
      Reflect.deleteProperty(globalThis, 'document');
    } else {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument,
      });
    }
  }
});

test('B0-R1 elapsed quiescence fails closed at its sample bound', async () => {
  const captureStableFrame = Reflect.get(b0Replay, 'captureStableB0R1Frame');
  assert.equal(typeof captureStableFrame, 'function');
  let frame = 0;
  await assert.rejects(
    captureStableFrame({
      maximumSamples: 4,
      maximumElapsedMs: 100,
      minimumQuietMs: 50,
      now: () => frame * 10,
      finishFiniteAnimations: async () => ({
        authority: 'none',
        finiteAnimations: 0,
        forcedToEnd: 0,
        infiniteAnimations: 0,
      }),
      sampleStyleSignature: async () => 'unchanged-style',
      captureFrame: async () => Buffer.from(`changing-${frame++}`),
      waitForNextSample: async () => true,
    }),
    /did not remain quiescent for 50ms within 4 samples and 100ms/u,
  );
});

test('B0-R1 elapsed quiescence fails closed when elapsed time exceeds its horizon', async () => {
  const captureStableFrame = Reflect.get(b0Replay, 'captureStableB0R1Frame');
  assert.equal(typeof captureStableFrame, 'function');
  const times = [0, 50, 101];
  let index = 0;
  await assert.rejects(
    captureStableFrame({
      maximumSamples: 8,
      maximumElapsedMs: 100,
      minimumQuietMs: 100,
      now: () => times[index]!,
      finishFiniteAnimations: async () => ({
        authority: 'none',
        finiteAnimations: 0,
        forcedToEnd: 0,
        infiniteAnimations: 0,
      }),
      sampleStyleSignature: async () => 'unchanged-style',
      captureFrame: async () => Buffer.from('unchanged-frame'),
      waitForNextSample: async () => {
        index += 1;
        return true;
      },
    }),
    /did not remain quiescent for 100ms within 2 samples and 100ms/u,
  );
});

test('B0-R1 requires a source-bound authority manifest', async () => {
  const loadManifest = Reflect.get(b0Replay, 'loadAndValidateB0R1Manifest');
  assert.equal(typeof loadManifest, 'function');

  const manifest = await loadManifest();
  assert.equal(manifest.authorityId, 'b0-r1');
  assert.equal(manifest.originalB0.preserved, true);
  assert.equal(manifest.originalB0.genericChatEquivalence, 'invalid');
  assert.match(manifest.source.provenance.parentCommit, /^[a-f0-9]{40}$/u);
  assert.ok(manifest.source.inputBinding.fileCount > 0);
  assert.match(manifest.source.inputBinding.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(manifest.readiness.version, 'b0-r1-content-pixel-quiescent-v4');
  assert.equal(manifest.readiness.minimumQuietMs, 250);
  assert.equal(manifest.readiness.maximumQuiescenceMs, 2_000);
  assert.equal(manifest.readiness.maximumQuiescenceSamples, 128);
  assert.equal(manifest.readiness.finiteAnimations, 'finished-and-observed-each-sample');
  assert.equal(manifest.readiness.styleAuthority, 'computed-theme-capture-geometry-font-v2');
  assert.equal(manifest.readiness.pixelAuthority, 'full-frame-unmasked');
  assert.equal(manifest.captures.length, 10);
});

test('B0-R1 manifest contract rejects environment, capture, and path ambiguity', () => {
  const assertManifestContract = Reflect.get(b0Replay, 'assertB0R1ManifestContract');
  assert.equal(typeof assertManifestContract, 'function');
  const manifest = buildCurrentManifestFixture();
  assert.doesNotThrow(() => assertManifestContract(manifest));

  assert.deepEqual(b0Replay.B0_R1_EDGE_LAUNCH_ARGS, [
    '--force-color-profile=srgb',
    '--disable-features=PaintHolding',
    '--mute-audio',
    '--disable-gpu',
    '--disable-lcd-text',
    '--disable-font-subpixel-positioning',
  ]);
  const invalidManifests = [
    { ...manifest, viewport: { ...manifest.viewport, width: 1671 } },
    {
      ...manifest,
      browser: { ...manifest.browser, launchArgs: manifest.browser.launchArgs.slice(0, -1) },
    },
    {
      ...manifest,
      browser: {
        ...manifest.browser,
        launchArgs: [
          '--force-color-profile=srgb',
          '--disable-features=PaintHolding',
          '--mute-audio',
          '--disable-gpu',
        ],
      },
    },
    { ...manifest, readiness: { ...manifest.readiness, stableFrames: 2 } },
    { ...manifest, readiness: { ...manifest.readiness, minimumQuietMs: 249 } },
    { ...manifest, captures: [manifest.captures[0], ...manifest.captures.slice(0, -1)] },
    {
      ...manifest,
      captures: manifest.captures.map((capture, index) =>
        index === 0
          ? {
              ...capture,
              outputPath: 'tests/visual/monochrome/baselines/b0-r1/../escape.png',
            }
          : capture,
      ),
    },
  ];
  for (const invalidManifest of invalidManifests) {
    assert.throws(() => assertManifestContract(invalidManifest), /manifest shape/u);
  }
});

test('B0-R1 source binding includes every imported replay authority', () => {
  const binding = b0Replay.currentB0R1InputBinding();
  assert.equal(Object.hasOwn(binding, 'dirtyInputs'), false);
  for (const path of [
    'package.json',
    'package-lock.json',
    'app/package.json',
    'app/postcss.config.js',
    'app/tailwind.config.ts',
    'app/tsconfig.json',
    'app/tsconfig.node.json',
    'app/vite.config.ts',
  ]) {
    assert.equal(binding.roots.includes(path), true, `${path} is not source-bound`);
  }
  assert.equal(binding.roots.includes('tests/visual/monochrome/baseline-manifest.ts'), true);
  assert.equal(binding.roots.includes('tests/visual/monochrome/fixture-manifest.ts'), true);
  assert.equal(binding.roots.includes('tests/visual/monochrome/route-manifest.ts'), true);
  assert.equal(binding.roots.includes('tests/visual/monochrome/styleMetrics.ts'), true);
});

test('B0-R1 parent provenance remains valid after the authority is committed', () => {
  const assertParentProvenance = Reflect.get(b0Replay, 'assertB0R1ParentProvenance');
  assert.equal(typeof assertParentProvenance, 'function');
  assert.doesNotThrow(() => assertParentProvenance(b0Replay.currentB0R1SourceProvenance()));
  const observed: string[] = [];
  assert.doesNotThrow(() =>
    assertParentProvenance(
      {
        parentCommit: '1'.repeat(40),
        branch: 'codex/source-parent',
        dirtyInputs: [],
      },
      (parentCommit: string) => {
        observed.push(parentCommit);
        return true;
      },
    ),
  );
  assert.deepEqual(observed, ['1'.repeat(40)]);
  assert.throws(
    () =>
      assertParentProvenance(
        {
          parentCommit: '2'.repeat(40),
          branch: 'codex/unrelated',
          dirtyInputs: [],
        },
        () => false,
      ),
    /parent commit is not an ancestor/u,
  );
});

test('B0-R1 publication rejects any input drift between capture one and capture ten', () => {
  const assertInputUnchanged = Reflect.get(b0Replay, 'assertB0R1InputBindingUnchanged');
  assert.equal(typeof assertInputUnchanged, 'function');
  const initial = {
    algorithm: 'sha256-path-nul-bytes-v1',
    roots: ['source.ts'],
    fileCount: 1,
    sha256: 'a'.repeat(64),
  };
  assert.doesNotThrow(() => assertInputUnchanged(initial, structuredClone(initial)));
  assert.throws(
    () => assertInputUnchanged(initial, { ...initial, sha256: 'b'.repeat(64) }),
    /source binding changed during capture/u,
  );
});

test('B0-R1 publication requires all ten captures from the current invocation', () => {
  const assertCaptureSetComplete = Reflect.get(b0Replay, 'assertB0R1CaptureSetComplete');
  assert.equal(typeof assertCaptureSetComplete, 'function');
  const expected = Array.from({ length: 10 }, (_, index) => `capture-${index}`);
  assert.doesNotThrow(() => assertCaptureSetComplete(new Set(expected), expected));
  assert.throws(
    () => assertCaptureSetComplete(new Set(expected.slice(1)), expected),
    /current invocation did not complete every capture/u,
  );
  assert.throws(
    () => assertCaptureSetComplete(new Set([...expected, 'unexpected']), expected),
    /current invocation did not complete every capture/u,
  );
});

test('B0-R1 readiness rejects blank or unauthenticated chat content', () => {
  const assertReady = Reflect.get(b0Replay, 'assertB0R1MeaningfulContent');
  assert.equal(typeof assertReady, 'function');

  const valid = {
    theme: 'default',
    surface: 'chat',
    sessionVisible: true,
    threadVisible: true,
    composerVisible: true,
    expectedMessagesVisible: 2,
    expectedMessageTextsVisible: true,
    fontsLoaded: true,
    fontCount: 1,
    stableFrames: 3,
    origamiFragmentsVisible: 0,
    origamiGateActive: false,
  };
  assert.doesNotThrow(() => assertReady(valid));

  for (const invalid of [
    { ...valid, sessionVisible: false },
    { ...valid, threadVisible: false },
    { ...valid, composerVisible: false },
    { ...valid, expectedMessagesVisible: 1 },
    { ...valid, expectedMessageTextsVisible: false },
    { ...valid, fontsLoaded: false },
    { ...valid, fontCount: 0 },
    { ...valid, stableFrames: 2 },
    { ...valid, origamiFragmentsVisible: 1 },
  ]) {
    assert.throws(() => assertReady(invalid), /B0-R1 readiness/u);
  }
});

test('B0-R1 pixel authority is exact and unmasked', () => {
  const countDifferences = Reflect.get(b0Replay, 'countB0R1PixelDifferences');
  assert.equal(typeof countDifferences, 'function');

  const baseline = new PNG({ width: 2, height: 1 });
  baseline.data.fill(100);
  const changed = PNG.sync.read(PNG.sync.write(baseline));
  changed.data[0] = 101;

  assert.equal(countDifferences(PNG.sync.write(baseline), PNG.sync.write(baseline)), 0);
  assert.equal(countDifferences(PNG.sync.write(baseline), PNG.sync.write(changed)), 1);
});

test('B0-R1 mismatch diagnostics retain exact topology without weakening pixel authority', () => {
  const analyzeDifferences = Reflect.get(b0Replay, 'analyzeB0R1PixelDifferences');
  assert.equal(typeof analyzeDifferences, 'function');

  const expected = new PNG({ width: 3, height: 2 });
  expected.data.fill(100);
  const actual = PNG.sync.read(PNG.sync.write(expected));
  actual.data[(0 * 3 + 1) * 4] = 105;
  actual.data[(1 * 3 + 2) * 4 + 2] = 93;

  const diagnostic = analyzeDifferences(PNG.sync.write(expected), PNG.sync.write(actual)) as {
    readonly summary: {
      readonly pixelDifferences: number;
      readonly bounds: Readonly<{ left: number; top: number; right: number; bottom: number }>;
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
    };
    readonly diffPng: Buffer;
  };

  assert.deepEqual(diagnostic.summary, {
    pixelDifferences: 2,
    bounds: { left: 1, top: 0, right: 2, bottom: 1 },
    channelDifferences: { red: 1, green: 0, blue: 1, alpha: 0 },
    maximumChannelDelta: { red: 5, green: 0, blue: 7, alpha: 0 },
    connectedComponents: 2,
    largestComponentPixels: 1,
    changedRows: 2,
    changedColumns: 2,
  });
  const diff = PNG.sync.read(diagnostic.diffPng);
  assert.deepEqual(
    [...diff.data],
    [0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255],
  );
});

test('B0-R1 Settings readiness observes the full dialog geometry and font line boxes', () => {
  const captureSelector = Reflect.get(b0Replay, 'b0R1CaptureSelector');
  const sampleStyleSignature = Reflect.get(b0Replay, 'sampleB0R1StyleSignature');
  assert.equal(typeof captureSelector, 'function');
  assert.equal(typeof sampleStyleSignature, 'function');
  assert.equal(captureSelector('chat'), '[data-vibespace-page="chat"]');
  assert.equal(captureSelector('terminal'), '[data-terminal-route-cache]');
  assert.equal(captureSelector('settings-appearance'), '.mc7f-settings-modal');

  const source = sampleStyleSignature.toString();
  for (const contract of [
    'getBoundingClientRect',
    'background-image',
    'backdrop-filter',
    'font-family',
    'font-size',
    'font-weight',
    'letter-spacing',
    'line-height',
  ]) {
    assert.match(source, new RegExp(contract));
  }
});

test('B0-R1 binds pet presentation instead of inheriting startup timing', () => {
  const petVisible = Reflect.get(b0Replay, 'b0R1PetVisibility');
  assert.equal(typeof petVisible, 'function');
  assert.equal(petVisible('default-chat'), false);
  assert.equal(petVisible('jarvis-chat'), false);
  assert.equal(petVisible('vibespace-terminal'), false);
  assert.throws(() => petVisible('unknown'), /B0-R1 pet presentation/u);
});

test('B0 replay admits only its exact loopback metadata URL', () => {
  assert.equal(
    resolveB0BaseUrl({ monochromeB0BaseUrl: 'http://127.0.0.1:4174' }),
    'http://127.0.0.1:4174',
  );
  for (const metadata of [
    {},
    { monochromeB0BaseUrl: 'http://localhost:4174' },
    { monochromeB0BaseUrl: 'https://127.0.0.1:4174' },
    { monochromeB0BaseUrl: 'http://127.0.0.1:80' },
    { monochromeB0BaseUrl: 'http://127.0.0.1:4174/path' },
    { monochromeB0BaseUrl: 'http://127.0.0.1:4174?query=1' },
  ]) {
    assert.throws(() => resolveB0BaseUrl(metadata), /B0 replay URL/u);
  }
});

test('B0 replay gates the same captured bytes while searching bounded rendered phases', async () => {
  const frames = [Buffer.from('first'), Buffer.from('preserved'), Buffer.from('later')];
  const capturedFrames = [...frames];
  const gatedFrames: Buffer[] = [];
  let waits = 0;
  const expectedHash = createHash('sha256').update(frames[1]!).digest('hex');

  const result = await captureMatchingFrame(
    expectedHash,
    3,
    async () => frames.shift()!,
    async () => {
      waits += 1;
      return true;
    },
    (candidate) => {
      gatedFrames.push(candidate);
      return candidate !== capturedFrames[0];
    },
  );

  assert.equal(result.matched, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.bytes.toString(), 'preserved');
  assert.equal(waits, 1);
  assert.deepEqual(gatedFrames, capturedFrames.slice(0, 2));
  assert.equal(gatedFrames[0], capturedFrames[0]);
  assert.equal(gatedFrames[1], capturedFrames[1]);
});

test('B0 replay stops at its phase bound and preserves the first mismatch for evidence', async () => {
  const frames = [Buffer.from('first'), Buffer.from('second'), Buffer.from('third')];
  let waits = 0;
  const result = await captureMatchingFrame(
    createHash('sha256').update('missing').digest('hex'),
    2,
    async () => frames.shift()!,
    async () => {
      waits += 1;
      return true;
    },
  );

  assert.equal(result.matched, false);
  assert.equal(result.attempts, 2);
  assert.equal(result.bytes.toString(), 'first');
  assert.equal(waits, 1);
  assert.equal(frames.length, 1);
});

test('B0 stable-pixel hashing ignores only explicitly bounded dynamic pixels', () => {
  const baseline = new PNG({ width: 4, height: 4 });
  baseline.data.fill(255);
  const insideChange = PNG.sync.read(PNG.sync.write(baseline));
  const outsideChange = PNG.sync.read(PNG.sync.write(baseline));
  insideChange.data[(1 * 4 + 1) * 4] = 0;
  outsideChange.data[0] = 0;
  const regions = [
    { name: 'dynamic', selector: '[data-dynamic]', x: 1, y: 1, width: 2, height: 2 },
  ];

  const expected = hashB0StablePixels(PNG.sync.write(baseline), regions);
  assert.equal(hashB0StablePixels(PNG.sync.write(insideChange), regions), expected);
  assert.notEqual(hashB0StablePixels(PNG.sync.write(outsideChange), regions), expected);
  assert.throws(
    () =>
      hashB0StablePixels(PNG.sync.write(baseline), [
        { name: 'outside', selector: '[data-outside]', x: 3, y: 3, width: 2, height: 2 },
      ]),
    /outside PNG bounds/u,
  );
});

test('B0 stable-pixel comparison permits at most a three-level channel raster delta', () => {
  const baseline = new PNG({ width: 2, height: 1 });
  baseline.data.fill(100);
  const threeLevels = PNG.sync.read(PNG.sync.write(baseline));
  const fourLevels = PNG.sync.read(PNG.sync.write(baseline));
  threeLevels.data[0] = 103;
  fourLevels.data[0] = 104;

  assert.equal(
    countB0StablePixelDifferences(PNG.sync.write(baseline), PNG.sync.write(threeLevels), []),
    0,
  );
  assert.equal(
    countB0StablePixelDifferences(PNG.sync.write(baseline), PNG.sync.write(fourLevels), []),
    1,
  );
});

test('B0 bounded raster regions are limited to exact unstable surfaces', () => {
  const defaultChat = MONOCHROME_BASELINE_MANIFEST.captures.find(
    ({ caseId }) => caseId === 'default-chat',
  );
  const defaultCapture = MONOCHROME_BASELINE_MANIFEST.captures.find(
    ({ caseId }) => caseId === 'default-settings',
  );
  const vibespaceChat = MONOCHROME_BASELINE_MANIFEST.captures.find(
    ({ caseId }) => caseId === 'vibespace-chat',
  );
  const origamiCapture = MONOCHROME_BASELINE_MANIFEST.captures.find(
    ({ caseId }) => caseId === 'origami-chat',
  );
  assert.ok(defaultChat);
  assert.ok(defaultCapture);
  assert.ok(vibespaceChat);
  assert.ok(origamiCapture);

  assert.deepEqual(b0BoundedRasterRegions(defaultChat), []);
  assert.deepEqual(b0BoundedRasterRegions(vibespaceChat), []);
  assert.deepEqual(
    b0BoundedRasterRegions(defaultCapture).map(({ name }) => name),
    ['pet', 'settings-navigation-glyphs'],
  );
  assert.deepEqual(
    b0BoundedRasterRegions(origamiCapture).map(({ name }) => name),
    ['pet', 'origami-voice-indicator'],
  );
});
