import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import postcss from 'postcss';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SelectableTheme } from '@/features/appearance/themeContract';
import { useUIStore } from '@/stores/ui';
import { OrigamiChatDecor } from './OrigamiChatDecor';

const origamiCssPath = resolve(__dirname, '../../styles/origami-chat.css');

describe('OrigamiChatDecor', () => {
  beforeEach(() => {
    useUIStore.setState({ theme: 'default' });
  });

  afterEach(() => {
    cleanup();
    useUIStore.setState({ theme: 'default' });
  });

  it('renders only inert local decorative image layers', () => {
    useUIStore.setState({ theme: 'vibespace' });
    const { container } = render(<OrigamiChatDecor />);
    const decor = screen.getByTestId('origami-chat-decor');
    const images = [...decor.querySelectorAll('img')];

    expect(decor.getAttribute('aria-hidden')).toBe('true');
    expect(decor.classList).toContain('hidden');
    expect(images.map((image) => new URL(image.src).pathname)).toEqual([
      '/assets/origami-chat/top-ribbon.svg',
      '/assets/origami-chat/crane.webp',
      '/assets/origami-chat/left-foliage.webp',
      '/assets/origami-chat/bottom-mountains.svg',
      '/assets/origami-chat/right-flower.webp',
    ]);
    for (const image of images) {
      expect(image.getAttribute('alt')).toBe('');
      expect(image.getAttribute('draggable')).toBe('false');
      expect(image.src).not.toContain('target-chat.png');
      expect(image.src).not.toMatch(/^https?:\/\/(?!localhost)/u);
    }
    expect(container.querySelector('button, a, input, textarea, [tabindex]')).toBeNull();
  });

  it('mounts only for the exact VibeSpace Origami theme identity', () => {
    const { container } = render(<OrigamiChatDecor />);
    const nonOrigamiThemes = ['default', 'monochrome', 'jarvis', 'vibespace-preview'] as const;

    for (const theme of nonOrigamiThemes) {
      act(() => {
        useUIStore.setState({ theme: theme as SelectableTheme });
      });
      expect(container.querySelector('[data-testid="origami-chat-decor"]'), theme).toBeNull();
    }

    act(() => {
      useUIStore.setState({ theme: 'vibespace' });
    });
    expect(container.querySelectorAll('[data-testid="origami-chat-decor"]')).toHaveLength(1);
  });

  it('keeps authored and remote message payload elements outside the decorative CSS contract', () => {
    const root = postcss.parse(readFileSync(origamiCssPath, 'utf8'));
    const payloadElement =
      /(?:^|[\s>+~])(?:h[1-6]|p|a|pre|code|blockquote|img|table|thead|tbody|tr|th|td|ul|ol|li|strong|em)(?=[:.[#\s>+~]|$)/u;

    root.walkRules((rule) => {
      for (const selector of rule.selectors) {
        if (selector.includes('.origami-chat-decor')) continue;
        expect(selector, `Origami CSS reaches message payload content: ${selector}`).not.toMatch(
          payloadElement,
        );
      }
    });

    root.walkDecls('content', (declaration) => {
      expect(
        declaration.value,
        `Origami CSS injects readable content: ${declaration.parent?.toString()}`,
      ).toMatch(/^(['"])\1$/u);
    });
  });
});
