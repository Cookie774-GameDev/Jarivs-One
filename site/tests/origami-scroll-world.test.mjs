import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..');
const read = (relative) => readFile(path.join(site, relative), 'utf8');

const expectedImages = {
  'scene-01-network.png': '919fcb0fb93610ec0b7d1089cdb543e829eb36f434eb657e1c12be0d354a75d3',
  'scene-02-jarvis-voice.png': 'd0ea9e96d60bd241fd16b8716e7d09d3f6559a5e0a3c1f5ba5e7e87cf030c163',
  'scene-03-terminal-workshop.png': 'afb62c97ecd839ea5601becb6134f518f4137dbc6560eef812e00193ba3eb274',
  'scene-04-jarvis-actions.png': '54e13c5ef71a5e9429acf00f8e4a6959590cd0d0c6cec13db1964970f483915b',
  'scene-05-context-memory.png': 'a4ccead3ba52e74ac2c3aa6ed93031ac6a242c7778f961cf134e3a43cc30048d',
  'scene-05-outro-workspace.png': 'b80514115e8fe6597445a10d1c3082b78d6b9d26caea4090df1312a93941c3c6'
};

test('preserves all six approved source images byte-for-byte', async () => {
  for (const [name, expected] of Object.entries(expectedImages)) {
    const bytes = await readFile(path.join(site, 'images/origami-scroll/source', name));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, name);
  }
});

test('uses the oso95 portable scrub engine mechanics', async () => {
  const engine = await read('js/scroll-world-engine.js');
  assert.match(engine, /scroll-world — portable scroll-scrubbed camera-flight engine/);
  assert.match(engine, /fetch\(url\).*\.blob\(\)/s);
  assert.match(engine, /URL\.createObjectURL\(blob\)/);
  assert.match(engine, /requestAnimationFrame\(raf\)/);
  assert.match(engine, /video\.currentTime = t/);
  assert.match(engine, /1\.6 \* vh/);
  assert.match(engine, /containerTop = container\.getBoundingClientRect\(\)\.top/);
});

test('defines six internal anchors but only five visible scene numbers', async () => {
  const config = await read('js/origami-scroll-world.js');
  assert.equal((config.match(/\bid: '/g) || []).length, 6);
  assert.equal((config.match(/\/dives\//g) || []).length, 6);
  assert.equal((config.match(/\/connectors\//g) || []).length, 5);
  assert.match(config, /visibleSectionCount: 5/);
  assert.match(config, /id: 'workspace-outro'[\s\S]*displayNumber: 5[\s\S]*showInNavigation: false/);
});

test('declares the complete real-media pipeline as ready with all clips', async () => {
  const manifest = JSON.parse(await read('images/origami-scroll/media-manifest.json'));
  assert.equal(manifest.pipeline, 'oso95/scroll-world architecture-b');
  assert.equal(manifest.ready, true);
  assert.equal(manifest.dives.length, 6);
  assert.equal(manifest.connectors.length, 5);
  assert.ok(manifest.dives.every((item) => item.prompt.length > 250));
  assert.ok(manifest.connectors.every((item) => item.fromDive && item.toDive));
  assert.equal(manifest.encoding.videoCodec, 'h264');
  assert.equal(manifest.encoding.crf, 20);
  assert.equal(manifest.encoding.gop, 8);
  assert.equal(manifest.encoding.audio, false);
  for (const dive of manifest.dives) {
    const bytes = await readFile(path.join(site, 'images/origami-scroll', dive.output));
    assert.ok(bytes.byteLength > 100_000, dive.output);
  }
  for (const conn of manifest.connectors) {
    const bytes = await readFile(path.join(site, 'images/origami-scroll', conn.output));
    assert.ok(bytes.byteLength > 100_000, conn.output);
  }
});

test('enables the cinematic path once real media exists', async () => {
  const html = await read('index.html');
  const config = await read('js/origami-scroll-world.js');
  assert.match(html, /id="vibespaceOrigamiWorld" data-cinematic-ready="true"/);
  // Must not hard-disable cinematic on touch/coarse pointer (Windows laptops).
  assert.doesNotMatch(config, /mobile-fallback|pointer: coarse.*return|max-width: 860px\).*return/);
  assert.match(config, /if \(!cinematicReady \|\| reduced \|\| !canMount\)/);
  assert.match(config, /root\.dataset\.initialized === 'true'/);
});

test('renders five semantic fallback scenes using six exact images', async () => {
  const html = await read('index.html');
  const section = html.match(/<section class="origami-world"[\s\S]*?<\/section>/)?.[0] || '';
  assert.equal((section.match(/<article /g) || []).length, 5);
  assert.equal((section.match(/images\/origami-scroll\/source\//g) || []).length, 6);
  assert.equal((section.match(/0[1-5] \/ 05/g) || []).length, 5);
  assert.doesNotMatch(section, /06 \/ 06|06 \/ 05|Scene 6/i);
});

test('loads the engine before the VibeSpace configuration', async () => {
  const html = await read('index.html');
  assert.ok(html.indexOf('js/scroll-world-engine.js') < html.indexOf('js/origami-scroll-world.js'));
  assert.match(html, /css\/origami-scroll-world\.css/);
});

test('does not replace scrubbing with observer, scroll snap, or image-transform JS', async () => {
  const config = await read('js/origami-scroll-world.js');
  const css = await read('css/origami-scroll-world.css');
  assert.doesNotMatch(config, /IntersectionObserver|style\.transform|backgroundImage/);
  assert.doesNotMatch(css, /scroll-snap-type/);
});

test('ships the new six-scene cinematic as both a reusable route and the main-page media chain', async () => {
  const index = await read('index.html');
  const html = await read('origami-cinematic.html');
  const indexConfig = await read('js/origami-scroll-world.js');
  const js = await read('js/origami-cinematic.js');
  const css = await read('css/origami-cinematic.css');

  assert.doesNotMatch(index, /href="\.\/origami-cinematic\.html"/);
  assert.match(html, /class="world-stage"/);
  assert.match(html, /id="chapter-track"/);
  const mainClips = [...indexConfig.matchAll(/clip:\s*'([^']+\.mp4)'/g)].map((match) => match[1]);
  assert.equal(mainClips.filter((clip) => clip.includes('/dives/')).length, 6);
  assert.equal(mainClips.filter((clip) => clip.includes('/connectors/')).length, 5);
  assert.equal((js.match(/\bid: "/g) || []).length, 6);
  assert.equal((js.match(/video: "images\/origami-scroll\/work\/higgsfield-test/g) || []).length, 6);
  assert.equal((js.match(/connector: "images\/origami-scroll\/work\/higgsfield-test\/connectors/g) || []).length, 5);
  assert.equal((js.match(/poster: "images\/origami-scroll\/source/g) || []).length, 6);
  assert.match(js, /ensureBlob\(media\.key, media\.video\)/);
  assert.match(js, /URL\.createObjectURL\(blob\)/);
  assert.match(js, /if \(!video\.seeking/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.seam-veil/);
});

test('all new cinematic media references exist and contain substantial video data', async () => {
  const js = await read('js/origami-cinematic.js');
  const videos = [...js.matchAll(/video: "([^"]+)"/g)].map((match) => match[1]);
  const connectors = [...js.matchAll(/connector: "([^"]+)"/g)].map((match) => match[1]);
  const posters = [...js.matchAll(/poster: "([^"]+)"/g)].map((match) => match[1]);

  assert.equal(videos.length, 6);
  assert.equal(connectors.length, 5);
  assert.equal(posters.length, 6);

  for (const relative of [...videos, ...connectors]) {
    const bytes = await readFile(path.join(site, relative));
    assert.ok(bytes.byteLength > 5_000_000, relative);
  }

  for (const relative of posters) {
    const bytes = await readFile(path.join(site, relative));
    assert.ok(bytes.byteLength > 100_000, relative);
  }
});

test('records the exact first-attempt Higgsfield connector chain and preserves a credit reserve', async () => {
  const manifest = JSON.parse(await read('images/origami-scroll/cinematic-manifest.json'));

  assert.equal(manifest.ready, true);
  assert.equal(manifest.settings.model, 'kling3_0');
  assert.equal(manifest.settings.mode, 'pro');
  assert.equal(manifest.settings.deliveredResolution, '1916x1080');
  assert.equal(manifest.dives.length, 6);
  assert.equal(manifest.connectors.length, 5);
  assert.equal(manifest.credits.connectorSpend, 43.75);
  assert.equal(manifest.credits.balanceAfterConnectors, 13.75);
  assert.ok(manifest.connectors.every((item) => item.attempts === 1));
  assert.ok(manifest.connectors.every((item) => item.startFrameSsim > 0.93));
  assert.ok(manifest.connectors.every((item) => item.endFrameSsim > 0.93));
});
