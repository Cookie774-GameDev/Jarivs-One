import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'WorkbenchPage.tsx'), 'utf8');
const css = readFileSync(resolve(__dirname, 'workbench.css'), 'utf8');
const sakuraScope = "html[data-theme='sakura'] .workbench-shell[data-sakura-route='workbench']";

describe('Workbench Sakura appearance contract', () => {
  it('marks the standard-intensity shell and toolbar without changing canvas ownership', () => {
    expect(source).toContain('data-sakura-route="workbench"');
    expect(source).toContain('data-sakura-intensity="standard"');
    expect(source).toContain('data-sakura-surface="workbench-toolbar"');
    expect(source).toContain('data-sakura-content="workbench-canvas"');
  });

  it('keeps Sakura rules exact to shell chrome and out of panel/user content', () => {
    expect(css).toContain(sakuraScope);
    const sakuraRules = css.slice(
      css.indexOf('/* Sakura Workbench chrome'),
      css.indexOf('@keyframes workbench-orbit'),
    );
    expect(sakuraRules).not.toMatch(/workbench-panel-body|workbench-wallpaper|iframe|textarea/);
  });

  it('bounds chrome motion and supplies an opaque forced-color fallback', () => {
    const sakuraRules = css.slice(
      css.indexOf('/* Sakura Workbench chrome'),
      css.indexOf('@keyframes workbench-orbit'),
    );
    expect(sakuraRules).toContain('@media (prefers-reduced-motion: reduce)');
    expect(sakuraRules).toContain('@media (forced-colors: active)');
    expect(sakuraRules).toContain('background: Canvas');
  });
});
