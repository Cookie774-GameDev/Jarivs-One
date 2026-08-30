import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

function mergePatch(target, patch) {
  if (patch === null || Array.isArray(patch) || typeof patch !== 'object') return patch;
  const merged =
    target !== null && !Array.isArray(target) && typeof target === 'object' ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = mergePatch(merged[key], value);
  }
  return merged;
}

const [baseConfig, cdpConfig, appPackage, rootPackage, releaseScript] = await Promise.all([
  readJson('../app/src-tauri/tauri.conf.json'),
  readJson('../app/src-tauri/tauri.cdp.conf.json'),
  readJson('../app/package.json'),
  readJson('../package.json'),
  readFile(new URL('./release-windows.ps1', import.meta.url), 'utf8'),
]);

test('QA CDP config preserves every Tauri window while changing only main browser args', () => {
  assert.deepEqual(Object.keys(cdpConfig), ['app']);
  assert.deepEqual(Object.keys(cdpConfig.app), ['windows']);

  const merged = mergePatch(baseConfig, cdpConfig);
  const baseWindows = baseConfig.app.windows;
  const mergedWindows = merged.app.windows;

  assert.deepEqual(
    mergedWindows.map(({ label }) => label),
    ['main', 'cold-start-intro', 'dictation'],
  );
  assert.equal(new Set(mergedWindows.map(({ label }) => label)).size, mergedWindows.length);
  assert.deepEqual(mergedWindows.slice(1), baseWindows.slice(1));

  const expectedMain = {
    ...baseWindows[0],
    additionalBrowserArgs: `${baseWindows[0].additionalBrowserArgs} --remote-debugging-address=127.0.0.1 --remote-debugging-port=9223`,
  };
  assert.deepEqual(mergedWindows[0], expectedMain);
  assert.deepEqual(merged, {
    ...baseConfig,
    app: {
      ...baseConfig.app,
      windows: [expectedMain, ...baseWindows.slice(1)],
    },
  });
});

test('QA CDP browser arguments request loopback-only and retain the bounded memory flag', () => {
  const args = cdpConfig.app.windows[0].additionalBrowserArgs.split(/\s+/u);
  const matching = (prefix) => args.filter((arg) => arg.startsWith(prefix));

  assert.deepEqual(matching('--js-flags='), ['--js-flags=--max-old-space-size=1536']);
  assert.deepEqual(matching('--remote-debugging-address='), [
    '--remote-debugging-address=127.0.0.1',
  ]);
  assert.deepEqual(matching('--remote-debugging-port='), ['--remote-debugging-port=9223']);
  assert.doesNotMatch(args.join(' '), /(?:0\.0\.0\.0|\[?::\]?|remote-allow-origins)/u);
  assert.doesNotMatch(args.join(' '), /(?:user-data-dir|profile-directory)/u);
  assert.doesNotMatch(JSON.stringify(baseConfig), /remote-debugging-/u);
});

test('only the named nondefault dev script can activate the QA CDP overlay', () => {
  assert.equal(
    appPackage.scripts['tauri:dev'],
    'node ../scripts/prepare-siyuan-runtime.mjs --if-windows && tauri dev --features jarvis-voice',
  );
  assert.equal(
    appPackage.scripts['tauri:build'],
    'node ../scripts/prepare-siyuan-runtime.mjs --if-windows && tauri build --features jarvis-voice',
  );
  assert.equal(
    appPackage.scripts['tauri:dev:cdp'],
    'node ../scripts/prepare-siyuan-runtime.mjs --if-windows && tauri dev --config src-tauri/tauri.cdp.conf.json --features jarvis-voice',
  );

  for (const [name, command] of Object.entries(appPackage.scripts)) {
    if (name === 'tauri:dev:cdp') continue;
    assert.doesNotMatch(command, /(?:tauri\.cdp\.conf\.json|remote-debugging-|9223)/u, name);
  }
  for (const [name, command] of Object.entries(rootPackage.scripts ?? {})) {
    assert.doesNotMatch(command, /(?:tauri\.cdp\.conf\.json|remote-debugging-|9223)/u, name);
  }
  assert.doesNotMatch(releaseScript, /(?:tauri\.cdp\.conf\.json|remote-debugging-|9223)/u);
  assert.match(
    releaseScript,
    /npm run tauri:build -- --config 'src-tauri\\tauri\.windows-signing\.generated\.json'/u,
  );
});
