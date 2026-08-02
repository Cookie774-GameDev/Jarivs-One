import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

describe('Sakura News appearance', () => {
  it('styles inspector, selected filters, cards, and empty state without altering publisher imagery', async () => {
    const css = postcss
      .parse(await readFile(resolve(process.cwd(), 'src/features/news/sakura-news.css'), 'utf8'))
      .toString();
    expect(css).toContain("html[data-theme='sakura'] .sakura-news-panel");
    expect(css).toContain("[aria-selected='true']");
    expect(css).toContain("[data-sakura-state='empty']");
    expect(css).not.toMatch(/\bimg\b|object-fit|filter\s*:/);
    expect(css).not.toMatch(/url\s*\(|!important/i);
  });
});
