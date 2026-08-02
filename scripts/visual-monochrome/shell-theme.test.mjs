import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = "html[data-theme='monochrome']";
const files = Object.freeze({
  css: 'app/src/styles/monochrome-theme.css',
  appShell: 'app/src/components/layout/AppShell.tsx',
  topBar: 'app/src/components/layout/TopBar.tsx',
  navPane: 'app/src/components/layout/NavPane.tsx',
  tabStrip: 'app/src/components/layout/TabStrip.tsx',
  inspector: 'app/src/components/layout/Inspector.tsx',
  pageRouter: 'app/src/components/layout/PageRouter.tsx',
  contextMenu: 'app/src/components/layout/JarvisContextMenu.tsx',
});

const surfaceContracts = Object.freeze([
  ['appShell', 'app-shell'],
  ['topBar', 'top-bar'],
  ['navPane', 'navigation'],
  ['tabStrip', 'tab-strip'],
  ['inspector', 'inspector'],
  ['pageRouter', 'page-router'],
  ['contextMenu', 'context-menu'],
]);

function read(path) {
  return readFileSync(path, 'utf8');
}

test('MC5 exposes stable semantic hooks without changing accessible labels or routes', () => {
  for (const [fileKey, surface] of surfaceContracts) {
    assert.match(
      read(files[fileKey]),
      new RegExp(`data-monochrome-surface=["']${surface}["']`, 'u'),
      `${surface} hook`,
    );
  }
  assert.match(read(files.topBar), /aria-label="Application header"/u);
  assert.match(read(files.navPane), /aria-label="Navigation"/u);
  assert.match(read(files.inspector), /aria-label="Inspector"/u);
  assert.match(
    read(files.tabStrip),
    /aria-label=\{tabs\.length > 0 \? 'Open chats' : undefined\}/u,
  );
  assert.match(read(files.pageRouter), /data-terminal-route-cache/u);
});

test('MC5 styles every shell hook only below the canonical MonoChrome root', () => {
  const css = read(files.css);
  for (const [, surface] of surfaceContracts) {
    assert.match(
      css,
      new RegExp(
        `html\\[data-theme='monochrome'\\][\\s\\S]*?\\[data-monochrome-surface='${surface}'\\]`,
        'u',
      ),
      `${surface} scoped style`,
    );
  }
  assert.match(css, /html\[data-theme='monochrome'\] \[role='dialog'\]/u);
  assert.match(css, /html\[data-theme='monochrome'\] \[role='menu'\]/u);
  assert.match(css, /html\[data-theme='monochrome'\] \[data-radix-popper-content-wrapper\]/u);
  assert.match(css, /html\[data-theme='monochrome'\] \[data-terminal-route-cache\]/u);
  assert.doesNotMatch(css, /(?:^|\n)\s*\[data-monochrome-surface=/u);
});

test('MC5 keeps compact shell geometry semantic and reduced-motion safe', () => {
  const css = read(files.css);
  assert.match(css, /--monochrome-top-bar-height:\s*36px;/u);
  assert.match(css, /--monochrome-tab-strip-height:\s*30px;/u);
  assert.match(css, /--monochrome-nav-expanded:\s*224px;/u);
  assert.match(css, /--monochrome-inspector-width:\s*304px;/u);
  assert.match(css, /border(?:-inline|-block|-left|-right|-top|-bottom)?:\s*1px solid/u);
  assert.match(css, /prefers-reduced-motion:\s*reduce/u);
  assert.doesNotMatch(css, /backdrop-filter|filter:\s*blur/u);
  const animationValues = [...css.matchAll(/^\s*animation:\s*([^;]+);/gmu)].map((match) =>
    match[1].trim(),
  );
  assert.deepEqual(animationValues, ['none']);
});
