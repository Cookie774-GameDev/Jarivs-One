import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ContextPage.tsx'), 'utf8');
const cssPath = resolve(__dirname, 'sakura-context.css');
const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

describe('ContextPage Sakura appearance contract', () => {
  it('marks the planar route and only its app-owned chrome with the standard intensity', () => {
    expect(source).toContain('data-sakura-route="context"');
    expect(source).toContain('data-sakura-intensity="standard"');
    expect(source).toContain('data-sakura-surface="context-tree"');
    expect(source).toContain('data-sakura-surface="context-workspace"');
    expect(source).toContain('data-sakura-surface="context-inspector"');
  });

  it('keeps graph and editor content outside the exact Sakura CSS surface selectors', () => {
    expect(css).toContain("html[data-theme='sakura'] [data-sakura-route='context']");
    expect(css).toContain("html[data-theme='sakura'] [data-sakura-surface='context-tree']");
    expect(css).not.toMatch(/canvas|textarea|contenteditable|transform\s*:/);
    expect(css).not.toContain("html[data-theme='monochrome']");
    expect(css).not.toContain("html[data-theme='default']");
  });

  it('provides reduced-motion and opaque forced-color fallbacks for Context chrome', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('background: Canvas');
    expect(css).toContain('border-color: CanvasText');
  });
});
