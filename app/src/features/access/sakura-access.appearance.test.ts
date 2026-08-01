import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

async function sheet() {
  return postcss.parse(
    await readFile(resolve(process.cwd(), 'src/features/access/sakura-access.css'), 'utf8'),
  );
}

describe('Sakura Access appearance', () => {
  it('keeps authoritative access states, urgency, and locked controls distinct and scoped', async () => {
    const root = await sheet();
    const css = root.toString();
    const selectors = root.nodes
      .filter((node): node is Rule => node.type === 'rule')
      .map((rule) => rule.selector);

    expect(selectors).toContain("html[data-theme='sakura'] .mc7f-access-paywall");
    expect(css).toContain("[data-sakura-state='past-due']");
    expect(css).toContain("[data-sakura-state='locked']");
    expect(css).toContain("[data-sakura-tone='danger']");
    expect(css).toContain(':disabled');
    expect(selectors.every((selector) => selector.startsWith("html[data-theme='sakura']"))).toBe(
      true,
    );
  });

  it('provides non-animated and forced-color fallbacks without unsafe assets', async () => {
    const root = await sheet();
    const media = root.nodes.filter((node): node is AtRule => node.type === 'atrule');
    const css = root.toString();

    expect(
      media.find((rule) => rule.params === '(prefers-reduced-motion: reduce)')?.toString(),
    ).toContain('animation: none');
    expect(media.find((rule) => rule.params === '(forced-colors: active)')?.toString()).toContain(
      'background: Canvas',
    );
    expect(css).not.toMatch(/url\s*\(/i);
    expect(css).not.toContain('!important');
  });
});
