import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const cssPath = new URL('../../app/src/styles/sakura-theme.css', import.meta.url);
const mainPath = new URL('../../app/src/main.tsx', import.meta.url);
const tokenPath = new URL('../../docs/appearance/sakura/design-tokens.json', import.meta.url);
const tokenDocumentationPath = new URL('../../docs/appearance/sakura/TOKENS.md', import.meta.url);
const buttonPath = new URL('../../app/src/components/ui/button.tsx', import.meta.url);
const workbenchPath = new URL(
  '../../app/src/features/appearance/MonochromeWorkbench.tsx',
  import.meta.url,
);
const EXACT_ROOT = /^html\s*\[\s*data-theme\s*=\s*(?:'sakura'|"sakura"|sakura)\s*\](?=$|[\s:])/u;

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

function declaration(css, property) {
  const escaped = property.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`, 'u'));
  assert.ok(match, `missing ${property}`);
  return match[1].trim();
}

function rgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(channels) {
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(left, right) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(foreground, background, alpha) {
  return foreground.map((channel, index) =>
    Math.round(channel * alpha + background[index] * (1 - alpha)),
  );
}

test('Sakura is a separately imported final theme layer and every selector is exactly scoped', () => {
  assert.equal(existsSync(cssPath), true, 'expected the dedicated Sakura stylesheet');
  const css = read(cssPath).replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  const selectors = collectSelectors(css);
  assert.ok(selectors.length >= 7, 'expected root, body, accessibility, and mode selectors');
  for (const selector of selectors) {
    assert.match(selector, EXACT_ROOT, `unscoped or lookalike selector: ${selector}`);
  }

  const main = read(mainPath);
  const orderedStyleImports = [
    "import './styles/globals.css';",
    "import './styles/vibespace-theme.css';",
    "import './styles/origami-chat.css';",
    "import './styles/monochrome-theme.css';",
    "import './styles/sakura-theme.css';",
  ];
  const offsets = orderedStyleImports.map((statement) => main.indexOf(statement));
  assert.ok(
    offsets.every((offset) => offset >= 0),
    'expected every theme stylesheet import',
  );
  assert.deepEqual(
    [...offsets].sort((left, right) => left - right),
    offsets,
    'expected Sakura after the preserved theme cascade',
  );
});

test('Sakura preserves the exact Phase A palette and lossless HSL channel authority', () => {
  const css = read(cssPath);
  const tokens = JSON.parse(read(tokenPath));
  const names = {
    night: 'night',
    night2: 'night-2',
    indigo: 'indigo',
    periwinkle: 'periwinkle',
    orchid: 'orchid',
    lavender: 'lavender',
    pink: 'pink',
    coral: 'coral',
    peach: 'peach',
    ivory: 'ivory',
    gold: 'gold',
    mint: 'mint',
    destructiveDerived: 'destructive',
  };
  for (const [sourceName, cssName] of Object.entries(names)) {
    assert.equal(
      declaration(css, `--sakura-${cssName}`).toLowerCase(),
      tokens.palette[sourceName].toLowerCase(),
      sourceName,
    );
  }

  const exactChannels = {
    night: '250.588235 54.83871% 12.156863%',
    'night-2': '243.673469 43.362832% 22.156863%',
    indigo: '243.428571 44.871795% 30.588235%',
    periwinkle: '237 27.777778% 42.352941%',
    orchid: '315.319149 19.341564% 47.647059%',
    lavender: '285 19.047619% 58.823529%',
    pink: '349.253731 66.336634% 80.196078%',
    coral: '348.28125 80% 68.627451%',
    peach: '8 69.230769% 87.254902%',
    ivory: '23.076923 100% 97.45098%',
    gold: '43.111111 100% 73.529412%',
    mint: '151.2 34.722222% 71.764706%',
    destructive: '346.61157 51.054852% 46.470588%',
  };
  for (const [name, channels] of Object.entries(exactChannels)) {
    assert.equal(declaration(css, `--sakura-${name}-hsl`), channels, name);
  }
});

test('Sakura maps the established semantic contract to the approved color roles', () => {
  const css = read(cssPath);
  const expected = {
    '--background': 'var(--sakura-night-hsl)',
    '--background-warm': 'var(--sakura-night-hsl)',
    '--panel': 'var(--sakura-night-2-hsl)',
    '--elevated': 'var(--sakura-indigo-hsl)',
    '--foreground': 'var(--sakura-ivory-hsl)',
    '--muted-foreground': 'var(--sakura-peach-hsl)',
    '--border': 'var(--sakura-ivory-hsl) / 0.39',
    '--border-mid': 'var(--sakura-ivory-hsl) / 0.52',
    '--ring': 'var(--sakura-pink-hsl)',
    '--primary': 'var(--sakura-coral-hsl)',
    '--primary-foreground': 'var(--sakura-night-hsl)',
    '--accent': 'var(--sakura-pink-hsl)',
    '--accent-foreground': 'var(--sakura-night-hsl)',
    '--destructive': 'var(--sakura-destructive-hsl)',
    '--destructive-foreground': 'var(--sakura-ivory-hsl)',
    '--destructive-border': 'var(--sakura-ivory-hsl)',
    '--destructive-border-alpha': '0.52',
    '--success': 'var(--sakura-mint-hsl)',
    '--warning': 'var(--sakura-gold-hsl)',
  };
  for (const [property, value] of Object.entries(expected)) {
    assert.equal(declaration(css, property), value, property);
  }
  assert.notEqual(declaration(css, '--destructive'), declaration(css, '--primary'));
  assert.notEqual(declaration(css, '--destructive'), declaration(css, '--ring'));

  assert.match(
    css.replaceAll(/\s+/gu, ' '),
    /html\[data-theme='sakura'\] \.bg-destructive \{ box-shadow: 0 0 0 1px hsl\(var\(--destructive-border\) \/ var\(--destructive-border-alpha\)\); \}/u,
  );

  const button = read(buttonPath);
  assert.match(
    button,
    /destructive:\s*'bg-destructive text-destructive-foreground hover:bg-destructive\/90'/u,
  );
  const workbench = read(workbenchPath);
  assert.match(
    workbench,
    /data-workbench-state="destructive"[\s\S]*?variant="destructive"[\s\S]*?aria-label="Delete synthetic run"[\s\S]*?<Trash2 aria-hidden="true" \/>[\s\S]*?Delete synthetic run/u,
  );
});

test('Sakura semantic text and essential boundary pairings meet the frozen contrast gates', () => {
  const { palette, contrastGates } = JSON.parse(read(tokenPath));
  const night = rgb(palette.night);
  const night2 = rgb(palette.night2);
  const indigo = rgb(palette.indigo);
  const periwinkle = rgb(palette.periwinkle);
  const ivory = rgb(palette.ivory);

  assert.ok(contrast(ivory, night) >= contrastGates.normalTextAA);
  assert.ok(contrast(ivory, night2) >= contrastGates.normalTextAA);
  assert.ok(contrast(ivory, indigo) >= contrastGates.normalTextAA);
  assert.ok(contrast(ivory, periwinkle) >= contrastGates.normalTextAA);
  assert.ok(contrast(rgb(palette.coral), night) >= contrastGates.normalTextAA);
  assert.ok(contrast(rgb(palette.destructiveDerived), ivory) >= contrastGates.normalTextAA);

  assert.ok(
    contrast(composite(ivory, indigo, 0.39), indigo) >= contrastGates.essentialNonText,
    '0.39 Ivory is the minimum essential boundary on Indigo',
  );
  assert.ok(
    contrast(composite(ivory, periwinkle, 0.52), periwinkle) >= contrastGates.essentialNonText,
    '0.52 Ivory preserves an essential boundary on Periwinkle',
  );
  assert.ok(
    contrast(composite(ivory, night2, 0.52), night2) >= contrastGates.essentialNonText,
    'destructive Ivory boundary passes on Night2',
  );
  assert.ok(
    contrast(composite(ivory, indigo, 0.52), indigo) >= contrastGates.essentialNonText,
    'destructive Ivory boundary passes on Indigo',
  );
});

test('Sakura freezes bounded material, geometry, typography, and motion tokens', () => {
  const css = read(cssPath);
  const expected = {
    '--sakura-panel-alpha': '0.82',
    '--sakura-panel-alpha-strong': '0.91',
    '--sakura-card-alpha': '0.07',
    '--sakura-decorative-border-alpha': '0.19',
    '--sakura-decorative-border-strong-alpha': '0.32',
    '--sakura-essential-border-alpha': '0.39',
    '--sakura-blur': '16px',
    '--radius-sm': '10px',
    '--radius': '12px',
    '--radius-lg': '16px',
    '--sakura-radius-feature': '23px',
    '--duration-fast': '180ms',
    '--duration-base': '220ms',
    '--font-display': "'Fraunces', Georgia, serif",
    '--font-sans': "'Plus Jakarta Sans', Inter, ui-sans-serif, system-ui, sans-serif",
    '--font-mono': "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  };
  for (const [property, value] of Object.entries(expected)) {
    assert.equal(declaration(css, property), value, property);
  }
});

test('Sakura authority truthfully records the active layers and pending later phases', () => {
  const tokens = JSON.parse(read(tokenPath));
  assert.equal(tokens.status, 'sk0b-production-token-layer-active-later-phases-pending');

  const documentation = read(tokenDocumentationPath);
  const normalizedDocumentation = documentation.replaceAll(/\s+/gu, ' ');
  assert.match(
    documentation,
    /Status: production token, scene, and material layers active; route, primitive, and final\s+acceptance remain pending\./u,
  );
  assert.match(
    normalizedDocumentation,
    /route, primitive, and final acceptance remain pending/iu,
  );
  assert.doesNotMatch(documentation, /\bFuture Sakura CSS should\b/u);
});

test('Sakura is local, bounded, motion-safe, and forced-colors compatible', () => {
  const css = read(cssPath);
  const normalized = css.replaceAll(/\s+/gu, ' ');
  assert.doesNotMatch(css, /\burl\s*\(|https?:|@import|!important/iu);
  assert.deepEqual(
    [...css.matchAll(/@keyframes\s+([\w-]+)/gu)].map((match) => match[1]),
    ['sakura-petal-drift'],
    'only the accepted deterministic local petal animation may define keyframes',
  );
  for (const selector of collectSelectors(css.replaceAll(/\/\*[\s\S]*?\*\//gu, ''))) {
    assert.doesNotMatch(selector, /\b(?:canvas|terminal|webview|iframe|provider)\b/iu);
  }
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
  assert.match(normalized, /animation:\s*none;/u);
  assert.match(normalized, /transition:\s*none;/u);
  assert.match(normalized, /scroll-behavior:\s*auto;/u);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/u);
  assert.match(normalized, /forced-color-adjust:\s*auto;/u);
  assert.match(normalized, /outline-color:\s*Highlight;/u);
  assert.ok(
    Buffer.byteLength(css, 'utf8') <= 16_384,
    'the integrated Sakura token, scene, and material layer must stay within 16 KiB',
  );
});
