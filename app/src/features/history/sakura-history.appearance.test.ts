import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

async function sheet() {
  return postcss.parse(
    await readFile(resolve(process.cwd(), 'src/features/history/sakura-history.css'), 'utf8'),
  );
}

describe('Sakura History appearance', () => {
  it('keeps rail, selected session, replay header, scrubber, and empty state Sakura-scoped', async () => {
    const root = await sheet();
    const css = root.toString();
    const selectors = root.nodes
      .filter((node): node is Rule => node.type === 'rule')
      .map((rule) => rule.selector);

    expect(selectors).toContain("html[data-theme='sakura'] [data-monochrome-route='history']");
    expect(css).toContain("[data-sakura-surface='history-list']");
    expect(css).toContain("[aria-current='true']");
    expect(css).toContain("[data-sakura-surface='replay-scrubber']");
    expect(css).toContain("[data-sakura-state='empty']");
    expect(selectors.every((selector) => selector.startsWith("html[data-theme='sakura']"))).toBe(
      true,
    );
  });

  it('keeps replay motion bounded and high-contrast surfaces opaque', async () => {
    const root = await sheet();
    const media = root.nodes.filter((node): node is AtRule => node.type === 'atrule');
    const css = root.toString();

    expect(
      media.find((rule) => rule.params === '(prefers-reduced-motion: reduce)')?.toString(),
    ).toContain('transition: none');
    expect(media.find((rule) => rule.params === '(forced-colors: active)')?.toString()).toContain(
      'border-color: CanvasText',
    );
    expect(css).not.toMatch(/url\s*\(/i);
    expect(css).not.toContain('!important');
  });
});
