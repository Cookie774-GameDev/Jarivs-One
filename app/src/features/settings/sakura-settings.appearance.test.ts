import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

async function sheet() {
  return postcss.parse(
    await readFile(resolve(process.cwd(), 'src/features/settings/sakura-settings.css'), 'utf8'),
  );
}

describe('Sakura Settings appearance', () => {
  it('keeps the modal, selected navigation, panels, and dense controls Sakura-scoped', async () => {
    const root = await sheet();
    const css = root.toString();
    const selectors = root.nodes
      .filter((node): node is Rule => node.type === 'rule')
      .map((rule) => rule.selector);

    expect(selectors).toContain("html[data-theme='sakura'] .mc7f-settings-modal");
    expect(css).toContain("[aria-current='page']");
    expect(css).toContain("[role='tabpanel']");
    expect(css).toContain("[data-sakura-surface='settings-content']");
    expect(selectors.every((selector) => selector.startsWith("html[data-theme='sakura']"))).toBe(
      true,
    );
  });

  it('provides reduced-motion, reflow, and forced-color fallbacks without unsafe assets', async () => {
    const root = await sheet();
    const media = root.nodes.filter((node): node is AtRule => node.type === 'atrule');
    const css = root.toString();

    expect(
      media.find((rule) => rule.params === '(prefers-reduced-motion: reduce)')?.toString(),
    ).toContain('transition: none');
    expect(media.find((rule) => rule.params === '(max-width: 760px)')?.toString()).toContain(
      'grid-template-columns: minmax(0, 1fr)',
    );
    expect(media.find((rule) => rule.params === '(forced-colors: active)')?.toString()).toContain(
      'background: Canvas',
    );
    expect(css).not.toMatch(/url\s*\(/i);
    expect(css).not.toContain('!important');
  });
});
