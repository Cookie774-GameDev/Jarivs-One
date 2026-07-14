import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..');
const read = (rel) => readFile(path.join(site, rel), 'utf8');

const LOCKED = [
  '#fdf4e6',
  '#e3885e',
  '#cfa1c7',
  '#8fa08b',
  '#8cbfd1',
  '#54362a',
  '#622f12',
];

test('production site loads origami paper stylesheet after base style', async () => {
  const html = await read('index.html');
  assert.match(html, /css\/style\.css/);
  assert.match(html, /css\/origami-paper\.css/);
  assert.ok(html.indexOf('css/style.css') < html.indexOf('css/origami-paper.css'));
  assert.match(html, /vs-site-ribbon/);
  assert.match(html, /aria-hidden="true"/);
});

test('origami paper CSS ships locked palette and no scroll-jack hooks', async () => {
  const css = (await read('css/origami-paper.css')).toLowerCase();
  for (const hex of LOCKED) {
    assert.ok(css.includes(hex), `missing ${hex}`);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /overflow:\s*hidden\s*!important|scroll-snap-type|preventdefault/);
  assert.match(css, /pointer-events:\s*none/);
});

test('site CNAME remains vibespaceos.com', async () => {
  const cname = (await read('CNAME')).trim();
  assert.equal(cname, 'vibespaceos.com');
});
