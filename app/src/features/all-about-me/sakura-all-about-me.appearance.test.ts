import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

describe('Sakura All About Me appearance', () => {
  it('styles profile form and status chrome without targeting user file or content payloads', async () => {
    const css = postcss
      .parse(
        await readFile(
          resolve(process.cwd(), 'src/features/all-about-me/sakura-all-about-me.css'),
          'utf8',
        ),
      )
      .toString();
    expect(css).toContain("html[data-theme='sakura'] .mc7f-settings-all-about-me");
    expect(css).toContain("[role='alert']");
    expect(css).toContain(':disabled');
    expect(css).not.toMatch(/\[data-user-content|pre\s*\{|code\s*\{|url\s*\(|!important/i);
  });
});
