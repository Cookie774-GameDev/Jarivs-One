import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

async function sheet() {
  return postcss.parse(
    await readFile(resolve(process.cwd(), 'src/features/account/sakura-account.css'), 'utf8'),
  );
}

describe('Sakura Account appearance', () => {
  it('keeps account framing, selected tabs, dense panels, loading, and error states scoped', async () => {
    const root = await sheet();
    const css = root.toString();
    const selectors = root.nodes
      .filter((node): node is Rule => node.type === 'rule')
      .map((rule) => rule.selector);

    expect(selectors).toContain("html[data-theme='sakura'] .mc7f-account-page");
    expect(css).toContain('.sakura-account-panel');
    expect(css).toContain("[data-state='active']");
    expect(css).toContain("[data-sakura-state='loading']");
    expect(css).toContain("[data-sakura-state='error']");
    expect(selectors.every((selector) => selector.startsWith("html[data-theme='sakura']"))).toBe(
      true,
    );
  });

  it('preserves semantic meter colors and accessibility fallbacks without unsafe assets', async () => {
    const root = await sheet();
    const media = root.nodes.filter((node): node is AtRule => node.type === 'atrule');
    const css = root.toString();

    expect(css).toContain("[role='progressbar']");
    expect(css).toContain('var(--destructive)');
    expect(
      media.find((rule) => rule.params === '(prefers-reduced-motion: reduce)')?.toString(),
    ).toContain('animation: none');
    expect(media.find((rule) => rule.params === '(forced-colors: active)')?.toString()).toContain(
      'background: Canvas',
    );
    expect(css).not.toMatch(/url\s*\(/i);
    expect(css).not.toContain('!important');
  });

  it('contains dense account content at narrow widths and keeps visible keyboard focus', async () => {
    const root = await sheet();
    const media = root.nodes.filter((node): node is AtRule => node.type === 'atrule');
    const css = root.toString();
    const narrow = media.find((rule) => rule.params === '(max-width: 639px)')?.toString();
    const forcedColors = media
      .find((rule) => rule.params === '(forced-colors: active)')
      ?.toString();

    expect(css).toContain('.account-support-grid');
    expect(css).toContain('.account-link-row');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(narrow).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(forcedColors).toContain(':focus-visible');
    expect(forcedColors).toContain('outline: 2px solid ButtonText');
  });
});
