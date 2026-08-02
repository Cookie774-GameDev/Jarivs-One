import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

describe('Sakura Wellness appearance', () => {
  it('styles the wellness overlay and progress with reduced-motion and forced-color fallbacks', async () => {
    const css = postcss
      .parse(
        await readFile(resolve(process.cwd(), 'src/features/wellness/sakura-wellness.css'), 'utf8'),
      )
      .toString();
    expect(css).toContain("html[data-theme='sakura'] [data-monochrome-surface='wellness-break']");
    expect(css).toContain("[data-sakura-surface='wellness-progress']");
    expect(css).toContain('(prefers-reduced-motion: reduce)');
    expect(css).toContain('(forced-colors: active)');
    expect(css).not.toMatch(/url\s*\(|!important/i);
  });
});
