import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const cssPath = new URL('../../app/src/styles/sakura-theme.css', import.meta.url);
const petalsPath = new URL(
  '../../app/src/features/appearance/sakura/SakuraPetals.tsx',
  import.meta.url,
);

const css = readFileSync(cssPath, 'utf8');
const petals = readFileSync(petalsPath, 'utf8');

function declaration(property) {
  const escaped = property.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`, 'u'));
  assert.ok(match, `missing ${property}`);
  return match[1].trim();
}

function number(property, unit = '') {
  const value = declaration(property);
  const match = value.match(new RegExp(`^(-?\\d+(?:\\.\\d+)?)${unit}$`, 'u'));
  assert.ok(match, `${property} must be one numeric ${unit || 'unitless'} value`);
  return Number(match[1]);
}

function assertBetween(value, minimum, maximum, label) {
  assert.ok(
    value >= minimum && value <= maximum,
    `${label}: ${value} not in ${minimum}–${maximum}`,
  );
}

test('material authority stays inside the approved numeric envelope', () => {
  assertBetween(number('--sakura-panel-alpha'), 0.72, 0.92, 'panel alpha');
  assertBetween(number('--sakura-panel-alpha-strong'), 0.72, 0.92, 'strong panel alpha');
  assertBetween(number('--sakura-card-alpha'), 0.05, 0.11, 'soft card alpha');
  assertBetween(number('--sakura-grain-opacity'), 0.04, 0.09, 'grain opacity');
  assertBetween(number('--sakura-blur', 'px'), 14, 18, 'backdrop blur');
  assertBetween(number('--sakura-decorative-border-alpha'), 0.18, 0.2, 'default line alpha');
  assertBetween(number('--sakura-decorative-border-strong-alpha'), 0.28, 0.32, 'strong line alpha');
  assertBetween(number('--radius-sm', 'px'), 9, 12, 'small radius');
  assert.equal(number('--radius-lg', 'px'), 16);
  assert.equal(number('--sakura-radius-feature', 'px'), 23);
  assertBetween(number('--sakura-radius-shell', 'px'), 22, 24, 'shell radius');
  assertBetween(number('--sakura-section-label-size', 'px'), 9, 11, 'section label size');
  assertBetween(number('--sakura-section-label-weight'), 600, 800, 'section label weight');
  assertBetween(
    number('--sakura-section-label-tracking', 'em'),
    0.1,
    0.16,
    'section label tracking',
  );
  assertBetween(number('--sakura-hover-lift', 'px'), 0, 1, 'hover lift');
  assertBetween(number('--duration-fast', 'ms'), 180, 280, 'fast transition');
  assertBetween(number('--duration-base', 'ms'), 180, 280, 'base transition');

  const durations = [...petals.matchAll(/duration:\s*'(\d+)s'/gu)].map((match) => Number(match[1]));
  assert.ok(durations.length > 0, 'expected deterministic petal durations');
  assert.ok(durations.every((duration) => duration >= 14 && duration <= 28));
});

test('opaque material fallbacks precede progressive blur and color-mix enhancement', () => {
  const fallbackPanel = css.indexOf('background-color: var(--sakura-panel-fallback);');
  const fallbackCard = css.indexOf('background-color: var(--sakura-card-fallback);');
  const blurSupport = css.indexOf('@supports ((backdrop-filter: blur(1px))');
  const mixSupport = css.indexOf('@supports (background: color-mix(in srgb, black, white))');

  assert.ok(fallbackPanel >= 0, 'missing opaque panel fallback application');
  assert.ok(fallbackCard >= 0, 'missing opaque card fallback application');
  assert.ok(blurSupport > fallbackPanel, 'blur enhancement must follow the opaque panel fallback');
  assert.ok(
    mixSupport > fallbackCard,
    'color-mix enhancement must follow the opaque card fallback',
  );
  assert.match(css, /backdrop-filter:\s*blur\(var\(--sakura-blur\)\) saturate\(1\.08\);/u);
  assert.match(
    css,
    /background-color:\s*color-mix\(\s*in srgb,\s*var\(--sakura-ivory\) var\(--sakura-card-alpha-percent\),\s*var\(--sakura-night-2\)\s*\);/u,
  );
});

test('material, typography, and interaction rules are exact-root scoped and local', () => {
  assert.doesNotMatch(css, /\burl\s*\(|https?:|@import|!important/iu);
  assert.doesNotMatch(css, /[\u3040-\u30ff\u3400-\u9fff]/u);
  assert.match(css, /html\[data-theme='sakura'\] \[data-sakura-backdrop\]::after/u);
  assert.match(css, /opacity:\s*var\(--sakura-grain-opacity\);/u);
  assert.match(css, /html\[data-theme='sakura'\] \.text-metadata\.uppercase/u);
  assert.match(css, /font-family:\s*var\(--font-display\);/u);
  assert.match(css, /font-family:\s*var\(--font-mono\);/u);
  assert.match(
    css,
    /html\[data-theme='sakura'\] \[data-sakura-shell='true'\]\s*\{[\s\S]*?border-radius:\s*var\(--sakura-radius-shell\);/u,
  );
  assert.match(css, /html\[data-theme='sakura'\]\s*\{\s*[\s\S]*scrollbar-color:/u);
  assert.match(css, /html\[data-theme='sakura'\] ::-webkit-scrollbar-thumb/u);
  assert.match(css, /html\[data-theme='sakura'\] \.cozy-card:hover/u);
  assert.match(css, /translateY\(calc\(-1 \* var\(--sakura-hover-lift\)\)\)/u);
  assert.match(css, /html\[data-theme='sakura'\] ::selection/u);
  assert.match(css, /html\[data-theme='sakura'\] :focus-visible/u);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)[\s\S]*background:\s*Canvas;/u);
});
