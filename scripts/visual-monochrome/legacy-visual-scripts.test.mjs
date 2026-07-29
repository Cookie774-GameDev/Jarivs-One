import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const legacyVisualScripts = [
  new URL('../boot-validation.mjs', import.meta.url),
  new URL('../capture-screenshots.mjs', import.meta.url),
];

test('legacy visual scripts derive current metadata and wait for observable readiness', () => {
  for (const scriptPath of legacyVisualScripts) {
    const source = readFileSync(scriptPath, 'utf8');

    assert.match(source, /themeContract\.source\.json/);
    assert.match(source, /app\/package\.json/);
    assert.match(source, /themeContract\.(?:fallbackTheme|selectableThemes)/);
    assert.match(source, /themeContract\.storeVersion/);
    assert.match(source, /appPackage\.version/);
    assert.match(source, /document\.fonts\.ready/);
    assert.match(source, /waitForStableLayout/);
    assert.match(source, /state:\s*['"]visible['"]/);

    assert.doesNotMatch(source, /theme\s*:\s*['"][^'"]+['"]/);
    assert.doesNotMatch(source, /version\s*:\s*(?:5|12)\b/);
    assert.doesNotMatch(source, /jarvis-core|CURRENT_VERSION|CAPTURE_APP_VERSION/);
    assert.doesNotMatch(source, /waitForTimeout|settle\s*:/);
    assert.doesNotMatch(source, /const\s+(?:SELECTABLE_)?THEMES?\s*=/);
  }
});
