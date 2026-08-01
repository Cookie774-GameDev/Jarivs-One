import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

describe('Sakura Local Models appearance', () => {
  it('styles registry, loading, error, download, and disabled chrome without changing runtime state', async () => {
    const css = postcss
      .parse(
        await readFile(
          resolve(process.cwd(), 'src/features/local-models/sakura-local-models.css'),
          'utf8',
        ),
      )
      .toString();
    expect(css).toContain("html[data-theme='sakura'] .mc7f-settings-local-models");
    expect(css).toContain("[role='alert']");
    expect(css).toContain("[aria-busy='true']");
    expect(css).toContain(':disabled');
    expect(css).not.toMatch(/url\s*\(|!important/i);
  });
});
