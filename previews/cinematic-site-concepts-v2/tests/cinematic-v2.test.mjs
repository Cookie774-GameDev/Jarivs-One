import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const ENTRIES = {
  'first-contact': 'first-contact.html',
  'memory-forest': 'memory-forest.html',
  'machine-opera': 'machine-opera.html',
};

test('catalog defines three visually independent seven-act worlds', async () => {
  const { WORLD_ORDER, WORLDS, getWorld } = await import('../worlds.mjs');

  assert.deepEqual(WORLD_ORDER, Object.keys(ENTRIES));
  assert.equal(Object.keys(WORLDS).length, 3);
  assert.equal(new Set(WORLD_ORDER.map((id) => WORLDS[id].signature)).size, 3);
  assert.equal(new Set(WORLD_ORDER.map((id) => WORLDS[id].displayFont)).size, 3);

  for (const id of WORLD_ORDER) {
    const world = WORLDS[id];
    assert.equal(getWorld(id), world);
    assert.equal(world.acts.length, 7);
    assert.equal(world.assets.plates.length, 7);
    assert.equal(new Set(world.acts.map((act) => act.title)).size, 7);
    assert.match(world.downloadUrl, /releases\/latest$/);
  }

  assert.equal(getWorld('unknown'), WORLDS['first-contact']);
});

test('every full-screen entrypoint exposes the cinematic lifecycle', async () => {
  for (const [id, file] of Object.entries(ENTRIES)) {
    const html = await readFile(new URL(file, ROOT), 'utf8');

    assert.match(html, new RegExp(`<body[^>]+data-world="${id}"`));
    assert.match(html, /data-loader-progress>000%/);
    assert.match(html, /Enter with sound/);
    assert.match(html, /Enter silently/);
    assert.match(html, /id="world-canvas"/);
    assert.match(html, /class="plate-stack"/);
    assert.match(html, /runtime\/experience\.mjs/);
    assert.match(html, /experience\.css/);
  }
});
