import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SELECTABLE_THEMES, migrateThemePreference, parseThemeCommandArgument } from './themes';
import { applyThemeToDocument, resolveTheme, useUIStore } from '@/stores/ui';

/** Locked OBJECTIVE §4 hues that must appear in the shipped VibeSpace stylesheet. */
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

const vibespaceCssPath = resolve(__dirname, '../../styles/vibespace-theme.css');
const globalsCssPath = resolve(__dirname, '../../styles/globals.css');

function readCss(path: string): string {
  return readFileSync(path, 'utf8').toLowerCase();
}

describe('VibeSpace locked palette (shipped CSS)', () => {
  it('ships every locked palette hex under data-theme=vibespace only', () => {
    const css = readCss(vibespaceCssPath);
    expect(css).toContain("html[data-theme='vibespace']");
    for (const hex of LOCKED_HEX) {
      expect(css, `missing locked hue ${hex}`).toContain(hex);
    }
  });

  it('does not rewrite dark/light/jarvis token blocks inside globals.css for vibespace work', () => {
    const globals = readFileSync(globalsCssPath, 'utf8');
    // Other theme token blocks remain present as independent skins.
    expect(globals).toMatch(/\[data-theme=['"]dark['"]\]/);
    expect(globals).toMatch(/\[data-theme=['"]light['"]\]/);
    expect(globals).toMatch(/\[data-theme=['"]jarvis['"]\]/);
    // VibeSpace must not be injected as a globals theme block (lives in vibespace-theme.css).
    expect(globals).not.toMatch(/\[data-theme=['"]vibespace['"]\]\s*\{/);
  });

  it('vibespace-theme.css never rewrites non-vibespace data-theme selectors', () => {
    // Ship isolation: every data-theme rule in this file must target vibespace only.
    // Catches accidental light/dark/jarvis token rewrites that would violate AC1.
    const raw = readFileSync(vibespaceCssPath, 'utf8');
    const selectors = raw.match(/\[data-theme\s*=\s*['"][^'"]+['"]\]/g) ?? [];
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      const theme = /data-theme\s*=\s*['"]([^'"]+)['"]/.exec(sel)?.[1];
      expect(theme, `non-vibespace selector leaked into vibespace-theme.css: ${sel}`).toBe(
        'vibespace',
      );
    }
    // Explicit negative checks (skeptic-required).
    expect(raw).not.toMatch(/\[data-theme\s*=\s*['"]light['"]\]/);
    expect(raw).not.toMatch(/\[data-theme\s*=\s*['"]dark['"]\]/);
    expect(raw).not.toMatch(/\[data-theme\s*=\s*['"]jarvis['"]\]/);
  });

  it('scopes paper primitives and terminal interior to vibespace only', () => {
    const css = readCss(vibespaceCssPath);
    expect(css).toContain("html[data-theme='vibespace'] .vs-paper-surface");
    expect(css).toContain("html[data-theme='vibespace'] .vs-folded-card");
    expect(css).toContain('--vs-terminal-bg: #622f12');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('styles primary chrome under vibespace without restyling pets', () => {
    const raw = readFileSync(vibespaceCssPath, 'utf8');
    const css = raw.toLowerCase();
    // Primary chrome hooks present
    expect(css).toContain("header[aria-label='application header']");
    expect(css).toContain("[data-nav-pane='true']");
    expect(css).toContain("aside[aria-label='inspector']");
    expect(css).toContain("main[aria-label='workspace']");
    // Terminal: paper frame + dark interior (not cream over xterm glyphs)
    expect(css).toContain('.jarvis-terminal-surface');
    expect(css).toContain('.xterm-viewport');
    expect(css).toMatch(/--vs-terminal-bg:\s*#622f12/);
    // Pets/mascot must not be restyled by this theme file
    expect(css).not.toMatch(/\[data-pet-overlay/);
    expect(css).not.toMatch(/\.pet-overlay-root/);
    expect(css).not.toMatch(/\.pet-canvas-container/);
    expect(css).not.toMatch(/pixi|vibespace-axolotl|pet-mini-panel/);
  });
});

describe('VibeSpace theme resolution via shipped store API', () => {
  it('accepts vibespace through the public theme registry', () => {
    expect(SELECTABLE_THEMES.some((t) => t.id === 'vibespace' && t.label === 'VibeSpace')).toBe(true);
    expect(migrateThemePreference('vibespace')).toBe('vibespace');
    expect(parseThemeCommandArgument('VibeSpace')).toBe('vibespace');
  });

  it('applyThemeToDocument sets data-theme=vibespace without flipping other skins', () => {
    applyThemeToDocument('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    applyThemeToDocument('vibespace');
    expect(resolveTheme('vibespace')).toBe('vibespace');
    expect(document.documentElement.getAttribute('data-theme')).toBe('vibespace');
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('vibespace');

    applyThemeToDocument('jarvis');
    expect(document.documentElement.getAttribute('data-theme')).toBe('jarvis');

    applyThemeToDocument('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    applyThemeToDocument('default');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('default');
  });

  it('setTheme persists vibespace through the UI store action path', () => {
    useUIStore.getState().setTheme('vibespace');
    expect(useUIStore.getState().theme).toBe('vibespace');
    expect(document.documentElement.getAttribute('data-theme')).toBe('vibespace');

    useUIStore.getState().setTheme('default');
    expect(useUIStore.getState().theme).toBe('default');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
