#!/usr/bin/env node
import {
  createReadStream,
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildBrowserLaunchAttempts, loadChromiumType } from './browser-launch.mjs';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIRECTORY = resolve(MODULE_DIRECTORY, '../..');
const WORKBENCH_RELATIVE_PATH = 'tests/visual/chat/workbench/index.html';
const WORKBENCH_STYLESHEET_RELATIVE_PATH = 'tests/visual/chat/workbench/workbench.css';
const ASSET_RELATIVE_ROOT = 'app/public/assets/origami-chat/';
const ARTIFACT_RELATIVE_ROOT = '.artifacts/origami-chat';
const VIEWPORT = Object.freeze({ width: 1672, height: 941, deviceScaleFactor: 1 });
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
});

function isContained(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

export function assertWorkbenchCaptureOptions(
  options,
  { rootDirectory = DEFAULT_ROOT_DIRECTORY } = {},
) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('capture options are required.');
  }
  const root = resolve(rootDirectory);
  const artifactRoot = resolve(root, ARTIFACT_RELATIVE_ROOT);
  const outputPath = resolve(root, requireText(options.outputPath, 'outputPath'));
  const workbenchPath = resolve(root, WORKBENCH_RELATIVE_PATH);
  if (!isContained(artifactRoot, outputPath)) {
    throw new Error(`outputPath must stay inside ${artifactRoot}.`);
  }
  if (extname(outputPath).toLowerCase() !== '.png') {
    throw new Error('outputPath must name a PNG file.');
  }
  if (!existsSync(workbenchPath) || !statSync(workbenchPath).isFile()) {
    throw new Error(`Workbench entry is missing: ${workbenchPath}`);
  }
  if (existsSync(outputPath)) {
    throw new Error(`Workbench output must not already exist: ${outputPath}`);
  }
  return {
    rootDirectory: root,
    artifactRoot,
    outputPath,
    receiptPath: outputPath.replace(/\.png$/iu, '.receipt.json'),
    workbenchPath,
    browserExecutable: options.browserExecutable,
  };
}

function resolveWorkbenchRequest(rootDirectory, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\\') || /%(?:2e|2f|5c)/iu.test(pathname)) return null;
  const relativePath = pathname === '/' ? WORKBENCH_RELATIVE_PATH : pathname.replace(/^\/+/u, '');
  const root = resolve(rootDirectory);
  if (
    relativePath === WORKBENCH_RELATIVE_PATH ||
    relativePath === WORKBENCH_STYLESHEET_RELATIVE_PATH
  ) {
    const candidate = resolve(root, relativePath);
    if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
    return candidate;
  }
  if (!relativePath.startsWith(ASSET_RELATIVE_ROOT)) return null;

  const assetRoot = resolve(root, ASSET_RELATIVE_ROOT);
  const candidate = resolve(assetRoot, relativePath.slice(ASSET_RELATIVE_ROOT.length));
  if (candidate === assetRoot || !isContained(assetRoot, candidate)) return null;
  try {
    if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
    const realAssetRoot = realpathSync(assetRoot);
    const realCandidate = realpathSync(candidate);
    return isContained(realAssetRoot, realCandidate) ? realCandidate : null;
  } catch {
    return null;
  }
}

export async function startWorkbenchServer(rootDirectory) {
  const server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const filePath = resolveWorkbenchRequest(rootDirectory, request.url ?? '/');
    if (!filePath) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Workbench server did not expose a loopback TCP address.');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
}

async function launchWorkbenchContext({ profileDirectory, browserExecutable }) {
  const chromium = await loadChromiumType();
  const failures = [];
  for (const attempt of buildBrowserLaunchAttempts({ browserExecutable })) {
    try {
      const context = await chromium.launchPersistentContext(profileDirectory, {
        headless: true,
        viewport: VIEWPORT,
        reducedMotion: 'reduce',
        ...attempt.options,
      });
      return {
        context,
        browser: context.browser(),
        source: attempt.source,
        launchOptions: attempt.options,
      };
    } catch (error) {
      failures.push(`${attempt.source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No supported headless browser could be launched.\n${failures.join('\n')}`);
}

export async function closeWorkbenchResources(resources, primaryError, removeProfile) {
  const cleanupErrors = [];
  let profileRemoved;
  for (const name of ['page', 'context', 'browser', 'server']) {
    const resource = resources[name];
    if (!resource || typeof resource.close !== 'function') continue;
    try {
      await resource.close();
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (removeProfile) {
    try {
      profileRemoved = await removeProfile();
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
      primaryError ? 'Workbench capture and cleanup failed.' : 'Workbench cleanup failed.',
    );
  }
  if (primaryError) throw primaryError;
  return profileRemoved;
}

async function waitForWorkbenchReady(page) {
  await page.locator('[data-workbench-ready="true"]').waitFor({ state: 'visible' });
  return page.evaluate(async () => {
    await document.fonts.ready;
    const workbench = document.querySelector('.workbench');
    if (!workbench) throw new Error('Workbench canvas is missing.');
    const workbenchStyles = getComputedStyle(workbench);
    if (workbenchStyles.width !== '1744px' || workbenchStyles.backgroundImage === 'none') {
      throw new Error('Workbench stylesheet did not apply to the comparison canvas.');
    }
    const assets = [...document.querySelectorAll('[data-asset]')];
    if (assets.length !== 11) {
      throw new Error(`Expected 11 workbench assets, received ${assets.length}.`);
    }
    const imageElements = assets.filter((element) => element instanceof HTMLImageElement);
    await Promise.all(imageElements.map((image) => image.decode()));
    const failed = imageElements.filter(
      (image) => image.naturalWidth === 0 || image.naturalHeight === 0,
    );
    if (failed.length > 0) {
      throw new Error(`Workbench contains ${failed.length} unloaded image asset(s).`);
    }
    const unstyledNineSlices = assets.filter(
      (asset) =>
        asset.classList.contains('nine-slice') &&
        getComputedStyle(asset).borderImageSource === 'none',
    );
    if (unstyledNineSlices.length > 0) {
      throw new Error(`Workbench contains ${unstyledNineSlices.length} unstyled nine-slice(s).`);
    }
    return {
      assetCount: assets.length,
      imageCount: imageElements.length,
      cssApplied: true,
      labelsOutsideAssets: assets.every(
        (asset) => asset.parentElement?.querySelector(':scope > figcaption') !== null,
      ),
    };
  });
}

function removeDisposableProfile(profileDirectory, artifactRoot) {
  const resolvedProfile = resolve(profileDirectory);
  if (!isContained(artifactRoot, resolvedProfile) || resolvedProfile === artifactRoot) {
    throw new Error(`Refusing to remove profile outside Task 5 artifacts: ${resolvedProfile}`);
  }
  if (existsSync(resolvedProfile)) {
    rmSync(resolvedProfile, { recursive: true, force: true });
  }
  return !existsSync(resolvedProfile);
}

export async function captureWorkbench(options, dependencies = {}) {
  const validated = assertWorkbenchCaptureOptions(options, dependencies);
  const profileDirectory = resolve(
    validated.artifactRoot,
    `workbench-profile-${process.pid}-${Date.now()}`,
  );
  mkdirSync(dirname(validated.outputPath), { recursive: true });
  mkdirSync(profileDirectory, { recursive: false });
  const resources = {};
  let primaryError;
  let captureResult;
  try {
    resources.server = await startWorkbenchServer(validated.rootDirectory);
    const launch = await launchWorkbenchContext({
      profileDirectory,
      browserExecutable: validated.browserExecutable,
    });
    resources.context = launch.context;
    resources.browser = launch.browser;
    resources.page = resources.context.pages()[0] ?? (await resources.context.newPage());
    await resources.page.goto(`${resources.server.baseUrl}/`, { waitUntil: 'networkidle' });
    const readiness = await waitForWorkbenchReady(resources.page);
    if (!readiness.labelsOutsideAssets) {
      throw new Error('Every workbench label must remain outside its comparison asset.');
    }
    await resources.page.screenshot({
      path: validated.outputPath,
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
    captureResult = {
      schemaVersion: 1,
      outputPath: relative(validated.rootDirectory, validated.outputPath).replaceAll('\\', '/'),
      runnerPid: process.pid,
      parentPid: process.ppid,
      browserSource: launch.source,
      browserLaunchOptions: launch.launchOptions,
      loopbackPort: resources.server.port,
      viewport: VIEWPORT,
      readiness,
      profileDirectory: relative(validated.rootDirectory, profileDirectory).replaceAll('\\', '/'),
    };
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }

  const profileRemoved = await closeWorkbenchResources(resources, primaryError, () =>
    removeDisposableProfile(profileDirectory, validated.artifactRoot),
  );
  const receipt = { ...captureResult, profileRemoved, resourcesClosed: true };
  writeFileSync(validated.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument sequence near ${String(flag)}.`);
    }
    if (flag === '--output') options.outputPath = value;
    else if (flag === '--browser-executable') options.browserExecutable = value;
    else throw new Error(`Unknown workbench capture argument: ${flag}`);
  }
  if (!options.outputPath) throw new Error('Missing required --output argument.');
  return options;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const receipt = await captureWorkbench(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
