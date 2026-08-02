import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const MODULE_PATH = resolve(HERE, 'capture-workbench.mjs');

async function loadCaptureModule() {
  assert.equal(existsSync(MODULE_PATH), true, 'capture-workbench.mjs must exist');
  return import(`${pathToFileURL(MODULE_PATH).href}?test=${Date.now()}`);
}

test('capture options accept only PNG evidence inside the Task 5 artifact root', async () => {
  const { assertWorkbenchCaptureOptions } = await loadCaptureModule();
  const candidate = `.artifacts/origami-chat/options-${process.pid}-${Date.now()}.png`;
  const valid = assertWorkbenchCaptureOptions({ outputPath: candidate }, { rootDirectory: ROOT });
  assert.equal(valid.outputPath, resolve(ROOT, candidate));
  assert.equal(valid.workbenchPath, resolve(ROOT, 'tests/visual/chat/workbench/index.html'));

  for (const outputPath of [
    '../escape.png',
    '.artifacts/other-slice/workbench.png',
    '.artifacts/origami-chat/workbench.jpg',
  ]) {
    assert.throws(
      () => assertWorkbenchCaptureOptions({ outputPath }, { rootDirectory: ROOT }),
      /inside.*origami-chat|PNG file/iu,
      outputPath,
    );
  }
});

test('capture cleanup preserves primary, resource, and profile failures in order', async () => {
  const { closeWorkbenchResources } = await loadCaptureModule();
  const calls = [];
  const resources = Object.fromEntries(
    ['page', 'context', 'browser', 'server'].map((name) => [
      name,
      {
        close: async () => {
          calls.push(name);
          throw new Error(`${name} close failed`);
        },
      },
    ]),
  );

  await assert.rejects(
    () =>
      closeWorkbenchResources(resources, new Error('capture failed'), async () => {
        calls.push('profile');
        throw new Error('profile removal failed');
      }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /capture and cleanup failed/iu);
      assert.deepEqual(
        error.errors.map((entry) => entry.message),
        [
          'capture failed',
          'page close failed',
          'context close failed',
          'browser close failed',
          'server close failed',
          'profile removal failed',
        ],
      );
      return true;
    },
  );
  assert.deepEqual(calls, ['page', 'context', 'browser', 'server', 'profile']);
});

test('capture source uses readiness signals and contains no fixed sleeps or remote navigation', async () => {
  await loadCaptureModule();
  const source = readFileSync(MODULE_PATH, 'utf8');
  assert.doesNotMatch(source, /waitForTimeout|setTimeout\s*\(/u);
  assert.doesNotMatch(source, /https?:\/\/(?!127\.0\.0\.1|localhost)/u);
  assert.match(source, /data-workbench-ready/u);
  assert.match(source, /document\.fonts\.ready/u);
});

test('the loopback workbench entry resolves its stylesheet through the real static server', async () => {
  const { startWorkbenchServer } = await loadCaptureModule();
  assert.equal(typeof startWorkbenchServer, 'function');
  const server = await startWorkbenchServer(ROOT);
  try {
    const pageResponse = await fetch(`${server.baseUrl}/`);
    assert.equal(pageResponse.status, 200);
    const html = await pageResponse.text();
    const stylesheetPath = html.match(/<link[^>]+href="([^"]+)"[^>]*>/u)?.[1];
    assert.equal(stylesheetPath, '/tests/visual/chat/workbench/workbench.css');

    const stylesheetResponse = await fetch(new URL(stylesheetPath, server.baseUrl));
    assert.equal(stylesheetResponse.status, 200);
    assert.match(stylesheetResponse.headers.get('content-type') ?? '', /^text\/css/u);
    assert.match(await stylesheetResponse.text(), /\.workbench\s*\{/u);

    assert.equal((await fetch(`${server.baseUrl}/package.json`)).status, 404);
    assert.equal((await fetch(`${server.baseUrl}/%2e%2e/package.json`)).status, 404);
  } finally {
    await server.close();
  }
});

test('the loopback server rejects encoded traversal and real-path asset-root escapes', async () => {
  const { startWorkbenchServer } = await loadCaptureModule();
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'vibespace-workbench-security-'));
  const assetRoot = resolve(fixtureRoot, 'app/public/assets/origami-chat');
  const siblingAssetRoot = resolve(fixtureRoot, 'app/public/assets/origami-chat-sibling');
  const outsideAssetRoot = resolve(fixtureRoot, 'outside-assets');
  let server;
  try {
    mkdirSync(assetRoot, { recursive: true });
    mkdirSync(siblingAssetRoot, { recursive: true });
    mkdirSync(outsideAssetRoot, { recursive: true });
    writeFileSync(resolve(assetRoot, 'allowed.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeFileSync(resolve(siblingAssetRoot, 'secret.txt'), 'sibling secret');
    writeFileSync(resolve(outsideAssetRoot, 'secret.txt'), 'junction secret');
    symlinkSync(outsideAssetRoot, resolve(assetRoot, 'linked'), 'junction');
    server = await startWorkbenchServer(fixtureRoot);

    assert.equal(
      (await fetch(`${server.baseUrl}/app/public/assets/origami-chat/allowed.svg`)).status,
      200,
    );

    const rejectedPaths = [
      '/app/public/assets/origami-chat/%5c..%5corigami-chat-sibling%5csecret.txt',
      '/app/public/assets/origami-chat/%5c..%2forigami-chat-sibling%5csecret.txt',
      '/app/public/assets/origami-chat/\\..\\origami-chat-sibling\\secret.txt',
      '/app/public/assets/origami-chat/%255c..%255corigami-chat-sibling%255csecret.txt',
      '/app/public/assets/origami-chat/%2e%2e/origami-chat-sibling/secret.txt',
      '/app/public/assets/origami-chat/linked/secret.txt',
    ];
    for (const requestPath of rejectedPaths) {
      const response = await fetch(`${server.baseUrl}${requestPath}`);
      assert.equal(response.status, 404, requestPath);
      assert.equal(await response.text(), 'Not found', requestPath);
    }
  } finally {
    try {
      if (server) await server.close();
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
});
