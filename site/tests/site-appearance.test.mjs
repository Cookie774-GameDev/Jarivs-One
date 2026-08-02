import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..');
const read = (relative) => readFile(path.join(site, relative), 'utf8');

test('offers exactly Default and VibeSpace website appearances', async () => {
  const html = await read('index.html');
  const choices = Array.from(html.matchAll(/data-appearance-choice="([^"]+)"/g), (match) => match[1]);

  assert.deepEqual(choices, ['default', 'vibespace']);
  assert.match(html, /aria-label="Website appearance"/);
  assert.match(html, /data-appearance-choice="default" aria-pressed="true">Default/);
  assert.match(html, /data-appearance-choice="vibespace" aria-pressed="false">VibeSpace/);
});

test('loads an isolated VibeSpace appearance layer without replacing scroll-world', async () => {
  const [html, css, script] = await Promise.all([
    read('index.html'),
    read('css/site-appearance.css'),
    read('js/site-appearance.js'),
  ]);

  assert.doesNotMatch(
    css,
    /html\[data-site-appearance="default"\]\s+#vibespaceOrigamiWorld\s*\{\s*display:\s*none/,
  );
  assert.match(html, /css\/site-appearance\.css/);
  assert.match(html, /js\/site-appearance\.js/);
  assert.match(css, /html\[data-site-appearance="vibespace"\]/);
  assert.match(script, /choices = \['default', 'vibespace'\]/);
  assert.match(script, /localStorage\.setItem\(STORAGE_KEY, next\)/);
  assert.match(script, /controller\.layout\(\)/);

  assert.match(html, /id="vibespaceOrigamiWorld" data-cinematic-ready="true"/);
  assert.ok(html.indexOf('js/scroll-world-engine.js') < html.indexOf('js/origami-scroll-world.js'));
  assert.ok(html.indexOf('js/origami-scroll-world.js') < html.indexOf('js/site-appearance.js'));
});
