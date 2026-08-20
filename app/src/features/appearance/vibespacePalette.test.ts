import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const LOCKED_HEX = [
  '#f4d8be',
  '#f7ddc6',
  '#f9e1cb',
  '#fff1df',
  '#d3b296',
  '#9d7970',
  '#4b3120',
  '#755842',
  '#fbae8e',
  '#f0a280',
  '#c6785b',
  '#c5b0d2',
  '#8e6fa4',
  '#758766',
  '#a7b38d',
  '#879eb7',
  '#e6a04f',
  '#9fb667',
  '#ef7f25',
] as const;

const CHAT_ROUTE_SCOPE =
  "html[data-theme='vibespace'] body:has(main[aria-label='workspace'] [data-vibespace-page='chat'])";
const cssPath = resolve(__dirname, '../../styles/origami-chat.css');
const baseCssPath = resolve(__dirname, '../../styles/vibespace-theme.css');
const assetRoot = resolve(__dirname, '../../../public/assets/origami-chat');
const chatViewPath = resolve(__dirname, '../chat/ChatView.tsx');
const schedulePagePath = resolve(__dirname, '../schedule/SchedulePage.tsx');
const bootstrapAppPath = resolve(__dirname, '../../bootstrapApp.tsx');

function readCss(): string {
  return existsSync(cssPath) ? readFileSync(cssPath, 'utf8').toLowerCase() : '';
}

function rules(css: string): Rule[] {
  const found: Rule[] = [];
  postcss.parse(css).walkRules((rule) => {
    found.push(rule);
  });
  return found;
}

function ruleFor(css: string, selectorFragment: string): Rule | undefined {
  return rules(css).find((rule) =>
    rule.selectors.some((selector) => normalizeSelector(selector).includes(selectorFragment)),
  );
}

function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, ' ').trim();
}

function exactRule(css: string, selector: string): Rule | undefined {
  return rules(css).find((rule) =>
    rule.selectors.some((candidate) => normalizeSelector(candidate) === selector),
  );
}

describe('VibeSpace Origami Chat palette contract', () => {
  it('isolates every Origami selector beneath the exact VibeSpace Workspace Chat gate', () => {
    const css = readCss();
    const parsedRules = rules(css);

    expect(parsedRules.length, 'missing dedicated Origami Chat stylesheet').toBeGreaterThan(0);
    for (const rule of parsedRules) {
      for (const selector of rule.selectors) {
        expect(
          normalizeSelector(selector),
          `Origami selector escaped the exact Chat gate: ${selector}`,
        ).toMatch(new RegExp(`^${CHAT_ROUTE_SCOPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      }
    }
    expect(readFileSync(baseCssPath, 'utf8').toLowerCase()).not.toContain(
      "[data-vibespace-page='chat']",
    );
    expect(readFileSync(bootstrapAppPath, 'utf8')).toContain("import './styles/origami-chat.css';");
  });

  it('keeps the locked paper palette on the VibeSpace Chat branch', () => {
    const css = readCss();
    const chatRoot = exactRule(css, CHAT_ROUTE_SCOPE);

    expect(chatRoot, 'missing the VibeSpace Chat-only token root').toBeDefined();
    for (const hex of LOCKED_HEX) {
      expect(chatRoot?.toString(), `missing locked hue ${hex}`).toContain(hex);
    }
  });

  it('builds layered paper instead of a flat beige surface', () => {
    const css = readCss();
    const stage = exactRule(css, `${CHAT_ROUTE_SCOPE} [data-vibespace-page='chat']`);
    const session = ruleFor(css, "[data-testid='jarvis-session-panel']");
    const metrics = ruleFor(css, "[data-testid='jarvis-session-panel'] .grid > div");
    const composer = ruleFor(css, "[data-tour='chat-composer']");

    expect(stage?.toString()).toContain('repeating-linear-gradient');
    expect(stage?.toString()).toContain('linear-gradient');
    expect(session?.toString()).toContain('box-shadow');
    expect(metrics?.toString()).toContain('box-shadow');
    expect(composer?.toString()).toContain('box-shadow');
    expect(css).toContain('clip-path: polygon');
  });

  it('keeps the high-contrast grain asset on one faint noninteractive texture layer', () => {
    const css = readCss();
    const grainLayer = exactRule(css, `${CHAT_ROUTE_SCOPE} [data-vibespace-page='chat']::before`);
    const opaqueSurfaces = [
      ruleFor(css, "header[aria-label='application header']"),
      exactRule(css, `${CHAT_ROUTE_SCOPE} [data-nav-pane='true']`),
      ruleFor(css, "aside[aria-label='inspector']"),
      exactRule(css, `${CHAT_ROUTE_SCOPE} [data-vibespace-page='chat']`),
    ];

    expect(css.match(/paper-grain\.webp/gu)).toHaveLength(1);
    expect(grainLayer?.toString()).toContain('/assets/origami-chat/paper-grain.webp');
    expect(grainLayer?.toString()).toContain('opacity: 0.035');
    expect(grainLayer?.toString()).toContain('pointer-events: none');
    for (const surface of opaqueSurfaces) {
      expect(surface?.toString()).not.toContain('paper-grain.webp');
    }
  });

  it('uses only the frozen local material and decoration assets', () => {
    const css = readCss();
    const expectedAssets = [
      'paper-base.webp',
      'paper-grain.webp',
      'panel-9slice.webp',
      'sidebar-row-9slice.webp',
      'sidebar-active-row-9slice.webp',
      'jarvis-frame-9slice.webp',
    ];

    expect(css).not.toMatch(/url\((?:['"])?https?:/u);
    expect(css).not.toContain('target-chat.png');
    for (const asset of expectedAssets) {
      expect(existsSync(resolve(assetRoot, asset)), asset).toBe(true);
      expect(css, asset).toContain(`/assets/origami-chat/${asset}`);
    }
  });

  it('locks the reference geometry before decorative detail', () => {
    const css = readCss();
    const header = ruleFor(css, "header[aria-label='application header']");
    const expandedNav = ruleFor(css, "[data-nav-pane='true'][style*='width: 240px']");
    const navButton = ruleFor(css, "[data-nav-pane='true'] button");
    const tabs = ruleFor(css, "[role='tablist'][aria-label='open chats']");
    const thread = ruleFor(css, "[data-tour='chat-thread']");
    const threadContent = ruleFor(css, "[data-tour='chat-thread'] > div");
    const assistantMessage = exactRule(
      css,
      `${CHAT_ROUTE_SCOPE} [data-tour='chat-thread'] .justify-start`,
    );
    const session = ruleFor(css, "[data-testid='jarvis-session-panel']");
    const composer = ruleFor(css, "[data-tour='chat-composer']");
    const jarvisPanel = ruleFor(css, '.jarvis-voice-panel');

    expect(header?.toString()).toContain('height: 79px');
    expect(expandedNav?.toString()).toContain('width: 334px');
    expect(navButton?.toString()).toContain('min-height: 36px');
    expect(tabs?.toString()).toContain('height: 64px');
    expect(thread?.toString()).toContain('padding-inline');
    expect(threadContent?.toString()).toContain('padding-top: 0');
    expect(assistantMessage?.toString()).toContain('margin-top: 18px');
    expect(session?.toString()).toContain('min-height: 196px');
    expect(composer?.toString()).toContain('min-height: 152px');
    expect(composer?.toString()).toContain('margin-right: 232px');
    expect(composer?.toString()).toContain('margin-bottom: 20px');
    expect(composer?.toString()).toContain('margin-left: 8px');
    expect(jarvisPanel?.toString()).toContain('width: 420px');
    expect(jarvisPanel?.toString()).toContain('min-height: 98px');
  });

  it('places extracted decorations in their locked full-viewport source coordinates', () => {
    const css = readCss();
    const expectedGeometry = [
      ['.origami-chat-decor', ['position: fixed', 'inset: 0', 'z-index: 3']],
      ['.origami-chat-decor__ribbon', ['top: 0', 'left: 85px', 'width: 1140px', 'height: 88px']],
      ['.origami-chat-decor__crane', ['top: 96px', 'left: 14px', 'width: 90px', 'height: 84px']],
      ['.origami-chat-decor__foliage', ['top: 230px', 'left: 0', 'width: 116px', 'height: 715px']],
      ['.origami-chat-decor__mountains', ['right: 0', 'bottom: 0', 'left: 0', 'height: 80px']],
      [
        '.origami-chat-decor__flower',
        ['top: 674px', 'left: 1378px', 'width: 298px', 'height: 271px'],
      ],
    ] as const;

    for (const [selector, declarations] of expectedGeometry) {
      const rule = exactRule(css, `${CHAT_ROUTE_SCOPE} ${selector}`);
      for (const declaration of declarations) {
        expect(rule?.toString(), `${selector} ${declaration}`).toContain(declaration);
      }
    }
  });

  it('maps the paper treatment to real Chat, message, session, composer, and Jarvis seams', () => {
    const css = readCss();

    expect(css).toContain("[data-tour='chat-thread']");
    expect(css).toContain("[data-testid='jarvis-session-panel']");
    expect(css).toContain("[data-tour='chat-composer']");
    expect(css).toContain("[data-vibespace-page='chat']");
    expect(css).toContain("button[aria-label^='agent mode']");
    expect(css).toContain('.jarvis-voice-panel');
  });

  it('does not let a compact ChatThread alone activate Origami outside the Chat route', () => {
    const css = readCss();
    const chatViewSource = readFileSync(chatViewPath, 'utf8').toLowerCase();
    const scheduleSource = readFileSync(schedulePagePath, 'utf8').toLowerCase();
    const chatVisualFragments = [
      "[data-tour='chat-thread']",
      "[data-testid='jarvis-session-panel']",
      "[data-tour='chat-composer']",
      '.jarvis-voice-panel',
    ];

    expect(css).not.toContain("body:has(main[aria-label='workspace'] [data-tour='chat-thread'])");
    expect(chatViewSource).toContain('data-vibespace-page="chat"');
    expect(scheduleSource).toMatch(
      /<chatthread\s+chatid=\{metadata\.outputchatid\}\s+compact\s*\/>/,
    );
    expect(scheduleSource).not.toContain('data-vibespace-page');
    for (const fragment of chatVisualFragments) {
      const matchingRules = rules(css).filter((rule) =>
        rule.selectors.some((selector) => selector.includes(fragment)),
      );
      for (const rule of matchingRules) {
        for (const selector of rule.selectors.filter((candidate) => candidate.includes(fragment))) {
          expect(
            normalizeSelector(selector),
            `Chat visual selector escaped the main Chat route: ${selector}`,
          ).toContain(CHAT_ROUTE_SCOPE);
        }
      }
    }
  });

  it('requires every shared-shell treatment to remain on the Chat route branch', () => {
    const css = readCss();
    const sharedShellFragments = [
      "header[aria-label='application header']",
      "[data-nav-pane='true']",
      "aside[aria-label='inspector']",
      "main[aria-label='workspace']",
    ];

    for (const fragment of sharedShellFragments) {
      const matchingRules = rules(css).filter((rule) =>
        rule.selectors.some((selector) => selector.includes(fragment)),
      );
      expect(matchingRules.length, `missing Chat treatment for ${fragment}`).toBeGreaterThan(0);
      for (const rule of matchingRules) {
        for (const selector of rule.selectors.filter((candidate) => candidate.includes(fragment))) {
          expect(
            normalizeSelector(selector),
            `shared shell selector escaped Chat scope: ${selector}`,
          ).toContain(CHAT_ROUTE_SCOPE);
        }
      }
    }
  });

  it('does not port the reference commit terminal or pet restyles', () => {
    const css = readCss();

    expect(css).not.toMatch(/\[data-theme=['"](?:default|dark|light|jarvis|monochrome)['"]\]/);
    expect(css).not.toMatch(/\.jarvis-terminal-surface|\.xterm(?:-|\b)/);
    expect(css).not.toMatch(
      /\[data-pet-overlay|\.pet-overlay-root|\.pet-canvas-container|pet-mini-panel/,
    );
  });

  it('preserves visible focus and reduced-motion handling inside Chat', () => {
    const css = readCss();
    const focusRule = ruleFor(css, ':focus-visible');

    expect(focusRule?.selector).toContain("[data-vibespace-page='chat']");
    expect(focusRule?.toString()).toContain('outline');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).not.toMatch(/pointer-events:\s*auto/);
  });

  it('removes decorative paint and uses system focus colors in forced-colors Chat', () => {
    const css = readCss();
    let forcedColorsCss = '';

    postcss.parse(css).walkAtRules('media', (atRule) => {
      if (atRule.params.replace(/\s+/gu, '') === '(forced-colors:active)') {
        forcedColorsCss = atRule.toString();
      }
    });

    expect(forcedColorsCss, 'missing the VibeSpace Chat forced-colors contract').not.toBe('');

    const paintedSurfaceRule = rules(forcedColorsCss).find((rule) =>
      rule.selectors.some((selector) =>
        normalizeSelector(selector).endsWith("header[aria-label='application header']"),
      ),
    );
    const expectedPaintedSurfaces = [
      "header[aria-label='application header']",
      "[data-nav-pane='true']",
      "[data-nav-pane='true'] button",
      "[data-nav-pane='true'] button:hover",
      "[data-nav-pane='true'] button.bg-muted",
      "[data-nav-pane='true'] button[class*='ring-accent']",
      "[data-nav-pane='true'] [aria-current='page']",
      "aside[aria-label='inspector']",
      "[data-vibespace-page='chat']",
      "[data-testid='jarvis-session-panel']",
      "[data-tour='chat-composer']",
      '.jarvis-voice-panel',
    ];

    for (const surface of expectedPaintedSurfaces) {
      expect(
        paintedSurfaceRule?.selectors.some(
          (selector) => normalizeSelector(selector) === `${CHAT_ROUTE_SCOPE} ${surface}`,
        ),
        `missing forced-colors paint reset for ${surface}`,
      ).toBe(true);
    }
    expect(paintedSurfaceRule?.toString()).toContain('background-image: none !important');

    const grain = exactRule(
      forcedColorsCss,
      `${CHAT_ROUTE_SCOPE} [data-vibespace-page='chat']::before`,
    );
    expect(grain?.toString()).toContain('display: none');
    expect(grain?.toString()).toContain('mix-blend-mode: normal');

    const decor = exactRule(forcedColorsCss, `${CHAT_ROUTE_SCOPE} .origami-chat-decor`);
    expect(decor?.toString()).toContain('display: none');

    const focus = ruleFor(forcedColorsCss, ':focus-visible');
    expect(focus?.toString()).toContain('outline-color: highlight');
    expect(focus?.toString()).toContain('box-shadow: none');
    expect(forcedColorsCss).not.toMatch(/\*\s*(?:::before|::after)?\s*\{/u);
  });
});
