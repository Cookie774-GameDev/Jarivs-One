import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const siteRoot = join(repoRoot, 'site');
const immutableBase = '8aa51f1';

const frozenFiles = [
  'site/js/scroll-world-engine.js',
  'site/js/origami-scroll-world.js',
  'site/css/origami-scroll-world.css',
];

const sourceFiles = [
  'scene-01-network.png',
  'scene-02-jarvis-voice.png',
  'scene-03-terminal-workshop.png',
  'scene-04-jarvis-actions.png',
  'scene-05-context-memory.png',
  'scene-05-outro-workspace.png',
];

const diveFiles = [
  'scene-01-network.mp4',
  'scene-02-jarvis-voice.mp4',
  'scene-03-terminal-workshop.mp4',
  'scene-04-jarvis-actions.mp4',
  'scene-05-context-memory.mp4',
  'scene-05-outro-workspace.mp4',
];

const connectorFiles = [
  'scene-01-to-02.mp4',
  'scene-02-to-03.mp4',
  'scene-03-to-04.mp4',
  'scene-04-to-05.mp4',
  'scene-05-to-outro.mp4',
];

function readSite(path) {
  return readFileSync(join(siteRoot, path), 'utf8');
}

function gitOutput(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

test('the production OG runtime, configuration, stylesheet, and media inventory are unchanged', () => {
  for (const path of frozenFiles) {
    const deployedBaseObject = gitOutput(['rev-parse', `${immutableBase}:${path}`]);
    const currentDeployObject = gitOutput(['hash-object', `--path=${path}`, path]);
    assert.equal(
      currentDeployObject,
      deployedBaseObject,
      `${path} must remain byte-identical to ${immutableBase} after Git normalization`,
    );
  }

  const inventories = [
    ['source', sourceFiles],
    ['dives', diveFiles],
    ['connectors', connectorFiles],
  ];

  for (const [directory, expected] of inventories) {
    const actual = readdirSync(join(siteRoot, 'images', 'origami-scroll', directory)).sort();
    assert.deepEqual(actual, [...expected].sort(), `${directory} inventory must stay exact`);
  }

  const config = readSite('js/origami-scroll-world.js');
  for (const file of diveFiles) {
    assert.match(config, new RegExp(`/dives/${file.replaceAll('.', '\\.')}`));
  }
  for (const file of connectorFiles) {
    assert.match(config, new RegExp(`/connectors/${file.replaceAll('.', '\\.')}`));
  }
});

test('the website resolves appearance before paint and presents exactly two choices', () => {
  const html = readSite('index.html');
  const bootstrapIndex = html.indexOf('data-site-appearance-bootstrap');
  const firstStylesheetIndex = html.indexOf('rel="stylesheet"');

  assert.ok(bootstrapIndex > -1, 'pre-paint appearance bootstrap is required');
  assert.ok(bootstrapIndex < firstStylesheetIndex, 'appearance must resolve before the first stylesheet');
  assert.match(html, /URLSearchParams\(location\.search\)/);
  assert.match(html, /vibespace-site-appearance/);
  assert.match(html, /dataset\.siteAppearance/);
  assert.match(html, /\bdefault\b/);
  assert.match(html, /css\/site-appearance\.css/);

  const choices = [...html.matchAll(/data-site-appearance-choice="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(choices, ['default', 'vibespace']);
  assert.match(html, /role="group" aria-label="Website appearance"/);
  assert.match(html, />Default<\/button>/);
  assert.match(html, />VibeSpace<\/button>/);
});

test('Default isolates the OG world and VibeSpace adds a responsive paper frame', () => {
  const cssPath = join(siteRoot, 'css', 'site-appearance.css');
  assert.ok(existsSync(cssPath), `${relative(repoRoot, cssPath)} must exist`);
  const css = readSite('css/site-appearance.css');

  assert.match(css, /data-site-appearance=['"]?default['"]?[^{}]*#vibespaceOrigamiWorld\s*{[^}]*display:\s*none/s);
  assert.match(css, /data-site-appearance=['"]?vibespace['"]?[^{}]*#vibespaceOrigamiWorld\s*{[^}]*display:\s*block/s);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /body::before/);
  assert.match(css, /body::after/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('the controller persists, shares, and relayouts appearance without touching the OG runtime', () => {
  const html = readSite('index.html');
  const controllerPath = join(siteRoot, 'js', 'site-appearance.js');
  assert.ok(existsSync(controllerPath), `${relative(repoRoot, controllerPath)} must exist`);
  const controller = readSite('js/site-appearance.js');

  const controllerIndex = html.indexOf('js/site-appearance.js');
  const origamiIndex = html.indexOf('js/origami-scroll-world.js');
  assert.ok(controllerIndex > -1 && controllerIndex < origamiIndex, 'appearance controller must load before OG config');
  assert.match(controller, /localStorage\.setItem\(['"]vibespace-site-appearance['"]/);
  assert.match(controller, /history\.replaceState/);
  assert.match(controller, /aria-pressed/);
  assert.match(controller, /meta\[name="theme-color"\]/);
  assert.match(controller, /window\.VibeSpaceOrigamiWorld\.layout\(\)/);
  assert.match(controller, /vibespace:appearancechange/);
  assert.match(controller, /requestAnimationFrame/);
});
