import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  const path = join(process.cwd(), relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const css = read('src/features/browser/browser.sakura.css').replace(/\s+/g, ' ').trim();
const pageSource = read('src/features/browser/BrowserPage.tsx');

describe('Browser Sakura ownership boundary', () => {
  it('scopes every new material rule to app-owned Sakura chrome', () => {
    expect(css).toContain("html[data-theme='sakura'] [data-vibespace-owned-chrome='browser']");
    expect(css).toContain('var(--sakura-panel-fallback)');
    expect(css).not.toContain('!important');
  });

  it('never selects remote/provider pixels', () => {
    expect(css).not.toMatch(/\.browser-iframe(?:\s|,|\{)/);
    expect(css).not.toMatch(/\.browser-viewport\s+(?:img|iframe)/);
    expect(css).not.toMatch(/\[data-remote-content-boundary/);
    expect(pageSource).toContain('data-remote-content-boundary="provider-page"');
  });

  it('provides non-color local approval states and opaque forced-colors chrome', () => {
    expect(css).toMatch(/\[data-status='pending'\][\s\S]*border-style: solid/);
    expect(css).toMatch(/\[data-status='denied'\][\s\S]*border-style: dashed/);
    expect(css).toMatch(
      /@media \(forced-colors: active\)[\s\S]*background: Canvas;[\s\S]*border-color: CanvasText/,
    );
  });
});
