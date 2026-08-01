import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

async function sheet() {
  return postcss.parse(
    await readFile(resolve(process.cwd(), 'src/features/skills/sakura-skills.css'), 'utf8'),
  );
}

describe('Sakura Skills appearance', () => {
  it('recreates the prototype registry, manifest, editor, and selected-state hierarchy', async () => {
    const root = await sheet();
    const css = root.toString();
    const selectors = root.nodes
      .filter((node): node is Rule => node.type === 'rule')
      .map((rule) => rule.selector);

    expect(selectors).toContain("html[data-theme='sakura'] [data-monochrome-route='skills']");
    expect(css).toContain("[data-monochrome-surface='skill-manifest']");
    expect(css).toContain("[aria-pressed='true']");
    expect(css).toContain("[data-monochrome-state='loading']");
    expect(css).toContain("[data-monochrome-state='empty']");
    expect(selectors.every((selector) => selector.startsWith("html[data-theme='sakura']"))).toBe(
      true,
    );
  });

  it('keeps motion bounded and forced-colors chrome opaque', async () => {
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
