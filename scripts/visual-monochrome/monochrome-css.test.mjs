import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = "html[data-theme='monochrome']";
const cssPath = new URL('../../app/src/styles/monochrome-theme.css', import.meta.url);
const mainPath = new URL('../../app/src/main.tsx', import.meta.url);
const globalsPath = new URL('../../app/src/styles/globals.css', import.meta.url);
const vibespacePath = new URL('../../app/src/styles/vibespace-theme.css', import.meta.url);

function read(path) {
  return readFileSync(path, 'utf8');
}

function matchingBrace(source, open) {
  let depth = 1;
  for (let index = open + 1; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return index;
  }
  throw new SyntaxError('unclosed CSS block');
}

function collectSelectors(source, start = 0, end = source.length) {
  const selectors = [];
  let cursor = start;
  while (cursor < end) {
    const open = source.indexOf('{', cursor);
    if (open < 0 || open >= end) break;
    const header = source.slice(cursor, open).trim();
    const close = matchingBrace(source, open);
    if (close > end) throw new SyntaxError('CSS block escaped its parent');
    if (/^@(layer|media|supports|container)\b/u.test(header)) {
      selectors.push(...collectSelectors(source, open + 1, close));
    } else if (!header.startsWith('@')) {
      selectors.push(...header.split(',').map((selector) => selector.trim()));
    }
    cursor = close + 1;
  }
  return selectors;
}

test('MonoChrome is a separately imported, root-scoped CSS layer with no Light residue', () => {
  const css = read(cssPath).replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  const selectors = collectSelectors(css);
  assert.ok(selectors.length >= 8, 'expected a real semantic layer');
  for (const selector of selectors) {
    const normalizedSelector = selector.replaceAll(/\s+/gu, ' ');
    assert.ok(
      normalizedSelector === ROOT ||
        normalizedSelector.startsWith(`${ROOT} `) ||
        normalizedSelector.startsWith(`${ROOT}:`),
      `unscoped selector: ${selector}`,
    );
  }

  const main = read(mainPath);
  assert.match(
    main,
    /import '\.\/styles\/globals\.css';\s*import '\.\/styles\/vibespace-theme\.css';\s*import '\.\/styles\/monochrome-theme\.css';/u,
  );
  const globals = read(globalsPath);
  assert.doesNotMatch(globals, /\[data-theme=['"]light['"]\]/u);
  assert.doesNotMatch(globals, /Existing Dark,\s*Light,\s*and System themes remain available\./u);
  assert.doesNotMatch(globals, /\[data-theme-preference=['"]system['"]\]/u);
  assert.doesNotMatch(read(vibespacePath), /\[data-theme=['"]light['"]\]/u);
});

test('MonoChrome exposes the complete compact semantic token contract', () => {
  const css = read(cssPath);
  for (const token of [
    '--background',
    '--background-warm',
    '--panel',
    '--elevated',
    '--paper-soft',
    '--paper-done',
    '--foreground',
    '--muted-foreground',
    '--border',
    '--border-mid',
    '--accent',
    '--accent-cyan',
    '--accent-violet',
    '--accent-amber',
    '--destructive',
    '--success',
    '--warning',
    '--info',
    '--ring',
    '--shadow-soft',
    '--shadow-lift',
    '--shadow-cozy',
    '--duration-fast',
    '--duration-base',
    '--ease-standard',
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`, 'u'), token);
  }
  assert.match(css, /--radius-sm:\s*1px;/u);
  assert.match(css, /--radius:\s*2px;/u);
  assert.match(css, /--radius-lg:\s*3px;/u);
  assert.match(css, /--bloom-image:\s*none;/u);
  assert.match(css, /--foreground:\s*210 15% 92%;/u);
  assert.match(css, /--accent-cyan:\s*175 58% 48%;/u);
  assert.match(css, /--accent-violet:\s*259 63% 60%;/u);
  assert.match(css, /--accent-amber:\s*38 86% 59%;/u);
  assert.match(css, /--destructive:\s*0 57% 56%;/u);
  assert.match(css, /--success:\s*146 50% 48%;/u);
  assert.match(css, /font-family:\s*Inter,/u);
  assert.match(css, /font-size:\s*13px;/u);
  assert.match(css, /font-family:\s*'JetBrains Mono',/u);
  assert.match(css, /font-variant-numeric:\s*tabular-nums;/u);
  assert.match(css, /html\[data-theme='monochrome'\] \.eyebrow,[\s\S]*?font-size:\s*11px;/u);
});

test('MonoChrome defines restrained interaction, accessibility, and density behavior', () => {
  const css = read(cssPath);
  const normalizedCss = css.replaceAll(/\s+/gu, ' ');
  assert.match(css, /::selection\s*\{/u);
  assert.match(css, /caret-color:\s*hsl\(var\(--accent-cyan\)\);/u);
  assert.match(css, /::-webkit-scrollbar\s*\{[\s\S]*?width:\s*[68]px;[\s\S]*?height:\s*[68]px;/u);
  assert.match(css, /:focus-visible\s*\{[\s\S]*?outline:\s*2px solid hsl\(var\(--ring\)\);/u);
  assert.match(
    normalizedCss,
    /button:not\(\.rounded-full\):not\(\s*\[data-monochrome-control-size='preserve'\]\s*\),.*?input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\):not\(\[type='range'\]\):not\(\s*\[type='color'\]\s*\):not\(\s*\[data-monochrome-control-size='preserve'\]\s*\),.*?select:not\(\s*\[data-monochrome-control-size='preserve'\]\s*\)\s*\{.*?min-height:\s*28px;.*?height:\s*32px;.*?max-height:\s*36px;/u,
  );
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
  assert.match(css, /animation(?:-duration)?:\s*none;/u);
  assert.match(css, /transition(?:-duration)?:\s*none;/u);
});

test('MonoChrome stays cheap and does not flatten documented geometry exceptions', () => {
  const css = read(cssPath);
  assert.doesNotMatch(css, /\burl\s*\(/iu);
  assert.doesNotMatch(css, /https?:/iu);
  assert.doesNotMatch(css, /(?:backdrop-)?filter\s*:/iu);
  assert.doesNotMatch(css, /\binfinite\b/iu);
  assert.doesNotMatch(css, /!important/iu);
  assert.doesNotMatch(css, /blur\s*\(/iu);
  assert.doesNotMatch(css, /(?:canvas|svg|\.rounded-full|avatar|status-dot|radio|orb)\b[^,{]*\{/iu);
  assert.ok(Buffer.byteLength(css, 'utf8') <= 12_000, 'stylesheet must remain inexpensive');
  assert.ok(collectSelectors(css.replaceAll(/\/\*[\s\S]*?\*\//gu, '')).length <= 48);
});
