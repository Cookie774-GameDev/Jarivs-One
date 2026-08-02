import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_BUNDLE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.txt',
  '.webmanifest',
]);

const DEVELOPMENT_WORKBENCH_TOKENS = Object.freeze([
  'MonochromeWorkbench',
  'monochromeWorkbenchFixtures',
]);

function collectTextBundleFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(target);
      } else if (entry.isFile() && TEXT_BUNDLE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(target);
      }
    }
  };
  visit(root);
  return files.sort((first, second) => first.localeCompare(second));
}

export function auditProductionWorkbenchAbsence(distributionDirectory) {
  const root = path.resolve(distributionDirectory);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`production distribution directory is unavailable: ${root}`);
  }

  const files = collectTextBundleFiles(root);
  const htmlEntryCount = files.filter((file) => path.extname(file) === '.html').length;
  const javascriptBundleCount = files.filter((file) =>
    ['.js', '.mjs'].includes(path.extname(file)),
  ).length;
  if (htmlEntryCount === 0) {
    throw new Error(`production distribution has no HTML entry: ${root}`);
  }
  if (javascriptBundleCount === 0) {
    throw new Error(`production distribution has no JavaScript bundle: ${root}`);
  }

  const violations = [];
  for (const file of files) {
    const relativePath = path.relative(root, file).replaceAll(path.sep, '/');
    for (const token of DEVELOPMENT_WORKBENCH_TOKENS) {
      if (relativePath.includes(token)) {
        violations.push({ path: relativePath, token: `filename:${token}` });
      }
    }
    const contents = readFileSync(file, 'utf8');
    for (const token of DEVELOPMENT_WORKBENCH_TOKENS) {
      if (contents.includes(token)) {
        violations.push({
          path: relativePath,
          token,
        });
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `production bundle contains development-only MonoChrome workbench identifiers: ${JSON.stringify(
        violations,
      )}`,
    );
  }

  return Object.freeze({
    distributionDirectory: root,
    htmlEntryCount,
    javascriptBundleCount,
    scannedFileCount: files.length,
    violations: Object.freeze([]),
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    const result = auditProductionWorkbenchAbsence(process.argv[2] ?? 'app/dist');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
