import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { MONOCHROME_BASELINE_MANIFEST } from './baseline-manifest.ts';
import {
  B0_R1_EDGE_LAUNCH_ARGS,
  B0_R1_MANIFEST_PATH,
  analyzeB0R1PixelDifferences,
  assertB0R1CaptureSetComplete,
  assertB0R1InputBindingUnchanged,
  b0R1OutputPath,
  b0R1PetVisibility,
  buildB0R1Manifest,
  countB0R1PixelDifferences,
  currentB0R1InputBinding,
  currentB0R1SourceProvenance,
  type B0R1CaptureAuthority,
  type B0R1Manifest,
  loadAndValidateB0R1Manifest,
  replayB0R1Capture,
  resolveB0BaseUrl,
} from './b0Replay.ts';
import {
  collectStyleMetrics,
  detectThemeLeakage,
  prepareDeterministicPage,
} from './styleMetrics.ts';

/**
 * B0-R1 is an additive ordinary-theme authority. The original B0 tree remains
 * immutable, but its generic chat captures are not content-equivalence proof:
 * their readiness gate admitted an empty thread. B0-R1 requires populated
 * fixture content and compares every pixel exactly, without masks or tolerance.
 */

const CREATE_MISSING_B0_R1 = process.env.MONOCHROME_B0_R1_CREATE_MISSING === '1';
test.use({ launchOptions: { args: [...B0_R1_EDGE_LAUNCH_ARGS] } });
if (CREATE_MISSING_B0_R1 && existsSync(B0_R1_MANIFEST_PATH)) {
  throw new Error('B0-R1 creation mode requires the authority manifest to be absent.');
}
const b0R1CaptureSource = CREATE_MISSING_B0_R1
  ? {
      inputBinding: currentB0R1InputBinding(),
      provenance: currentB0R1SourceProvenance(),
    }
  : undefined;
let b0R1Manifest: B0R1Manifest | undefined;
const validatedB0R1Manifest = (): B0R1Manifest => {
  if (CREATE_MISSING_B0_R1) {
    throw new Error('B0-R1 authority is unavailable during missing-only creation mode.');
  }
  b0R1Manifest ??= loadAndValidateB0R1Manifest();
  return b0R1Manifest;
};
const b0R1InvocationCaptures = new Set<string>();

test.describe('Preserved themes and Origami — B0-R1 ordinary authority', () => {
  test('authority is source-bound and preserves the immutable B0 tree', async ({
    browser,
  }, testInfo) => {
    expect(MONOCHROME_BASELINE_MANIFEST.captures).toHaveLength(10);
    for (const capture of MONOCHROME_BASELINE_MANIFEST.captures) {
      expect(
        createHash('sha256').update(readFileSync(capture.outputPath)).digest('hex'),
        `${capture.outputPath} must remain immutable`,
      ).toBe(capture.sha256);
    }
    test.skip(
      CREATE_MISSING_B0_R1 && !existsSync(B0_R1_MANIFEST_PATH),
      'The missing-only creation pass writes the source-bound manifest after capture 10.',
    );
    const manifest = validatedB0R1Manifest();
    expect(manifest.originalB0.genericChatEquivalence).toBe('invalid');
    expect(manifest.captures).toHaveLength(10);
    expect(browser.version()).toBe(manifest.browser.version);
    expect(testInfo.project.use.launchOptions?.args).toEqual([...B0_R1_EDGE_LAUNCH_ARGS]);
    expect(manifest.browser.launchArgs).toEqual(B0_R1_EDGE_LAUNCH_ARGS);
  });

  for (const [captureIndex, capture] of MONOCHROME_BASELINE_MANIFEST.captures.entries()) {
    test(`${capture.caseId} matches exact populated B0-R1 pixels`, async ({
      browser,
      page,
    }, testInfo) => {
      await page.setViewportSize({
        width: MONOCHROME_BASELINE_MANIFEST.viewport.width,
        height: MONOCHROME_BASELINE_MANIFEST.viewport.height,
      });
      const b0BaseUrl = resolveB0BaseUrl(testInfo.config.metadata);
      const outputPath = b0R1OutputPath(capture.outputPath);
      const manifestCapture = (
        CREATE_MISSING_B0_R1 ? undefined : validatedB0R1Manifest()
      )?.captures.find(({ caseId }) => caseId === capture.caseId);
      const existingBytes = existsSync(outputPath) ? readFileSync(outputPath) : undefined;
      const existingSha256 = existingBytes
        ? createHash('sha256').update(existingBytes).digest('hex')
        : undefined;
      if (!CREATE_MISSING_B0_R1 && !manifestCapture) {
        throw new Error(`B0-R1 manifest capture is missing: ${capture.caseId}.`);
      }
      if (manifestCapture && manifestCapture.outputPath !== outputPath) {
        throw new Error(`B0-R1 manifest output path mismatch: ${capture.caseId}.`);
      }
      const expectedSha256 = manifestCapture?.sha256 ?? existingSha256;
      const actual = await replayB0R1Capture(page, capture, b0BaseUrl);
      const sha256 = createHash('sha256').update(actual).digest('hex');
      if (!existsSync(outputPath)) {
        if (!CREATE_MISSING_B0_R1) throw new Error(`B0-R1 capture is missing: ${outputPath}.`);
        await mkdir(outputPath.slice(0, outputPath.lastIndexOf('/')), { recursive: true });
        await writeFile(outputPath, actual, { flag: 'wx' });
      }
      const expected = readFileSync(outputPath);
      const pixelDifferences = countB0R1PixelDifferences(expected, actual);
      if (pixelDifferences !== 0) {
        const diagnostic = analyzeB0R1PixelDifferences(expected, actual);
        if (diagnostic.summary.pixelDifferences !== pixelDifferences) {
          throw new Error(`B0-R1 mismatch diagnostic count diverged: ${capture.caseId}.`);
        }
        const expectedPath = testInfo.outputPath(`${capture.caseId}-expected.png`);
        const actualPath = testInfo.outputPath(`${capture.caseId}-actual.png`);
        const diffPath = testInfo.outputPath(`${capture.caseId}-diff.png`);
        const summaryPath = testInfo.outputPath(`${capture.caseId}-difference-summary.json`);
        await Promise.all([
          writeFile(expectedPath, expected),
          writeFile(actualPath, actual),
          writeFile(diffPath, diagnostic.diffPng),
          writeFile(
            summaryPath,
            `${JSON.stringify(
              {
                caseId: capture.caseId,
                outputPath,
                expectedSha256,
                actualSha256: sha256,
                ...diagnostic.summary,
              },
              null,
              2,
            )}\n`,
          ),
        ]);
        await Promise.all([
          testInfo.attach(`${capture.caseId}-expected`, {
            path: expectedPath,
            contentType: 'image/png',
          }),
          testInfo.attach(`${capture.caseId}-actual`, {
            path: actualPath,
            contentType: 'image/png',
          }),
          testInfo.attach(`${capture.caseId}-diff`, {
            path: diffPath,
            contentType: 'image/png',
          }),
          testInfo.attach(`${capture.caseId}-difference-summary`, {
            path: summaryPath,
            contentType: 'application/json',
          }),
        ]);
      }
      expect(
        pixelDifferences,
        `${outputPath} (full actual SHA-256 ${sha256}; B0-R1 SHA-256 ${expectedSha256 ?? sha256})`,
      ).toBe(0);
      if (CREATE_MISSING_B0_R1) b0R1InvocationCaptures.add(capture.caseId);

      if (
        CREATE_MISSING_B0_R1 &&
        captureIndex === MONOCHROME_BASELINE_MANIFEST.captures.length - 1 &&
        !existsSync(B0_R1_MANIFEST_PATH)
      ) {
        const captures: B0R1CaptureAuthority[] = MONOCHROME_BASELINE_MANIFEST.captures.map(
          (sourceCapture) => {
            const authorityPath = b0R1OutputPath(sourceCapture.outputPath);
            const bytes = readFileSync(authorityPath);
            const png = PNG.sync.read(bytes);
            return {
              caseId: sourceCapture.caseId,
              themeId: sourceCapture.themeId,
              documentTheme: sourceCapture.documentTheme,
              route: sourceCapture.route,
              fixtureId: sourceCapture.fixtureId,
              origamiGateActive: sourceCapture.origamiGateActive,
              petVisible: b0R1PetVisibility(sourceCapture.caseId),
              outputPath: authorityPath,
              sha256: createHash('sha256').update(bytes).digest('hex'),
              width: png.width,
              height: png.height,
            };
          },
        );
        if (!b0R1CaptureSource) {
          throw new Error('B0-R1 capture source preflight is missing.');
        }
        assertB0R1CaptureSetComplete(
          b0R1InvocationCaptures,
          MONOCHROME_BASELINE_MANIFEST.captures.map(({ caseId }) => caseId),
        );
        assertB0R1InputBindingUnchanged(b0R1CaptureSource.inputBinding, currentB0R1InputBinding());
        const manifest = buildB0R1Manifest(captures, browser.version(), b0R1CaptureSource);
        await writeFile(B0_R1_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, {
          flag: 'wx',
        });
      }
    });
  }
});

test.describe('Preserved theme selector isolation', () => {
  for (const theme of ['default', 'vibespace', 'jarvis', 'origami'] as const) {
    test(`${theme} keeps metrics distinct from MonoChrome`, async ({ page }) => {
      await prepareDeterministicPage(page, '/chat', {
        fixtureId: 'chat',
        origamiGate: theme === 'origami',
        surfaceId: `theme:${theme}`,
        theme,
      });
      const preserved = await collectStyleMetrics(page, `theme:${theme}`, theme);

      await prepareDeterministicPage(page, '/chat', {
        fixtureId: 'chat',
        surfaceId: 'theme:monochrome',
        theme: 'monochrome',
      });
      const monochrome = await collectStyleMetrics(page, 'theme:monochrome', 'monochrome');

      expect(detectThemeLeakage(monochrome, preserved, theme)).toEqual([]);
    });
  }
});
