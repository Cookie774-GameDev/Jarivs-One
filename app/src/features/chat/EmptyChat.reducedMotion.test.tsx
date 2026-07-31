import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reducedMotion = vi.hoisted(() => ({ current: false }));

vi.mock('motion/react', () => ({
  useReducedMotion: () => reducedMotion.current,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => (
      <div {...props} data-motion-wrapper="true">
        {children}
      </div>
    ),
  },
}));

import { EmptyChat } from './EmptyChat';

describe('EmptyChat reduced-motion behavior', () => {
  beforeEach(() => {
    reducedMotion.current = false;
  });

  it('renders its final state without a motion wrapper when reduced motion is requested', () => {
    reducedMotion.current = true;
    const { container } = render(<EmptyChat />);

    expect(screen.getByText('Jarvis is ready.')).toBeTruthy();
    expect(document.querySelector('[data-motion-wrapper="true"]')).toBeNull();
    const accent = container.querySelector<HTMLElement>('[data-monochrome-empty-accent]');
    expect(accent).not.toBeNull();
    expect(accent?.className).toContain('[html[data-theme=monochrome]_&]:!bg-none');
  });

  it('retains the restrained entrance animation when reduced motion is not requested', () => {
    render(<EmptyChat />);

    expect(document.querySelector('[data-motion-wrapper="true"]')).not.toBeNull();
  });
});
