import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

describe('Sakura Wallpaper Library appearance', () => {
  it('styles catalog chrome, selection, lock, and confirmation without touching asset pixels', async () => {
    const css = postcss
      .parse(
        await readFile(
          resolve(process.cwd(), 'src/features/wallpaper-library/sakura-wallpaper-library.css'),
          'utf8',
        ),
      )
      .toString();
    expect(css).toContain("html[data-theme='sakura'] .wallpaper-library");
    expect(css).toContain('.is-active');
    expect(css).toContain('.is-locked');
    expect(css).toContain('.wallpaper-library-confirm');
    expect(css).not.toMatch(/\b(img|video)\b|object-fit|filter\s*:/);
    expect(css).not.toMatch(/url\s*\(|!important/i);
  });
});
