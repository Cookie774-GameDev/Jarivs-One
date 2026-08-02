import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

describe('Sakura Clock appearance', () => {
  it('styles tool, form, empty, active, urgent, and disabled chrome with accessible fallbacks', async () => {
    const css = postcss
      .parse(await readFile(resolve(process.cwd(), 'src/features/clock/sakura-clock.css'), 'utf8'))
      .toString();
    expect(css).toContain("html[data-theme='sakura'] .sakura-clock-panel");
    expect(css).toContain("[data-sakura-state='empty']");
    expect(css).toContain("[data-sakura-state='urgent']");
    expect(css).toContain(':disabled');
    expect(css).toContain('(forced-colors: active)');
    expect(css).not.toMatch(/url\s*\(|!important/i);
  });
});
