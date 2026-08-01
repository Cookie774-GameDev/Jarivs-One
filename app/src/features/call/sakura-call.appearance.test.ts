import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

async function sakuraCallCss() {
  const css = await readFile(resolve(process.cwd(), 'src/features/call/sakura-call.css'), 'utf8');
  return postcss.parse(css);
}

describe('Sakura call appearance policy', () => {
  it('styles call state chrome without selecting transcript payload descendants', async () => {
    const sheet = await sakuraCallCss();
    const selectors = sheet.nodes
      .filter((node): node is Rule => node.type === 'rule')
      .map((rule) => rule.selector);

    expect(selectors).toContain("html[data-theme='sakura'] [data-sakura-surface='call']");
    expect(selectors).toContain(
      "html[data-theme='sakura'] [data-sakura-surface='call-transcript']",
    );
    expect(selectors).toContain("html[data-theme='sakura'] [data-call-state='error']");
    expect(selectors.some((selector) => selector.includes('[data-call-payload'))).toBe(false);
  });

  it('provides reduced-motion and forced-colors fallbacks', async () => {
    const sheet = await sakuraCallCss();
    const media = sheet.nodes.filter((node): node is AtRule => node.type === 'atrule');
    const reducedMotion = media.find(
      (rule) => rule.name === 'media' && rule.params === '(prefers-reduced-motion: reduce)',
    );
    const forcedColors = media.find(
      (rule) => rule.name === 'media' && rule.params === '(forced-colors: active)',
    );

    expect(reducedMotion?.toString()).toContain('animation: none');
    expect(forcedColors?.toString()).toContain('background: Canvas');
    expect(forcedColors?.toString()).toContain('border-color: CanvasText');
  });
});
