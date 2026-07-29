import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrigamiChatDecor } from './OrigamiChatDecor';

describe('OrigamiChatDecor', () => {
  it('renders only inert local decorative image layers', () => {
    const { container } = render(<OrigamiChatDecor />);
    const decor = screen.getByTestId('origami-chat-decor');
    const images = [...decor.querySelectorAll('img')];

    expect(decor.getAttribute('aria-hidden')).toBe('true');
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
});
