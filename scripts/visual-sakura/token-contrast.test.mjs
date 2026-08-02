import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../../app/src/styles/sakura-theme.css', import.meta.url), 'utf8');

function declaration(property) {
  const escaped = property.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`, 'u'));
  assert.ok(match, `missing ${property}`);
  return match[1].trim();
}

function color(name) {
  const value = declaration(`--sakura-${name}`);
  assert.match(value, /^#[\da-f]{6}$/iu, `${name} must be an exact hex authority`);
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function luminance(rgb) {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function composite(foreground, background, alpha) {
  return foreground.map((channel, index) => channel * alpha + background[index] * (1 - alpha));
}

test('all approved semantic text pairs meet WCAG AA from the CSS authority', () => {
  const pairs = [
    ['ivory', 'night'],
    ['ivory', 'night-2'],
    ['ivory', 'indigo'],
    ['ivory', 'periwinkle'],
    ['peach', 'night-2'],
    ['peach', 'indigo'],
    ['coral', 'night'],
    ['pink', 'night'],
    ['gold', 'night'],
    ['mint', 'night'],
    ['destructive', 'ivory'],
  ];

  for (const [foreground, background] of pairs) {
    assert.ok(
      contrast(color(foreground), color(background)) >= 4.5,
      `${foreground} on ${background} must meet 4.5:1`,
    );
  }
});

test('essential one-pixel boundaries meet 3:1 while decorative lines stay explicitly exempt', () => {
  const ivory = color('ivory');
  const indigo = color('indigo');
  const periwinkle = color('periwinkle');
  const night2 = color('night-2');
  const essential = Number(declaration('--sakura-essential-border-alpha'));
  const destructive = Number(declaration('--destructive-border-alpha'));
  const decorative = Number(declaration('--sakura-decorative-border-alpha'));

  assert.ok(contrast(composite(ivory, indigo, essential), indigo) >= 3);
  assert.ok(contrast(composite(ivory, periwinkle, destructive), periwinkle) >= 3);
  assert.ok(contrast(composite(ivory, night2, destructive), night2) >= 3);
  assert.ok(contrast(composite(ivory, indigo, destructive), indigo) >= 3);
  assert.ok(
    contrast(composite(ivory, indigo, decorative), indigo) < 3,
    'decorative hairlines are intentionally not essential state boundaries',
  );
  assert.notEqual(
    declaration('--sakura-decorative-border-alpha'),
    declaration('--sakura-essential-border-alpha'),
  );
});

test('destructive state is independently named and carries a persistent 3:1 boundary', () => {
  assert.notDeepEqual(color('destructive'), color('coral'));
  assert.notDeepEqual(color('destructive'), color('pink'));
  assert.equal(declaration('--destructive'), 'var(--sakura-destructive-hsl)');
  assert.match(
    css,
    /html\[data-theme='sakura'\] \.bg-destructive\s*\{[\s\S]*?box-shadow:\s*0 0 0 1px hsl\(var\(--destructive-border\) \/ var\(--destructive-border-alpha\)\);/u,
  );
});

test('selection remains readable after translucent compositing', () => {
  const night = color('night');
  const selected = composite(color('pink'), night, Number(declaration('--sakura-selection-alpha')));
  assert.ok(contrast(night, selected) >= 4.5);
});
