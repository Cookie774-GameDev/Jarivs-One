import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'FilesPage.tsx'), 'utf8');
const cssPath = resolve(__dirname, 'sakura-files.css');
const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

describe('FilesPage Sakura appearance contract', () => {
  it('marks the quiet route and separates tree/editor/Jarvis chrome', () => {
    expect(source).toContain('data-sakura-route="files"');
    expect(source).toContain('data-sakura-intensity="quiet"');
    expect(source).toContain('data-sakura-surface="files-tree"');
    expect(source).toContain('data-sakura-surface="files-editor"');
    expect(source).toContain('data-sakura-content="file-editor"');
  });

  it('styles only named chrome and never file/editor/media content', () => {
    expect(css).toContain("html[data-theme='sakura'] [data-sakura-route='files']");
    expect(css).toContain("html[data-theme='sakura'] [data-sakura-surface='files-tree']");
    expect(css).not.toMatch(/textarea|img|video|data-sakura-content|contenteditable/);
    expect(css).not.toContain("html[data-theme='monochrome']");
    expect(css).not.toContain("html[data-theme='default']");
  });

  it('supplies reduced-motion and forced-color readability fallbacks', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('background: Canvas');
  });
});
