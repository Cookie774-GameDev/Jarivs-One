import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const sourcePath = new URL(
  '../../app/src/features/appearance/themeContract.source.json',
  import.meta.url,
);
const generatedPath = new URL(
  '../../app/src/features/appearance/themeContract.generated.ts',
  import.meta.url,
);
const prepaintPath = new URL('../../app/public/theme-prepaint.js', import.meta.url);
const tauriConfigPath = new URL('../../app/src-tauri/tauri.conf.json', import.meta.url);
const generatorPath = fileURLToPath(new URL('./generate-theme-contract.mjs', import.meta.url));

test('source contract carries the complete accepted theme policy', () => {
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));

  assert.equal(source.storageKey, 'jarvis-ui');
  assert.equal(source.storeVersion, 5);
  assert.equal(source.fallbackTheme, 'default');
  assert.deepEqual(
    source.selectableThemes.map(({ id }) => id),
    ['jarvis', 'vibespace', 'default', 'monochrome', 'sakura'],
  );
  assert.deepEqual(source.selectableThemes.at(-1), {
    id: 'sakura',
    label: 'Sakura',
    description: 'Cel-painted dusk workspace.',
  });
  assert.deepEqual(source.documentThemes, {
    jarvis: 'jarvis',
    vibespace: 'vibespace',
    default: 'dark',
    monochrome: 'monochrome',
    sakura: 'sakura',
  });
  assert.deepEqual(source.persistedLegacyThemes, {
    light: 'monochrome',
    dark: 'default',
    system: 'default',
  });
  assert.deepEqual(source.syncLegacyThemes, { light: 'monochrome' });
  assert.deepEqual(source.commandAliases, {
    jarvis: 'jarvis',
    'jarvis core': 'jarvis',
    core: 'jarvis',
    vibespace: 'vibespace',
    vibe: 'vibespace',
    default: 'default',
    dark: 'default',
    monochrome: 'monochrome',
    mono: 'monochrome',
    terminal: 'monochrome',
    light: 'monochrome',
    sakura: 'sakura',
    'sakura dusk': 'sakura',
  });
});

test('generated TypeScript and prepaint assets are current', () => {
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, [generatorPath, '--check'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  });

  const generated = readFileSync(generatedPath, 'utf8');
  const prepaint = readFileSync(prepaintPath, 'utf8');

  assert.match(generated, /monochrome/);
  assert.match(generated, /Cel-painted dusk workspace\./);
  assert.match(prepaint, /data-theme-preference/);
  assert.doesNotMatch(prepaint, /prefers-color-scheme/);
  assert.doesNotMatch(prepaint, /matchMedia/);
});

test('generated prepaint normalizes storage without system media authority', () => {
  const prepaint = readFileSync(prepaintPath, 'utf8');
  const cases = [
    ['sakura', 'sakura', 'sakura'],
    ['light', 'monochrome', 'monochrome'],
    ['dark', 'default', 'dark'],
    ['system', 'default', 'dark'],
    ['monochrome', 'monochrome', 'monochrome'],
    ['unknown', 'default', 'dark'],
    ['constructor', 'default', 'dark'],
    ['toString', 'default', 'dark'],
    ['__proto__', 'default', 'dark'],
  ];

  for (const [stored, preference, documentTheme] of cases) {
    const attributes = new Map();
    runInNewContext(prepaint, {
      localStorage: {
        getItem: () => JSON.stringify({ state: { theme: stored }, version: 5 }),
      },
      document: {
        documentElement: {
          setAttribute: (name, value) => attributes.set(name, value),
        },
      },
      Set,
      JSON,
    });

    assert.equal(attributes.get('data-theme-preference'), preference);
    assert.equal(attributes.get('data-theme'), documentTheme);
  }
});

test('generated prepaint keeps the pet-overlay shell transparent before app startup', () => {
  const prepaint = readFileSync(prepaintPath, 'utf8');
  const attributes = new Map();
  const style = {};

  runInNewContext(prepaint, {
    localStorage: { getItem: () => null },
    window: { location: { search: '?view=pet-overlay' } },
    document: {
      documentElement: {
        style,
        setAttribute: (name, value) => attributes.set(name, value),
      },
    },
    URLSearchParams,
    Set,
    JSON,
  });

  assert.equal(attributes.get('data-vibespace-view'), 'pet-overlay');
  assert.deepEqual(style, {
    background: 'transparent',
    backgroundColor: 'transparent',
    backgroundImage: 'none',
  });
});

test('production index uses a CSP-safe self-hosted prepaint before the module bundle', () => {
  if (process.platform === 'win32') {
    execFileSync(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'npm --prefix app run build'],
      {
        cwd: repoRoot,
        stdio: 'pipe',
      },
    );
  } else {
    execFileSync('npm', ['--prefix', 'app', 'run', 'build'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  }

  const distIndex = readFileSync(new URL('../../app/dist/index.html', import.meta.url), 'utf8');
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
  const scriptPolicy = tauriConfig.app.security.csp
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('script-src '));
  const prepaintIndex = distIndex.indexOf('src="/theme-prepaint.js"');
  const moduleIndex = distIndex.search(/<script[^>]+type="module"[^>]+src="\/assets\/[^"]+\.js"/);

  assert.ok(prepaintIndex >= 0);
  assert.ok(moduleIndex > prepaintIndex);
  assert.equal(scriptPolicy, "script-src 'self' https://www.youtube.com");
  assert.doesNotMatch(scriptPolicy, /'unsafe-inline'|'unsafe-eval'/);
  assert.doesNotMatch(distIndex, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(readFileSync(prepaintPath, 'utf8'), /\beval\s*\(|new Function|https?:\/\//);
});
