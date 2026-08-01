import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as styleMetrics from './styleMetrics.ts';

interface Observation {
  readonly browserZoomFactor: number;
  readonly devicePixelRatio: number;
  readonly visualViewportScale: number | null;
}

function fakeDriver(observations: readonly Observation[]) {
  const calls: string[] = [];
  const remaining = [...observations];
  return {
    calls,
    driver: {
      async setBrowserZoom(factor: number) {
        calls.push(`set:${factor}`);
      },
      async resetBrowserZoom() {
        calls.push('reset');
      },
      async observeBrowserScale() {
        calls.push('observe');
        const observation = remaining.shift();
        if (!observation) throw new Error('missing injected scale observation');
        return observation;
      },
      async detach() {
        calls.push('detach');
      },
    },
  };
}

test('authenticated browser zoom sets, observes, runs, resets, verifies, and detaches', async () => {
  assert.equal(typeof styleMetrics.runAuthenticatedBrowserScale, 'function');
  const { calls, driver } = fakeDriver([
    { browserZoomFactor: 0.8, devicePixelRatio: 0.8, visualViewportScale: 1 },
    { browserZoomFactor: 1, devicePixelRatio: 1, visualViewportScale: 1 },
  ]);

  const result = await styleMetrics.runAuthenticatedBrowserScale(
    { factor: 0.8, label: '80%' },
    driver,
    async (observation) => {
      calls.push('operation');
      assert.deepEqual(observation, {
        browserZoomFactor: 0.8,
        devicePixelRatio: 0.8,
        visualViewportScale: 1,
      });
      return 'completed';
    },
  );

  assert.equal(result, 'completed');
  assert.deepEqual(calls, ['set:0.8', 'observe', 'operation', 'reset', 'observe', 'detach']);
});

test('requested browser zoom mismatch fails before the operation and still restores', async () => {
  const { calls, driver } = fakeDriver([
    { browserZoomFactor: 1, devicePixelRatio: 1, visualViewportScale: 1 },
    { browserZoomFactor: 1, devicePixelRatio: 1, visualViewportScale: 1 },
  ]);

  await assert.rejects(
    styleMetrics.runAuthenticatedBrowserScale({ factor: 0.8, label: '80%' }, driver, async () => {
      calls.push('operation');
    }),
    /requested browser zoom.*80%/u,
  );
  assert.deepEqual(calls, ['set:0.8', 'observe', 'reset', 'observe', 'detach']);
});

test('browser zoom cannot be substituted with pinch zoom or viewport emulation', async () => {
  const { calls, driver } = fakeDriver([
    { browserZoomFactor: 1, devicePixelRatio: 1, visualViewportScale: 0.8 },
    { browserZoomFactor: 1, devicePixelRatio: 1, visualViewportScale: 1 },
  ]);

  await assert.rejects(
    styleMetrics.runAuthenticatedBrowserScale({ factor: 0.8, label: '80%' }, driver, async () => {
      calls.push('operation');
    }),
    /requested browser zoom.*80%/u,
  );
  assert.deepEqual(calls, ['set:0.8', 'observe', 'reset', 'observe', 'detach']);
});

test('restoration mismatch fails closed after the operation and always detaches', async () => {
  const { calls, driver } = fakeDriver([
    { browserZoomFactor: 2, devicePixelRatio: 2, visualViewportScale: 1 },
    { browserZoomFactor: 1.25, devicePixelRatio: 1.25, visualViewportScale: 1 },
  ]);

  await assert.rejects(
    styleMetrics.runAuthenticatedBrowserScale({ factor: 2, label: '200%' }, driver, async () => {
      calls.push('operation');
    }),
    /restored browser zoom/u,
  );
  assert.deepEqual(calls, ['set:2', 'observe', 'operation', 'reset', 'observe', 'detach']);
});

test('a11y zoom loop consumes canonical authority without viewport substitution', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./monochrome.a11y.spec.ts', import.meta.url)),
    'utf8',
  );
  const start = source.indexOf(
    "browserZoomTest.describe('Zoom/reflow — authenticated browser-owned tab zoom'",
  );
  const end = source.indexOf("test.describe('Numerical contrast", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const zoomBlock = source.slice(start, end);

  assert.match(zoomBlock, /for \(const zoom of MONOCHROME_ZOOM_ROWS\)/u);
  assert.match(zoomBlock, /withAuthenticatedBrowserScale\(zoomPage, zoom/u);
  assert.doesNotMatch(zoomBlock, /setViewportSize/u);
  assert.doesNotMatch(zoomBlock, /Emulation\.setPageScaleFactor/u);
});
