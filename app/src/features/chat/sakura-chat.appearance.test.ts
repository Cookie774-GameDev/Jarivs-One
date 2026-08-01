import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

async function sakuraChatCss() {
  const css = await readFile(resolve(process.cwd(), 'src/features/chat/sakura-chat.css'), 'utf8');
  return postcss.parse(css);
}

async function chatThreadSource() {
  return readFile(resolve(process.cwd(), 'src/features/chat/ChatThread.tsx'), 'utf8');
}

function rulesWithin(root: AtRule) {
  return (root.nodes ?? []).filter((node): node is Rule => node.type === 'rule');
}

describe('Sakura chat appearance policy', () => {
  it('scopes translucent chat and composer chrome to Sakura without targeting payload elements', async () => {
    const sheet = await sakuraChatCss();
    const selectors = sheet.nodes
      .filter((node): node is Rule => node.type === 'rule')
      .map((rule) => rule.selector);

    expect(selectors).toContain("html[data-theme='sakura'] [data-sakura-surface='message-stack']");
    expect(selectors).toContain("html[data-theme='sakura'] [data-sakura-surface='thread-empty']");
    expect(selectors).toContain("html[data-theme='sakura'] [data-tour='chat-composer']");
    expect(selectors.every((selector) => selector.startsWith("html[data-theme='sakura']"))).toBe(
      true,
    );
    expect(selectors.some((selector) => /markdown|pre|code|img|video|iframe/i.test(selector))).toBe(
      false,
    );
  });

  it('maps the real empty-thread state to the reference-locked Sakura hero without changing copy', async () => {
    const source = await chatThreadSource();
    expect(source).toContain('data-sakura-surface="thread-empty"');
    expect(source).toContain('No messages yet');
    expect(source).toContain('Type below to start the conversation.');

    const sheet = await sakuraChatCss();
    const emptyRule = sheet.nodes.find(
      (node): node is Rule =>
        node.type === 'rule' &&
        node.selector === "html[data-theme='sakura'] [data-sakura-surface='thread-empty']",
    );
    expect(emptyRule?.toString()).toContain('min-height: clamp(18rem, 50vh, 34rem)');
    expect(emptyRule?.toString()).toContain('border-radius: var(--sakura-radius-feature)');
  });

  it('provides opaque forced-colors chrome and removes decorative motion', async () => {
    const sheet = await sakuraChatCss();
    const reducedMotion = sheet.nodes.find(
      (node): node is AtRule =>
        node.type === 'atrule' &&
        node.name === 'media' &&
        node.params === '(prefers-reduced-motion: reduce)',
    );
    const forcedColors = sheet.nodes.find(
      (node): node is AtRule =>
        node.type === 'atrule' &&
        node.name === 'media' &&
        node.params === '(forced-colors: active)',
    );

    expect(reducedMotion).toBeDefined();
    expect(
      rulesWithin(reducedMotion!).some((rule) => rule.toString().includes('transition: none')),
    ).toBe(true);
    expect(forcedColors).toBeDefined();
    expect(
      rulesWithin(forcedColors!).some((rule) => rule.toString().includes('background: Canvas')),
    ).toBe(true);
  });
});
