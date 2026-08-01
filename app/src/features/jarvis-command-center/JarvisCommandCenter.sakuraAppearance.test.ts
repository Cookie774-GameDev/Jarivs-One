import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

async function commandCenterCss() {
  const css = await readFile(
    resolve(process.cwd(), 'src/features/jarvis-command-center/jarvis-command-center.css'),
    'utf8',
  );
  return postcss.parse(css);
}

describe('Jarvis Command Center Sakura appearance policy', () => {
  it('distinguishes collapsed and expanded hierarchy only inside Sakura', async () => {
    const sheet = await commandCenterCss();
    const selectors = sheet.nodes
      .filter((node): node is Rule => node.type === 'rule')
      .map((rule) => rule.selector);

    expect(selectors).toContain(
      "html[data-theme='sakura'] .jarvis-command-center[data-jarvis-expansion='collapsed']",
    );
    expect(selectors).toContain(
      "html[data-theme='sakura'] .jarvis-command-center[data-jarvis-expansion='expanded']",
    );
  });

  it('uses semantic run-state colors and opaque forced-colors chrome', async () => {
    const sheet = await commandCenterCss();
    const css = sheet.toString();
    const forcedColors = sheet.nodes.find(
      (node): node is AtRule =>
        node.type === 'atrule' &&
        node.name === 'media' &&
        node.params === '(forced-colors: active)',
    );

    expect(css).toContain("[data-jarvis-run-state='failed']");
    expect(css).toContain('var(--destructive)');
    expect(css).toContain("[data-jarvis-run-state='awaiting_approval']");
    expect(css).toContain('var(--warning)');
    expect(forcedColors?.toString()).toContain('background: Canvas');
    expect(forcedColors?.toString()).toContain('border-color: CanvasText');
  });
});
