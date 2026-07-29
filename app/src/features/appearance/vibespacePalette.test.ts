import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const LOCKED_HEX = [
  '#fdf4e6',
  '#faeee0',
  '#fceacc',
  '#fcd1a9',
  '#e3885e',
  '#d5663a',
  '#d77b6b',
  '#e7a57e',
  '#eaa870',
  '#cfa1c7',
  '#a57aa0',
  '#7b5479',
  '#8fa08b',
  '#798a6a',
  '#6c7457',
  '#8cbfd1',
  '#b27c53',
  '#865939',
  '#622f12',
  '#54362a',
] as const;

const CHAT_ROUTE_SCOPE =
  "html[data-theme='vibespace'] body:has(main[aria-label='workspace'] [data-vibespace-page='chat'])";
const cssPath = resolve(__dirname, '../../styles/vibespace-theme.css');
const chatViewPath = resolve(__dirname, '../chat/ChatView.tsx');
const schedulePagePath = resolve(__dirname, '../schedule/SchedulePage.tsx');

function readCss(): string {
  return readFileSync(cssPath, 'utf8').toLowerCase();
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
});
