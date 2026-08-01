import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

describe('Sakura Plugins appearance', () => {
  it('scopes registry, status, credential, empty, and dialog chrome without recoloring provider logos', async () => {
    const css = postcss
      .parse(
        await readFile(resolve(process.cwd(), 'src/features/plugins/sakura-plugins.css'), 'utf8'),
      )
      .toString();
    expect(css).toContain("html[data-theme='sakura'] .mc7f-plugins");
    expect(css).toContain("[data-sakura-state='connected']");
    expect(css).toContain("[data-sakura-state='error']");
    expect(css).toContain("[data-sakura-state='empty']");
    expect(css).not.toMatch(/PluginLogo|img|filter\s*:/);
    expect(css).not.toMatch(/url\s*\(|!important/i);
  });
});
