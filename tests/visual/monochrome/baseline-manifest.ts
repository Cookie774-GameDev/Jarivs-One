export type BaselineThemeId = 'default' | 'jarvis' | 'vibespace';
export type BaselineDocumentTheme = 'dark' | 'jarvis' | 'vibespace';
export type BaselineFixtureId = 'chat' | 'settings-appearance' | 'terminal-workbench';
export type BaselineCaptureState =
  | 'generic-mc0b-chat'
  | 'generic-mc0b-settings'
  | 'generic-mc0b-terminal'
  | 'frozen-origami-acceptance';

export interface MonochromeBaselineCapture {
  readonly caseId: string;
  readonly outputPath: string;
  readonly themeId: BaselineThemeId;
  readonly documentTheme: BaselineDocumentTheme;
  readonly route: 'chat' | 'settings-appearance' | 'terminal';
  readonly underlyingRoute: 'chat' | 'terminal';
  readonly captureState: BaselineCaptureState;
  readonly fixtureId: BaselineFixtureId;
  readonly origamiGateActive: boolean;
  readonly fontReady: boolean;
  readonly fontCount: number;
  readonly stableLayout: boolean;
  readonly unexpectedPageErrors: number;
  readonly sha256: string;
}

export interface MonochromeBaselineManifest {
  readonly schemaVersion: 1;
  readonly sourceCommit: string;
  readonly harnessCommit: string;
  readonly routeManifestSha256: string;
  readonly fixtureSourceSha256: string;
  readonly fixtureManifestSha256: string;
  readonly origamiFixtureSourceSha256: string;
  readonly captureFixtureSha256: string;
  readonly browserSource: 'msedge';
  readonly viewport: Readonly<{ width: 1672; height: 941; deviceScaleFactor: 1 }>;
  readonly environment: Readonly<{
    locale: 'en-US';
    timezoneId: 'UTC';
    colorScheme: 'light';
    reducedMotion: 'reduce';
    fixedClock: '2026-07-16T12:00:00.000Z';
    fontReadiness: 'document.fonts.ready';
    stableLayout: 'three-consecutive-animation-frames';
    navigation: 'loopback-only';
    dataSource: 'isolated-synthetic-fixtures';
  }>;
  readonly ownedPaths: readonly string[];
  readonly captures: readonly MonochromeBaselineCapture[];
  readonly validatorCommand: string;
}

const CAPTURES: readonly MonochromeBaselineCapture[] = Object.freeze([
  {
    caseId: 'default-chat',
    outputPath: 'tests/visual/monochrome/baselines/b0/default/chat.png',
    themeId: 'default',
    documentTheme: 'dark',
    route: 'chat',
    underlyingRoute: 'chat',
    captureState: 'generic-mc0b-chat',
    fixtureId: 'chat',
    origamiGateActive: false,
    fontReady: true,
    fontCount: 71,
    stableLayout: true,
    unexpectedPageErrors: 0,
    sha256: '02753d5f6ac3f3d3381cd71142b57ed24cd34c8164baa50cd1fcb9bb0b2f6a3a',
  },
  {
    caseId: 'default-settings',
    outputPath: 'tests/visual/monochrome/baselines/b0/default/settings-appearance.png',
    themeId: 'default',
    documentTheme: 'dark',
    route: 'settings-appearance',
    underlyingRoute: 'terminal',
    captureState: 'generic-mc0b-settings',
    fixtureId: 'settings-appearance',
    origamiGateActive: false,
    fontReady: true,
    fontCount: 71,
    stableLayout: true,
    unexpectedPageErrors: 0,
    sha256: 'b49a1abe47d6953f9b2b1640ebc3a7822d4fcb9904e774fa1b61f30ceb53076e',
  },
  {
    caseId: 'default-terminal',
    outputPath: 'tests/visual/monochrome/baselines/b0/default/terminal-workbench.png',
    themeId: 'default',
    documentTheme: 'dark',
    route: 'terminal',
    underlyingRoute: 'terminal',
    captureState: 'generic-mc0b-terminal',
    fixtureId: 'terminal-workbench',
    origamiGateActive: false,
    fontReady: true,
    fontCount: 71,
    stableLayout: true,
    unexpectedPageErrors: 0,
    sha256: 'e198c1504ba24953bb98b3f02cb6541cc7e275293be6fcebdc3879becc39fe2c',
  },
  {
    caseId: 'jarvis-chat',
    outputPath: 'tests/visual/monochrome/baselines/b0/jarvis/chat.png',
    themeId: 'jarvis',
    documentTheme: 'jarvis',
    route: 'chat',
    underlyingRoute: 'chat',
    captureState: 'generic-mc0b-chat',
    fixtureId: 'chat',
    origamiGateActive: false,
    fontReady: true,
    fontCount: 71,
    stableLayout: true,
    unexpectedPageErrors: 0,
    sha256: '60edaeef44de36b08b78c5a6f9e5a192892206774753a53a7840a2d94d783685',
  },
  {
    caseId: 'jarvis-settings',
    outputPath: 'tests/visual/monochrome/baselines/b0/jarvis/settings-appearance.png',
    themeId: 'jarvis',
    documentTheme: 'jarvis',
    route: 'settings-appearance',
    underlyingRoute: 'terminal',
    captureState: 'generic-mc0b-settings',
    fixtureId: 'settings-appearance',
    origamiGateActive: false,
    fontReady: true,
    fontCount: 71,
    stableLayout: true,
    unexpectedPageErrors: 0,
    sha256: '702e71fab064e7abf54585e37da6a5056d6b6c83f7209c92b8c35288ce2060b1',
  },
  {
    caseId: 'jarvis-terminal',
    outputPath: 'tests/visual/monochrome/baselines/b0/jarvis/terminal-workbench.png',
    themeId: 'jarvis',
    documentTheme: 'jarvis',
    route: 'terminal',
    underlyingRoute: 'terminal',
    captureState: 'generic-mc0b-terminal',
    fixtureId: 'terminal-workbench',
    origamiGateActive: false,
    fontReady: true,
    fontCount: 71,
    stableLayout: true,
    unexpectedPageErrors: 0,
    sha256: 'ac76229cc7e36456d019cab04a927284cd3c39d4a3dfccb0bd0ef460994b4fc8',
  },
  {
    caseId: 'origami-chat',
    outputPath: 'tests/visual/monochrome/baselines/b0/origami/chat.png',
    themeId: 'vibespace',
    documentTheme: 'vibespace',
    route: 'chat',
    underlyingRoute: 'chat',
    captureState: 'frozen-origami-acceptance',
    fixtureId: 'chat',
    origamiGateActive: true,
    fontReady: true,
    fontCount: 71,
    stableLayout: true,
    unexpectedPageErrors: 0,
    sha256: '2f5a34cdbb8b1f1b54f523f13db3f2864acf67a392b02561cca65fe1c6cb9582',
  },
  {
    caseId: 'vibespace-chat',
    outputPath: 'tests/visual/monochrome/baselines/b0/vibespace/chat.png',
    themeId: 'vibespace',
    documentTheme: 'vibespace',
    route: 'chat',
    underlyingRoute: 'chat',
    captureState: 'generic-mc0b-chat',
    fixtureId: 'chat',
    origamiGateActive: true,
    fontReady: true,
    fontCount: 71,
    stableLayout: true,
    unexpectedPageErrors: 0,
    sha256: 'b66da8f343c31f4e4ca9e62cf6bbeb1309fc18d5adc24837b560fa881e41f9b8',
  },
  {
    caseId: 'vibespace-settings',
    outputPath: 'tests/visual/monochrome/baselines/b0/vibespace/settings-appearance.png',
    themeId: 'vibespace',
    documentTheme: 'vibespace',
    route: 'settings-appearance',
    underlyingRoute: 'terminal',
    captureState: 'generic-mc0b-settings',
    fixtureId: 'settings-appearance',
    origamiGateActive: false,
    fontReady: true,
    fontCount: 71,
    stableLayout: true,
    unexpectedPageErrors: 0,
    sha256: '453a8870cc9fe4c5e6b02d7ddb608c9db9e94f5ca563f2c5876c77354ae92a0c',
  },
  {
    caseId: 'vibespace-terminal',
    outputPath: 'tests/visual/monochrome/baselines/b0/vibespace/terminal-workbench.png',
    themeId: 'vibespace',
    documentTheme: 'vibespace',
    route: 'terminal',
    underlyingRoute: 'terminal',
    captureState: 'generic-mc0b-terminal',
    fixtureId: 'terminal-workbench',
    origamiGateActive: false,
    fontReady: true,
    fontCount: 71,
    stableLayout: true,
    unexpectedPageErrors: 0,
    sha256: '9f88c2f3a211905c2004ac94ac25c5e8e06cd834cbb0695104014dc39e0d8a0e',
  },
]);

const OWNED_PATHS = Object.freeze([
  'tests/visual/monochrome/baseline-manifest.test.ts',
  'tests/visual/monochrome/baseline-manifest.ts',
  ...CAPTURES.map(({ outputPath }) => outputPath),
]);

export const MONOCHROME_BASELINE_MANIFEST: MonochromeBaselineManifest = Object.freeze({
  schemaVersion: 1,
  sourceCommit: '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae',
  harnessCommit: '023844c789843e452aab7aad952f8392908d92de',
  routeManifestSha256: 'cf8f766056f9f5bb318d383394f14b5d4e11ec498fa55b1c47ef78f602a81796',
  fixtureSourceSha256: '5dfacca26708b83f8938bb75e0b63b8feb964bb741629bf66d96abbda6e2da4f',
  fixtureManifestSha256: '33781c88e14e4ddc570fa4a2513e3cf9df324e5a1b0c100c4833008d27cb2a08',
  origamiFixtureSourceSha256: '4db0e6aafcc439be18b5103d135bdd2e79d6f26976b04eb0c9c57e2225fd72fc',
  captureFixtureSha256: '48759d692d069850a3b2f734823ec06b2fcf62a667d984d52ec30247d25c4ec9',
  browserSource: 'msedge',
  viewport: Object.freeze({ width: 1672, height: 941, deviceScaleFactor: 1 }),
  environment: Object.freeze({
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    fixedClock: '2026-07-16T12:00:00.000Z',
    fontReadiness: 'document.fonts.ready',
    stableLayout: 'three-consecutive-animation-frames',
    navigation: 'loopback-only',
    dataSource: 'isolated-synthetic-fixtures',
  }),
  ownedPaths: OWNED_PATHS,
  captures: CAPTURES,
  validatorCommand: 'node --test tests/visual/monochrome/baseline-manifest.test.ts',
});

export function validateMonochromeBaselineManifest(manifest: MonochromeBaselineManifest): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push('schema version drift');
  if (manifest.sourceCommit !== MONOCHROME_BASELINE_MANIFEST.sourceCommit) {
    errors.push('source commit drift');
  }
  if (manifest.harnessCommit !== MONOCHROME_BASELINE_MANIFEST.harnessCommit) {
    errors.push('harness commit drift');
  }
  if (JSON.stringify(manifest.ownedPaths) !== JSON.stringify(OWNED_PATHS)) {
    errors.push('owned path drift');
  }
  const ids = manifest.captures.map(({ caseId }) => caseId);
  const paths = manifest.captures.map(({ outputPath }) => outputPath);
  if (manifest.captures.length !== 10) errors.push('capture count drift');
  if (new Set(ids).size !== ids.length) errors.push('duplicate case id');
  if (new Set(paths).size !== paths.length) errors.push('duplicate output path');
  if (JSON.stringify(paths) !== JSON.stringify([...paths].sort())) {
    errors.push('capture path order drift');
  }
  if (JSON.stringify(manifest.captures) !== JSON.stringify(CAPTURES)) {
    errors.push('capture authority drift');
  }
  for (const capture of manifest.captures) {
    if (!/^[a-f0-9]{64}$/u.test(capture.sha256)) errors.push(`hash drift: ${capture.caseId}`);
    if (!capture.fontReady || !capture.stableLayout) {
      errors.push(`readiness drift: ${capture.caseId}`);
    }
    if (capture.unexpectedPageErrors !== 0) errors.push(`page error drift: ${capture.caseId}`);
    const expectedGate = capture.route === 'chat' && capture.documentTheme === 'vibespace';
    if (capture.origamiGateActive !== expectedGate) {
      errors.push(`Origami gate drift: ${capture.caseId}`);
    }
    if (capture.route === 'settings-appearance' && capture.underlyingRoute !== 'terminal') {
      errors.push(`settings underlying route drift: ${capture.caseId}`);
    }
  }
  return errors;
}
