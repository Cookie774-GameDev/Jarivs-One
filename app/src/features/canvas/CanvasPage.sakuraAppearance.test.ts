import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'CanvasPage.tsx'), 'utf8');
const cssPath = resolve(__dirname, 'sakura-canvas.css');
const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

describe('Infinite Canvas Sakura appearance contract', () => {
  it('marks the quiet route and app-owned chrome without taking workspace ownership', () => {
    expect(source).toContain('data-sakura-route="canvas"');
    expect(source).toContain('data-sakura-intensity="quiet"');
    for (const surface of [
      'canvas-header',
      'canvas-layout-switcher',
      'canvas-templates',
      'canvas-search',
      'canvas-frames',
      'canvas-export',
      'canvas-tool-rail',
      'canvas-empty-state',
      'canvas-selection',
      'canvas-minimap',
      'canvas-control-dock',
      'canvas-outline',
      'canvas-inspector',
    ]) {
      expect(source).toContain(`data-sakura-surface="${surface}"`);
    }
    expect(source).toContain('data-sakura-content="canvas-workspace"');
  });

  it('keeps workspace, media, and editor pixels outside the Sakura selector set', () => {
    expect(source).toContain("import './sakura-canvas.css'");
    expect(css).toContain("html[data-theme='sakura'] [data-sakura-route='canvas']");
    expect(css).toContain("html[data-theme='sakura'] [data-sakura-surface='canvas-header']");
    expect(css).toContain("html[data-theme='sakura'] [data-sakura-surface='canvas-selection']");
    expect(css).not.toMatch(/data-sakura-content|textarea|iframe|img|video|url\(|!important/i);
    expect(css).not.toContain("html[data-theme='monochrome']");
  });

  it('provides bounded motion and readable opaque fallbacks', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('background: Canvas');
    expect(css).toContain('border-color: CanvasText');
  });
});
