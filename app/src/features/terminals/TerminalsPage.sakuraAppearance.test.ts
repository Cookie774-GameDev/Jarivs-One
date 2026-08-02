import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(__dirname, 'TerminalsPage.tsx'), 'utf8');
const viewSource = readFileSync(resolve(__dirname, 'TerminalView.tsx'), 'utf8');
const cssPath = resolve(__dirname, 'sakura-terminal.css');
const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

describe('Terminal Sakura appearance contract', () => {
  it('marks the quiet route and app-owned outer chrome without replacing terminal state', () => {
    expect(pageSource).toContain('data-sakura-route="terminal"');
    expect(pageSource).toContain('data-sakura-intensity="quiet"');
    expect(pageSource).toContain('data-sakura-surface="terminal-toolbar"');
    expect(pageSource).toContain('data-sakura-surface="terminal-grid"');
    expect(viewSource.match(/data-sakura-terminal-chrome=\{hideChrome \? undefined : 'true'\}/g)).toHaveLength(
      2,
    );
    expect(viewSource).toContain('data-sakura-terminal-content="preserve"');
  });

  it('never targets ANSI, xterm, or terminal content from Sakura chrome CSS', () => {
    expect(css).toContain("html[data-theme='sakura'] [data-sakura-route='terminal']");
    expect(css).toContain("html[data-theme='sakura'] [data-sakura-terminal-chrome='true']");
    expect(css).not.toMatch(
      /\bxterm\b|\bansi\b|data-sakura-terminal-content|(?:^|\n)\s*color\s*:/i,
    );
    expect(css).not.toContain("html[data-theme='monochrome']");
    expect(css).not.toContain("html[data-theme='default']");
  });

  it('bounds chrome motion and supplies an opaque forced-color fallback', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('background: Canvas');
  });
});
