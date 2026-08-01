import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

async function sheet() {
  return postcss.parse(
    await readFile(resolve(process.cwd(), 'src/features/tools/sakura-tools.css'), 'utf8'),
  );
}

describe('Sakura Tools appearance', () => {
  it('keeps header, sync status, quick starts, manifests, and empty state Sakura-scoped', async () => {
    const root = await sheet();
    const css = root.toString();
    const selectors = root.nodes
      .filter((node): node is Rule => node.type === 'rule')
      .map((rule) => rule.selector);

    expect(selectors).toContain("html[data-theme='sakura'] [data-monochrome-route='tools']");
    expect(css).toContain("[data-monochrome-surface='tool-sync-status']");
    expect(css).toContain("[data-monochrome-surface='tool-manifest']");
    expect(css).toContain("[data-sakura-surface='tool-template']");
    expect(css).toContain("[data-monochrome-state='empty']");
    expect(selectors.every((selector) => selector.startsWith("html[data-theme='sakura']"))).toBe(
      true,
    );
  });

  it('provides reduced-motion and forced-colors fallbacks without remote assets', async () => {
    const root = await sheet();
    const media = root.nodes.filter((node): node is AtRule => node.type === 'atrule');
    const css = root.toString();

    expect(
      media.find((rule) => rule.params === '(prefers-reduced-motion: reduce)')?.toString(),
    ).toContain('transform: none');
    expect(media.find((rule) => rule.params === '(forced-colors: active)')?.toString()).toContain(
      'background: Canvas',
    );
    expect(css).not.toMatch(/url\s*\(/i);
    expect(css).not.toContain('!important');
  });
});
