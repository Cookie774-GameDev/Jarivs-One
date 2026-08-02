import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = "html[data-theme='monochrome']";
const EXACT_ROOT =
  /^html\s*\[\s*data-theme\s*=\s*(?:'monochrome'|"monochrome"|monochrome)\s*\](?=$|[\s:])/u;
const cssPath = new URL('../../app/src/styles/monochrome-theme.css', import.meta.url);
const mainPath = new URL('../../app/src/main.tsx', import.meta.url);
const globalsPath = new URL('../../app/src/styles/globals.css', import.meta.url);
const vibespacePath = new URL('../../app/src/styles/vibespace-theme.css', import.meta.url);
const navPanePath = new URL('../../app/src/components/layout/NavPane.tsx', import.meta.url);
const topBarPath = new URL('../../app/src/components/layout/TopBar.tsx', import.meta.url);

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

function isExactlyMonochromeScoped(selector) {
  return EXACT_ROOT.test(selector.trim());
}

test('MonoChrome is a separately imported, root-scoped CSS layer with no Light residue', () => {
  const css = read(cssPath).replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  const selectors = collectSelectors(css);
  assert.ok(selectors.length >= 8, 'expected a real semantic layer');
  for (const selector of selectors) {
    assert.ok(isExactlyMonochromeScoped(selector), `unscoped selector: ${selector}`);
  }

  const main = read(mainPath);
  const orderedStyleImports = [
    "import './styles/globals.css';",
    "import './styles/vibespace-theme.css';",
    "import './styles/origami-chat.css';",
    "import './styles/monochrome-theme.css';",
  ];
  const styleImportOffsets = orderedStyleImports.map((statement) => main.indexOf(statement));
  assert.ok(
    styleImportOffsets.every((offset) => offset >= 0),
    'expected every scoped theme stylesheet import',
  );
  assert.deepEqual(
    [...styleImportOffsets].sort((left, right) => left - right),
    styleImportOffsets,
    'expected globals, preserved themes, and MonoChrome in cascade order',
  );
  const globals = read(globalsPath);
  assert.doesNotMatch(globals, /\[data-theme=['"]light['"]\]/u);
  assert.doesNotMatch(globals, /Existing Dark,\s*Light,\s*and System themes remain available\./u);
  assert.doesNotMatch(globals, /\[data-theme-preference=['"]system['"]\]/u);
  assert.doesNotMatch(read(vibespacePath), /\[data-theme=['"]light['"]\]/u);
});

test('MonoChrome selector validation rejects non-equality and lookalike theme activation', () => {
  for (const selector of [
    ROOT,
    'html[data-theme="monochrome"] body',
    'html[data-theme=monochrome]:focus-within',
  ]) {
    assert.equal(isExactlyMonochromeScoped(selector), true, selector);
  }

  for (const selector of [
    "html[data-theme^='monochrome'] body",
    "html[data-theme$='monochrome'] body",
    "html[data-theme*='monochrome'] body",
    "html[data-theme~='monochrome'] body",
    "html[data-theme|='monochrome'] body",
    "html[data-theme='monochrome-dark'] body",
    "html[data-theme='monochrome' i] body",
    `.theme-preview ${ROOT} body`,
  ]) {
    assert.equal(isExactlyMonochromeScoped(selector), false, selector);
  }
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
  assert.match(
    css,
    /:focus-visible\s*\{[\s\S]*?outline:\s*2px solid hsl\(var\(--ring\)\);[\s\S]*?box-shadow:\s*none;/u,
  );
  assert.match(css, /\.kbd\s*\{[\s\S]*?box-shadow:\s*none;/u);
  assert.match(
    normalizedCss,
    /button:not\(\.rounded-full\):not\(\s*\[data-monochrome-control-size='preserve'\]\s*\),.*?input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\):not\(\[type='range'\]\):not\(\s*\[type='color'\]\s*\):not\(\s*\[data-monochrome-control-size='preserve'\]\s*\),.*?select:not\(\s*\[data-monochrome-control-size='preserve'\]\s*\)\s*\{.*?min-height:\s*28px;.*?height:\s*32px;.*?max-height:\s*36px;/u,
  );
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
  assert.match(css, /animation(?:-duration)?:\s*none;/u);
  assert.match(css, /transition(?:-duration)?:\s*none;/u);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/u);
  assert.match(
    normalizedCss,
    /@media \(forced-colors: active\) \{ html\[data-theme='monochrome'\] \{ forced-color-adjust: auto; \}/u,
  );
  assert.match(
    normalizedCss,
    /@media \(forced-colors: active\)[\s\S]*?:focus-visible\s*\{ outline-color:\s*Highlight;/u,
  );
  assert.match(
    normalizedCss,
    /@media \(forced-colors: active\)[\s\S]*?\.bg-accent-gradient\s*\{ background-color:\s*Highlight;[\s\S]*?color:\s*HighlightText;/u,
  );
  assert.doesNotMatch(css, /forced-color-adjust:\s*none/iu);
});

test('MonoChrome stays cheap and does not flatten documented geometry exceptions', () => {
  const css = read(cssPath);
  assert.doesNotMatch(css, /\burl\s*\(/iu);
  assert.doesNotMatch(css, /https?:/iu);
  assert.doesNotMatch(
    css,
    /\b(?:conic|linear|radial|repeating-linear|repeating-radial)-gradient\s*\(/iu,
  );
  assert.doesNotMatch(css, /(?:backdrop-)?filter\s*:/iu);
  assert.doesNotMatch(css, /\binfinite\b/iu);
  assert.doesNotMatch(css, /!important/iu);
  assert.doesNotMatch(css, /blur\s*\(/iu);
  assert.doesNotMatch(css, /(?:canvas|svg|\.rounded-full|status-dot|radio|orb)\b[^,{]*\{/iu);
  const shadowValues = [...css.matchAll(/^\s*box-shadow:\s*([^;]+);/gmu)].map((match) =>
    match[1].trim(),
  );
  assert.ok(shadowValues.length > 0, 'expected explicit flat-material shadow resets');
  assert.deepEqual(
    [...new Set(shadowValues)],
    ['none'],
    'every direct MonoChrome shadow declaration must flatten the painted effect',
  );
  assert.ok(Buffer.byteLength(css, 'utf8') <= 12_000, 'stylesheet must remain inexpensive');
  assert.ok(collectSelectors(css.replaceAll(/\/\*[\s\S]*?\*\//gu, '')).length <= 56);
});

test('MonoChrome removes painted chrome effects while preserving semantic separation', () => {
  const css = read(cssPath);
  const normalizedCss = css.replaceAll(/\s+/gu, ' ');

  assert.match(
    normalizedCss,
    /\[role='dialog'\],.*?\[data-radix-popper-content-wrapper\]\s*\{.*?border:\s*1px solid hsl\(var\(--border-mid\)\);.*?box-shadow:\s*none;/u,
  );
  assert.match(
    normalizedCss,
    /\.jarvis-j-glow\s*\{.*?display:\s*none;.*?background:\s*none;.*?box-shadow:\s*none;/u,
  );
  assert.match(
    normalizedCss,
    /\[data-monochrome-voice-listening-effect='true'\]\s*\{.*?display:\s*none;.*?background:\s*none;.*?box-shadow:\s*none;/u,
  );
  assert.match(
    normalizedCss,
    /\.jarvis-bot-mark\s*\{.*?background:\s*hsl\(var\(--accent-amber\)\);.*?box-shadow:\s*none;/u,
  );
  assert.match(
    normalizedCss,
    /\[data-vibespace-avatar\]\s*\{.*?--vibespace-avatar-background:\s*hsl\(var\(--accent-violet\)\);.*?box-shadow:\s*none;/u,
  );
  assert.match(
    normalizedCss,
    /\[data-monochrome-surface='navigation'\] \[aria-current='page'\]\s*\{.*?border-left:.*?box-shadow:\s*none;/u,
  );
  assert.match(
    normalizedCss,
    /\[data-monochrome-unread-indicator='true'\]\s*\{.*?box-shadow:\s*none;/u,
  );

  const navPane = read(navPanePath);
  assert.match(navPane, /aria-current=\{active \? 'page' : undefined\}/u);
  const topBar = read(topBarPath);
  assert.equal(
    [...topBar.matchAll(/data-monochrome-voice-listening-effect="true"/gu)].length,
    2,
    'both conditional listening paints need stable MonoChrome hooks',
  );
  assert.equal(
    [...topBar.matchAll(/data-monochrome-unread-indicator="true"/gu)].length,
    2,
    'both full and compact unread indicators need the stable MonoChrome hook',
  );
});
