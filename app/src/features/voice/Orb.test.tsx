import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Orb } from './Orb';

function setReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('Orb motion policy', () => {
  beforeEach(() => setReducedMotion(false));

  it('keeps idle presentation still and reserves continuous expression for active voice', () => {
    const view = render(<Orb state="idle" />);
    expect(screen.getByRole('img').getAttribute('data-orb-motion')).toBe('idle');

    view.rerender(<Orb state="speaking" />);
    expect(screen.getByRole('img').getAttribute('data-orb-motion')).toBe('active');
  });

  it('disables nonessential movement when reduced motion is requested', () => {
    setReducedMotion(true);
    render(<Orb state="error" />);

    const orb = screen.getByRole('img');
    expect(orb.getAttribute('data-orb-motion')).toBe('reduced');
    expect(orb.style.filter).toContain('hue-rotate(220deg)');
  });
});
