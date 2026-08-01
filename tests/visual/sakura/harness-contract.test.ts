import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = resolve(fileURLToPath(new URL('.', import.meta.url)));
const root = resolve(directory, '../../..');
const configPath = resolve(root, 'playwright.sakura.config.ts');
const specPath = resolve(directory, 'sakura.visual.spec.ts');
const helpersPath = resolve(directory, 'fixtures.ts');

test('Sakura harness is account-free, process-free, and artifact-only', () => {
  assert.equal(existsSync(configPath), true, 'playwright.sakura.config.ts must exist');
  assert.equal(existsSync(specPath), true, 'the real-app Sakura spec must exist');
  assert.equal(existsSync(helpersPath), true, 'deterministic fixtures must exist');

  const config = readFileSync(configPath, 'utf8');
  assert.match(config, /VIBESPACE_SAKURA_BASE_URL/u);
  assert.match(config, /http:\/\/127\.0\.0\.1:5187/u);
  assert.doesNotMatch(config, /\bwebServer\b/u);
  assert.match(config, /test-results\/sakura/u);
  assert.match(config, /sakura-desktop-1440x900/u);
  assert.match(config, /sakura-compact-1024x768/u);
});

test('Sakura specs cover real routes, accessibility media, and ordinary-theme isolation', () => {
  assert.equal(existsSync(specPath), true, 'the real-app Sakura spec must exist');
  const spec = readFileSync(specPath, 'utf8');

  for (const route of ['Chat', 'Canvas', 'Kanban', 'Schedule', 'Benchmarks']) {
    assert.match(spec, new RegExp(`name: '${route}'`, 'u'));
  }
  assert.match(spec, /reducedMotion: 'reduce'/u);
  assert.match(spec, /forcedColors: 'active'/u);
  assert.match(spec, /theme: 'default'/u);
  assert.match(spec, /data-sakura-scene/u);
  assert.match(spec, /data-sakura-shell-frame/u);
  assert.match(spec, /scrollWidth/u);
  assert.doesNotMatch(spec, /toHaveScreenshot/u);
});

test('reference provenance remains exact and no remote or secret-bearing fixture is introduced', () => {
  assert.equal(existsSync(helpersPath), true, 'deterministic fixtures must exist');
  const config = readFileSync(configPath, 'utf8');
  const helpers = readFileSync(helpersPath, 'utf8');

  assert.match(
    config,
    /C:\\\\Users\\\\viper\\\\Downloads\\\\VibeSpace-Sakura-UI-Preview \(1\)\\\\VibeSpace-Sakura-UI-Preview\\\\index\.html/u,
  );
  assert.match(helpers, /76611A6BBFF4E0744F30EB95F254FAFE036DC035D6E9E5957066F0780B342FA3/u);
  assert.match(
    helpers,
    /C:\\\\Users\\\\viper\\\\Downloads\\\\VibeSpace-Sakura-UI-Preview \(1\)\\\\VibeSpace-Sakura-UI-Preview\\\\index\.html/u,
  );
  assert.match(helpers, /jarvis-ui/u);
  assert.match(helpers, /document\.fonts\.ready/u);
  assert.doesNotMatch(helpers, /api[_-]?key|authorization|bearer|https?:\/\/(?!127\.0\.0\.1)/iu);
});
