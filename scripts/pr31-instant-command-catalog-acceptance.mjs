import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const instantRoot = path.join(repoRoot, 'app', 'src', 'features', 'instant-command');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.ts$/u.test(entry.name) && !/\.test\.ts$/u.test(entry.name) ? [absolute] : [];
  });
}

const files = sourceFiles(instantRoot);
const preReceiptFiles = files.filter(
  (file) =>
    ['parse.ts', 'catalog.ts', 'catalogIndex.ts', 'catalogTypes.ts'].includes(
      path.basename(file),
    ) || file.includes(`${path.sep}catalog${path.sep}`),
);
const forbiddenPattern =
  /^\s*import[^;]*from\s+['"][^'"]*(?:\/ai\/|providerRouting|generateText|runAgent)[^'"]*['"]/gmu;
const forbiddenPreReceiptImports = preReceiptFiles.flatMap((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(forbiddenPattern)].map((match) => ({
    file: path.relative(repoRoot, file).replaceAll('\\', '/'),
    import: match[0].trim(),
  }));
});

const catalogSources = files
  .filter(
    (file) =>
      path.basename(file) === 'catalog.ts' || file.includes(`${path.sep}catalog${path.sep}`),
  )
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const commandIds = new Set(
  [...catalogSources.matchAll(/['"]([a-z]+(?:[._][a-z]+)+)['"]/gu)]
    .map((match) => match[1])
    .filter((value) => /\./u.test(value)),
);

const testFiles = [
  'src/features/instant-command/acceptanceCorpus.test.ts',
  'src/features/instant-command/performance.test.ts',
];
const npmCli =
  process.env.npm_execpath ??
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const startedAt = performance.now();
const testResult = spawnSync(
  process.execPath,
  [npmCli, '--prefix', 'app', 'run', 'test', '--', '--run', ...testFiles, '--reporter=dot'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 120_000,
  },
);
const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
const verificationPassed = testResult.status === 0 && !testResult.error;

const report = {
  commandIds: commandIds.size,
  corpusMinimum: { positive: 300, closeNegative: 300, ambiguity: 100, authorization: 100 },
  latencyBudgetMs: 500,
  forbiddenPreReceiptImports,
  verification: {
    status: verificationPassed ? 'passed' : 'failed',
    testFiles,
    durationMs,
    freshProcess: true,
    warmP95Gate: verificationPassed,
    ...(testResult.error ? { failure: 'test_process_error' } : {}),
    ...(testResult.status !== null && testResult.status !== 0
      ? { failure: 'test_process_rejected' }
      : {}),
  },
};

if (forbiddenPreReceiptImports.length > 0 || commandIds.size < 90 || !verificationPassed) {
  process.exitCode = 1;
}
process.stdout.write(`${JSON.stringify(report)}\n`);
