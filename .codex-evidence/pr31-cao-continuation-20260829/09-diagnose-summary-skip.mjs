import { chromium } from 'playwright-core';
import { attachOfficialNative } from '../../scripts/pr31-native-acceptance-harness.mjs';

const jarvisPid = Number(process.env.VS_NATIVE_JARVIS_PID);
const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
const result = await attachment.page.evaluate(async () => {
  const { useAuthStore } = await import('/src/stores/auth.ts');
  const { ensureContextPersistence } = await import('/src/features/context/contextPersistence.ts');
  const { readSiyuanIndexEntries } = await import(
    '/src/features/context/siyuan/siyuanIndexJobStore.ts'
  );
  const { readTextFileSample } = await import('/src/lib/fs.ts');
  const { isSafeSiyuanSummaryText, prepareSiyuanSummaryContent } = await import(
    '/src/features/context/siyuan/siyuanSummaryContent.ts'
  );
  const { applySecretPolicy } = await import('/src/lib/security/secretDetector.ts');
  const auth = useAuthStore.getState();
  if (!auth.projectId) throw new Error('active_project_missing');
  const persistence = await ensureContextPersistence(auth.projectId);
  const map = persistence.maps.find((candidate) =>
    candidate.rootDir.includes('phase0-context-fixture'),
  );
  if (!map) throw new Error('phase0_map_missing');
  const entries = await readSiyuanIndexEntries(auth.projectId, map.id);
  const entry = entries.find((candidate) => candidate.nodeId === 'path:official-native-acceptance.md');
  if (!entry?.sourcePointer) throw new Error('phase0_entry_missing');
  const read = await readTextFileSample(entry.sourcePointer, 96 * 1024, {
    root: map.rootDir,
    strictProjectBoundary: true,
  });
  if (!read.ok) {
    return {
      sourcePointer: entry.sourcePointer,
      root: map.rootDir,
      readOk: false,
      readError: read.error.code,
      summaryState: entry.summaryState,
    };
  }
  const safeText = isSafeSiyuanSummaryText(read.content);
  const prepared = prepareSiyuanSummaryContent(read.content, entry.sizeBytes);
  const secret = applySecretPolicy(prepared.content, 'exclude');
  return {
    sourcePointer: entry.sourcePointer,
    root: map.rootDir,
    readOk: true,
    contentLength: read.content.length,
    safeText,
    secretDecision: secret.decision,
    secretHasText: Boolean(secret.text?.trim()),
    secretFindings: secret.findings.map(({ secretClass, detector, start, end }) => ({
      secretClass,
      detector,
      start,
      end,
    })),
    summaryState: entry.summaryState,
  };
});
process.stdout.write(`${JSON.stringify(result)}\n`);
setTimeout(() => process.exit(0), 50);
